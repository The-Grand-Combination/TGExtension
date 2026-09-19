import * as assert from 'node:assert';
import { RIVER_LAND, RIVER_SEA, TERRAIN_OCEAN } from '../../data/mapPalettes.js';
import { fillValue, isSeaValue, planStroke, type LayerPixels, type PaintRules } from '../../services/layerPaint.js';
import { packRgb } from './bmpFixtures.js';

const LAND_COLOR = packRgb(10, 20, 30);
const SEA_COLOR = packRgb(40, 50, 60);
const RESERVED_LAND = packRgb(1, 2, 3);
const RESERVED_SEA = packRgb(4, 5, 6);
const PLAINS = 5;
const GRASS = 8;
const WATER_TERRAIN = 254;
const RIVER_LINE = 2;
/** One row of four pixels: enough for a stroke to meet land and sea in each layer. */
const WIDTH = 4;

function rules(overrides: Partial<PaintRules> = {}): PaintRules {
  return {
    seaColors: new Set([SEA_COLOR, RESERVED_SEA]),
    waterTerrain: new Set([WATER_TERRAIN]),
    plainsIndex: PLAINS,
    reservedLand: RESERVED_LAND,
    reservedSea: RESERVED_SEA,
    ...overrides,
  };
}

/** A map whose four pixels are, in order: all land, all sea, land but for rivers, sea but for terrain. */
function pixels(): LayerPixels {
  return {
    provinces: new Uint32Array([LAND_COLOR, SEA_COLOR, LAND_COLOR, SEA_COLOR]),
    rivers: new Uint8Array([RIVER_LAND, RIVER_SEA, RIVER_SEA, RIVER_SEA]),
    terrain: new Uint8Array([GRASS, WATER_TERRAIN, GRASS, GRASS]),
  };
}

/** One pixel painted with one value, as the page hands a stroke over. */
function one(index: number, value: number): number[] {
  return [index, 1, value];
}

suite('layerPaint — what each layer calls water', () => {
  test('a sea province, a lake and the reserved sea colour are water, and an unknown colour is land', () => {
    assert.strictEqual(isSeaValue('provinces', SEA_COLOR, rules()), true);
    assert.strictEqual(isSeaValue('provinces', RESERVED_SEA, rules()), true);
    assert.strictEqual(isSeaValue('provinces', LAND_COLOR, rules()), false);
    assert.strictEqual(isSeaValue('provinces', RESERVED_LAND, rules()), false);
  });

  test('rivers is water only where the file has the sea index; a river line runs over land', () => {
    assert.strictEqual(isSeaValue('rivers', RIVER_SEA, rules()), true);
    assert.strictEqual(isSeaValue('rivers', RIVER_LAND, rules()), false);
    assert.strictEqual(isSeaValue('rivers', RIVER_LINE, rules()), false);
  });

  test('terrain is water where terrain.txt says so, and ocean is water whatever the mod types', () => {
    assert.strictEqual(isSeaValue('terrain', WATER_TERRAIN, rules()), true);
    assert.strictEqual(isSeaValue('terrain', GRASS, rules()), false);
    assert.strictEqual(isSeaValue('terrain', TERRAIN_OCEAN, rules({ waterTerrain: new Set() })), true);
  });

  test('the value a layer takes for land, and the one it takes for sea', () => {
    assert.strictEqual(fillValue('provinces', false, rules()), RESERVED_LAND);
    assert.strictEqual(fillValue('provinces', true, rules()), RESERVED_SEA);
    assert.strictEqual(fillValue('rivers', false, rules()), RIVER_LAND);
    assert.strictEqual(fillValue('rivers', true, rules()), RIVER_SEA);
    assert.strictEqual(fillValue('terrain', false, rules()), PLAINS);
    assert.strictEqual(fillValue('terrain', true, rules()), TERRAIN_OCEAN);
    assert.strictEqual(fillValue('terrain', false, rules({ plainsIndex: undefined })), undefined);
  });
});

suite('layerPaint — Terrain Lock', () => {
  test('paints where every other layer has land, and holds the brush back where one has water', () => {
    const plan = planStroke([0, 4, LAND_COLOR], 'provinces', 'lock', pixels(), WIDTH, rules());
    assert.deepStrictEqual(plan.writes, { provinces: [0, 1, LAND_COLOR] });
    assert.strictEqual(plan.heldBack, 3);
  });

  test('painting terrain asks the province map and the rivers, not the terrain itself', () => {
    const plan = planStroke([0, 4, GRASS], 'terrain', 'lock', pixels(), WIDTH, rules());
    assert.deepStrictEqual(plan.writes, { terrain: [0, 1, GRASS] });
    assert.strictEqual(plan.heldBack, 3);
  });

  test('a layer the mods do not have asks nothing of the stroke', () => {
    const only = { provinces: new Uint32Array([LAND_COLOR, LAND_COLOR, LAND_COLOR, LAND_COLOR]) };
    const plan = planStroke([0, 4, RIVER_LINE], 'rivers', 'lock', only, WIDTH, rules());
    assert.deepStrictEqual(plan.writes, { rivers: [0, 4, RIVER_LINE] });
    assert.strictEqual(plan.heldBack, 0);
  });
});

suite('layerPaint — Sea Province Mode', () => {
  test('paints only where every other layer has water', () => {
    const plan = planStroke([0, 4, SEA_COLOR], 'provinces', 'sea', pixels(), WIDTH, rules());
    assert.deepStrictEqual(plan.writes, { provinces: [1, 1, SEA_COLOR] });
    assert.strictEqual(plan.heldBack, 3);
  });

  test('nothing but the province map is painted in it', () => {
    const plan = planStroke([0, 4, RIVER_SEA], 'rivers', 'sea', pixels(), WIDTH, rules());
    assert.deepStrictEqual(plan.writes, {});
    assert.strictEqual(plan.heldBack, 4);
  });
});

suite('layerPaint — Multi Draw', () => {
  test('a land province brings the other files up to land, and leaves a river line alone', () => {
    const plan = planStroke([0, 4, LAND_COLOR], 'provinces', 'multi', pixels(), WIDTH, rules());
    assert.strictEqual(plan.heldBack, 0);
    assert.deepStrictEqual(plan.writes.provinces, [0, 4, LAND_COLOR]);
    assert.deepStrictEqual(plan.writes.rivers, [1, 3, RIVER_LAND]);
    assert.deepStrictEqual(plan.writes.terrain, [1, 1, PLAINS]);
  });

  test('a river line over a sea province makes land of the province and the terrain', () => {
    const map: LayerPixels = {
      provinces: new Uint32Array([SEA_COLOR]),
      rivers: new Uint8Array([RIVER_SEA]),
      terrain: new Uint8Array([WATER_TERRAIN]),
    };
    const plan = planStroke(one(0, RIVER_LINE), 'rivers', 'multi', map, WIDTH, rules());
    assert.deepStrictEqual(plan.writes, {
      provinces: [0, 1, RESERVED_LAND],
      rivers: [0, 1, RIVER_LINE],
      terrain: [0, 1, PLAINS],
    });
  });

  test('a sea province takes the river line with it', () => {
    const map: LayerPixels = {
      provinces: new Uint32Array([LAND_COLOR]),
      rivers: new Uint8Array([RIVER_LINE]),
      terrain: new Uint8Array([GRASS]),
    };
    const plan = planStroke(one(0, SEA_COLOR), 'provinces', 'multi', map, WIDTH, rules());
    assert.deepStrictEqual(plan.writes, {
      provinces: [0, 1, SEA_COLOR],
      rivers: [0, 1, RIVER_SEA],
      terrain: [0, 1, TERRAIN_OCEAN],
    });
  });

  test('ocean terrain makes sea of the province and the rivers', () => {
    const map: LayerPixels = {
      provinces: new Uint32Array([LAND_COLOR]),
      rivers: new Uint8Array([RIVER_LAND]),
      terrain: new Uint8Array([GRASS]),
    };
    const plan = planStroke(one(0, TERRAIN_OCEAN), 'terrain', 'multi', map, WIDTH, rules());
    assert.deepStrictEqual(plan.writes, {
      provinces: [0, 1, RESERVED_SEA],
      rivers: [0, 1, RIVER_SEA],
      terrain: [0, 1, TERRAIN_OCEAN],
    });
  });

  test('with no land terrain to give, the terrain is left as it is and the rest still lines up', () => {
    const map: LayerPixels = {
      provinces: new Uint32Array([SEA_COLOR]),
      rivers: new Uint8Array([RIVER_SEA]),
      terrain: new Uint8Array([WATER_TERRAIN]),
    };
    const plan = planStroke(one(0, RIVER_LAND), 'rivers', 'multi', map, WIDTH, rules({ plainsIndex: undefined }));
    assert.deepStrictEqual(plan.writes, { provinces: [0, 1, RESERVED_LAND], rivers: [0, 1, RIVER_LAND] });
  });

  test('a stroke the other files already agree with touches only the layer it was painted on', () => {
    const map: LayerPixels = {
      provinces: new Uint32Array([LAND_COLOR]),
      rivers: new Uint8Array([RIVER_LAND]),
      terrain: new Uint8Array([GRASS]),
    };
    const plan = planStroke(one(0, RESERVED_LAND), 'provinces', 'multi', map, WIDTH, rules());
    assert.deepStrictEqual(plan.writes, { provinces: [0, 1, RESERVED_LAND] });
  });
});
