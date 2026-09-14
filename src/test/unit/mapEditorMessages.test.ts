import * as assert from 'node:assert';
import { asPageMessage } from '../../services/mapEditorMessages.js';

/**
 * The page is ours, but what it posts arrives untyped and goes straight into a
 * file write, so every field is checked. These are the messages that carry the
 * points of provinces edited and not yet saved.
 */
suite('mapEditorMessages', () => {
  test('a pending message keeps one entry per province, every kind present', () => {
    const message = asPageMessage({
      type: 'pending',
      edits: [
        { provinceId: 42, data: { unit: { x: '1.00', y: '2.00' } } },
        { provinceId: 7, data: { city: { x: '3.50', y: '4.25' }, fort: { x: '', y: '9' } } },
      ],
    });
    assert.ok(message?.type === 'pending');
    assert.strictEqual(message.edits.length, 2);
    assert.deepStrictEqual(message.edits[0], {
      provinceId: 42,
      data: { unit: { x: '1.00', y: '2.00' }, city: undefined, factory: undefined, fort: undefined, railroad: undefined, naval_base: undefined },
    });
    // A kind without both coordinates is a cleared point, not a half-written one.
    assert.strictEqual(message.edits[1]?.data.fort, undefined);
    assert.deepStrictEqual(message.edits[1]?.data.city, { x: '3.50', y: '4.25' });
  });

  test('an entry without a province id is dropped, the rest still arrive', () => {
    const message = asPageMessage({
      type: 'pending',
      edits: [{ data: { unit: { x: '1', y: '2' } } }, { provinceId: 5, data: {} }, 'nonsense'],
    });
    assert.ok(message?.type === 'pending');
    assert.deepStrictEqual(message.edits.map((edit) => edit.provinceId), [5]);
  });

  test('pending with no edits at all is an empty list, not a refusal', () => {
    const message = asPageMessage({ type: 'pending' });
    assert.ok(message?.type === 'pending');
    assert.deepStrictEqual(message.edits, []);
  });

  test('saveAll carries nothing, and an unknown type is refused', () => {
    assert.deepStrictEqual(asPageMessage({ type: 'saveAll' }), { type: 'saveAll' });
    assert.strictEqual(asPageMessage({ type: 'saveEverything' }), undefined);
    assert.strictEqual(asPageMessage(undefined), undefined);
  });

  test('paint carries whole triples, and anything else is refused outright', () => {
    assert.deepStrictEqual(asPageMessage({ type: 'paint', runs: [4, 2, 255] }), { type: 'paint', runs: [4, 2, 255] });
    assert.deepStrictEqual(asPageMessage({ type: 'paint', runs: [] }), { type: 'paint', runs: [] });
    // A dropped number would shift every run after it onto the wrong pixels.
    assert.strictEqual(asPageMessage({ type: 'paint', runs: [4, 2] }), undefined);
    assert.strictEqual(asPageMessage({ type: 'paint', runs: [4, 2, '255'] }), undefined);
    assert.strictEqual(asPageMessage({ type: 'paint', runs: [4, 1.5, 255] }), undefined);
    assert.strictEqual(asPageMessage({ type: 'paint' }), undefined);
  });

  test('paintPending carries the count the close warning uses', () => {
    assert.deepStrictEqual(asPageMessage({ type: 'paintPending', pixels: 12 }), { type: 'paintPending', pixels: 12 });
    assert.strictEqual(asPageMessage({ type: 'paintPending', pixels: 'many' }), undefined);
  });

  test('newProvince carries the colour and the date, and nothing less', () => {
    assert.deepStrictEqual(asPageMessage({ type: 'newProvince', color: 255, popDate: '1836.1.1' }), {
      type: 'newProvince',
      color: 255,
      popDate: '1836.1.1',
    });
    assert.strictEqual(asPageMessage({ type: 'newProvince', color: '255', popDate: '1836.1.1' }), undefined);
    assert.strictEqual(asPageMessage({ type: 'newProvince', color: 255 }), undefined);
  });

  test('a save that creates a province carries the colour, the sea tick and the name', () => {
    const message = asPageMessage({
      type: 'save',
      section: 'positions',
      data: {},
      provinceId: 9,
      popDate: '1836.1.1',
      create: { color: 255, isSea: true, name: 'Nova' },
    });
    assert.ok(message?.type === 'save');
    assert.deepStrictEqual(message.params.create, { color: 255, isSea: true, name: 'Nova' });
  });

  test('a creation without a whole colour is no creation: the save goes out on its own', () => {
    const message = asPageMessage({
      type: 'save',
      section: 'positions',
      data: {},
      provinceId: 9,
      popDate: '1836.1.1',
      create: { isSea: true, name: 'Nova' },
    });
    assert.ok(message?.type === 'save');
    assert.strictEqual(message.params.create, undefined);
  });

  test('the messages that carry plain fields still parse', () => {
    assert.deepStrictEqual(asPageMessage({ type: 'select', provinceId: 3, popDate: '1836.1.1' }), {
      type: 'select',
      provinceId: 3,
      popDate: '1836.1.1',
    });
    assert.deepStrictEqual(asPageMessage({ type: 'reload' }), { type: 'reload' });
    assert.strictEqual(asPageMessage({ type: 'select', provinceId: '3', popDate: '1836.1.1' }), undefined);
  });
});
