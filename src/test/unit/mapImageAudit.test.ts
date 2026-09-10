import * as assert from 'node:assert';
import { RIVERS_BMP_PALETTE, TERRAIN_BMP_PALETTE } from '../../data/mapPalettes.js';
import type { MapFinding } from '../../model/mapAudit.js';
import { auditMapImages, type MapImageSource } from '../../services/mapImageAudit.js';
import { encodeBmp24, encodeBmp8, grayPalette, packRgb } from './bmpFixtures.js';
import { buildTestIndex } from './testIndex.js';

const LAND = packRgb(10, 0, 0);
const COAST = packRgb(0, 10, 0);
const SEA = packRgb(0, 0, 10);
const LAKE = packRgb(1, 222, 200);
const UNKNOWN = packRgb(9, 9, 9);

const DEFINITION = ';r;g;b;x;x\n1;10;0;0;Inland;x\n2;0;10;0;Coast;x\n900;0;0;10;Sea;x\n3;20;20;20;Ghost;x\n;1;222;200;Lake;x\n';
const TERRAIN_TXT =
  'terrain = 64\ncategories = { plains = { color = { 1 1 1 } } ocean = { is_water = yes color = { 0 0 0 } } }\n' +
  'text_5 = { type = plains color = { 5 } }\ntext_7 = { type = plains color = { 7 } }\nocean1 = { type = ocean color = { 254 } }\n';

// 6x4 map, top-down. Columns 3-5 are sea province 900.
const PROVINCES = encodeBmp24(6, 4, [
  LAND, LAND, COAST, SEA, SEA, SEA,
  LAND, LAND, COAST, SEA, SEA, SEA,
  LAND, LAKE, COAST, SEA, SEA, SEA,
  UNKNOWN, LAND, COAST, SEA, SEA, SEA,
]);
const TERRAIN = encodeBmp8(6, 4, [
  70, 5, 254, 254, 254, 254,
  5, 9, 5, 254, 254, 254,
  5, 5, 5, 254, 254, 254,
  5, 5, 5, 7, 254, 254,
], TERRAIN_BMP_PALETTE);
const RIVERS = encodeBmp8(6, 4, [
  255, 16, 255, 255, 254, 254,
  0, 4, 4, 254, 254, 254,
  255, 255, 255, 254, 4, 254,
  255, 254, 255, 254, 254, 254,
], RIVERS_BMP_PALETTE);

function source(files: Readonly<Record<string, Uint8Array | undefined>>, texts: Readonly<Record<string, string>> = {}): MapImageSource {
  const allTexts: Readonly<Record<string, string>> = { 'map/definition.csv': DEFINITION, 'map/terrain.txt': TERRAIN_TXT, ...texts };
  return {
    readText: (relativePath): Promise<string | undefined> => Promise.resolve(allTexts[relativePath]),
    readBytes: (relativePath): Promise<Uint8Array | undefined> => Promise.resolve(files[relativePath]),
  };
}

function summary(findings: readonly MapFinding[]): string[] {
  return findings.map((finding) => {
    const where = finding.pixel ? `@${String(finding.pixel.x)},${String(finding.pixel.y)}` : '';
    return `${finding.file.slice(4)} ${finding.severity} ${finding.code}${where}`;
  });
}

suite('mapImageAudit', () => {
  test('cross-checks the three bitmaps and definition.csv', async () => {
    const findings = await auditMapImages(
      source({ 'map/provinces.bmp': PROVINCES, 'map/terrain.bmp': TERRAIN, 'map/rivers.bmp': RIVERS }),
      buildTestIndex(),
    );
    assert.deepStrictEqual(summary(findings), [
      'provinces.bmp error map-size-not-multiple',
      'provinces.bmp error unknown-color',
      'provinces.bmp warning province-without-pixels',
      'terrain.bmp error terrain-index-unmapped@0,0',
      'terrain.bmp error terrain-index-unmapped@1,1',
      'terrain.bmp warning land-over-ocean-terrain@2,0',
      'terrain.bmp warning terrain-without-province@0,3',
      'terrain.bmp warning terrain-over-sea@3,3',
      'rivers.bmp warning river-land-over-sea@3,0',
      'rivers.bmp warning river-over-sea@4,2',
      'rivers.bmp warning river-isolated-pixel@4,2',
      'rivers.bmp warning river-sea-over-land@1,3',
    ]);
    assert.ok(findings[0]?.message.includes('6x4') && findings[0].message.includes('4 is not: 0 or 144 would be'));
    assert.ok(findings[1]?.message.startsWith('Color 9,9,9 covers 1 pixel (first at 0, 3)'));
    assert.ok(findings[2]?.message.startsWith('Province 3 (Ghost) has no pixel'));
    assert.ok(findings[3]?.message.includes('Index 70') && findings[3].message.includes('plains'));
    assert.ok(findings[4]?.message.includes('color = { 9 }'));
    assert.ok(findings[5]?.message.startsWith('Province 2 (Coast) has 1 pixel over ocean terrain'));
  });

  test('accepts any width when the height is a multiple of 144', async () => {
    const provinces = encodeBmp24(10, 144, Array.from({ length: 10 * 144 }, () => LAND));
    const findings = await auditMapImages(source({ 'map/provinces.bmp': provinces }, { 'map/definition.csv': ';r;g;b;x;x\n1;10;0;0;All;x\n' }), buildTestIndex());
    assert.deepStrictEqual(summary(findings), [
      'terrain.bmp error map-file-missing',
      'rivers.bmp error map-file-missing',
    ]);
  });

  test('reports missing bitmaps', async () => {
    const findings = await auditMapImages(source({}), buildTestIndex());
    assert.deepStrictEqual(summary(findings), [
      'provinces.bmp error map-file-missing',
      'terrain.bmp error map-file-missing',
      'rivers.bmp error map-file-missing',
    ]);
  });

  test('reports formats the engine cannot use, non-standard palettes and size mismatches', async () => {
    const findings = await auditMapImages(
      source({
        'map/provinces.bmp': encodeBmp8(6, 4, [], TERRAIN_BMP_PALETTE),
        'map/terrain.bmp': encodeBmp24(6, 4, []),
        'map/rivers.bmp': encodeBmp8(5, 4, [], grayPalette()),
      }),
      buildTestIndex(),
    );
    assert.deepStrictEqual(summary(findings), [
      'provinces.bmp error map-size-not-multiple',
      'provinces.bmp error bmp-unsupported',
      'terrain.bmp error bmp-unsupported',
      'rivers.bmp error nonstandard-palette',
      'rivers.bmp error map-size-mismatch',
    ]);
    assert.ok(findings[3]?.message.includes('Enforce Colormaps'));
    assert.ok(findings[4]?.message.includes('5x4') && findings[4].message.includes('6x4'));
  });
});
