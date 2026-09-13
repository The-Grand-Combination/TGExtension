/**
 * The byte↔text boundary for mod files. Victoria 2 stores script and
 * localisation in a single-byte code page, not UTF-8: which one depends on the
 * language the game was built for, and the same byte means different letters in
 * each (`0xCF` is `Ï` in windows-1252 and `П` in windows-1251), so a mod has
 * exactly one.
 *
 * Both decoders map all 256 bytes to 256 distinct code points — windows-1252
 * included, because the WHATWG table fills the five slots (`0x81`, `0x8D`,
 * `0x8F`, `0x90`, `0x9D`) that the original code page leaves undefined. They are
 * therefore bijections, and `encodeText(decodeText(bytes))` returns the original
 * bytes. Editing one line of a file cannot disturb any other.
 */

export type Codepage = 'windows-1252' | 'windows-1251';

export const CODEPAGES: readonly Codepage[] = ['windows-1252', 'windows-1251'];

/** What the English-language game ships; the right answer for every mod that is not Cyrillic. */
export const DEFAULT_CODEPAGE: Codepage = 'windows-1252';

export function isCodepage(value: unknown): value is Codepage {
  return typeof value === 'string' && (CODEPAGES as readonly string[]).includes(value);
}

export function decodeText(bytes: Uint8Array, codepage: Codepage): string {
  return decoderFor(codepage).decode(bytes);
}

/**
 * The bytes for `text`, or undefined when one character has no byte in this code
 * page. Never a partial encoding: a caller that gets undefined must not write.
 */
export function encodeText(text: string, codepage: Codepage): Uint8Array | undefined {
  const table = tableFor(codepage);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const byte = table[text.charCodeAt(index)] ?? NO_BYTE;
    if (byte === NO_BYTE) {
      return undefined;
    }
    bytes[index] = byte;
  }
  return bytes;
}

/**
 * The first character `codepage` cannot store, for an error message. Iterates by
 * code point, so an astral character is reported whole rather than as half of a
 * surrogate pair — its leading surrogate has no byte either, which is what makes
 * looking only at the first code unit enough.
 */
export function unrepresentableIn(text: string, codepage: Codepage): string | undefined {
  const table = tableFor(codepage);
  for (const character of text) {
    if ((table[character.charCodeAt(0)] ?? NO_BYTE) === NO_BYTE) {
      return character;
    }
  }
  return undefined;
}

// `TextDecoder` is a global value here, not a type name; this keeps the module import-free.
type Decoder = InstanceType<typeof TextDecoder>;

/** Table entry for a character this code page cannot store; a real byte is 0..255. */
const NO_BYTE = -1;

const decoders = new Map<Codepage, Decoder>();
const tables = new Map<Codepage, Int16Array>();

function decoderFor(codepage: Codepage): Decoder {
  const existing = decoders.get(codepage);
  if (existing) {
    return existing;
  }
  // ignoreBOM keeps a stray UTF-8 BOM as three ordinary characters instead of
  // swallowing it, so a file that has one still round-trips byte for byte.
  const decoder = new TextDecoder(codepage, { ignoreBOM: true });
  decoders.set(codepage, decoder);
  return decoder;
}

/**
 * Character → byte, built by decoding every byte once. Deriving the table from
 * the decoder is the point: the two directions cannot drift apart, and there is
 * no `TextEncoder` for anything but UTF-8 to derive it from instead.
 *
 * It is an array indexed by UTF-16 code unit rather than a map keyed by the
 * character: encoding runs over every code unit of a file that can be hundreds
 * of kilobytes, and an index into a typed array costs neither the one-character
 * string a lookup by key would allocate nor the hash. Every character of both
 * code pages is in the basic plane, so a code unit identifies one.
 */
function tableFor(codepage: Codepage): Int16Array {
  const existing = tables.get(codepage);
  if (existing) {
    return existing;
  }
  const decoder = decoderFor(codepage);
  const table = new Int16Array(0x10000).fill(NO_BYTE);
  for (let byte = 0; byte < 256; byte += 1) {
    table[decoder.decode(Uint8Array.of(byte)).charCodeAt(0)] = byte;
  }
  tables.set(codepage, table);
  return table;
}
