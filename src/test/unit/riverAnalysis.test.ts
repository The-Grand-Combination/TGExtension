import * as assert from 'node:assert';
import { analyzeRivers } from '../../services/riverAnalysis.js';

/** `.` land, `~` sea, `S` source, `M` merge, `r` river body. */
function grid(rows: readonly string[]): { rivers: Uint8Array; width: number; height: number; isSea: (offset: number) => boolean } {
  const width = rows[0]?.length ?? 0;
  const rivers = new Uint8Array(width * rows.length);
  const values: Readonly<Record<string, number>> = { '.': 255, '~': 254, S: 0, M: 1, r: 4 };
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      rivers[y * width + x] = values[row.charAt(x)] ?? 255;
    }
  });
  return { rivers, width, height: rows.length, isSea: (offset): boolean => rivers[offset] === 254 };
}

function codesOf(rows: readonly string[]): string[] {
  const { rivers, width, height, isSea } = grid(rows);
  const analysis = analyzeRivers(rivers, width, height, isSea);
  return [
    ...analysis.issues.map((issue) => `${issue.code}@${String(issue.x)},${String(issue.y)}`),
    ...analysis.sourceless.map((river) => `sourceless(${String(river.size)})@${String(river.x)},${String(river.y)}`),
    ...analysis.landlocked.map((river) => `landlocked(${String(river.size)})@${String(river.x)},${String(river.y)}`),
  ];
}

suite('riverAnalysis', () => {
  test('accepts a river from a source to the sea, diagonal steps included', () => {
    assert.deepStrictEqual(codesOf([
      'S.....',
      '.r....',
      '..rrr.',
      '.....r',
      '.....~',
    ]), []);
  });

  test('accepts a tributary that joins through a merge pixel', () => {
    assert.deepStrictEqual(codesOf([
      'S...S.',
      'r...r.',
      'r...M.',
      'rrrrr.',
      '....r~',
    ]), []);
  });

  test('reports a river that never touches the sea, once', () => {
    assert.deepStrictEqual(codesOf([
      'S....',
      'rrrr.',
      '.....',
    ]), ['landlocked(5)@0,0']);
  });

  test('treats every index below 254 as river', () => {
    const { rivers, width, height, isSea } = grid([
      'S.....',
      '.r....',
      '..rrr~',
    ]);
    rivers[1 * width + 1] = 16;
    rivers[2 * width + 3] = 200;
    assert.deepStrictEqual(analyzeRivers(rivers, width, height, isSea).issues, []);
  });

  test('reports a merge pixel that touches only its own river', () => {
    assert.deepStrictEqual(codesOf([
      'S....',
      'rrM..',
      '.....',
      'Srrr~',
    ]), ['river-merge-detached@2,1', 'landlocked(4)@0,0']);
  });

  test('reports lone pixels and rivers without a source', () => {
    assert.deepStrictEqual(codesOf([
      'r.....',
      '..rrr~',
    ]), ['river-isolated-pixel@0,0', 'sourceless(3)@2,1']);
  });

  test('reports a 2x2 block once, at its top-left pixel', () => {
    assert.deepStrictEqual(codesOf([
      'S.....',
      'rr....',
      'rr....',
      '.rrrr~',
    ]), ['river-thick@0,1']);
  });
});
