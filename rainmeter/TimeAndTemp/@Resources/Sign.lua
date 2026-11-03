-- Draws the Time and Temp sign on MeterSign and cycles its slides: the two
-- words, the local time and the temperature. Mirrors display.html.

local SLOTS, WIDTH, HEIGHT = 4, 5, 9
local TICK_MS = 25                 -- must match Update= in TimeAndTemp.ini
local DEGREE = "\194\176"          -- the UTF-8 bytes of the glyphs.json key
local GLOW_ALPHA = 110

-- Website sizes in pixels at Scale=1 (see .sign in style.css, minus the frame).
local LIGHT, GAP, CHAR_GAP, PADDING = 22, 7, 50, 24

local glyphs = {}
local settings = {}
local lights = {}                  -- shape geometry, panel lights then colon lights
local slideIndex, ticks = 0, 0

-- What's lit right now. Between slides the lit lights fade off ("out"), the
-- new frame swaps in, and its lights fade on ("in").
local shown = { key = nil, on = {} }
local level, phase = 1, "idle"
local lastPaint = nil

-- Minimal JSON reader, enough for glyphs.json.
local function decodeJson(text)
  local pos = 1
  local value

  local function skip()
    pos = text:find("[^ \t\r\n]", pos) or #text + 1
  end

  local function fail(what)
    error(("glyphs.json: expected %s at byte %d"):format(what, pos))
  end

  local function str()
    local out = {}
    pos = pos + 1
    while true do
      local c = text:sub(pos, pos)
      if c == "" then fail("closing quote") end
      if c == '"' then pos = pos + 1; return table.concat(out) end
      if c == "\\" then
        local e = text:sub(pos + 1, pos + 1)
        if e == "u" then
          local code = tonumber(text:sub(pos + 2, pos + 5), 16) or fail("\\u escape")
          if code < 0x80 then
            out[#out + 1] = string.char(code)
          elseif code < 0x800 then
            out[#out + 1] = string.char(0xC0 + math.floor(code / 64), 0x80 + code % 64)
          else
            out[#out + 1] = string.char(0xE0 + math.floor(code / 4096),
              0x80 + math.floor(code / 64) % 64, 0x80 + code % 64)
          end
          pos = pos + 6
        else
          local map = { b = "\b", f = "\f", n = "\n", r = "\r", t = "\t" }
          out[#out + 1] = map[e] or e
          pos = pos + 2
        end
      else
        out[#out + 1] = c
        pos = pos + 1
      end
    end
  end

  function value()
    skip()
    local c = text:sub(pos, pos)
    if c == "{" then
      local obj = {}
      pos = pos + 1; skip()
      if text:sub(pos, pos) == "}" then pos = pos + 1; return obj end
      while true do
        skip()
        if text:sub(pos, pos) ~= '"' then fail("key") end
        local key = str()
        skip()
        if text:sub(pos, pos) ~= ":" then fail("':'") end
        pos = pos + 1
        obj[key] = value()
        skip()
        local sep = text:sub(pos, pos)
        pos = pos + 1
        if sep == "}" then return obj end
        if sep ~= "," then fail("',' or '}'") end
      end
    elseif c == "[" then
      local arr = {}
      pos = pos + 1; skip()
      if text:sub(pos, pos) == "]" then pos = pos + 1; return arr end
      while true do
        arr[#arr + 1] = value()
        skip()
        local sep = text:sub(pos, pos)
        pos = pos + 1
        if sep == "]" then return arr end
        if sep ~= "," then fail("',' or ']'") end
      end
    elseif c == '"' then
      return str()
    else
      local num = text:match("^-?[%d.eE+-]+", pos)
      if num then pos = pos + #num; return tonumber(num) end
      for word, v in pairs({ ["true"] = true, ["false"] = false, ["null"] = false }) do
        if text:sub(pos, pos + #word - 1) == word then pos = pos + #word; return v end
      end
      fail("a value")
    end
  end

  return value()
end

local function loadGlyphs(path)
  local file = io.open(path, "rb")
  if not file then
    print("TimeAndTemp: could not open " .. path .. " (run install.py to copy it)")
    return {}
  end
  local text = file:read("*a")
  file:close()
  local ok, data = pcall(decodeJson, text)
  if not ok then
    print("TimeAndTemp: " .. tostring(data))
    return {}
  end
  return data.glyphs or {}
end

-- Splits a UTF-8 string into characters.
local function utf8Chars(s)
  local chars = {}
  for ch in s:gmatch("[%z\1-\127\194-\244][\128-\191]*") do chars[#chars + 1] = ch end
  return chars
end

local function trim(s)
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- Pads a word out to SLOTS characters. Centering an odd gap puts the
-- extra blank on the right, since the sign has no half positions.
local function layout(word, align)
  local chars = {}
  for i, ch in ipairs(utf8Chars(word:upper())) do
    if i > SLOTS then break end
    chars[i] = ch
  end
  local gap = SLOTS - #chars
  local left = ({ left = 0, center = math.floor(gap / 2), right = gap })[align] or 0
  local out = {}
  for _ = 1, left do out[#out + 1] = " " end
  for _, ch in ipairs(chars) do out[#out + 1] = ch end
  while #out < SLOTS do out[#out + 1] = " " end
  return out
end

-- 12-hour local time as four slots, e.g. " 932" or "1205" (the colon is separate).
local function timeChars()
  local now = os.date("*t")
  local hour = now.hour % 12
  if hour == 0 then hour = 12 end
  return layout(("%d%02d"):format(hour, now.min), "right")
end

local function temperature()
  local value = tonumber(SKIN:GetMeasure("MeasureTemp"):GetStringValue())
  if value then return math.floor(value + 0.5) end
end

-- The slides currently in rotation, each returning chars, colon.
local function activeSlides()
  local slides = {}
  for _, word in ipairs(settings.words) do
    if word ~= "" then
      slides[#slides + 1] = function() return layout(word, settings.align), false end
    end
  end
  if settings.showTime then
    slides[#slides + 1] = function() return timeChars(), true end
  end
  local temp = settings.showTemp and temperature()
  if temp then
    slides[#slides + 1] = function() return layout(temp .. DEGREE, "right"), false end
  end
  return slides
end

local function px(n)
  return ("%.2f"):format(n * settings.scale)
end

-- "R,G,B[,A]" -> list of numbers.
local function parseColor(s)
  local out = {}
  for n in s:gmatch("[%d.]+") do out[#out + 1] = tonumber(n) end
  return out
end

-- Blends between the off and on colors; t runs 0 (off) to 1 (on).
local function blend(t)
  local out = {}
  for i = 1, 3 do
    local a, b = settings.lightOff[i] or 0, settings.lightOn[i] or 0
    out[i] = math.floor(a + (b - a) * t + 0.5)
  end
  return table.concat(out, ",")
end

-- Works out where every light goes and draws the background.
local function buildSign()
  local panelW = WIDTH * LIGHT + (WIDTH - 1) * GAP
  local panelH = HEIGHT * LIGHT + (HEIGHT - 1) * GAP
  local inset = PADDING
  local signW = SLOTS * panelW + (SLOTS - 1) * CHAR_GAP + 2 * inset
  local signH = panelH + 2 * inset

  lights = {}
  for slot = 0, SLOTS - 1 do
    local x0 = inset + slot * (panelW + CHAR_GAP)
    for r = 0, HEIGHT - 1 do
      for c = 0, WIDTH - 1 do
        lights[#lights + 1] = {
          x = x0 + c * (LIGHT + GAP) + LIGHT / 2,
          y = inset + r * (LIGHT + GAP) + LIGHT / 2,
        }
      end
    end
  end
  -- The colon sits centered in the gap after the second character, on rows 3 and 7.
  local colonX = inset + 2 * panelW + CHAR_GAP + CHAR_GAP / 2
  for _, r in ipairs({ 2, 6 }) do
    lights[#lights + 1] = { x = colonX, y = inset + r * (LIGHT + GAP) + LIGHT / 2 }
  end

  SKIN:Bang("!SetOption", "MeterSign", "Shape",
    ("Rectangle 0,0,%s,%s | Fill Color %s | StrokeWidth 0"):format(
      px(signW), px(signH), settings.background))
  SKIN:Bang("!SetOption", "MeterSign", "W", px(signW))
  SKIN:Bang("!SetOption", "MeterSign", "H", px(signH))
end

-- Which lights a slide turns on, plus a key for spotting changes.
local function frameFor(chars, colon)
  local on = {}
  for _, ch in ipairs(chars) do
    local matrix = glyphs[ch]
    for r = 1, HEIGHT do
      for c = 1, WIDTH do
        on[#on + 1] = matrix ~= nil and matrix[r] ~= nil and matrix[r][c] == 1
      end
    end
  end
  on[#on + 1] = colon
  on[#on + 1] = colon
  return { key = table.concat(chars, "|") .. tostring(colon), on = on }
end

-- Draws the shown frame with its lit lights at brightness `level`.
local function paint()
  local paintKey = shown.key .. level
  if paintKey == lastPaint then return end
  lastPaint = paintKey

  local radius = px(LIGHT / 2)
  local lit = ("Fill Color %s | StrokeWidth %s | Stroke Color %s,%d"):format(
    blend(level), px(LIGHT / 4), table.concat(settings.lightOn, ",", 1, 3),
    math.floor(GLOW_ALPHA * level + 0.5))
  local unlit = ("Fill Color %s | StrokeWidth 0"):format(blend(0))
  for i, light in ipairs(lights) do
    -- On lights get a translucent stroke in place of the website's glow.
    local shape = ("Ellipse %s,%s,%s | %s"):format(
      px(light.x), px(light.y), radius, shown.on[i] and lit or unlit)
    SKIN:Bang("!SetOption", "MeterSign", "Shape" .. (i + 1), shape)
  end
  SKIN:Bang("!UpdateMeter", "MeterSign")
  SKIN:Bang("!Redraw")
end

local function currentFrame()
  local slides = activeSlides()
  if #slides == 0 then return frameFor(layout("", "left"), false) end
  return frameFor(slides[slideIndex % #slides + 1]())
end

-- Moves the fade along one tick toward the current slide.
local function step()
  local target = currentFrame()
  local delta = settings.fade > 0 and TICK_MS / (settings.fade * 1000) or 1

  if phase == "idle" and target.key ~= shown.key then
    phase = shown.key and "out" or "in"
    if phase == "in" then shown, level = target, 0 end
  end
  if phase == "out" then
    level = math.max(0, level - delta)
    if level == 0 then shown, phase = target, "in" end
  elseif phase == "in" then
    level = math.min(1, level + delta)
    if level == 1 then phase = "idle" end
  end
  paint()
end

function Initialize()
  local function var(name, default)
    return SKIN:GetVariable(name, default)
  end
  settings = {
    words = { trim(var("Word1", "")), trim(var("Word2", "")) },
    align = var("Align", "left"):lower(),
    showTime = var("ShowTime", "1") ~= "0",
    showTemp = var("ShowTemp", "1") ~= "0",
    seconds = math.max(0.2, tonumber(var("SecondsPerSlide", "3")) or 3),
    fade = math.max(0, tonumber(var("FadeSeconds", "0.2")) or 0.2),
    scale = tonumber(var("Scale", "0.5")) or 0.5,
    lightOn = parseColor(var("LightOn", "255,210,63")),
    lightOff = parseColor(var("LightOff", "39,40,42")),
    background = var("Background", "0,0,0,200"),
  }
  glyphs = loadGlyphs(var("GlyphsFile", SKIN:GetVariable("@") .. "glyphs.json"))
  buildSign()
  step()
end

function Update()
  ticks = ticks + 1
  if ticks * TICK_MS >= settings.seconds * 1000 then
    ticks = 0
    slideIndex = slideIndex + 1
  end
  -- Stepping every tick keeps the clock current; paint() skips unchanged frames.
  step()
end
