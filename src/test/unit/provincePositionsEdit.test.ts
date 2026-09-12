import * as assert from 'node:assert';
import { decodeText, DEFAULT_CODEPAGE } from '../../io/textCodec.js';
import * as fs from 'node:fs';
import type { ProvincePositions } from '../../model/mapEditor.js';
import {
  EMPTY_PROVINCE_POSITIONS,
  findPositionsBlock,
  formatCoordinate,
  parseProvincePositions,
  planPositionsEdit,
  positionMarkersOf,
  renderPositionsFile,
  sameCoordinate,
} from '../../services/provincePositionsEdit.js';
import { parseDocument } from '../../services/syntaxValidation.js';
import { applyPatches } from '../../services/textPatch.js';

const TGC_POSITIONS = 'F:/SteamLibrary/steamapps/common/Victoria 2/mod/TGC/map/positions.txt';

/** The TGC layout: four-space indent, a blank line after every block, `} # Name` after each province. */
const FILE = [
  '# Sitka',
  '1 = {',
  '    text_position = {',
  '        x = 643.710000',
  '        y = 2491.466667',
  '    }',
  '',
  '    text_rotation = 5.544018',
  '    text_scale = 6',
  '    unit = {',
  '        x = 633.650000',
  '        y = 2502.135000',
  '    }',
  '',
  '    city = {',
  '        x = 650.975000',
  '        y = 2472.840000',
  '    }',
  '',
  '    factory = {',
  '        x = 649.820000',
  '        y = 2478.195000',
  '    }',
  '',
  '    building_position = {',
  '        fort = {',
  '            x = 642.240000',
  '            y = 2478.073333',
  '        }',
  '',
  '        naval_base = {',
  '            x = 654.326667',
  '            y = 2463.536667',
  '        }',
  '',
  '    }',
  '',
  '    building_rotation = {',
  '        naval_base = 5.704918',
  '    }',
  '',
  '} # Yakutat',
  '',
  '2 = {',
  '    unit = {',
  '        x = 664.687500',
  '        y = 2518.958334',
  '    }',
  '',
  '} # Kenai',
  '',
  '2985 = {} # Todos Santos Bay',
  '',
].join('\r\n');

/** The game's own layout: braces on their own lines, no spaces around `=`, tabs. */
const VANILLA = ['#Sitka', '1 = ', '{', '\tunit=', '\t{', '\t\tx=711.000000', '\t\ty=1992.000000', '\t}', '\ttext_rotation=5.323253', '}', ''].join('\r\n');

function positionsOf(text: string, provinceId: number): ProvincePositions {
  const block = findPositionsBlock(parseDocument(text).document, provinceId);
  if (block?.value.kind !== 'block') {
    throw new assert.AssertionError({ message: `expected a block for ${String(provinceId)}` });
  }
  return parseProvincePositions(block.value);
}

function edit(text: string, provinceId: number, after: ProvincePositions): string {
  return applyPatches(text, planPositionsEdit(text, parseDocument(text).document, provinceId, after));
}

suite('provincePositionsEdit', () => {
  test('reads the editable points of a block and leaves the rest alone', () => {
    assert.deepStrictEqual(positionsOf(FILE, 1), {
      unit: { x: '633.650000', y: '2502.135000' },
      city: { x: '650.975000', y: '2472.840000' },
      factory: { x: '649.820000', y: '2478.195000' },
      fort: { x: '642.240000', y: '2478.073333' },
      railroad: undefined,
      naval_base: { x: '654.326667', y: '2463.536667' },
    });
    assert.deepStrictEqual(positionsOf(FILE, 2), { ...EMPTY_PROVINCE_POSITIONS, unit: { x: '664.687500', y: '2518.958334' } });
    assert.deepStrictEqual(positionsOf(FILE, 2985), EMPTY_PROVINCE_POSITIONS);
    assert.deepStrictEqual(positionsOf(VANILLA, 1), { ...EMPTY_PROVINCE_POSITIONS, unit: { x: '711.000000', y: '1992.000000' } });
  });

  test('lists every numeric point of the map', () => {
    const markers = positionMarkersOf(parseDocument(FILE).document);
    assert.deepStrictEqual(
      markers.map((marker) => [marker.id, marker.kind, marker.x, marker.y]),
      [
        [1, 'unit', 633.65, 2502.135],
        [1, 'city', 650.975, 2472.84],
        [1, 'factory', 649.82, 2478.195],
        [1, 'fort', 642.24, 2478.073333],
        [1, 'naval_base', 654.326667, 2463.536667],
        [2, 'unit', 664.6875, 2518.958334],
      ],
    );
  });

  test('compares and formats coordinates as numbers', () => {
    assert.strictEqual(formatCoordinate('643.71'), '643.710000');
    assert.strictEqual(formatCoordinate(' 1639 '), '1639.000000');
    assert.strictEqual(formatCoordinate('abc'), 'abc');
    assert.ok(sameCoordinate('643.710000', '643.71'));
    assert.ok(!sameCoordinate('643.710000', '643.72'));
  });

  test('saving unchanged data patches nothing, in either layout', () => {
    assert.deepStrictEqual(planPositionsEdit(FILE, parseDocument(FILE).document, 1, positionsOf(FILE, 1)), []);
    const rounded = { ...positionsOf(FILE, 1), unit: { x: '633.65', y: '2502.135' } };
    assert.deepStrictEqual(planPositionsEdit(FILE, parseDocument(FILE).document, 1, rounded), []);
    assert.deepStrictEqual(planPositionsEdit(VANILLA, parseDocument(VANILLA).document, 1, positionsOf(VANILLA, 1)), []);
  });

  test('a moved point rewrites only its coordinates', () => {
    const before = positionsOf(FILE, 1);
    const patches = planPositionsEdit(FILE, parseDocument(FILE).document, 1, { ...before, unit: { x: '633.65', y: '2510.5' } });
    assert.strictEqual(patches.length, 1);
    const edited = applyPatches(FILE, patches);
    assert.strictEqual(edited, FILE.replace('y = 2502.135000', 'y = 2510.500000'));
    const vanilla = edit(VANILLA, 1, { ...EMPTY_PROVINCE_POSITIONS, unit: { x: '700', y: '1992' } });
    assert.strictEqual(vanilla, VANILLA.replace('x=711.000000', 'x=700.000000'));
  });

  test('a cleared point loses its lines and the blank line after them', () => {
    const before = positionsOf(FILE, 1);
    const edited = edit(FILE, 1, { ...before, factory: undefined });
    assert.strictEqual(edited, FILE.replace('    factory = {\r\n        x = 649.820000\r\n        y = 2478.195000\r\n    }\r\n\r\n', ''));
  });

  test('a new point goes before the closing brace, inside building_position for the building kinds', () => {
    const before = positionsOf(FILE, 1);
    const edited = edit(FILE, 1, { ...before, railroad: { x: '649.61', y: '2482.395' } });
    assert.strictEqual(
      edited,
      FILE.replace(
        '        }\r\n\r\n    }\r\n\r\n    building_rotation',
        '        }\r\n\r\n        railroad = {\r\n            x = 649.610000\r\n            y = 2482.395000\r\n        }\r\n    }\r\n\r\n    building_rotation',
      ),
    );
    const kenai = edit(FILE, 2, { ...positionsOf(FILE, 2), city: { x: '1', y: '2' }, fort: { x: '3', y: '4' } });
    assert.ok(
      kenai.includes(
        '    }\r\n\r\n    city = {\r\n        x = 1.000000\r\n        y = 2.000000\r\n    }\r\n    building_position = {\r\n        fort = {\r\n            x = 3.000000\r\n            y = 4.000000\r\n        }\r\n    }\r\n} # Kenai',
      ),
      kenai,
    );
  });

  test('clearing every building point removes building_position, but not one holding other keys', () => {
    const before = positionsOf(FILE, 1);
    const edited = edit(FILE, 1, { ...before, fort: undefined, naval_base: undefined });
    assert.ok(!edited.includes('building_position'), edited);
    assert.ok(edited.includes('    }\r\n\r\n    building_rotation = {'), edited);
    const withTown = FILE.replace('        naval_base = {\r\n            x = 654.326667', '        town = { x = 1 y = 2 }\r\n        naval_base = {\r\n            x = 654.326667');
    const kept = edit(withTown, 1, { ...positionsOf(withTown, 1), fort: undefined, naval_base: undefined });
    assert.ok(kept.includes('    building_position = {\r\n        town = { x = 1 y = 2 }\r\n    }'), kept);
  });

  test('an empty one-line block is opened up, and a missing province is appended', () => {
    const opened = edit(FILE, 2985, { ...EMPTY_PROVINCE_POSITIONS, unit: { x: '10', y: '20' } });
    assert.ok(opened.includes('2985 = {\r\n    unit = {\r\n        x = 10.000000\r\n        y = 20.000000\r\n    }\r\n} # Todos Santos Bay'), opened);
    const appended = edit(FILE, 4000, { ...EMPTY_PROVINCE_POSITIONS, naval_base: { x: '5', y: '6' } });
    assert.ok(appended.endsWith('# Todos Santos Bay\r\n4000 = {\r\n    building_position = {\r\n        naval_base = {\r\n            x = 5.000000\r\n            y = 6.000000\r\n        }\r\n    }\r\n}\r\n'), appended);
    assert.strictEqual(renderPositionsFile(1, { ...EMPTY_PROVINCE_POSITIONS, unit: { x: '1', y: '2' } }), '1 = {\r\n\tunit = {\r\n\t\tx = 1.000000\r\n\t\ty = 2.000000\r\n\t}\r\n}\r\n');
  });

  test('round-trips the TGC positions.txt without a patch when it is installed', function () {
    if (!fs.existsSync(TGC_POSITIONS)) {
      this.skip();
    }
    const text = decodeText(fs.readFileSync(TGC_POSITIONS), DEFAULT_CODEPAGE);
    const document = parseDocument(text).document;
    let blocks = 0;
    for (const entry of document.entries) {
      if (entry.kind === 'assignment' && entry.value.kind === 'block') {
        blocks++;
        const id = Number(entry.key.value);
        assert.deepStrictEqual(planPositionsEdit(text, document, id, parseProvincePositions(entry.value)), [], `province ${String(id)}`);
      }
    }
    assert.ok(blocks > 3000, `only ${String(blocks)} blocks`);
    assert.ok(positionMarkersOf(document).length > 10000);
  });
});
