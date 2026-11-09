/**
 * Time and Temp sign for Google Slides.
 *
 * Builds four slides that look like the light sign on the Time and
 * Temperature building: word 1, word 2, the time and the temperature. Every
 * light is an ellipse with a fixed object ID. A one-minute trigger recolors
 * only the lights that changed. Sizes match rainmeter/.../Sign.lua and
 * style.css.
 *
 * Setup:
 *   1. Upload glyphs.json to Google Drive and copy its file ID (the long part
 *      of the share link). Put it in CONFIG.GLYPHS below. An https:// URL to
 *      the raw file works too. Do the same for the building drawing PNG and
 *      CONFIG.BUILDING_IMAGE.
 *   2. In your presentation, open Extensions > Apps Script. Paste this file
 *      in as Code.gs, and appsscript.json too (Project Settings > "Show
 *      appsscript.json"). Or add "Google Slides API" under Services instead.
 *   3. Run setup() and approve the permissions. It appends the four slides
 *      and starts the one-minute trigger. Run it again after changing CONFIG.
 *   4. Present with View > Slideshow, then use the options menu at the bottom
 *      to turn on auto-play (2 or 3 seconds, loop). A Fade transition
 *      (Slide > Transition, "Apply to all slides") looks closest to the sign.
 *
 * The bulbs are tagged with "tt_" object IDs. Don't copy, paste or regroup
 * them, or update() won't find them.
 */

const CONFIG = {
  // Leave blank to use the presentation this script is bound to.
  PRESENTATION_ID: '',
  // Drive file ID of glyphs.json, or an https:// URL that serves it.
  GLYPHS: '',

  // The two words the sign switches between, up to 4 characters each.
  // Leave one blank to skip its slide.
  WORDS: ['CALL', 'JOE'],
  // Where short words sit: left, center or right.
  ALIGN: 'left',

  TIME_ZONE: 'America/New_York',
  ZIP_CODE: '04101',
  COUNTRY: 'US',
  TEMP_UNIT: 'fahrenheit', // or 'celsius'
  TEMP_REFRESH_MINUTES: 10,
  // How long a temperature reading can be shown after fetches start failing.
  // After that, the temperature slide is skipped.
  TEMP_STALE_MINUTES: 60,

  LIGHT_ON: '#ffd23f',
  LIGHT_OFF: '#27282a',
  BACKGROUND: '#c7e7f4', // light sky blue
  // Opacity of the glow ring around lit bulbs (110/255 in the skin).
  GLOW_ALPHA: 0.43,

  // Drive file ID or share link of the building drawing. setup() stretches it
  // over the whole slide, behind the lights, on all four slides. Leave blank
  // for none. The sky only shows through where the PNG is transparent.
  BUILDING_IMAGE: '',
  // Where the sign goes, in points (a 16:9 slide is 720 x 405). x and y are
  // the sign's top-left corner, padding included, and width is its full
  // width. The height follows from the width. These were measured from
  // slides/notes/time and temp test.png, so the lights land on the drawing's
  // sign. Set SIGN to null to center the sign on the slide.
  SIGN: { x: 129.8, y: 76.9, width: 459.7 },
  // When SIGN is null: how much of the slide width or height the sign fills.
  FILL: 0.92,
};

const SLOTS = 4;
const WIDTH = 5;
const HEIGHT = 9;
const DEGREE = '°';
// Sign sizes in px, the same as Sign.lua. LIGHT + GAP is the spacing between
// light centers, and BULB is the diameter each light is drawn at.
const LIGHT = 22;
const GAP = 7;
const CHAR_GAP = 86;
const PADDING = 24;
const BULB = 12;
const LIGHTS_PER_SLIDE = SLOTS * WIDTH * HEIGHT + 2; // panels, then the colon
const SLIDE_COUNT = 4;
const PREFIX = 'tt_';
const BATCH_SIZE = 400;

const props = PropertiesService.getScriptProperties();

// ---------------------------------------------------------------- entry points

/** Adds a menu to the presentation (bound scripts only). */
function onOpen() {
  SlidesApp.getUi()
    .createMenu('Time & Temp')
    .addItem('Set up slides', 'setup')
    .addItem('Update now', 'update')
    .addToUi();
}

/** Builds the four sign slides (replacing old ones) and starts the trigger. */
function setup() {
  withLock(() => {
    const id = CONFIG.PRESENTATION_ID || SlidesApp.getActivePresentation().getId();
    props.setProperty('presentationId', id);

    // Step 1 is SlidesApp only: slides, background and drawing. It saves
    // before step 2, which adds the lights with the Slides API. Mixing the
    // two in the other order fails, because SlidesApp doesn't see slides the
    // API made earlier in the same run.
    const built = buildSlides(id);
    props.setProperty('slides', JSON.stringify(built.slideIds));

    const geometry = layoutLights(built.pageW, built.pageH);
    const requests = [];
    built.slideIds.forEach((pageObjectId, k) => {
      geometry.lights.forEach((light, i) => {
        requests.push({
          createShape: {
            objectId: bulbId(k, i),
            shapeType: 'ELLIPSE',
            elementProperties: {
              pageObjectId,
              size: { width: pt(geometry.bulb), height: pt(geometry.bulb) },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: light.x - geometry.bulb / 2,
                translateY: light.y - geometry.bulb / 2,
                unit: 'PT',
              },
            },
          },
        });
      });
    });
    batch(id, requests);

    props.setProperty('glow', String(geometry.glow));
    for (let k = 0; k < SLIDE_COUNT; k++) {
      props.deleteProperty('state_' + k);
      props.deleteProperty('skip_' + k);
    }
    installTrigger();
    paintAll(id);
  });
}

/** Repaints whatever changed. The trigger runs this every minute. */
function update() {
  withLock(() => {
    const id = props.getProperty('presentationId');
    if (!id) throw new Error('Run setup() first.');
    paintAll(id);
  });
}

/** Stops the one-minute trigger. The slides stay as they are. */
function stop() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'update')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

function installTrigger() {
  stop();
  ScriptApp.newTrigger('update').timeBased().everyMinutes(1).create();
}

/**
 * Removes the old sign slides, then appends four blank ones with the
 * background color and the building drawing. A slide counts as a sign slide
 * if setup made it (its ID was saved) or it holds "tt_" lights, which also
 * catches slides left behind by an interrupted setup.
 * Returns { slideIds, pageW, pageH }, with sizes in points.
 */
function buildSlides(id) {
  const known = JSON.parse(props.getProperty('slides') || '[]');
  const deck = SlidesApp.openById(id);
  deck.getSlides().forEach((slide) => {
    const ours =
      known.includes(slide.getObjectId()) ||
      slide.getObjectId().startsWith(PREFIX) ||
      slide.getPageElements().some((el) => el.getObjectId().startsWith(PREFIX));
    if (ours) slide.remove();
  });

  const source = CONFIG.BUILDING_IMAGE.trim();
  let blob = null;
  if (source) {
    const fileId = driveFileId(source);
    if (!fileId) throw new Error('CONFIG.BUILDING_IMAGE must be a Drive file ID or Drive link.');
    blob = DriveApp.getFileById(fileId).getBlob();
  }

  const pageW = deck.getPageWidth();
  const pageH = deck.getPageHeight();
  const slideIds = [];
  for (let k = 0; k < SLIDE_COUNT; k++) {
    const slide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    slide.getBackground().setSolidFill(CONFIG.BACKGROUND);
    if (blob) slide.insertImage(blob, 0, 0, pageW, pageH);
    slideIds.push(slide.getObjectId());
  }
  deck.saveAndClose();
  return { slideIds, pageW, pageH };
}

// ---------------------------------------------------------------- painting

function paintAll(id) {
  const glyphs = loadGlyphs();
  const temp = temperature();
  const frames = [
    wordFrame(CONFIG.WORDS[0]),
    wordFrame(CONFIG.WORDS[1]),
    { chars: timeChars(), colon: true, skip: false },
    temp === null
      ? { chars: layout('', 'left'), colon: false, skip: true }
      : { chars: layout(temp + DEGREE, 'right'), colon: false, skip: false },
  ];

  const glow = Number(props.getProperty('glow')) || 1;
  const slideIds = JSON.parse(props.getProperty('slides') || '[]');
  const requests = [];
  const skipRequests = [];
  const saves = {};
  frames.forEach((frame, k) => {
    const state = lightsOn(glyphs, frame.chars, frame.colon);
    const before = props.getProperty('state_' + k) || '';
    for (let i = 0; i < LIGHTS_PER_SLIDE; i++) {
      if (state[i] !== before[i]) requests.push(paintRequest(bulbId(k, i), state[i] === '1', glow));
    }
    saves['state_' + k] = state;

    const skip = String(frame.skip);
    if (slideIds[k] && props.getProperty('skip_' + k) !== skip) {
      skipRequests.push({
        updateSlideProperties: {
          objectId: slideIds[k],
          slideProperties: { isSkipped: frame.skip },
          fields: 'isSkipped',
        },
      });
      saves['skip_' + k] = skip;
    }
  });

  batch(id, requests);
  try {
    batch(id, skipRequests);
  } catch (e) {
    // Skipping is a nicety. A blank slide is fine if the API refuses it.
    console.warn('Could not change skipped slides: ' + e);
  }
  props.setProperties(saves);
}

function paintRequest(objectId, on, glow) {
  const shapeProperties = {
    shapeBackgroundFill: {
      solidFill: { color: { rgbColor: rgb(on ? CONFIG.LIGHT_ON : CONFIG.LIGHT_OFF) } },
    },
    outline: on
      ? {
          outlineFill: {
            solidFill: { color: { rgbColor: rgb(CONFIG.LIGHT_ON) }, alpha: CONFIG.GLOW_ALPHA },
          },
          weight: pt(glow),
          propertyState: 'RENDERED',
        }
      : { propertyState: 'NOT_RENDERED' },
  };
  return {
    updateShapeProperties: { objectId, shapeProperties, fields: 'shapeBackgroundFill,outline' },
  };
}

/** A string of '0'/'1', one per light, in the same order as layoutLights(). */
function lightsOn(glyphs, chars, colon) {
  let out = '';
  chars.forEach((ch) => {
    const matrix = glyphs[ch];
    for (let r = 0; r < HEIGHT; r++) {
      for (let c = 0; c < WIDTH; c++) {
        out += matrix && matrix[r] && matrix[r][c] === 1 ? '1' : '0';
      }
    }
  });
  return out + (colon ? '11' : '00');
}

/**
 * Light centers in points, scaled to fit the slide and centered on it. The
 * math matches buildSign() in Sign.lua.
 */
function layoutLights(pageW, pageH) {
  const panelW = WIDTH * LIGHT + (WIDTH - 1) * GAP;
  const panelH = HEIGHT * LIGHT + (HEIGHT - 1) * GAP;
  const signW = SLOTS * panelW + (SLOTS - 1) * CHAR_GAP + 2 * PADDING;
  const signH = panelH + 2 * PADDING;
  const box = CONFIG.SIGN;
  const scale = box
    ? box.width / signW
    : Math.min((pageW * CONFIG.FILL) / signW, (pageH * CONFIG.FILL) / signH);
  const left = box ? box.x : (pageW - signW * scale) / 2;
  const top = box ? box.y : (pageH - signH * scale) / 2;
  const at = (x, y) => ({ x: left + x * scale, y: top + y * scale });

  const lights = [];
  for (let slot = 0; slot < SLOTS; slot++) {
    const x0 = PADDING + slot * (panelW + CHAR_GAP);
    for (let r = 0; r < HEIGHT; r++) {
      for (let c = 0; c < WIDTH; c++) {
        lights.push(at(x0 + c * (LIGHT + GAP) + LIGHT / 2, PADDING + r * (LIGHT + GAP) + LIGHT / 2));
      }
    }
  }
  // The colon sits centered in the gap after the second character, on rows 3 and 7.
  const colonX = PADDING + 2 * panelW + CHAR_GAP + CHAR_GAP / 2;
  [2, 6].forEach((r) => lights.push(at(colonX, PADDING + r * (LIGHT + GAP) + LIGHT / 2)));

  return { lights, bulb: BULB * scale, glow: (BULB / 3) * scale };
}

// ---------------------------------------------------------------- slide content

function wordFrame(word) {
  const text = (word || '').trim();
  return { chars: layout(text, CONFIG.ALIGN), colon: false, skip: text === '' };
}

/**
 * Pads a word out to SLOTS characters. Centering an odd gap puts the extra
 * blank on the right, since the sign has no half positions.
 */
function layout(word, align) {
  const chars = Array.from(word.toUpperCase()).slice(0, SLOTS);
  const gap = SLOTS - chars.length;
  const left = { left: 0, center: Math.floor(gap / 2), right: gap }[String(align).toLowerCase()] || 0;
  const out = new Array(left).fill(' ').concat(chars);
  while (out.length < SLOTS) out.push(' ');
  return out;
}

/** 12-hour time as four slots, e.g. " 932" or "1205" (the colon is separate). */
function timeChars() {
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, CONFIG.TIME_ZONE, 'H')) % 12 || 12;
  return layout(hour + Utilities.formatDate(now, CONFIG.TIME_ZONE, 'mm'), 'right');
}

// ---------------------------------------------------------------- data

function loadGlyphs() {
  const source = CONFIG.GLYPHS.trim();
  if (!source) throw new Error('Set CONFIG.GLYPHS to the Drive file ID or URL of glyphs.json.');
  const driveId = driveFileId(source);
  const text = driveId
    ? DriveApp.getFileById(driveId).getBlob().getDataAsString('UTF-8')
    : UrlFetchApp.fetch(source).getContentText('UTF-8');
  return JSON.parse(text).glyphs || {};
}

/**
 * The Drive file ID in a bare ID or a Drive share link, or null for any other
 * URL. Drive links have to go through DriveApp: a plain fetch isn't signed
 * in, so Drive answers 401.
 */
function driveFileId(source) {
  if (!/^https?:\/\//.test(source)) return source;
  if (!/\/\/(drive|docs)\.google\.com\//.test(source)) return null;
  const match = source.match(/\/d\/([\w-]+)/) || source.match(/[?&]id=([\w-]+)/);
  if (!match) throw new Error('Could not find a file ID in ' + source);
  return match[1];
}

/**
 * The rounded temperature, refetched every TEMP_REFRESH_MINUTES. Returns
 * null when there's no reading newer than TEMP_STALE_MINUTES.
 */
function temperature() {
  const now = Date.now();
  const cached = JSON.parse(props.getProperty('temp') || 'null');
  if (cached && now - cached.at < CONFIG.TEMP_REFRESH_MINUTES * 60000) return cached.value;

  try {
    const { lat, lon } = location();
    const data = fetchJson(
      'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
        '&current=temperature_2m&temperature_unit=' + encodeURIComponent(CONFIG.TEMP_UNIT)
    );
    const value = Math.round(data.current.temperature_2m);
    if (!isFinite(value)) throw new Error('no temperature in response');
    props.setProperty('temp', JSON.stringify({ value, at: now }));
    return value;
  } catch (e) {
    console.warn('Temperature fetch failed: ' + e);
    if (cached && now - cached.at < CONFIG.TEMP_STALE_MINUTES * 60000) return cached.value;
    return null;
  }
}

/** Latitude and longitude for the ZIP code, cached until the ZIP changes. */
function location() {
  const key = CONFIG.ZIP_CODE + '|' + CONFIG.COUNTRY;
  const cached = JSON.parse(props.getProperty('location') || 'null');
  if (cached && cached.key === key) return cached;

  const data = fetchJson(
    'https://geocoding-api.open-meteo.com/v1/search?count=1&name=' +
      encodeURIComponent(CONFIG.ZIP_CODE) + '&countryCode=' + encodeURIComponent(CONFIG.COUNTRY)
  );
  const hit = data.results && data.results[0];
  if (!hit) throw new Error('ZIP code ' + CONFIG.ZIP_CODE + ' not found');
  const result = { key, lat: hit.latitude, lon: hit.longitude };
  props.setProperty('location', JSON.stringify(result));
  return result;
}

function fetchJson(url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode() + ' from ' + url);
  return JSON.parse(res.getContentText());
}

// ---------------------------------------------------------------- helpers

function bulbId(k, i) {
  return PREFIX + 's' + k + '_b' + i;
}

function pt(magnitude) {
  return { magnitude, unit: 'PT' };
}

/** '#rrggbb' -> Slides API RgbColor. */
function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

function batch(id, requests) {
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    Slides.Presentations.batchUpdate({ requests: requests.slice(i, i + BATCH_SIZE) }, id);
  }
}

/** Keeps setup() and the trigger from painting at the same time. */
function withLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) {
    console.warn('Another run is still going; skipping this one.');
    return;
  }
  try {
    fn();
  } finally {
    lock.releaseLock();
  }
}
