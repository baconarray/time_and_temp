"""Copy the TimeAndTemp skin and glyphs.json into Rainmeter's Skins folder.

    python rainmeter/install.py [skins_dir]

Without an argument it uses the SkinPath from Rainmeter.ini, falling back to
Documents/Rainmeter/Skins. Run it again after editing glyphs.json; an
existing Settings.inc is never overwritten.
"""

import configparser
import os
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKIN = HERE / "TimeAndTemp"
GLYPHS = HERE.parent / "glyphs.json"
SETTINGS = Path("@Resources") / "Settings.inc"


def skins_dir():
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    ini = Path(os.environ.get("APPDATA", "")) / "Rainmeter" / "Rainmeter.ini"
    if ini.exists():
        config = configparser.ConfigParser(interpolation=None, strict=False)
        config.read(ini, encoding="utf-16" if ini.read_bytes()[:2] == b"\xff\xfe" else "utf-8")
        path = config.get("Rainmeter", "SkinPath", fallback="")
        if path:
            return Path(path)
    return Path.home() / "Documents" / "Rainmeter" / "Skins"


def main():
    target = skins_dir() / "TimeAndTemp"
    for src in SKIN.rglob("*"):
        if src.is_dir():
            continue
        rel = src.relative_to(SKIN)
        dest = target / rel
        if rel == SETTINGS and dest.exists():
            print(f"kept     {dest}")
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        print(f"copied   {dest}")
    dest = target / "@Resources" / "glyphs.json"
    shutil.copy2(GLYPHS, dest)
    print(f"copied   {dest}")
    print("\nIn Rainmeter, choose Refresh all, then load TimeAndTemp > TimeAndTemp.ini.")


if __name__ == "__main__":
    main()
