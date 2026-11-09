/**
 * Baxter Academy Entryway Kiosk - Daily Weather + Date Updater
 *          plus the Time and Temp sign slides
 *
 * This file has three parts that share one presentation:
 *
 *   PART 1, the kiosk weather updater (unchanged from the original kiosk.gs).
 *     Once a day, updateKioskWeather() rewrites the text boxes tagged WX_*.
 *
 *   PART 2, the Time and Temp sign. setupTimeAndTemp() adds four slides to the
 *     deck that look like the light sign on the Time and Temperature building:
 *     word 1, word 2, the time and the temperature. A one-minute trigger runs
 *     updateTimeAndTemp(), which recolors only the lights that changed.
 *
 *   PART 3, the lobby display: a web app (doGet + Display.html) for the TV.
 *     It plays the deck with its own timing for each slide. Regular slides
 *     come from the published deck. When the rotation reaches one of the four
 *     sign slides, the page draws the sign itself, with the same glyphs,
 *     positions and drawing, so the clock is live to the second instead of
 *     waiting minutes for the deck to republish.
 *
 * Parts 1 and 2 don't touch each other's work:
 *   - Part 2 only changes or deletes its own four slides (their IDs are saved
 *     in Script Properties, and they hold lights with "tt_" IDs). Every other
 *     slide is left alone.
 *   - Each part's trigger setup deletes only its own trigger.
 *   - Part 2's saved state lives in Script Properties under "tt_" keys.
 *   - The sign's lights have no alt-text titles, so the kiosk's WX_* tag
 *     search skips them.
 *
 * HOW TAGGING WORKS (Part 1):
 *   You label each text box using its alt-text "Title" field. The script finds
 *   boxes by that label and rewrites their text. Boxes you don't tag (like a
 *   static "HIGH" label) are left alone. To tag a box: right-click it >
 *   Alt text (or Ctrl+Alt+Y) > put the tag in the TITLE field.
 *
 *   Tags the script fills (create only the ones you want):
 *     WX_DATE        ->  Wednesday, June 24, 2026
 *     WX_HIGH        ->  72°
 *     WX_LOW         ->  54°
 *     WX_CONDITIONS  ->  Partly Sunny
 *     WX_SUMMARY     ->  High 72° · Low 54° · Partly Sunny   (optional combined box)
 *     WX_UPDATED     ->  Updated 6:04 AM                      (optional freshness stamp)
 *
 * SETUP, Part 1 (one time):
 *   1. Create + style your text boxes in Slides and tag them (see above).
 *      Tip: type a placeholder value in each box and style it once; the script
 *      keeps that styling when it swaps in real values.
 *   2. Paste your presentation ID into PRESENTATION_ID below.
 *   3. Put a real contact in USER_AGENT (NWS asks for a way to reach you).
 *   4. Run updateKioskWeather once to authorize and confirm it works.
 *   5. Run createDailyTrigger once to schedule the 6 AM refresh.
 *      Set the project time zone to America/New_York under Project Settings (gear
 *      icon) so 6 AM means 6 AM Eastern.
 *
 * SETUP, Part 2 (one time):
 *   1. Upload glyphs.json and the building drawing PNG to Google Drive. Put
 *      their file IDs or share links in TT_CONFIG.GLYPHS and
 *      TT_CONFIG.BUILDING_IMAGE.
 *   2. Under Services (the + next to it in the editor), add "Google Slides
 *      API" and keep its identifier as "Slides". Part 2 also needs the V8
 *      runtime (Project Settings > "Enable Chrome V8 runtime").
 *   3. Choose where the slides go with TT_CONFIG.INSERT_AT.
 *   4. Run setupTimeAndTemp and approve the new permissions. Approving them
 *      matters: until you do, the existing 6 AM kiosk trigger can fail too,
 *      because the project now asks for more access than it used to.
 *   5. Run setupTimeAndTemp again after changing TT_CONFIG. It rebuilds only
 *      its own four slides, in the same place in the deck.
 *   Run stopTimeAndTemp to stop the one-minute updates. The kiosk part keeps
 *   running.
 *
 * SETUP, Part 3 (one time, after Part 2):
 *   1. In the deck: File > Share > Publish to web > Publish, with
 *      "Automatically republish when changes are made" checked. Copy the link
 *      into TT_CONFIG.KIOSK.PUBLISHED_URL.
 *   2. In the script editor, add an HTML file named "Display" (File > + >
 *      HTML) and paste Display.html into it.
 *   3. Deploy > New deployment > Web app. Execute as "Me". Who has access:
 *      "Anyone" (the kiosk computer isn't signed in). Copy the /exec URL and
 *      open it full screen on the kiosk.
 *   4. After editing this code or Display.html, use Deploy > Manage
 *      deployments > Edit > Version: New version, so the /exec URL stays the
 *      same.
 *   Slide timing: regular slides show for KIOSK.OTHER_SECONDS and sign slides
 *   for KIOSK.SIGN_SECONDS. Put [seconds=20] in a slide's speaker notes to
 *   give it its own time. Skipped slides stay out of the rotation. The page
 *   rereads the deck every few minutes, so new or reordered slides show up on
 *   their own.
 *   The page doesn't need the one-minute trigger. If the TV is the only place
 *   the sign is seen, you can run stopTimeAndTemp. The sign slides inside the
 *   deck then stay frozen, but the TV still shows the right time.
 *
 * Don't copy, paste or regroup the sign's lights (IDs like tt_s2_b17), or
 * updateTimeAndTemp won't find them.
 */

// ---- CONFIG -----------------------------------------------------------------
var PRESENTATION_ID = '1o34xwfx636FBIZQLAn7qIZVYV023AkNTDNVbQU8dxok';
var LATITUDE  = 43.6607;   // Portland, Maine. Change for a different location.
var LONGITUDE = -70.2621;
var TIME_ZONE = 'America/New_York';
var USER_AGENT = '(Baxter Academy entryway kiosk, tyler.beaulieu@baxter-academy.org)'; // edit contact

// Time and Temp sign. It uses PRESENTATION_ID, LATITUDE, LONGITUDE and
// TIME_ZONE above.
var TT_CONFIG = {
  // Drive file ID or share link of glyphs.json. An https:// URL to the raw
  // file works too.
  GLYPHS: '',
  // Drive file ID or share link of the building drawing. It covers each sign
  // slide, behind the lights. Leave blank for none. The sky only shows
  // through where the PNG is transparent.
  BUILDING_IMAGE: '',

  // Where the four slides go, counting from 0 (0 = the start of the deck).
  // null puts them at the end. Once the slides exist, running setup again
  // puts all four back together where the first one is now, even if you've
  // moved it since.
  INSERT_AT: null,

  // The two words the sign switches between, up to 4 characters each.
  // Leave one blank to skip its slide.
  WORDS: ['CALL', 'JOE'],
  // Where short words sit: left, center or right.
  ALIGN: 'left',

  TEMP_UNIT: 'fahrenheit', // or 'celsius'
  TEMP_REFRESH_MINUTES: 10,
  // How long a temperature reading can be shown after fetches start failing.
  // After that, the temperature slide is skipped.
  TEMP_STALE_MINUTES: 60,

  LIGHT_ON: '#ffd23f',
  LIGHT_OFF: '#27282a',
  BACKGROUND: '#c7e7f4', // light sky blue
  // Opacity of the glow ring around lit bulbs.
  GLOW_ALPHA: 0.43,

  // Where the sign goes, in points (a 16:9 slide is 720 x 405). x and y are
  // the sign's top-left corner, padding included, and width is its full
  // width. These were measured from slides/notes/time and temp test.png, so
  // the lights land on the drawing's sign. null centers the sign.
  SIGN: { x: 129.8, y: 76.9, width: 459.7 },
  // When SIGN is null: how much of the slide width or height the sign fills.
  FILL: 0.92,

  // The lobby display web app (Part 3).
  KIOSK: {
    // The "Publish to web" link for the deck.
    PUBLISHED_URL: '',
    // How long slides stay up, in seconds. Put [seconds=20] in a slide's
    // speaker notes to give it its own time.
    OTHER_SECONDS: 12,
    SIGN_SECONDS: 3,
    // How often the page rereads the deck for new, removed or reordered slides.
    PLAYLIST_REFRESH_MINUTES: 5,
    // How long the cross-fade between slides takes.
    FADE_SECONDS: 0.6,
    // How long the sign's lights take to fade off (then on) between two sign
    // slides, like the real sign.
    LIGHT_FADE_SECONDS: 0.2,
  },
};
// -----------------------------------------------------------------------------


// =============================================================================
// PART 1: kiosk weather + date
// =============================================================================

function updateKioskWeather() {
  var wx;
  try {
    wx = getWeather_();
  } catch (err) {
    // Fetch failed -> leave yesterday's data on screen rather than blanking it.
    Logger.log('Weather update skipped: ' + err);
    return;
  }

  var now = new Date();
  var values = {
    WX_DATE:       Utilities.formatDate(now, TIME_ZONE, 'EEEE, MMMM d, yyyy'),
    WX_HIGH:       wx.high + '°',
    WX_LOW:        wx.low + '°',
    WX_CONDITIONS: wx.conditions,
    WX_SUMMARY:    'High ' + wx.high + '° · Low ' + wx.low + '° · ' + wx.conditions,
    WX_UPDATED:    'Updated ' + Utilities.formatDate(now, TIME_ZONE, 'h:mm a')
  };

  var presentation = SlidesApp.openById(PRESENTATION_ID);
  var shapes = [];
  presentation.getSlides().forEach(function (slide) {
    collectShapes_(slide.getPageElements(), shapes);
  });

  shapes.forEach(function (shape) {
    var tag = shape.getTitle(); // alt-text "Title" field
    if (tag && values.hasOwnProperty(tag)) {
      shape.getText().setText(values[tag]);
    }
  });
}

/** National Weather Service lookup. Returns { high, low, conditions }. */
function getWeather_() {
  var opts = { headers: { 'User-Agent': USER_AGENT }, muteHttpExceptions: true };

  // Step 1: resolve the forecast URL for these coordinates.
  var pointsUrl = 'https://api.weather.gov/points/' + LATITUDE + ',' + LONGITUDE;
  var pointsResp = UrlFetchApp.fetch(pointsUrl, opts);
  if (pointsResp.getResponseCode() !== 200) {
    throw new Error('points lookup HTTP ' + pointsResp.getResponseCode());
  }
  var forecastUrl = JSON.parse(pointsResp.getContentText()).properties.forecast;

  // Step 2: pull the forecast periods.
  var fcResp = UrlFetchApp.fetch(forecastUrl, opts);
  if (fcResp.getResponseCode() !== 200) {
    throw new Error('forecast HTTP ' + fcResp.getResponseCode());
  }
  var periods = JSON.parse(fcResp.getContentText()).properties.periods;

  // Running in the morning: first daytime period = today's high + conditions,
  // first nighttime period = tonight's low.
  var day   = periods.filter(function (p) { return p.isDaytime; })[0];
  var night = periods.filter(function (p) { return !p.isDaytime; })[0];

  return {
    high:       day   ? day.temperature   : '--',
    low:        night ? night.temperature : '--',
    conditions: day   ? day.shortForecast : (night ? night.shortForecast : '')
  };
}

/** Recursively gather shapes, including any nested inside groups. */
function collectShapes_(elements, out) {
  elements.forEach(function (el) {
    var type = el.getPageElementType();
    if (type === SlidesApp.PageElementType.SHAPE) {
      out.push(el.asShape());
    } else if (type === SlidesApp.PageElementType.GROUP) {
      collectShapes_(el.asGroup().getChildren(), out);
    }
  });
}

/** Run once to schedule the daily 6 AM refresh. */
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'updateKioskWeather') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('updateKioskWeather')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
}


// =============================================================================
// PART 2: Time and Temp sign
// =============================================================================
//
// Layout constants match rainmeter/TimeAndTemp/@Resources/Sign.lua: LIGHT +
// GAP is the spacing between light centers and BULB is each light's diameter,
// in px before scaling.

var TT = {
  SLOTS: 4,
  WIDTH: 5,
  HEIGHT: 9,
  LIGHT: 22,
  GAP: 7,
  CHAR_GAP: 86,
  PADDING: 24,
  BULB: 12,
  LIGHTS_PER_SLIDE: 4 * 5 * 9 + 2, // panels, then the colon
  SLIDE_COUNT: 4,
  PREFIX: 'tt_',
  BATCH_SIZE: 400,
  DEGREE: '°',
};

/**
 * Builds the four sign slides and starts the one-minute trigger. If the slides
 * already exist, they're rebuilt in the same place in the deck.
 */
function setupTimeAndTemp() {
  ttWithLock_(() => {
    const id = PRESENTATION_ID;
    const props = PropertiesService.getScriptProperties();

    // Step 1 is SlidesApp only: slides, background and drawing. It saves
    // before step 2, which adds the lights with the Slides API. Mixing the
    // two in the other order fails, because SlidesApp doesn't see slides the
    // API made earlier in the same run.
    const built = ttBuildSlides_(id);
    props.setProperty('tt_slides', JSON.stringify(built.slideIds));

    const geometry = ttLayoutLights_(built.pageW, built.pageH);
    const requests = [];
    built.slideIds.forEach((pageObjectId, k) => {
      geometry.lights.forEach((light, i) => {
        requests.push({
          createShape: {
            objectId: ttBulbId_(k, i),
            shapeType: 'ELLIPSE',
            elementProperties: {
              pageObjectId,
              size: { width: ttPt_(geometry.bulb), height: ttPt_(geometry.bulb) },
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
    ttBatch_(id, requests);

    props.setProperty('tt_glow', String(geometry.glow));
    for (let k = 0; k < TT.SLIDE_COUNT; k++) {
      props.deleteProperty('tt_state_' + k);
      props.deleteProperty('tt_skip_' + k);
    }
    ttInstallTrigger_();
    ttPaintAll_(id);
  });
}

/** Repaints whatever changed on the sign slides. The trigger runs this every minute. */
function updateTimeAndTemp() {
  ttWithLock_(() => ttPaintAll_(PRESENTATION_ID));
}

/** Stops the one-minute sign updates. The slides and the kiosk part are left alone. */
function stopTimeAndTemp() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'updateTimeAndTemp')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

function ttInstallTrigger_() {
  stopTimeAndTemp();
  ScriptApp.newTrigger('updateTimeAndTemp').timeBased().everyMinutes(1).create();
}

/**
 * Removes the old sign slides, then inserts four blank ones in their place
 * with the background color and the building drawing. A slide counts as a
 * sign slide if setup made it (its ID was saved) or it holds "tt_" lights,
 * which also catches slides left behind by an interrupted setup.
 * Returns { slideIds, pageW, pageH }, with sizes in points.
 */
function ttBuildSlides_(id) {
  const known = JSON.parse(PropertiesService.getScriptProperties().getProperty('tt_slides') || '[]');
  const deck = SlidesApp.openById(id);
  const isSign = (slide) =>
    known.includes(slide.getObjectId()) ||
    slide.getObjectId().startsWith(TT.PREFIX) ||
    slide.getPageElements().some((el) => el.getObjectId().startsWith(TT.PREFIX));

  const slides = deck.getSlides();
  const sign = slides.map(isSign);
  const firstOld = sign.indexOf(true);
  const others = sign.filter((s) => !s).length;
  let insertAt;
  if (firstOld >= 0) {
    insertAt = sign.slice(0, firstOld).filter((s) => !s).length;
  } else if (TT_CONFIG.INSERT_AT === null || TT_CONFIG.INSERT_AT === undefined) {
    insertAt = others;
  } else {
    insertAt = Math.max(0, Math.min(others, TT_CONFIG.INSERT_AT));
  }
  slides.forEach((slide, i) => {
    if (sign[i]) slide.remove();
  });

  const source = TT_CONFIG.BUILDING_IMAGE.trim();
  let blob = null;
  if (source) {
    const fileId = ttDriveFileId_(source);
    if (!fileId) throw new Error('TT_CONFIG.BUILDING_IMAGE must be a Drive file ID or Drive link.');
    blob = DriveApp.getFileById(fileId).getBlob();
  }

  const pageW = deck.getPageWidth();
  const pageH = deck.getPageHeight();
  const slideIds = [];
  for (let k = 0; k < TT.SLIDE_COUNT; k++) {
    const slide = deck.insertSlide(insertAt + k, SlidesApp.PredefinedLayout.BLANK);
    slide.getBackground().setSolidFill(TT_CONFIG.BACKGROUND);
    if (blob) slide.insertImage(blob, 0, 0, pageW, pageH);
    slideIds.push(slide.getObjectId());
  }
  deck.saveAndClose();
  return { slideIds, pageW, pageH };
}

// ---- painting

function ttPaintAll_(id) {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('tt_glow')) throw new Error('Run setupTimeAndTemp first.');
  const glyphs = ttLoadGlyphs_();
  const temp = ttTemperature_();
  const frames = [
    ttWordFrame_(TT_CONFIG.WORDS[0]),
    ttWordFrame_(TT_CONFIG.WORDS[1]),
    { chars: ttTimeChars_(), colon: true, skip: false },
    temp === null
      ? { chars: ttLayout_('', 'left'), colon: false, skip: true }
      : { chars: ttLayout_(temp + TT.DEGREE, 'right'), colon: false, skip: false },
  ];

  const glow = Number(props.getProperty('tt_glow')) || 1;
  const slideIds = JSON.parse(props.getProperty('tt_slides') || '[]');
  const requests = [];
  const skipRequests = [];
  const saves = {};
  frames.forEach((frame, k) => {
    const state = ttLightsOn_(glyphs, frame.chars, frame.colon);
    const before = props.getProperty('tt_state_' + k) || '';
    for (let i = 0; i < TT.LIGHTS_PER_SLIDE; i++) {
      if (state[i] !== before[i]) requests.push(ttPaintRequest_(ttBulbId_(k, i), state[i] === '1', glow));
    }
    saves['tt_state_' + k] = state;

    const skip = String(frame.skip);
    if (slideIds[k] && props.getProperty('tt_skip_' + k) !== skip) {
      skipRequests.push({
        updateSlideProperties: {
          objectId: slideIds[k],
          slideProperties: { isSkipped: frame.skip },
          fields: 'isSkipped',
        },
      });
      saves['tt_skip_' + k] = skip;
    }
  });

  ttBatch_(id, requests);
  try {
    ttBatch_(id, skipRequests);
  } catch (e) {
    // Skipping is a nicety. A blank slide is fine if the API refuses it.
    console.warn('Could not change skipped slides: ' + e);
  }
  props.setProperties(saves);
}

function ttPaintRequest_(objectId, on, glow) {
  const shapeProperties = {
    shapeBackgroundFill: {
      solidFill: { color: { rgbColor: ttRgb_(on ? TT_CONFIG.LIGHT_ON : TT_CONFIG.LIGHT_OFF) } },
    },
    outline: on
      ? {
          outlineFill: {
            solidFill: { color: { rgbColor: ttRgb_(TT_CONFIG.LIGHT_ON) }, alpha: TT_CONFIG.GLOW_ALPHA },
          },
          weight: ttPt_(glow),
          propertyState: 'RENDERED',
        }
      : { propertyState: 'NOT_RENDERED' },
  };
  return {
    updateShapeProperties: { objectId, shapeProperties, fields: 'shapeBackgroundFill,outline' },
  };
}

/** A string of '0'/'1', one per light, in the same order as ttLayoutLights_(). */
function ttLightsOn_(glyphs, chars, colon) {
  let out = '';
  chars.forEach((ch) => {
    const matrix = glyphs[ch];
    for (let r = 0; r < TT.HEIGHT; r++) {
      for (let c = 0; c < TT.WIDTH; c++) {
        out += matrix && matrix[r] && matrix[r][c] === 1 ? '1' : '0';
      }
    }
  });
  return out + (colon ? '11' : '00');
}

/** Light centers in points. The math matches buildSign() in Sign.lua. */
function ttLayoutLights_(pageW, pageH) {
  const panelW = TT.WIDTH * TT.LIGHT + (TT.WIDTH - 1) * TT.GAP;
  const panelH = TT.HEIGHT * TT.LIGHT + (TT.HEIGHT - 1) * TT.GAP;
  const signW = TT.SLOTS * panelW + (TT.SLOTS - 1) * TT.CHAR_GAP + 2 * TT.PADDING;
  const signH = panelH + 2 * TT.PADDING;
  const box = TT_CONFIG.SIGN;
  const scale = box
    ? box.width / signW
    : Math.min((pageW * TT_CONFIG.FILL) / signW, (pageH * TT_CONFIG.FILL) / signH);
  const left = box ? box.x : (pageW - signW * scale) / 2;
  const top = box ? box.y : (pageH - signH * scale) / 2;
  const at = (x, y) => ({ x: left + x * scale, y: top + y * scale });
  const pitch = TT.LIGHT + TT.GAP;

  const lights = [];
  for (let slot = 0; slot < TT.SLOTS; slot++) {
    const x0 = TT.PADDING + slot * (panelW + TT.CHAR_GAP);
    for (let r = 0; r < TT.HEIGHT; r++) {
      for (let c = 0; c < TT.WIDTH; c++) {
        lights.push(at(x0 + c * pitch + TT.LIGHT / 2, TT.PADDING + r * pitch + TT.LIGHT / 2));
      }
    }
  }
  // The colon sits centered in the gap after the second character, on rows 3 and 7.
  const colonX = TT.PADDING + 2 * panelW + TT.CHAR_GAP + TT.CHAR_GAP / 2;
  [2, 6].forEach((r) => lights.push(at(colonX, TT.PADDING + r * pitch + TT.LIGHT / 2)));

  return { lights, bulb: TT.BULB * scale, glow: (TT.BULB / 3) * scale };
}

// ---- slide content

function ttWordFrame_(word) {
  const text = (word || '').trim();
  return { chars: ttLayout_(text, TT_CONFIG.ALIGN), colon: false, skip: text === '' };
}

/**
 * Pads a word out to 4 characters. Centering an odd gap puts the extra blank
 * on the right, since the sign has no half positions.
 */
function ttLayout_(word, align) {
  const chars = Array.from(word.toUpperCase()).slice(0, TT.SLOTS);
  const gap = TT.SLOTS - chars.length;
  const left = { left: 0, center: Math.floor(gap / 2), right: gap }[String(align).toLowerCase()] || 0;
  const out = new Array(left).fill(' ').concat(chars);
  while (out.length < TT.SLOTS) out.push(' ');
  return out;
}

/** 12-hour time as four slots, e.g. " 932" or "1205" (the colon is separate). */
function ttTimeChars_() {
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, TIME_ZONE, 'H')) % 12 || 12;
  return ttLayout_(hour + Utilities.formatDate(now, TIME_ZONE, 'mm'), 'right');
}

// ---- data

/** glyphs.json's glyphs, cached for 10 minutes so most runs skip the Drive read. */
function ttLoadGlyphs_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('tt_glyphs');
  if (cached) return JSON.parse(cached);

  const source = TT_CONFIG.GLYPHS.trim();
  if (!source) throw new Error('Set TT_CONFIG.GLYPHS to the Drive file ID or URL of glyphs.json.');
  const driveId = ttDriveFileId_(source);
  const text = driveId
    ? DriveApp.getFileById(driveId).getBlob().getDataAsString('UTF-8')
    : UrlFetchApp.fetch(source).getContentText('UTF-8');
  const glyphs = JSON.parse(text).glyphs || {};
  cache.put('tt_glyphs', JSON.stringify(glyphs), 600);
  return glyphs;
}

/**
 * The Drive file ID in a bare ID or a Drive share link, or null for any other
 * URL. Drive links have to go through DriveApp: a plain fetch isn't signed
 * in, so Drive answers 401.
 */
function ttDriveFileId_(source) {
  if (!/^https?:\/\//.test(source)) return source;
  if (!/\/\/(drive|docs)\.google\.com\//.test(source)) return null;
  const match = source.match(/\/d\/([\w-]+)/) || source.match(/[?&]id=([\w-]+)/);
  if (!match) throw new Error('Could not find a file ID in ' + source);
  return match[1];
}

/**
 * The current temperature at LATITUDE/LONGITUDE from Open-Meteo, rounded and
 * refetched every TEMP_REFRESH_MINUTES. Returns null when there's no reading
 * newer than TEMP_STALE_MINUTES.
 */
function ttTemperature_() {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  const cached = JSON.parse(props.getProperty('tt_temp') || 'null');
  if (cached && now - cached.at < TT_CONFIG.TEMP_REFRESH_MINUTES * 60000) return cached.value;

  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LATITUDE + '&longitude=' + LONGITUDE +
      '&current=temperature_2m&temperature_unit=' + encodeURIComponent(TT_CONFIG.TEMP_UNIT);
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
    const value = Math.round(JSON.parse(res.getContentText()).current.temperature_2m);
    if (!isFinite(value)) throw new Error('no temperature in response');
    props.setProperty('tt_temp', JSON.stringify({ value, at: now }));
    return value;
  } catch (e) {
    console.warn('Temperature fetch failed: ' + e);
    if (cached && now - cached.at < TT_CONFIG.TEMP_STALE_MINUTES * 60000) return cached.value;
    return null;
  }
}

// ---- lobby display web app (Part 3)

/** Serves the lobby display page. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Display')
    .setTitle('Lobby display')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Everything the display page needs, called from the page with
 * google.script.run. It can't end in "_", because the page can't call
 * private functions. Pass withImage = true on the first load to include the
 * building drawing as a data URL (about 200 KB).
 */
function kioskData(withImage) {
  const kiosk = TT_CONFIG.KIOSK;
  const props = PropertiesService.getScriptProperties();
  const signIds = JSON.parse(props.getProperty('tt_slides') || '[]');
  const deck = SlidesApp.openById(PRESENTATION_ID);

  const slides = [];
  deck.getSlides().forEach((slide) => {
    const id = slide.getObjectId();
    const sign = signIds.indexOf(id);
    if (sign >= 0) {
      slides.push({ id, sign, seconds: kiosk.SIGN_SECONDS });
      return;
    }
    if (ttIsSkipped_(slide)) return;
    // -1, not null: google.script.run drops null values on the way to the page.
    slides.push({ id, sign: -1, seconds: ttNotesSeconds_(slide) || kiosk.OTHER_SECONDS });
  });

  const pageW = deck.getPageWidth();
  const pageH = deck.getPageHeight();
  const data = {
    slides,
    pageW,
    pageH,
    embed: ttEmbedBase_(kiosk.PUBLISHED_URL),
    geometry: ttLayoutLights_(pageW, pageH),
    glyphs: ttLoadGlyphs_(),
    temp: ttTemperature_(),
    words: TT_CONFIG.WORDS,
    align: TT_CONFIG.ALIGN,
    timeZone: TIME_ZONE,
    lightOn: TT_CONFIG.LIGHT_ON,
    lightOff: TT_CONFIG.LIGHT_OFF,
    background: TT_CONFIG.BACKGROUND,
    glowAlpha: TT_CONFIG.GLOW_ALPHA,
    fadeSeconds: kiosk.FADE_SECONDS,
    lightFadeSeconds: kiosk.LIGHT_FADE_SECONDS,
    refreshMinutes: kiosk.PLAYLIST_REFRESH_MINUTES,
    tempRefreshMinutes: TT_CONFIG.TEMP_REFRESH_MINUTES,
  };
  if (withImage) data.image = ttBuildingDataUrl_();
  return data;
}

/** The current temperature, or null. Called from the display page. */
function kioskTemp() {
  return ttTemperature_();
}

function ttIsSkipped_(slide) {
  try {
    return slide.isSkipped();
  } catch (e) {
    return false;
  }
}

/** The number in a "[seconds=20]" tag in the slide's speaker notes, or null. */
function ttNotesSeconds_(slide) {
  try {
    const notes = slide.getNotesPage().getSpeakerNotesShape().getText().asString();
    const match = notes.match(/\[\s*seconds\s*=\s*(\d+(?:\.\d+)?)\s*\]/i);
    return match ? Number(match[1]) : null;
  } catch (e) {
    return null;
  }
}

/**
 * The published deck's base URL (".../presentation/d/e/<id>"), taken from any
 * Publish to web link. The page adds /embed and the slide to show.
 */
function ttEmbedBase_(url) {
  const match = String(url || '').match(/https:\/\/docs\.google\.com\/presentation\/d\/(?:e\/)?[\w-]+/);
  if (!match) throw new Error('Set TT_CONFIG.KIOSK.PUBLISHED_URL to the deck\'s Publish to web link.');
  return match[0];
}

function ttBuildingDataUrl_() {
  const source = TT_CONFIG.BUILDING_IMAGE.trim();
  if (!source) return null;
  const blob = DriveApp.getFileById(ttDriveFileId_(source)).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

// ---- helpers

function ttBulbId_(k, i) {
  return TT.PREFIX + 's' + k + '_b' + i;
}

function ttPt_(magnitude) {
  return { magnitude, unit: 'PT' };
}

/** '#rrggbb' -> Slides API RgbColor. */
function ttRgb_(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

function ttBatch_(id, requests) {
  for (let i = 0; i < requests.length; i += TT.BATCH_SIZE) {
    Slides.Presentations.batchUpdate({ requests: requests.slice(i, i + TT.BATCH_SIZE) }, id);
  }
}

/** Keeps setupTimeAndTemp and the trigger from painting at the same time. */
function ttWithLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) {
    console.warn('Another Time and Temp run is still going; skipping this one.');
    return;
  }
  try {
    fn();
  } finally {
    lock.releaseLock();
  }
}
