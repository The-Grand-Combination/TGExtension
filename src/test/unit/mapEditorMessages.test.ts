import * as assert from 'node:assert';
import { asPageMessage } from '../../providers/mapEditorMessages.js';

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
