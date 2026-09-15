import * as assert from 'node:assert';
import {
  affineFromTriangles,
  applyAffine,
  bilinear,
  boundsOf,
  boxFromHandle,
  distortQuad,
  fitQuad,
  freeFileName,
  handleAt,
  insideQuad,
  isAffine,
  mergeReferenceLists,
  moveQuad,
  parseReferences,
  quadOfBox,
  renderReferences,
  type Quad,
  type ReferenceLayer,
} from '../../services/referenceLayers.js';

const SQUARE: Quad = quadOfBox(10, 20, 100, 50);

function near(actual: Quad, expected: Quad): void {
  actual.forEach((corner, index) => {
    const want = expected[index] as { x: number; y: number };
    assert.ok(Math.abs(corner.x - want.x) < 1e-6 && Math.abs(corner.y - want.y) < 1e-6, `corner ${String(index)}: ${JSON.stringify(corner)} vs ${JSON.stringify(want)}`);
  });
}

suite('referenceLayers — the manifest', () => {
  const layer: ReferenceLayer = { file: 'old map.png', corners: SQUARE, opacity: 60 };

  test('a manifest written is a manifest read', () => {
    assert.deepStrictEqual(parseReferences(renderReferences([layer])), [layer]);
  });

  test('corners are written to a hundredth and opacity whole, so a diff stays readable', () => {
    const text = renderReferences([{ file: 'a.png', corners: quadOfBox(0.123456, 0, 1, 1), opacity: 59.6 }]);
    assert.ok(text.includes('0.12'), text);
    assert.ok(!text.includes('0.123'), text);
    assert.ok(text.includes('"opacity": 60'), text);
  });

  test('a broken entry is left out and the rest of the file still counts', () => {
    const text = JSON.stringify({
      references: [
        { file: 'ok.png', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], opacity: 50 },
        { file: '', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], opacity: 50 },
        { file: 'three.png', corners: [[0, 0], [1, 0], [1, 1]], opacity: 50 },
        { file: 'nan.png', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], opacity: 'x' },
        'not even an object',
      ],
    });
    assert.deepStrictEqual(parseReferences(text).map((item) => item.file), ['ok.png']);
  });

  test('a point arrives as a pair from the manifest or as an object from the page, and both are read', () => {
    const pairs = JSON.stringify({ references: [{ file: 'a.png', corners: [[1, 2], [3, 2], [3, 4], [1, 4]], opacity: 50 }] });
    const objects = JSON.stringify({ references: [{ file: 'a.png', corners: [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 4 }, { x: 1, y: 4 }], opacity: 50 }] });
    assert.deepStrictEqual(parseReferences(pairs), parseReferences(objects));
    assert.strictEqual(parseReferences(pairs).length, 1);
    const half = JSON.stringify({ references: [{ file: 'a.png', corners: [{ x: 1 }, [3, 2], [3, 4], [1, 4]], opacity: 50 }] });
    assert.deepStrictEqual(parseReferences(half), []);
  });

  test('a file that is not JSON, or not a manifest, reads as no references', () => {
    assert.deepStrictEqual(parseReferences('{'), []);
    assert.deepStrictEqual(parseReferences('[]'), []);
    assert.deepStrictEqual(parseReferences('{"references": 3}'), []);
  });

  test('opacity is clamped to 0-100 on the way in', () => {
    const text = JSON.stringify({ references: [{ file: 'a.png', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], opacity: 140 }] });
    assert.strictEqual(parseReferences(text)[0]?.opacity, 100);
  });

  test('the list the extension sends decides which files and in what order; the page keeps the geometry of the ones it holds', () => {
    const held = { file: 'a.png', corners: moveQuad(SQUARE, 40, 40), opacity: 30 };
    const stale = { file: 'a.png', corners: SQUARE, opacity: 60 };
    const added = { file: 'b.png', corners: quadOfBox(5, 5, 0, 0), opacity: 60 };
    assert.deepStrictEqual(mergeReferenceLists([held], [added, stale]), [added, held]);
    assert.deepStrictEqual(mergeReferenceLists([held], []), []);
  });

  test('a dropped name is made safe, and a name already there gets a number before its extension', () => {
    assert.strictEqual(freeFileName([], 'Mapa 1836 (v2).png'), 'Mapa_1836_v2_.png');
    assert.strictEqual(freeFileName(['map.png'], 'map.png'), 'map-2.png');
    assert.strictEqual(freeFileName(['map.png', 'MAP-2.png'], 'map.png'), 'map-3.png');
    assert.strictEqual(freeFileName([], '..'), 'reference.png');
    assert.strictEqual(freeFileName(['notes'], 'notes'), 'notes-2');
  });
});

suite('referenceLayers — the geometry', () => {
  test('a box is a quad with its corners in reading order, and its bounds are the box again', () => {
    assert.deepStrictEqual(SQUARE, [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 70 }, { x: 10, y: 70 }]);
    assert.deepStrictEqual(boundsOf(SQUARE), { x: 10, y: 20, width: 100, height: 50 });
  });

  test('a rectangle and a parallelogram are affine; a corner pulled alone is not', () => {
    assert.strictEqual(isAffine(SQUARE), true);
    assert.strictEqual(isAffine(moveQuad(SQUARE, 5, -3)), true);
    assert.strictEqual(isAffine(distortQuad(SQUARE, 'n', 7, 0)), true);
    assert.strictEqual(isAffine(distortQuad(SQUARE, 'se', 7, 0)), false);
  });

  test('a side grip stretches one side; a corner grip two; neither turns the frame inside out', () => {
    assert.deepStrictEqual(boxFromHandle(boundsOf(SQUARE), 'e', 20, 99, false), { x: 10, y: 20, width: 120, height: 50 });
    assert.deepStrictEqual(boxFromHandle(boundsOf(SQUARE), 'nw', -10, -10, false), { x: 0, y: 10, width: 110, height: 60 });
    assert.deepStrictEqual(boxFromHandle(boundsOf(SQUARE), 'w', 500, 0, false), { x: 109, y: 20, width: 1, height: 50 });
  });

  test('proportional keeps the shape and grows from the opposite corner, by the axis pulled further', () => {
    const grown = boxFromHandle(boundsOf(SQUARE), 'se', 100, 0, true);
    assert.deepStrictEqual(grown, { x: 10, y: 20, width: 200, height: 100 });
    const fromSide = boxFromHandle(boundsOf(SQUARE), 'e', 100, 0, true);
    assert.deepStrictEqual(fromSide, { x: 10, y: -5, width: 200, height: 100 });
  });

  test('fitting a quad to a new frame carries every corner, so a distorted picture stays distorted', () => {
    const bent = distortQuad(SQUARE, 'se', 20, 30);
    const from = boundsOf(bent);
    const to = { x: from.x + 10, y: from.y, width: from.width * 2, height: from.height };
    const fitted = fitQuad(bent, from, to);
    assert.deepStrictEqual(boundsOf(fitted), to);
    assert.strictEqual(isAffine(fitted), false);
    near(fitQuad(SQUARE, boundsOf(SQUARE), { x: 0, y: 0, width: 50, height: 25 }), quadOfBox(0, 0, 50, 25));
  });

  test('distort moves one corner alone, or the two along a side', () => {
    near(distortQuad(SQUARE, 'ne', 5, -5), [{ x: 10, y: 20 }, { x: 115, y: 15 }, { x: 110, y: 70 }, { x: 10, y: 70 }]);
    near(distortQuad(SQUARE, 's', 5, 0), [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 115, y: 70 }, { x: 15, y: 70 }]);
  });

  test('bilinear walks the picture: corners at the corners, the middle in the middle', () => {
    const bent = distortQuad(SQUARE, 'se', 20, 30);
    assert.deepStrictEqual(bilinear(bent, 0, 0), bent[0]);
    assert.deepStrictEqual(bilinear(bent, 1, 1), bent[2]);
    assert.deepStrictEqual(bilinear(SQUARE, 0.5, 0.5), { x: 60, y: 45 });
  });

  test('the affine map of a triangle takes each of its points where it was told, and a flat triangle has none', () => {
    const source: readonly [ { x: number; y: number }, { x: number; y: number }, { x: number; y: number } ] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    const target: readonly [ { x: number; y: number }, { x: number; y: number }, { x: number; y: number } ] = [{ x: 5, y: 5 }, { x: 25, y: 7 }, { x: 3, y: 30 }];
    const matrix = affineFromTriangles(source, target);
    assert.ok(matrix);
    source.forEach((point, index) => {
      const moved = applyAffine(matrix, point);
      const want = target[index] as { x: number; y: number };
      assert.ok(Math.abs(moved.x - want.x) < 1e-9 && Math.abs(moved.y - want.y) < 1e-9, JSON.stringify(moved));
    });
    assert.strictEqual(affineFromTriangles([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], target), undefined);
  });

  test('a grip is found within its tolerance, the picture within its edges, and nothing beyond', () => {
    assert.strictEqual(handleAt(SQUARE, { x: 11, y: 19 }, 2), 'nw');
    assert.strictEqual(handleAt(SQUARE, { x: 60, y: 70 }, 2), 's');
    assert.strictEqual(handleAt(SQUARE, { x: 60, y: 40 }, 2), 'inside');
    assert.strictEqual(handleAt(SQUARE, { x: 200, y: 40 }, 2), null);
    assert.strictEqual(insideQuad(distortQuad(SQUARE, 'se', -90, -40), { x: 100, y: 60 }), false);
  });
});
