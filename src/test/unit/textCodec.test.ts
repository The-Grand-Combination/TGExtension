import * as assert from 'node:assert';
import {
  CODEPAGES,
  decodeText,
  DEFAULT_CODEPAGE,
  encodeText,
  isCodepage,
  unrepresentableIn,
} from '../../io/textCodec.js';

/** `Москва` as the Russian game stores it. */
const MOSCOW_BYTES = Uint8Array.of(0xcc, 0xee, 0xf1, 0xea, 0xe2, 0xe0);
const MOSCOW = 'Москва';

suite('textCodec', () => {
  test('every byte survives a decode and an encode, in both code pages', () => {
    const all = Uint8Array.from({ length: 256 }, (_value, byte) => byte);
    for (const codepage of CODEPAGES) {
      const text = decodeText(all, codepage);
      assert.strictEqual(text.length, 256, `${codepage}: one character per byte`);
      assert.strictEqual(new Set(text).size, 256, `${codepage}: the 256 characters must be distinct`);
      assert.deepStrictEqual(encodeText(text, codepage), all, `${codepage}: not byte-exact`);
    }
  });

  test('windows-1251 reads Cyrillic that latin1 turns into mojibake', () => {
    assert.strictEqual(decodeText(MOSCOW_BYTES, 'windows-1251'), MOSCOW);
    assert.deepStrictEqual(encodeText(MOSCOW, 'windows-1251'), MOSCOW_BYTES);
    // What the extension used to show, and why this module exists.
    assert.strictEqual(decodeText(MOSCOW_BYTES, 'windows-1252'), 'Ìîñêâà');
  });

  test('windows-1252 reads the 0x80-0x9F punctuation that latin1 drops', () => {
    // TGC's own localisation is full of these; latin1 decodes them to control characters.
    assert.strictEqual(decodeText(Uint8Array.of(0x92), 'windows-1252'), '’');
    assert.strictEqual(decodeText(Uint8Array.of(0x93, 0x94), 'windows-1252'), '“”');
    assert.strictEqual(decodeText(Uint8Array.of(0x97), 'windows-1252'), '—');
  });

  test('a UTF-8 BOM stays three ordinary bytes instead of being swallowed', () => {
    const bom = Uint8Array.of(0xef, 0xbb, 0xbf, 0x41);
    for (const codepage of CODEPAGES) {
      assert.deepStrictEqual(encodeText(decodeText(bom, codepage), codepage), bom, codepage);
    }
  });

  test('a character the code page cannot hold is refused, not mangled', () => {
    assert.strictEqual(encodeText(MOSCOW, 'windows-1252'), undefined);
    assert.strictEqual(unrepresentableIn(MOSCOW, 'windows-1252'), 'М');
    assert.strictEqual(unrepresentableIn(MOSCOW, 'windows-1251'), undefined);
    assert.strictEqual(unrepresentableIn('Köln', 'windows-1252'), undefined);
    assert.strictEqual(unrepresentableIn('Köln', 'windows-1251'), 'ö');
  });

  test('an astral character is reported whole, not as half a surrogate pair', () => {
    const stray = unrepresentableIn('a 😀 b', DEFAULT_CODEPAGE);
    assert.strictEqual(stray, '😀');
    assert.strictEqual(encodeText('a 😀 b', DEFAULT_CODEPAGE), undefined);
  });

  test('isCodepage rejects anything the manifest does not offer', () => {
    assert.ok(CODEPAGES.every((codepage) => isCodepage(codepage)));
    for (const value of ['latin1', 'utf-8', 'windows1251', '', 7, undefined, null]) {
      assert.ok(!isCodepage(value), String(value));
    }
  });
});
