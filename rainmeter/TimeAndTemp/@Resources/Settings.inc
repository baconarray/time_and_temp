; Time and Temp sign settings. Save this file, then right-click the sign and
; choose "Refresh skin" to apply changes.

[Variables]
; The two words the sign switches between, up to 4 characters each.
; Leave one blank to show only the other.
Word1=CALL
Word2=JOE

; Where the temperature comes from. Country is a two-letter code.
ZipCode=04101
Country=US
; fahrenheit or celsius
TempUnit=fahrenheit

; How long each slide stays up, and how long the lights take to fade off
; (then on again) between slides.
SecondsPerSlide=3
FadeSeconds=0.2
; Where short words sit on the sign: left, center or right
Align=left
; 1 to include the slide, 0 to skip it
ShowTime=1
ShowTemp=1

; Size of the sign. 1 is 858 px wide.
Scale=0.5

; Colors as R,G,B. Background takes a fourth value for opacity (0-255).
LightOn=255,210,63
LightOff=39,40,42
Background=0,0,0,200

; The font. install.py copies the repo's glyphs.json here.
GlyphsFile=#@#glyphs.json
