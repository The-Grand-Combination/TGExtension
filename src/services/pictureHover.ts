import type { FileType } from '../model/fileType.js';
import type { Range } from '../model/range.js';
import { tokenize } from '../parser/lexer.js';
import { decodePicture, type DecodedImage } from './pictureDecoder.js';
import { encodePng } from './pngEncoder.js';

/** VS Code truncates hover content around 100k characters; stay just below. */
const MAX_BASE64_LENGTH = 96_000;
const PREVIEW_MAX_WIDTH = 560;
const PREVIEW_MIN_WIDTH = 100;
/** Images narrower than this get pixel-doubled so small previews stay readable. */
const UPSCALE_THRESHOLD = 280;

export interface PictureReference {
  readonly name: string;
  readonly tokenRange: Range;
}

/** Detect a `picture = <name>` value under the cursor. */
export function resolvePictureAt(text: string, offset: number): PictureReference | undefined {
  const { tokens } = tokenize(text);
  const tokenIndex = tokens.findIndex(
    (candidate) =>
      (candidate.kind === 'word' || candidate.kind === 'string') &&
      candidate.range.start <= offset &&
      offset <= candidate.range.end,
  );
  if (tokenIndex < 2) {
    return undefined;
  }
  const token = tokens[tokenIndex];
  const equals = tokens[tokenIndex - 1];
  const key = tokens[tokenIndex - 2];
  if (
    !token ||
    equals?.kind !== 'equals' ||
    key?.kind !== 'word' ||
    key.value.toLowerCase() !== 'picture'
  ) {
    return undefined;
  }
  return { name: token.value, tokenRange: token.range };
}

/** Rendered hover markdown for a mod-relative picture path, or undefined when the file is absent. */
export type PictureMarkdownLoader = (relativePath: string) => string | undefined;

export interface PictureHover {
  readonly markdown: string;
  readonly tokenRange: Range;
}

const PICTURE_EXTENSIONS: readonly string[] = ['.dds', '.tga'];

/**
 * The hover for the `picture = <name>` under the cursor: the first of
 * `<name>.dds` / `<name>.tga` that exists in the folder for this file type.
 */
export function pictureHoverAt(
  text: string,
  offset: number,
  fileType: FileType,
  load: PictureMarkdownLoader,
): PictureHover | undefined {
  const reference = resolvePictureAt(text, offset);
  if (!reference) {
    return undefined;
  }
  const folder = fileType === 'decision' ? 'decisions' : 'events';
  for (const extension of PICTURE_EXTENSIONS) {
    const markdown = load(`gfx/pictures/${folder}/${reference.name}${extension}`);
    if (markdown !== undefined) {
      return { markdown, tokenRange: reference.tokenRange };
    }
  }
  return undefined;
}

/** Bilinear downscale to the target width, preserving aspect ratio. */
export function scaleImage(image: DecodedImage, targetWidth: number): DecodedImage {
  if (targetWidth >= image.width) {
    return image;
  }
  const targetHeight = Math.max(1, Math.round((image.height * targetWidth) / image.width));
  const rgba = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      samplePixel(image, x, y, targetWidth, targetHeight, rgba);
    }
  }
  return { width: targetWidth, height: targetHeight, rgba };
}

function samplePixel(
  image: DecodedImage,
  x: number,
  y: number,
  targetWidth: number,
  targetHeight: number,
  out: Uint8Array,
): void {
  const sourceX = (x * (image.width - 1)) / Math.max(1, targetWidth - 1);
  const sourceY = (y * (image.height - 1)) / Math.max(1, targetHeight - 1);
  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  const x1 = Math.min(x0 + 1, image.width - 1);
  const y1 = Math.min(y0 + 1, image.height - 1);
  const fractionX = sourceX - x0;
  const fractionY = sourceY - y0;
  const target = (y * targetWidth + x) * 4;
  for (let channel = 0; channel < 4; channel++) {
    const top =
      (image.rgba[(y0 * image.width + x0) * 4 + channel] ?? 0) * (1 - fractionX) +
      (image.rgba[(y0 * image.width + x1) * 4 + channel] ?? 0) * fractionX;
    const bottom =
      (image.rgba[(y1 * image.width + x0) * 4 + channel] ?? 0) * (1 - fractionX) +
      (image.rgba[(y1 * image.width + x1) * 4 + channel] ?? 0) * fractionX;
    out[target + channel] = Math.round(top * (1 - fractionY) + bottom * fractionY);
  }
}

/**
 * Decode picture bytes to a markdown image (PNG data URI), or undefined.
 * The preview is downscaled so the data URI stays under VS Code's hover
 * content limit; oversized results are shrunk further until they fit.
 */
/** Crisp nearest-neighbor 2x upscale for small pictures. */
export function pixelDouble(image: DecodedImage): DecodedImage {
  const width = image.width * 2;
  const height = image.height * 2;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = ((y >> 1) * image.width + (x >> 1)) * 4;
      rgba.set(image.rgba.subarray(source, source + 4), (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

export function pictureHoverMarkdown(
  bytes: Uint8Array,
  fileName: string,
  relativePath: string,
): string | undefined {
  const decoded = decodePicture(bytes, fileName);
  if (!decoded) {
    return undefined;
  }
  const enlarged = decoded.width < UPSCALE_THRESHOLD ? pixelDouble(decoded) : decoded;
  let preview = scaleImage(enlarged, PREVIEW_MAX_WIDTH);
  let base64 = Buffer.from(encodePng(preview.width, preview.height, preview.rgba)).toString('base64');
  while (base64.length > MAX_BASE64_LENGTH && preview.width > PREVIEW_MIN_WIDTH) {
    preview = scaleImage(preview, Math.floor(preview.width * 0.7));
    base64 = Buffer.from(encodePng(preview.width, preview.height, preview.rgba)).toString('base64');
  }
  if (base64.length > MAX_BASE64_LENGTH) {
    return `_${relativePath} (too large to preview)_`;
  }
  const size = `${String(decoded.width)}×${String(decoded.height)}`;
  return `![picture](data:image/png;base64,${base64})\n\n_${relativePath} (${size})_`;
}
