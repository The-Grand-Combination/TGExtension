import { decodeBmp as decodeBmpFile, type BmpImage } from '../services/bmpDecoder.js';
import { decodeRowOffset, isRiverIndex, RIVER_SEA_INDEX } from '../services/mapBitmaps.js';
import { showLoading } from './dom.js';
import { messageOf } from './host.js';
import { RIVER_COLOR, TILE, type Tile } from './state.js';

/**
 * Reading the map bitmaps into pixels and pixels into tiles. Rows come out in
 * storage order (see `mapBitmaps`), which is how the game and the editor show
 * them.
 */

/** Read a bitmap with the same decoder the reports use, or say why it cannot be shown. */
function readBitmap(buffer: ArrayBuffer, name: string): BmpImage {
  const result = decodeBmpFile(new Uint8Array(buffer));
  if (result.kind === 'error') {
    throw new Error(name + ': ' + result.reason + '.');
  }
  return result.image;
}

export interface DecodedPixels {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  readonly packed: Uint32Array;
}

export function decodeProvincesBmp(buffer: ArrayBuffer): DecodedPixels {
  const image = readBitmap(buffer, 'provinces.bmp');
  const { width, height, bitsPerPixel } = image;
  if (bitsPerPixel !== 24 && bitsPerPixel !== 32) {
    throw new Error(String(bitsPerPixel) + '-bit provinces.bmp; only 24-bit and 32-bit maps can be shown.');
  }
  const bytesPerPixel = bitsPerPixel / 8;
  const bytes = image.bytes;
  const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  const packed = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) {
    let source = decodeRowOffset(image, y);
    let target = y * width;
    for (let x = 0; x < width; x++) {
      const blue = bytes[source] ?? 0;
      const green = bytes[source + 1] ?? 0;
      const red = bytes[source + 2] ?? 0;
      const out = target * 4;
      rgba[out] = red; rgba[out + 1] = green; rgba[out + 2] = blue; rgba[out + 3] = 255;
      packed[target] = (red << 16) | (green << 8) | blue;
      source += bytesPerPixel; target++;
    }
  }
  return { width: width, height: height, rgba: rgba, packed: packed };
}

export interface OverlayPixels {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
}

function readOverlay(buffer: ArrayBuffer, name: string): BmpImage {
  const image = readBitmap(buffer, name);
  if (image.bitsPerPixel !== 8) {
    throw new Error(String(image.bitsPerPixel) + '-bit ' + name + '; the game reads an 8-bit one.');
  }
  return image;
}

/** rivers.bmp as a transparent overlay: every palette index below 254 (source, merge, widths) becomes a blue pixel. */
export function decodeRiversBmp(buffer: ArrayBuffer): OverlayPixels {
  const image = readOverlay(buffer, 'rivers.bmp');
  const { width, height, bytes } = image;
  const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let y = 0; y < height; y++) {
    let source = decodeRowOffset(image, y);
    let out = y * width * 4;
    for (let x = 0; x < width; x++, source++, out += 4) {
      if (isRiverIndex(bytes[source] ?? RIVER_SEA_INDEX)) {
        rgba[out] = RIVER_COLOR[0]; rgba[out + 1] = RIVER_COLOR[1]; rgba[out + 2] = RIVER_COLOR[2]; rgba[out + 3] = 255;
      }
    }
  }
  return { width: width, height: height, rgba: rgba };
}

/** terrain.bmp in the colours its own palette gives each index: what an image editor shows for it. */
export function decodeTerrainBmp(buffer: ArrayBuffer): OverlayPixels {
  const image = readOverlay(buffer, 'terrain.bmp');
  const { width, height, bytes } = image;
  const palette = new Uint8ClampedArray(256 * 3);
  for (let index = 0; index < image.paletteEntries && index < 256; index++) {
    const entry = image.paletteOffset + index * 4;
    palette[index * 3] = bytes[entry + 2] ?? 0;
    palette[index * 3 + 1] = bytes[entry + 1] ?? 0;
    palette[index * 3 + 2] = bytes[entry] ?? 0;
  }
  const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let y = 0; y < height; y++) {
    let source = decodeRowOffset(image, y);
    let out = y * width * 4;
    for (let x = 0; x < width; x++, source++, out += 4) {
      const index = (bytes[source] ?? 0) * 3;
      rgba[out] = palette[index] ?? 0; rgba[out + 1] = palette[index + 1] ?? 0; rgba[out + 2] = palette[index + 2] ?? 0; rgba[out + 3] = 255;
    }
  }
  return { width: width, height: height, rgba: rgba };
}

/** The response body, with the overlay counting the megabytes as they come; the progress is not logged, a 60 MB file is a thousand chunks. */
export function readBody(response: Response, name: string): Promise<ArrayBuffer> {
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) { return response.arrayBuffer(); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  function step(): Promise<ArrayBuffer> {
    return reader.read().then(function (result): Promise<ArrayBuffer> | ArrayBuffer {
      if (result.done) {
        const joined = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
        return joined.buffer;
      }
      chunks.push(result.value);
      received += result.value.length;
      showLoading('Loading ' + name + '… ' + (received / 1048576).toFixed(1) + (total > 0 ? ' / ' + (total / 1048576).toFixed(1) : '') + ' MB', false);
      return step();
    });
  }
  return step();
}

/** Fetch a bitmap the extension allowed as a local resource. */
export function fetchBitmap(uri: string, name: string): Promise<ArrayBuffer> {
  return fetch(uri).then(function (response) {
    if (!response.ok) { throw new Error(name + ' could not be read (HTTP ' + String(response.status) + ').'); }
    return readBody(response, name);
  });
}

/** Copy pixels into TILE x TILE canvases, one row of tiles per turn of the event loop. */
export function buildTiles(
  rgba: Uint8ClampedArray<ArrayBuffer>,
  imageWidth: number,
  imageHeight: number,
  verb: string,
): Promise<Tile[]> {
  const tiles: Tile[] = [];
  const rows = Math.ceil(imageHeight / TILE);
  const columns = Math.ceil(imageWidth / TILE);
  const full = new ImageData(rgba, imageWidth, imageHeight);
  return new Promise(function (resolve, reject) {
    let row = 0;
    function next(): void {
      try {
        for (let column = 0; column < columns; column++) {
          const x = column * TILE;
          const y = row * TILE;
          const width = Math.min(TILE, imageWidth - x);
          const height = Math.min(TILE, imageHeight - y);
          const tile = document.createElement('canvas');
          tile.width = width; tile.height = height;
          const tileContext = tile.getContext('2d');
          if (!tileContext) { throw new Error('The browser refused a ' + String(width) + ' x ' + String(height) + ' canvas.'); }
          tileContext.putImageData(full, -x, -y);
          tiles.push({ x: x, y: y, canvas: tile });
        }
        row++;
        showLoading(verb + ' ' + String(imageWidth) + ' x ' + String(imageHeight) + '… ' + String(Math.round((row / rows) * 100)) + '%', false);
        if (row < rows) { setTimeout(next, 0); } else { resolve(tiles); }
      } catch (error) { reject(error instanceof Error ? error : new Error(messageOf(error))); }
    }
    next();
  });
}
