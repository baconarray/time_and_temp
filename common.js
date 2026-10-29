// Shared glyph data helpers and rendering for the editor and display pages.

const WIDTH = 5;
const HEIGHT = 9;

// Every character the editor offers, in display order.
const CHARSET = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  ..." °-.,:'\"!?/%+=#&$@()*<>_",
];

function blankGlyph() {
  return Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));
}

function charLabel(ch) {
  return ch === " " ? "SPACE" : ch;
}

// Loads glyphs.json and returns { char: matrix } with a blank entry for any
// CHARSET character the file is missing. Extra characters in the file are kept.
async function loadGlyphs() {
  const res = await fetch("glyphs.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load glyphs.json (${res.status})`);
  const data = await res.json();
  const glyphs = {};
  for (const ch of CHARSET) glyphs[ch] = blankGlyph();
  Object.assign(glyphs, data.glyphs || {});
  return glyphs;
}

async function saveGlyphs(glyphs) {
  const res = await fetch("api/glyphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ width: WIDTH, height: HEIGHT, glyphs }),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// Builds a black panel of WIDTH x HEIGHT lights inside `panel`.
// Returns a 2D array of the light elements, indexed [row][col].
function buildPanel(panel) {
  panel.classList.add("panel");
  panel.replaceChildren();
  const lights = [];
  for (let r = 0; r < HEIGHT; r++) {
    const row = [];
    for (let c = 0; c < WIDTH; c++) {
      const light = document.createElement("div");
      light.className = "light";
      light.dataset.row = r;
      light.dataset.col = c;
      panel.appendChild(light);
      row.push(light);
    }
    lights.push(row);
  }
  return lights;
}

function paintPanel(lights, matrix) {
  for (let r = 0; r < HEIGHT; r++) {
    for (let c = 0; c < WIDTH; c++) {
      lights[r][c].classList.toggle("on", !!(matrix && matrix[r][c]));
    }
  }
}
