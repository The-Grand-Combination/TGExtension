import * as assert from 'node:assert';
import { decodeBmp, type BmpImage } from '../../services/bmpDecoder.js';
import { riversThumbnail, sampledThumbnail, thumbnailDataUri } from '../../services/mapThumbnails.js';
import { encodeBmp24, encodeBmp8, grayPalette, packRgb } from './bmpFixtures.js';

function decoded(bytes: Uint8Array): BmpImage {
  const result = decodeBmp(bytes);
  assert.ok(result.kind === 'image', result.kind === 'error' ? result.reason : '');
  return result.image;
}

function pixel(rgba: Uint8Array, width: number, x: number, y: number): readonly number[] {
  const at = (y * width + x) * 4;
  return [rgba[at] ?? -1, rgba[at + 1] ?? -1, rgba[at + 2] ?? -1, rgba[at + 3] ?? -1];
}

suite('mapThumbnails', () => {
  test('a cell takes the colour in the middle of it, rows the way the editor draws them', () => {
    // 4 x 2, top-down: red row over blue row. Stored bottom-up, the editor
    // draws the blue row first, so the thumbnail's top row is blue.
    const red = packRgb(255, 0, 0);
    const blue = packRgb(0, 0, 255);
    const image = decoded(encodeBmp24(4, 2, [red, red, red, red, blue, blue, blue, blue]));
    const rgba = sampledThumbnail(image, 2, 2);
    assert.deepStrictEqual(pixel(rgba, 2, 0, 0), [0, 0, 255, 255]);
    assert.deepStrictEqual(pixel(rgba, 2, 1, 1), [255, 0, 0, 255]);
  });

  test('a top-down file is not turned over', () => {
    const red = packRgb(255, 0, 0);
    const blue = packRgb(0, 0, 255);
    const image = decoded(encodeBmp24(2, 2, [red, red, blue, blue], { topDown: true }));
    assert.deepStrictEqual(pixel(sampledThumbnail(image, 2, 2), 2, 0, 0), [255, 0, 0, 255]);
  });

  test('an 8-bit file is shown through its own palette', () => {
    const palette = grayPalette();
    const image = decoded(encodeBmp8(2, 1, [0, 200], palette));
    const rgba = sampledThumbnail(image, 2, 1);
    assert.deepStrictEqual(pixel(rgba, 2, 0, 0), [...palette[0] ?? [], 255]);
    assert.deepStrictEqual(pixel(rgba, 2, 1, 0), [...palette[200] ?? [], 255]);
  });

  test('a one-pixel river lights the cell it crosses in its own colour; land and sea keep theirs', () => {
    // 8 x 4 of land (255) with one river pixel (2) at the top-left corner of the
    // top-down picture, and sea (254) everywhere on the right half.
    const indices = new Array<number>(32).fill(255);
    for (let y = 0; y < 4; y++) { for (let x = 4; x < 8; x++) { indices[y * 8 + x] = 254; } }
    indices[0] = 2;
    const palette = grayPalette();
    const image = decoded(encodeBmp8(8, 4, indices, palette));
    const rgba = riversThumbnail(image, 2, 2);
    // Top-down row 0 is drawn last by the editor: it lands on the bottom thumbnail row.
    assert.deepStrictEqual(pixel(rgba, 2, 0, 1), [...palette[2] ?? [], 255]);
    assert.deepStrictEqual(pixel(rgba, 2, 0, 0), [...palette[255] ?? [], 255]);
    assert.deepStrictEqual(pixel(rgba, 2, 1, 1), [...palette[254] ?? [], 255]);
  });

  test('the data URI is a PNG', () => {
    const uri = thumbnailDataUri(1, 1, new Uint8Array([1, 2, 3, 255]));
    assert.ok(uri.startsWith('data:image/png;base64,'));
    const bytes = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
    assert.deepStrictEqual([...bytes.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  });
});
