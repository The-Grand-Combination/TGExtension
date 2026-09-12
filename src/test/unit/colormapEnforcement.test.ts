import * as assert from 'node:assert';
import { RIVERS_BMP_PALETTE, TERRAIN_BMP_PALETTE, type Palette } from '../../data/mapPalettes.js';
import { decodeBmp } from '../../services/bmpDecoder.js';
import { paletteEquals, paletteOf, remapToPalette } from '../../services/bmpPalette.js';
import { COLORMAP_FILES, planColormapFix } from '../../services/colormapEnforcement.js';
import { encodeBmp24, encodeBmp8, grayPalette } from './bmpFixtures.js';

/** The standard palette with its entries in reverse order, as an editor that re-sorts colours might save it. */
function reversedRiversPalette(): Palette {
  return [...RIVERS_BMP_PALETTE].reverse();
}

function indicesOf(bytes: Uint8Array, count: number): number[] {
  const decoded = decodeBmp(bytes);
  assert.strictEqual(decoded.kind, 'image');
  return Array.from({ length: count }, (_, x) => decoded.image.indexAt(x, 0));
}

suite('colormapEnforcement', () => {
  test('covers terrain.bmp and rivers.bmp with their own palettes', () => {
    assert.deepStrictEqual(COLORMAP_FILES.map((file) => file.relativePath), ['map/terrain.bmp', 'map/rivers.bmp']);
    assert.strictEqual(COLORMAP_FILES[0]?.palette, TERRAIN_BMP_PALETTE);
    assert.strictEqual(COLORMAP_FILES[1]?.palette, RIVERS_BMP_PALETTE);
  });

  test('leaves a standard palette alone', () => {
    const plan = planColormapFix(encodeBmp8(4, 1, [0, 1, 2, 3], RIVERS_BMP_PALETTE), RIVERS_BMP_PALETTE);
    assert.deepStrictEqual(plan, { outcome: 'standard' });
  });

  test('a re-sorted palette is put back and every pixel keeps its colour', () => {
    // Reversed: old index 0 is white (land), 1 is the sea colour, 255 is the source green.
    const plan = planColormapFix(encodeBmp8(4, 1, [0, 1, 255, 254], reversedRiversPalette()), RIVERS_BMP_PALETTE);
    assert.strictEqual(plan.outcome, 'fixable');
    const fixed = decodeBmp(plan.fixed);
    assert.strictEqual(fixed.kind, 'image');
    assert.ok(paletteEquals(paletteOf(fixed.image), RIVERS_BMP_PALETTE));
    assert.deepStrictEqual(indicesOf(plan.fixed, 4), [255, 254, 0, 1]);
    assert.strictEqual(plan.remappedPixels, 4);
    assert.strictEqual(plan.approximatedColors, 0);
  });

  test('pixels already carrying the standard index of their colour are not counted as renumbered', () => {
    // Same colours as the standard palette at 0 and 1, then a swapped pair at 2 and 3.
    const palette: Palette = RIVERS_BMP_PALETTE.map((entry, index) =>
      index === 2 ? RIVERS_BMP_PALETTE[3] ?? entry : index === 3 ? RIVERS_BMP_PALETTE[2] ?? entry : entry,
    );
    const plan = planColormapFix(encodeBmp8(4, 1, [0, 1, 2, 3], palette), RIVERS_BMP_PALETTE);
    assert.strictEqual(plan.outcome, 'fixable');
    assert.deepStrictEqual(indicesOf(plan.fixed, 4), [0, 1, 3, 2]);
    assert.strictEqual(plan.remappedPixels, 2);
  });

  test('a colour the standard palette lacks goes to the nearest standard entry', () => {
    // Grey 250 is nearest to white (255, land); grey 0 is nearest to the filler (2, 0, 1), first at 16.
    const plan = planColormapFix(encodeBmp8(2, 1, [250, 0], grayPalette()), RIVERS_BMP_PALETTE);
    assert.strictEqual(plan.outcome, 'fixable');
    assert.deepStrictEqual(indicesOf(plan.fixed, 2), [255, 16]);
    // Of the 256 greys only white is a standard rivers colour.
    assert.strictEqual(plan.approximatedColors, 255);
  });

  test('the remap keeps the standard palette repeated colours at their first index', () => {
    const decoded = decodeBmp(encodeBmp8(1, 1, [100], RIVERS_BMP_PALETTE));
    assert.strictEqual(decoded.kind, 'image');
    // Index 100 has the filler colour (2, 0, 1), which first appears at 16.
    const remap = remapToPalette(decoded.image, RIVERS_BMP_PALETTE);
    assert.deepStrictEqual(indicesOf(remap.bytes, 1), [16]);
    assert.strictEqual(remap.remappedPixels, 1);
  });

  test('cannot fix what has no palette or is not a BMP', () => {
    assert.deepStrictEqual(planColormapFix(undefined, TERRAIN_BMP_PALETTE), { outcome: 'missing' });
    assert.deepStrictEqual(planColormapFix(Uint8Array.from([0, 1, 2]), TERRAIN_BMP_PALETTE), { outcome: 'unreadable' });
    assert.deepStrictEqual(planColormapFix(encodeBmp24(1, 1, [0]), TERRAIN_BMP_PALETTE), { outcome: 'not-indexed' });
  });
});
