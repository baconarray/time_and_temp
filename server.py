"""Local dev server for the Time and Temperature glyph editor.

Serves the static pages in this directory and accepts POST /api/glyphs,
which validates the payload and writes it to glyphs.json.

    python server.py [port]
"""

import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GLYPHS_PATH = ROOT / "glyphs.json"
WIDTH, HEIGHT = 5, 9


def validate(data):
    if not isinstance(data, dict) or not isinstance(data.get("glyphs"), dict):
        raise ValueError("payload must be an object with a 'glyphs' object")
    for char, rows in data["glyphs"].items():
        if len(char) != 1:
            raise ValueError(f"glyph key {char!r} must be a single character")
        if not isinstance(rows, list) or len(rows) != HEIGHT:
            raise ValueError(f"glyph {char!r} must have {HEIGHT} rows")
        for row in rows:
            if not isinstance(row, list) or len(row) != WIDTH or any(v not in (0, 1) for v in row):
                raise ValueError(f"glyph {char!r} rows must be {WIDTH} values of 0 or 1")


def dump(glyphs):
    """Write one matrix row per line so the file stays readable and diffable."""
    entries = []
    for char, rows in glyphs.items():
        body = ",\n".join("      [" + ",".join(str(v) for v in row) + "]" for row in rows)
        entries.append(f"    {json.dumps(char, ensure_ascii=False)}: [\n{body}\n    ]")
    return (
        "{\n"
        f'  "width": {WIDTH},\n'
        f'  "height": {HEIGHT},\n'
        '  "glyphs": {\n' + ",\n".join(entries) + "\n  }\n}\n"
    )


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Always serve the latest glyphs.json after a save.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/api/glyphs":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            validate(data)
        except (ValueError, json.JSONDecodeError) as e:
            self.send_error(400, str(e))
            return
        GLYPHS_PATH.write_text(dump(data["glyphs"]), encoding="utf-8")
        body = json.dumps({"ok": True, "count": len(data["glyphs"])}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving on http://localhost:{port}/  (editor: /index.html, display: /display.html)")
    ThreadingHTTPServer(("localhost", port), Handler).serve_forever()
