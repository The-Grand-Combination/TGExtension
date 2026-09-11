import * as assert from 'node:assert';
import { TERRAIN_BMP_PALETTE } from '../../data/mapPalettes.js';
import { decodeBmp, indicesOf } from '../../services/bmpDecoder.js';
import { parseProvinceRows } from '../../services/provinceTable.js';
import { parseDocument } from '../../services/syntaxValidation.js';
import {
  cropCenter,
  dominantTerrainByProvince,
  terrainPictureDataUri,
  terrainSpriteTextures,
  terrainTypeByIndex,
  textureCandidates,
} from '../../services/terrainPictures.js';
import { encodeBmp24, encodeBmp8 } from './bmpFixtures.js';

const GFX = [
  'spriteTypes = {',
  '\tspriteType = {',
  '\t\tname = "GFX_terrainimg_arctic"',
  '\t\ttexturefile = "gfx\\\\interface\\\\terrain\\\\terrain_arctic.tga"',
  '\t\tnorefcount = yes',
  '\t}',
  '\tspriteType = {',
  '\t\tname = "GFX_province_view_bg"',
  '\t\ttexturefile = "gfx\\\\interface\\\\bg.tga"',
  '\t}',
  '\tspriteType = { name = "GFX_terrainimg_Urban_Fez" texturefile = "gfx\\\\interface\\\\terrain\\\\unique_urban\\\\terrain_urban_fez.tga" }',
  '}',
].join('\n');

const TERRAIN_TXT = [
  'terrain = 64',
  'categories = { arctic = { color = { 1 2 3 } } farmlands = { color = { 4 5 6 } } }',
  'text_0 = { type = arctic color = { 0 } priority = 0 }',
  'text_1 = { type = farmlands color = { 1 2 } priority = 1 }',
].join('\n');

suite('terrainPictures', () => {
  test('reads GFX_terrainimg sprites into terrain → texture path with forward slashes', () => {
    const textures = terrainSpriteTextures(parseDocument(GFX).document);
    assert.deepStrictEqual(
      [...textures],
      [
        ['arctic', 'gfx/interface/terrain/terrain_arctic.tga'],
        ['urban_fez', 'gfx/interface/terrain/unique_urban/terrain_urban_fez.tga'],
      ],
    );
  });

  test('maps terrain.bmp indices to their category', () => {
    const types = terrainTypeByIndex(parseDocument(TERRAIN_TXT).document);
    assert.deepStrictEqual([...types], [[0, 'arctic'], [1, 'farmlands'], [2, 'farmlands']]);
  });

  test('offers the other extension the game also loads', () => {
    assert.deepStrictEqual(textureCandidates('gfx/a.tga'), ['gfx/a.tga', 'gfx/a.dds']);
    assert.deepStrictEqual(textureCandidates('gfx/a.DDS'), ['gfx/a.DDS', 'gfx/a.tga']);
    assert.deepStrictEqual(textureCandidates('gfx/a.png'), ['gfx/a.png']);
  });

  test('finds the dominant terrain of each province', async () => {
    const one = (10 << 16) | (20 << 8) | 30;
    const two = (40 << 16) | (50 << 8) | 60;
    const provinces = decodeBmp(encodeBmp24(4, 1, [one, one, one, two]));
    const terrain = decodeBmp(encodeBmp8(4, 1, [1, 0, 1, 0], TERRAIN_BMP_PALETTE));
    assert.ok(provinces.kind === 'image' && terrain.kind === 'image');
    const rows = parseProvinceRows(';r;g;b;x;x\n1;10;20;30;One;x\n2;40;50;60;Two;x\n');
    const dominant = await dominantTerrainByProvince(
      provinces.image,
      indicesOf(terrain.image),
      rows,
      terrainTypeByIndex(parseDocument(TERRAIN_TXT).document),
    );
    assert.deepStrictEqual([...dominant], [[1, 'farmlands'], [2, 'arctic']]);
  });

  test('crops a larger picture to the middle and leaves a smaller one alone', () => {
    const rgba = new Uint8Array(4 * 3 * 4).map((_, index) => index);
    const cropped = cropCenter({ width: 4, height: 3, rgba }, 2, 1);
    assert.deepStrictEqual([cropped.width, cropped.height], [2, 1]);
    assert.deepStrictEqual([...cropped.rgba], [...rgba.subarray((1 * 4 + 1) * 4, (1 * 4 + 3) * 4)]);
    const small = { width: 2, height: 2, rgba: new Uint8Array(16) };
    assert.strictEqual(cropCenter(small, 374, 94), small);
  });

  test('rejects bytes that are not a picture', () => {
    assert.strictEqual(terrainPictureDataUri(new Uint8Array([1, 2, 3]), 'x.tga', 400), undefined);
  });
});
