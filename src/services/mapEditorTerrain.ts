import * as path from 'node:path';
import { indicesOf } from './bmpDecoder.js';
import { cached, pathKey, type MapEditorStack } from './mapEditorStack.js';
import { listLayeredFiles, type LayerFileSystem, type ModLayers } from './modLayers.js';
import { parseDocument } from './syntaxValidation.js';
import {
  dominantTerrainByProvince,
  terrainPictureDataUri,
  terrainSpriteTextures,
  terrainTypeByIndex,
  textureCandidates,
} from './terrainPictures.js';

/** What a stack knows about terrain pictures; built once per stack, on the first map request. */
export interface TerrainInfo {
  /** Terrain name (lowercase) → texture path, from `GFX_terrainimg_<terrain>` sprites. */
  readonly textures: ReadonlyMap<string, string>;
  /** Province id → the terrain category most of its terrain.bmp pixels carry. */
  readonly dominant: ReadonlyMap<number, string>;
}

export interface TerrainHost {
  readonly fileSystem: LayerFileSystem;
  readonly readText: (absolutePath: string) => Promise<string | undefined>;
  readonly readBytes: (absolutePath: string) => Promise<Uint8Array | undefined>;
  /** Folder of the files shipped with the extension, for a default a mod does not carry. */
  readonly assetsFolder: string;
}

const PROVINCES_BMP = 'map/provinces.bmp';
const TERRAIN_BMP = 'map/terrain.bmp';
const TERRAIN_TXT = 'map/terrain.txt';
const OCEAN_TEXTURE = 'gfx/interface/terrain/terrain_ocean.tga';
const BUNDLED_OCEAN_PICTURE = 'terrain_ocean.dds';
const BUNDLED_NO_TERRAIN_PICTURE = 'no_terrain.dds';
const TERRAIN_PICTURE_MAX_WIDTH = 440;

/**
 * The terrain side of the Map Editor: which texture each terrain draws with,
 * what terrain.bmp says a province mostly is, and the decoded pictures the page
 * shows. Both the per-stack table and the decoded pictures are kept, because
 * the table walks every pixel of two bitmaps and a picture is a `.dds` decode.
 */
export class MapEditorTerrain {
  private readonly byLayers = new Map<string, Promise<TerrainInfo>>();
  /** Terrain pictures by normalised absolute path, as sent to the page; a miss is remembered too. */
  private readonly pictureByPath = new Map<string, string | undefined>();

  constructor(
    private readonly host: TerrainHost,
    private readonly stack: MapEditorStack,
  ) {}

  /** A stack whose sprites or bitmaps cannot be read has no terrain pictures; the failure itself is not kept. */
  info(layers: ModLayers): Promise<TerrainInfo> {
    return cached(this.byLayers, layers.key, () => this.build(layers)).catch(
      (): TerrainInfo => ({ textures: new Map(), dominant: new Map() }),
    );
  }

  /** The picture for a named terrain, or undefined when no sprite names a texture for it. */
  async pictureOf(layers: ModLayers, info: TerrainInfo, terrain: string): Promise<string | undefined> {
    const texture = info.textures.get(terrain.toLowerCase());
    if (texture === undefined) {
      return undefined;
    }
    for (const relativePath of textureCandidates(texture)) {
      const absolutePath = this.stack.resolve(layers, relativePath);
      if (absolutePath !== undefined) {
        return this.pictureAt(absolutePath);
      }
    }
    return undefined;
  }

  /**
   * What a sea province shows: the stack's own
   * `gfx/interface/terrain/terrain_ocean`, else the copy shipped with the
   * extension. The sprite is not asked for, because vanilla declares
   * `GFX_terrainimg_ocean` against the mountains texture.
   */
  async oceanPicture(layers: ModLayers): Promise<string | undefined> {
    for (const relativePath of textureCandidates(OCEAN_TEXTURE)) {
      const absolutePath = this.stack.resolve(layers, relativePath);
      const picture = absolutePath === undefined ? undefined : await this.pictureAt(absolutePath);
      if (picture !== undefined) {
        return picture;
      }
    }
    return this.pictureAt(path.join(this.host.assetsFolder, BUNDLED_OCEAN_PICTURE));
  }

  /** What a province with no terrain shows: the picture the extension ships for it. */
  noTerrainPicture(): Promise<string | undefined> {
    return this.pictureAt(path.join(this.host.assetsFolder, BUNDLED_NO_TERRAIN_PICTURE));
  }

  clear(): void {
    this.byLayers.clear();
    this.pictureByPath.clear();
  }

  forgetTable(): void {
    this.byLayers.clear();
  }

  forgetPicture(key: string): void {
    this.pictureByPath.delete(key);
  }

  private async pictureAt(absolutePath: string): Promise<string | undefined> {
    const key = pathKey(absolutePath);
    if (!this.pictureByPath.has(key)) {
      const bytes = await this.host.readBytes(absolutePath);
      this.pictureByPath.set(
        key,
        bytes === undefined ? undefined : terrainPictureDataUri(bytes, path.basename(absolutePath), TERRAIN_PICTURE_MAX_WIDTH),
      );
    }
    return this.pictureByPath.get(key);
  }

  private async build(layers: ModLayers): Promise<TerrainInfo> {
    const textures = new Map<string, string>();
    for (const name of listLayeredFiles(layers, this.host.fileSystem, 'interface', '.gfx')) {
      const absolutePath = this.stack.resolve(layers, `interface/${name}`);
      const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      if (text !== undefined) {
        for (const [terrain, texture] of terrainSpriteTextures(parseDocument(text).document)) {
          if (!textures.has(terrain)) {
            textures.set(terrain, texture);
          }
        }
      }
    }
    return { textures, dominant: await this.dominantTerrains(layers) };
  }

  private async dominantTerrains(layers: ModLayers): Promise<Map<number, string>> {
    const provinces = await this.stack.readBitmap(layers, PROVINCES_BMP);
    const terrain = await this.stack.readBitmap(layers, TERRAIN_BMP);
    const terrainTextPath = this.stack.resolve(layers, TERRAIN_TXT);
    const table = await this.stack.definitions(layers);
    if (!provinces || !terrain || terrainTextPath === undefined || table.absolutePath === undefined) {
      return new Map();
    }
    const comparable =
      terrain.bitsPerPixel === 8 &&
      provinces.bitsPerPixel !== 8 &&
      provinces.width === terrain.width &&
      provinces.height === terrain.height;
    if (!comparable) {
      return new Map();
    }
    const typeByIndex = terrainTypeByIndex(parseDocument((await this.host.readText(terrainTextPath)) ?? '').document);
    return dominantTerrainByProvince(provinces, indicesOf(terrain), table.rows, typeByIndex);
  }
}
