import * as assert from 'node:assert';
import { decodeBmp, type BmpImage } from '../../services/bmpDecoder.js';
import { applyRuns, enclosedPixels, floodFill, runsOf, strokePixels, unusedColor } from '../../services/provincePaint.js';
import { encodeBmp24, packRgb } from './bmpFixtures.js';

const RED = packRgb(255, 0, 0);
const BLUE = packRgb(0, 0, 255);
const GREEN = packRgb(0, 255, 0);

function image(bytes: Uint8Array): BmpImage {
  const decoded = decodeBmp(bytes);
  assert.strictEqual(decoded.kind, 'image', decoded.kind === 'error' ? decoded.reason : '');
  return decoded.image;
}

/** A 4x3 map: a red block on the left, blue on the right, and one red pixel cut off by blue. */
function sample(): Uint32Array {
  return new Uint32Array([
    RED, RED, BLUE, BLUE,
    RED, RED, BLUE, RED,
    BLUE, BLUE, BLUE, BLUE,
  ]);
}

suite('provincePaint', () => {
  test('fills the region that touches the pixel, and leaves the one cut off by another colour', () => {
    const filled = floodFill(sample(), 4, 3, 0, GREEN).sort((one, other) => one - other);
    assert.deepStrictEqual(filled, [0, 1, 4, 5]);
  });

  test('does not leak through a corner', () => {
    const packed = new Uint32Array([RED, BLUE, BLUE, RED]);
    assert.deepStrictEqual(floodFill(packed, 2, 2, 0, GREEN), [0]);
  });

  test('fills nothing when the pixel already holds the colour', () => {
    assert.deepStrictEqual(floodFill(sample(), 4, 3, 0, RED), []);
  });

  test('a brush of one pixel draws a line with no holes in it', () => {
    const pixels = strokePixels({ x: 0, y: 0 }, { x: 3, y: 2 }, 1, 4, 3).sort((one, other) => one - other);
    assert.deepStrictEqual(pixels, [0, 5, 6, 11]);
  });

  test('a wider brush is a square around the point, clipped to the map', () => {
    const pixels = strokePixels({ x: 0, y: 0 }, { x: 0, y: 0 }, 3, 4, 3).sort((one, other) => one - other);
    assert.deepStrictEqual(pixels, [0, 1, 4, 5]);
  });

  test('joins neighbouring pixels of one colour into a single run', () => {
    const pixels = new Map([[5, RED], [4, RED], [6, BLUE], [9, RED]]);
    assert.deepStrictEqual(runsOf(pixels), [4, 2, RED, 6, 1, BLUE, 9, 1, RED]);
  });

  test('writes the runs into a bottom-up bitmap the way the page reads it', () => {
    // The page reads the rows in the order the file stores them, so its row 0 is
    // the bottom row of a bottom-up bitmap.
    const bytes = encodeBmp24(3, 2, [RED, RED, RED, BLUE, BLUE, BLUE]);
    const bitmap = image(bytes);
    assert.deepStrictEqual(applyRuns(bitmap, [1, 1, GREEN]), { ok: true, pixels: 1 });
    assert.strictEqual(bitmap.rgbAt(1, 1), GREEN);
    assert.strictEqual(bitmap.rgbAt(1, 0), RED);
  });

  test('writes the runs into a top-down bitmap as its own rows', () => {
    const bitmap = image(encodeBmp24(3, 2, [RED, RED, RED, BLUE, BLUE, BLUE], { topDown: true }));
    assert.deepStrictEqual(applyRuns(bitmap, [1, 1, GREEN]), { ok: true, pixels: 1 });
    assert.strictEqual(bitmap.rgbAt(1, 0), GREEN);
  });

  test('a run crossing a row keeps both halves on their own row', () => {
    const bitmap = image(encodeBmp24(3, 2, [RED, RED, RED, BLUE, BLUE, BLUE]));
    assert.deepStrictEqual(applyRuns(bitmap, [2, 2, GREEN]), { ok: true, pixels: 2 });
    assert.strictEqual(bitmap.rgbAt(2, 1), GREEN);
    assert.strictEqual(bitmap.rgbAt(0, 0), GREEN);
  });

  test('refuses runs that fall outside the map, and leaves the bytes alone', () => {
    const bitmap = image(encodeBmp24(3, 2, [RED, RED, RED, BLUE, BLUE, BLUE]));
    assert.deepStrictEqual(applyRuns(bitmap, [5, 2, GREEN]), { ok: false, reason: 'painted pixels fall outside the map' });
    assert.strictEqual(bitmap.rgbAt(2, 0), RED);
  });
});

suite('provincePaint — what a drawn line closes off', () => {
  const W = 7;
  const H = 6;

  /** A red province filling x 0..2 of rows 2..4, blue everywhere else. */
  function bay(): Uint32Array {
    const packed = new Uint32Array(W * H).fill(BLUE);
    for (let y = 2; y <= 4; y++) {
      for (let x = 0; x <= 2; x++) { packed[y * W + x] = RED; }
    }
    return packed;
  }

  /** Out of the province at row 2, around to x = 5, and back into it at row 4. */
  const ARC = [3 + 2 * W, 4 + 2 * W, 5 + 2 * W, 5 + 3 * W, 5 + 4 * W, 4 + 4 * W, 3 + 4 * W];

  test('fills what the line and the colour shut away from the edge of the map', () => {
    const filled = enclosedPixels(bay(), W, H, ARC, RED).sort((one, other) => one - other);
    assert.deepStrictEqual(filled, [3 + 3 * W, 4 + 3 * W]);
  });

  test('a line that never comes back closes nothing', () => {
    const open = [3 + 2 * W, 4 + 2 * W, 5 + 2 * W];
    assert.deepStrictEqual(enclosedPixels(bay(), W, H, open, RED), []);
  });

  test('a hole the colour has had all along is left alone', () => {
    const packed = bay();
    // A blue pixel walled in by red, far from the line: not what the user drew.
    packed[0 + 0 * W] = RED; packed[1 + 0 * W] = RED; packed[2 + 0 * W] = RED;
    packed[0 + 1 * W] = RED; packed[2 + 1 * W] = RED;
    const filled = enclosedPixels(packed, W, H, ARC, RED).sort((one, other) => one - other);
    assert.deepStrictEqual(filled, [3 + 3 * W, 4 + 3 * W]);
  });

  test('the line itself is a wall even where the colour is not there yet', () => {
    // The same arc over a map with no province at all shuts nothing: the wall is open at the left.
    const plain = new Uint32Array(W * H).fill(BLUE);
    assert.deepStrictEqual(enclosedPixels(plain, W, H, ARC, RED), []);
  });
});

suite('provincePaint — a colour nothing is using', () => {
  test('the draw decides it when the colour it lands on is free', () => {
    assert.strictEqual(unusedColor(new Set([1, 2]), () => 0.5), 0x800000);
  });

  test('a taken colour is walked past, one at a time', () => {
    assert.strictEqual(unusedColor(new Set([0, 1, 2]), () => 0), 3);
  });

  test('the walk wraps around the end of the space', () => {
    const taken = new Set([0xffffff, 0, 1]);
    assert.strictEqual(unusedColor(taken, () => 1), 2);
  });

  test('a draw outside the space is brought back inside it', () => {
    assert.strictEqual(unusedColor(new Set(), () => -1), 0);
    assert.strictEqual(unusedColor(new Set(), () => 2), 0xffffff);
  });
});
