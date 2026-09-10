import * as assert from 'node:assert';
import { RIVERS_BMP_PALETTE, TERRAIN_BMP_PALETTE } from '../../data/mapPalettes.js';
import { decodeBmp } from '../../services/bmpDecoder.js';
import { paletteEquals, paletteOf } from '../../services/bmpPalette.js';
import { COLORMAP_FILES, planColormapFix } from '../../services/colormapEnforcement.js';
import { encodeBmp24, encodeBmp8, grayPalette } from './bmpFixtures.js';

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

  test('rewrites a non-standard palette and keeps the pixels', () => {
    const plan = planColormapFix(encodeBmp8(4, 1, [0, 1, 2, 3], grayPalette()), RIVERS_BMP_PALETTE);
    assert.strictEqual(plan.outcome, 'fixable');
    const fixed = decodeBmp(plan.fixed);
    assert.strictEqual(fixed.kind, 'image');
    assert.ok(paletteEquals(paletteOf(fixed.image), RIVERS_BMP_PALETTE));
    assert.deepStrictEqual([0, 1, 2, 3].map((x) => fixed.image.indexAt(x, 0)), [0, 1, 2, 3]);
  });

  test('cannot fix what has no palette or is not a BMP', () => {
    assert.deepStrictEqual(planColormapFix(undefined, TERRAIN_BMP_PALETTE), { outcome: 'missing' });
    assert.deepStrictEqual(planColormapFix(Uint8Array.from([0, 1, 2]), TERRAIN_BMP_PALETTE), { outcome: 'unreadable' });
    assert.deepStrictEqual(planColormapFix(encodeBmp24(1, 1, [0]), TERRAIN_BMP_PALETTE), { outcome: 'not-indexed' });
  });
});
