import * as assert from 'node:assert';
import { decodePicture } from '../../services/pictureDecoder.js';
import { resolvePictureAt } from '../../services/pictureHover.js';
import { encodePng } from '../../services/pngEncoder.js';

function ddsHeader(width: number, height: number, fourCc: string): Uint8Array {
  const bytes = new Uint8Array(128);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x20534444, true);
  view.setUint32(4, 124, true);
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(76, 32, true);
  view.setUint32(80, 0x4, true);
  for (let index = 0; index < 4; index++) {
    bytes[84 + index] = fourCc.charCodeAt(index);
  }
  return bytes;
}

suite('pictureDecoder — DDS', () => {
  test('decodes a solid red DXT1 block', () => {
    // color0 = 0xF800 (red), color1 = 0x0000, all pixels use palette entry 0.
    const block = Uint8Array.from([0x00, 0xf8, 0x00, 0x00, 0, 0, 0, 0]);
    const file = Buffer.concat([ddsHeader(4, 4, 'DXT1'), block]);
    const decoded = decodePicture(file, 'test.dds');
    assert.ok(decoded, 'expected a decoded image');
    assert.strictEqual(decoded.width, 4);
    assert.strictEqual(decoded.height, 4);
    assert.deepStrictEqual([...decoded.rgba.slice(0, 4)], [255, 0, 0, 255]);
  });

  test('clips DXT1 blocks on non-multiple-of-4 sizes', () => {
    const block = Uint8Array.from([0x00, 0xf8, 0x00, 0x00, 0, 0, 0, 0]);
    const file = Buffer.concat([ddsHeader(3, 2, 'DXT1'), block]);
    const decoded = decodePicture(file, 'test.dds');
    assert.ok(decoded, 'expected a decoded image');
    assert.strictEqual(decoded.rgba.length, 3 * 2 * 4);
  });

  test('decodes DXT5 alpha', () => {
    // alpha0=255 > alpha1=0 (8-value mode), all alpha indices 0 → 255.
    const alpha = Uint8Array.from([255, 0, 0, 0, 0, 0, 0, 0]);
    const color = Uint8Array.from([0x00, 0xf8, 0x00, 0x00, 0, 0, 0, 0]);
    const file = Buffer.concat([ddsHeader(4, 4, 'DXT5'), alpha, color]);
    const decoded = decodePicture(file, 'test.dds');
    assert.ok(decoded, 'expected a decoded image');
    assert.strictEqual(decoded.rgba[3], 255);
  });

  test('rejects truncated files', () => {
    assert.strictEqual(decodePicture(ddsHeader(16, 16, 'DXT1'), 'test.dds'), undefined);
  });
});

suite('pictureDecoder — TGA', () => {
  function tgaFile(imageType: number, pixels: number[]): Uint8Array {
    // 2x1, 24bpp, top-origin.
    const header = new Uint8Array(18);
    header[2] = imageType;
    header[12] = 2;
    header[14] = 1;
    header[16] = 24;
    header[17] = 0x20;
    return Buffer.concat([header, Uint8Array.from(pixels)]);
  }

  test('decodes uncompressed 24-bit BGR', () => {
    const decoded = decodePicture(tgaFile(2, [255, 0, 0, 0, 0, 255]), 'test.tga');
    assert.ok(decoded, 'expected a decoded image');
    assert.deepStrictEqual([...decoded.rgba.slice(0, 8)], [0, 0, 255, 255, 255, 0, 0, 255]);
  });

  test('decodes RLE runs', () => {
    // One RLE packet: repeat count 2 of a single green BGR pixel.
    const decoded = decodePicture(tgaFile(10, [0x81, 0, 255, 0]), 'test.tga');
    assert.ok(decoded, 'expected a decoded image');
    assert.deepStrictEqual([...decoded.rgba.slice(0, 8)], [0, 255, 0, 255, 0, 255, 0, 255]);
  });
});

suite('pngEncoder', () => {
  test('produces a valid PNG signature and dimensions', () => {
    const png = encodePng(2, 1, Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]));
    assert.deepStrictEqual([...png.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer, png.byteOffset);
    assert.strictEqual(view.getUint32(16), 2);
    assert.strictEqual(view.getUint32(20), 1);
  });
});

suite('pictureHover — scaling', () => {
  test('downscales preserving aspect ratio, never upscales', async () => {
    const { scaleImage } = await import('../../services/pictureHover.js');
    const wide = { width: 800, height: 300, rgba: new Uint8Array(800 * 300 * 4) };
    const scaled = scaleImage(wide, 560);
    assert.strictEqual(scaled.width, 560);
    assert.strictEqual(scaled.height, Math.round((300 * 560) / 800));
    const small = { width: 95, height: 95, rgba: new Uint8Array(95 * 95 * 4) };
    assert.strictEqual(scaleImage(small, 560), small);
  });

  test('pixel-doubles small images crisply', async () => {
    const { pixelDouble } = await import('../../services/pictureHover.js');
    const image = { width: 2, height: 1, rgba: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]) };
    const doubled = pixelDouble(image);
    assert.strictEqual(doubled.width, 4);
    assert.strictEqual(doubled.height, 2);
    assert.deepStrictEqual([...doubled.rgba.slice(0, 8)], [255, 0, 0, 255, 255, 0, 0, 255]);
    assert.deepStrictEqual([...doubled.rgba.slice(16, 20)], [255, 0, 0, 255]);
  });
});

suite('pictureHover — context detection', () => {
  test('detects picture values, quoted or not', () => {
    const text = 'country_event = { picture = "Slaves" }';
    const offset = text.indexOf('Slaves') + 2;
    assert.strictEqual(resolvePictureAt(text, offset)?.name, 'Slaves');
    const bare = 'picture = cavours_diplomacy';
    assert.strictEqual(resolvePictureAt(bare, bare.length - 2)?.name, 'cavours_diplomacy');
  });

  test('ignores non-picture values', () => {
    const text = 'title = "Slaves"';
    assert.strictEqual(resolvePictureAt(text, text.indexOf('Slaves') + 2), undefined);
  });
});
