# Instrument Serif

Drop `InstrumentSerif-Regular.woff2` (weight 400) into this folder.

## Why it's missing

The font ships with this repo referenced from `apps/agent/styles/global.css`
via `@font-face`, but the binary is not committed here. Until the file is
present, the editorial title in the agent conversation falls back to
`Iowan Old Style, Georgia, serif`.

## How to fetch

Instrument Serif is SIL OFL 1.1. Grab a woff2 build from Google Fonts and drop
it here:

```sh
curl -L \
  "https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap" \
  | grep -Eo 'https://fonts\.gstatic\.com/s/instrumentserif/[^)]+woff2' \
  | head -1 \
  | xargs curl -Lo apps/agent/public/instrument-serif/InstrumentSerif-Regular.woff2
```

Or open [fonts.google.com/specimen/Instrument+Serif](https://fonts.google.com/specimen/Instrument+Serif)
and download the weight-400 woff2 manually.

The file path **must** match the one referenced in `apps/agent/styles/global.css`:

```css
src: url("../instrument-serif/InstrumentSerif-Regular.woff2") format("woff2");
```
