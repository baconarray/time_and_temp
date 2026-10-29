# Time and Temp

A 5×9 light-grid font copied from the sign on the Time and Temperature building in Portland, ME, plus tools for drawing it. The goal of this project is to create an interface that allows one to create a JSON file with the shape of glyphs from the Time and Temp sign to be used in other projects. 

```
python server.py
```

- **Editor:** http://localhost:8000/index.html. Click or drag lights on each character, then press **Submit** to save to `glyphs.json`.
- **Display test:** http://localhost:8000/display.html. A 4-character sign that switches between two words.

`glyphs.json` maps each character to 9 rows of 5 values (`1` = on, `0` = off), with rows running top to bottom.
