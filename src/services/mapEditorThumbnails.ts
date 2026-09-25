import type { MapThumbnails } from '../model/mapEditor.js';
import { cached, type MapEditorStack } from './mapEditorStack.js';
import { riversThumbnail, sampledThumbnail, THUMBNAIL_SIZE, thumbnailDataUri } from './mapThumbnails.js';
import type { ModLayers } from './modLayers.js';
import { PROVINCES_BMP, RIVERS_BMP, TERRAIN_BMP } from '../model/gamePaths.js';

/**
 * The three bitmaps as thumbnails for the Layers box. Kept per stack: building
 * one samples a bitmap that runs to tens of megabytes, and the box is drawn
 * again on every Map Editor request.
 */
export class MapEditorThumbnails {
  private readonly byLayers = new Map<string, Promise<MapThumbnails>>();

  constructor(private readonly stack: MapEditorStack) {}

  /** A missing or unreadable bitmap is left out rather than failing the set. */
  of(layers: ModLayers): Promise<MapThumbnails> {
    return cached(this.byLayers, layers.key, () => this.build(layers));
  }

  clear(): void {
    this.byLayers.clear();
  }

  forget(layersKey: string): void {
    this.byLayers.delete(layersKey);
  }

  private async build(layers: ModLayers): Promise<MapThumbnails> {
    const out: { provinces?: string; rivers?: string; terrain?: string } = {};
    const provinces = await this.stack.readBitmap(layers, PROVINCES_BMP);
    if (provinces) {
      out.provinces = thumbnailDataUri(THUMBNAIL_SIZE, THUMBNAIL_SIZE, sampledThumbnail(provinces, THUMBNAIL_SIZE, THUMBNAIL_SIZE));
    }
    const rivers = await this.stack.readBitmap(layers, RIVERS_BMP);
    if (rivers?.bitsPerPixel === 8) {
      out.rivers = thumbnailDataUri(THUMBNAIL_SIZE, THUMBNAIL_SIZE, riversThumbnail(rivers, THUMBNAIL_SIZE, THUMBNAIL_SIZE));
    }
    const terrain = await this.stack.readBitmap(layers, TERRAIN_BMP);
    if (terrain) {
      out.terrain = thumbnailDataUri(THUMBNAIL_SIZE, THUMBNAIL_SIZE, sampledThumbnail(terrain, THUMBNAIL_SIZE, THUMBNAIL_SIZE));
    }
    return out;
  }
}
