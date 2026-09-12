# Map bitmaps — `provinces.bmp`, `terrain.bmp`, `rivers.bmp`

The three bitmaps under `map/` are checked by the **map audit** (`services/mapImageAudit.ts`,
`services/riverAnalysis.ts`) behind the side bar action **Map Report**
(`victorian-tools.generateMapReport`, `commands/generateMapReportCommand.ts`, request
`victorianTools/mapReport` in `model/mapAudit.ts`). It is a report of its own, apart from the full
report: the findings have no text to highlight, and pixel findings would crowd the file findings out.
The side bar action **Enforce Colormaps** puts the two standard palettes back and renumbers the
pixels to match.

## What the engine does (NCE `map/map_data_loading.cpp`, `map/map_borders.cpp`)

The engine never complains about these files. Every defect below is repaired or ignored silently:

- `provinces.bmp` is decoded as RGB; each pixel's color is looked up in `definition.csv`. A color
  with no row becomes **province 0** (no province, no adjacency, treated as sea by the coast code).
  A province defined without any pixel gets mid-point (0, 0) and, on land, no terrain.
- `terrain.bmp` and `rivers.bmp` are read as one byte per pixel; **the palette is never read**. The
  file must be 8-bit; a compressed or otherwise exotic header aborts the game. Both must have the
  width of `provinces.bmp`.
- Terrain indices 0–63 map to a category through `terrain.txt` (`name = { type = X color = { N } }`);
  254 is ocean. Any other index on a land pixel is rewritten to 5 (plains). A province's terrain is
  the most frequent index over its pixels, unless `history/provinces` sets `terrain =`.
- Rivers: index 0 is a **source**, 1 a **merge**, 254 sea, 255 land, and every other index is river
  body (2–11 are the widths the palette names; TGC paints a wide river with index 16 and the game
  draws it, so NCE's cut at 16 is not the game's). Tracing starts at sources only; a river with no
  source is never drawn.

The palettes are the same in every known map (game files, TGC, GFM) and are kept in
`data/mapPalettes.ts`; they are what image editors show, so a wrong palette makes the file
unreadable to a human while the game keeps working.

## Reading the files

`services/bmpDecoder.ts` reads 8/24/32-bit uncompressed BMPs with 12/40/52/56/108/124-byte headers,
bottom-up or top-down, padded rows, `biClrUsed` 0 or 256, and exposes pixels in **image-editor
coordinates** (x, y from the top-left corner). Every position in the report uses those coordinates.
The files are read through the [mod stack](mods-and-submods.md), so a submod that ships only
`terrain.txt` is checked over its base mod's bitmaps. The audit runs for a mod whose own folder has
any of `map/provinces.bmp`, `terrain.bmp`, `rivers.bmp`, `definition.csv`, `default.map`,
`terrain.txt`; a submod that does not touch the map does not repeat its base mod's findings.

The whole audit over TGC (7040×2880, 20 M pixels per bitmap) takes about 0.3 s; the pixel passes
yield to the event loop every 128 rows.

## Rules

Files and formats (all errors): `map-file-missing` (any of the three is absent from the stack),
`bmp-unsupported` (not a BMP, RLE, wrong bit depth: provinces needs 24/32-bit, the others 8-bit),
`map-size-mismatch` (terrain/rivers not the size of provinces), `map-size-not-multiple` (the map
height is not a multiple of 144, which the game requires; the width is free; the message names the
nearest multiples),
`nonstandard-palette` (terrain or rivers palette differs from the standard one; Enforce Colormaps
fixes it).

`provinces.bmp`, against `definition.csv`:

- `unknown-color` (error, one per color): pixels of a color with no row. Rows with an **empty id**
  (`;1;222;208;Lake Sakami;x`) are lakes the engine ignores on purpose; their colors are not errors.
- `province-without-pixels` (warning, per province): an id with a row but no pixel.

`terrain.bmp` against `provinces.bmp` and `terrain.txt`:

- `terrain-index-unmapped` (error, per index): a land pixel whose index is ≥ 64 (rewritten to
  plains) or has no `color = { N }` entry in `terrain.txt`.
- `land-over-ocean-terrain` (warning, per province): land province pixels painted ocean (254).
- `terrain-over-sea` (warning, per province): pixels of a `sea_starts` province painted with a land
  index (< 64).
- `terrain-without-province` (warning): land terrain where `provinces.bmp` has no province (unknown
  color; lake colors excluded).

`rivers.bmp` against `provinces.bmp`:

- `river-over-sea` (warning, one line): river pixels on sea provinces — river mouths drawn one pixel
  into the sea, common on every coast.
- `river-sea-over-land`, `river-land-over-sea` (warning, one line each): 254 on a land province,
  255 on a sea province.

River shape (`riverAnalysis.ts`). Neighbours are the **8 surrounding pixels**: 698 of TGC's 1208
sources and 343 of the game's 905 sit diagonally against the river they start, so diagonal contact is
a mapping convention, not a defect, and there is no corner rule.

- `river-isolated-pixel` (warning): a river pixel with no river neighbour; the game draws nothing for
  it.
- `river-merge-detached` (error): a merge pixel (1) touching fewer than 2 river pixels.
- `river-not-reaching-sea` (warning, one line per river): a connected river that touches no sea pixel
  (rivers 254 or a sea-province pixel) anywhere. Rivers may end inland (closed basins, rivers that
  vanish in a desert): the game draws them, so this is not an error, and a river's own end pixels
  are not checked.
- `river-thick` (warning): a 2×2 block of river pixels; rivers are 1 pixel wide. Reported at the
  block's top-left pixel.
- `river-without-source` (warning): a connected river of more than one pixel with no source; the
  engine never draws it.

Counts are aggregated by their natural key (color, province, palette index) with the pixel count and
the first position, so a thousand mispainted pixels of one color are one line. Shape defects are one
line per pixel, since each is fixed on its own.

## Report layout

**Map Report** opens the same mod dialog as the full report and produces a plain-text document
(`renderMapReportText`, `services/reportText.ts`), one section per mod:

```
Victorian Tools - Map report
Generated 2026-09-09 18:00:00
Pixel positions are x, y from the top-left corner of the image.

<mod root>
2 errors, 71 warnings in the map bitmaps
  map/provinces.bmp                error   unknown-color: Color 50,50,125 covers 4 pixels (first at 327, 1033) and is not in map/definition.csv; ...
  map/rivers.bmp (4077, 1196)      warning river-thick: River is 2 pixels wide here: the 2x2 block from this pixel is all river.
```

A picked mod that ships no map file of its own gets one line saying so instead of repeating its base
mod's findings. The full report does not include the map bitmaps.

## Enforce Colormaps

The side bar row **Enforce Colormaps** (`victorian-tools.enforceColormaps`,
`commands/enforceColormapsCommand.ts`) opens the mod dialog, then asks the server
(`victorianTools/enforceColormaps`, `model/colormaps.ts`) for a dry run over each picked mod's **own**
`map/terrain.bmp` and `map/rivers.bmp` (never a file of a layer below). Each file is `standard`,
`fixable`, `not-indexed` (not 8-bit, nothing to fix), `missing` or `unreadable`
(`services/colormapEnforcement.ts`). With something fixable, a modal lists the files and **Rewrite
palettes** runs the request again for real: the 256 palette entries after the header are replaced
and **every pixel is renumbered to the standard index of the colour it had** under the file's own
palette (`remapToPalette` in `services/bmpPalette.ts`); headers stay byte for byte, and the file is
written in place. The result per file, with the number of pixels renumbered, is shown in a message.

The renumbering is the point. The game reads pixel indices and never the palette, and an image
editor that saves a 256-colour BMP (mspaint, for one) re-sorts the colour table and renumbers the
pixels to match, so the picture looks the same while sea may now be index 135 and a merge point
249. Replacing the table alone would leave those indices in place and turn the whole sea into river.
A colour the standard palette does not have goes to its nearest entry by RGB distance and is counted
in the message; where the standard palette repeats a colour (the `2, 0, 1` filler of rivers.bmp,
indices 16-253), the first index wins, which is the one TGC paints its wide river with.

The vanilla `rivers.bmp` and `terrain.bmp` carry exactly the standard palettes above with a 40-byte
info header; TGC's committed files carry the same palettes behind a 124-byte header. Both are read.

## Calibration

Game files (5616×2160): 28 unknown colors (15 505 pixels, the well-known vanilla map slips, e.g.
`1,222,200` with 8345 pixels), 24 stray terrain pixels with indices 93/96/173/211, 28 provinces with
a pixel over ocean terrain, 6 thick blocks, 7 detached merges, 1 lone pixel, 10 rivers that never
touch the sea. TGC (7040×2880): 1 unknown color (`50,50,125`, 4 pixels), province 3234 (Qinghai
Lake) without pixels, 1 lone river pixel, 18 thick blocks, 26 rivers that never touch the sea,
19 provinces with a pixel over ocean terrain. Both palettes are standard in both maps. The 7950
pixels of index 16 in TGC's rivers.bmp are a wide river the game draws (49 sources start it, 95
merges join it); treating them as river removed the lone pixels and detached merges an index cut at
16 had produced. The game map
is 5616×2160 and TGC's 7040×2880; both heights are multiples of 144, so neither is flagged by
`map-size-not-multiple`.
