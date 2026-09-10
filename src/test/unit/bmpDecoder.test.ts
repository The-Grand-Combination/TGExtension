import * as assert from 'node:assert';
import { RIVERS_BMP_PALETTE, TERRAIN_BMP_PALETTE } from '../../data/mapPalettes.js';
import { decodeBmp, formatRgb, indicesOf } from '../../services/bmpDecoder.js';
import { paletteEquals, paletteOf, withPalette } from '../../services/bmpPalette.js';
import { encodeBmp24, encodeBmp8, grayPalette, packRgb } from './bmpFixtures.js';

function image(bytes: Uint8Array): ReturnType<typeof decodeBmp> & { kind: 'image' } {
  const decoded = decodeBmp(bytes);
  assert.strictEqual(decoded.kind, 'image', decoded.kind === 'error' ? decoded.reason : '');
  return decoded;
}

suite('bmpDecoder', () => {
  test('reads an 8-bit bottom-up image in top-down coordinates', () => {
    const decoded = image(encodeBmp8(3, 2, [1, 2, 3, 4, 5, 6], TERRAIN_BMP_PALETTE));
    assert.strictEqual(decoded.image.width, 3);
    assert.strictEqual(decoded.image.height, 2);
    assert.strictEqual(decoded.image.bitsPerPixel, 8);
    assert.strictEqual(decoded.image.indexAt(0, 0), 1);
    assert.strictEqual(decoded.image.indexAt(2, 1), 6);
    assert.deepStrictEqual([...indicesOf(decoded.image)], [1, 2, 3, 4, 5, 6]);
  });

  test('honours top-down storage, padded rows and a V5 header', () => {
    const decoded = image(encodeBmp8(5, 2, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], RIVERS_BMP_PALETTE, { topDown: true, infoHeaderSize: 124, colorsUsed: 256 }));
    assert.deepStrictEqual([...indicesOf(decoded.image)], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.strictEqual(decoded.image.paletteEntries, 256);
    assert.strictEqual(decoded.image.paletteOffset, 14 + 124);
  });

  test('reads 24-bit colors as packed rgb', () => {
    const decoded = image(encodeBmp24(2, 2, [packRgb(1, 2, 3), packRgb(4, 5, 6), packRgb(7, 8, 9), packRgb(255, 0, 128)]));
    assert.strictEqual(decoded.image.bitsPerPixel, 24);
    assert.strictEqual(formatRgb(decoded.image.rgbAt(0, 0)), '1,2,3');
    assert.strictEqual(formatRgb(decoded.image.rgbAt(1, 1)), '255,0,128');
  });

  test('rejects what is not a supported BMP', () => {
    assert.deepStrictEqual(decodeBmp(Uint8Array.from([1, 2, 3])), { kind: 'error', reason: 'not a BMP file (missing BM signature)' });
    const compressed = encodeBmp8(4, 1, [0, 0, 0, 0], TERRAIN_BMP_PALETTE);
    new DataView(compressed.buffer).setUint32(30, 1, true);
    assert.strictEqual(decodeBmp(compressed).kind, 'error');
    const truncated = encodeBmp24(4, 4, []).subarray(0, 60);
    assert.strictEqual(decodeBmp(truncated).kind, 'error');
  });
});

suite('bmpPalette', () => {
  test('reads the palette back and compares it', () => {
    const decoded = image(encodeBmp8(4, 1, [0, 0, 0, 0], RIVERS_BMP_PALETTE));
    assert.ok(paletteEquals(paletteOf(decoded.image), RIVERS_BMP_PALETTE));
    assert.ok(!paletteEquals(paletteOf(decoded.image), TERRAIN_BMP_PALETTE));
  });

  test('replaces only the palette bytes', () => {
    const original = encodeBmp8(4, 1, [7, 8, 9, 10], grayPalette());
    const decoded = image(original);
    const fixed = withPalette(decoded.image, TERRAIN_BMP_PALETTE);
    assert.strictEqual(fixed.length, original.length);
    assert.ok(paletteEquals(paletteOf(image(fixed).image), TERRAIN_BMP_PALETTE));
    assert.deepStrictEqual([...indicesOf(image(fixed).image)], [7, 8, 9, 10]);
    assert.deepStrictEqual([...original.subarray(0, 54)], [...fixed.subarray(0, 54)]);
  });

  test('the standard palettes carry the sea, land and ocean colors', () => {
    assert.strictEqual(RIVERS_BMP_PALETTE.length, 256);
    assert.strictEqual(TERRAIN_BMP_PALETTE.length, 256);
    assert.deepStrictEqual(RIVERS_BMP_PALETTE[254], [255, 0, 128]);
    assert.deepStrictEqual(RIVERS_BMP_PALETTE[255], [255, 255, 255]);
    assert.deepStrictEqual(RIVERS_BMP_PALETTE[0], [0, 255, 0]);
    assert.deepStrictEqual(TERRAIN_BMP_PALETTE[254], [255, 255, 255]);
  });
});
