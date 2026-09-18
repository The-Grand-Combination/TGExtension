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
        { provinceId: 42, data: { unit: { x: '1.00', y: '2.00' }, text_rotation: '5.544018', text_scale: ' ' } },
        { provinceId: 7, data: { city: { x: '3.50', y: '4.25' }, fort: { x: '', y: '9' } } },
      ],
    });
    assert.ok(message?.type === 'pending');
    assert.strictEqual(message.edits.length, 2);
    assert.deepStrictEqual(message.edits[0], {
      provinceId: 42,
      data: {
        text_position: undefined,
        unit: { x: '1.00', y: '2.00' },
        city: undefined,
        factory: undefined,
        fort: undefined,
        railroad: undefined,
        naval_base: undefined,
        text_rotation: '5.544018',
        text_scale: undefined,
      },
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

  test('a dropped picture carries its name, its bytes and where it landed', () => {
    const message = asPageMessage({ type: 'addReference', name: 'old map.png', bytes: 'AAAA', x: 10, y: 20 });
    assert.deepStrictEqual(message, { type: 'addReference', name: 'old map.png', bytes: 'AAAA', x: 10, y: 20 });
    assert.strictEqual(asPageMessage({ type: 'addReference', name: 'a.png', bytes: 'AAAA', x: '10', y: 20 }), undefined);
    assert.strictEqual(asPageMessage({ type: 'addReference', name: 'a.png', x: 10, y: 20 }), undefined);
  });

  test('a picture dragged from the Explorer carries its URI and the drop point', () => {
    assert.deepStrictEqual(
      asPageMessage({ type: 'addReferencePath', uri: 'file:///c:/maps/old.png', x: 1, y: 2 }),
      { type: 'addReferencePath', uri: 'file:///c:/maps/old.png', x: 1, y: 2 },
    );
    assert.strictEqual(asPageMessage({ type: 'addReferencePath', uri: 'file:///c:/maps/old.png' }), undefined);
  });

  test('the reference list keeps whole entries and drops the rest, corners four pairs and opacity clamped', () => {
    const message = asPageMessage({
      type: 'references',
      layers: [
        { file: 'a.png', corners: [[0, 0], [4, 0], [4, 2], [0, 2]], opacity: 130 },
        { file: 'b.png', corners: [[0, 0], [4, 0], [4, 2]], opacity: 50 },
        { file: 'c.png', corners: [[0, 0], [4, 0], [4, 2], [0, 'x']], opacity: 50 },
      ],
    });
    assert.ok(message?.type === 'references');
    assert.deepStrictEqual(message.layers, [
      { file: 'a.png', corners: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }], opacity: 100 },
    ]);
    assert.deepStrictEqual(asPageMessage({ type: 'references' }), { type: 'references', layers: [] });
  });

  test('the picker is asked for with the point the picture lands on', () => {
    assert.deepStrictEqual(asPageMessage({ type: 'pickReference', x: 3, y: 4 }), { type: 'pickReference', x: 3, y: 4 });
    assert.strictEqual(asPageMessage({ type: 'pickReference', x: 3 }), undefined);
  });

  test('the list the page posts, points as objects, comes through whole', () => {
    const layers = [{ file: 'a.png', corners: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }], opacity: 60 }];
    const message = asPageMessage({ type: 'references', layers });
    assert.ok(message?.type === 'references');
    assert.deepStrictEqual(message.layers, layers);
  });

  test('removing a reference names its file', () => {
    assert.deepStrictEqual(asPageMessage({ type: 'removeReference', file: 'a.png' }), { type: 'removeReference', file: 'a.png' });
    assert.strictEqual(asPageMessage({ type: 'removeReference' }), undefined);
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
      params: {
        section: 'positions',
        data: {},
        provinceId: 9,
        popDate: '1836.1.1',
        create: { color: 255, isSea: true, name: 'Nova', climate: 'arid_climate', states: ['ENG_1', 7] },
      },
    });
    assert.ok(message?.type === 'save');
    assert.deepStrictEqual(message.params.create, {
      color: 255, isSea: true, name: 'Nova', climate: 'arid_climate', states: ['ENG_1'],
    });
  });

  test('a save with its fields at the top level, not under params, is not a save', () => {
    assert.strictEqual(asPageMessage({ type: 'save', section: 'pops', pops: [], provinceId: 9, popDate: '1836.1.1' }), undefined);
  });

  test('a save carries no target: the extension adds the picked mods, which the page never knows', () => {
    const message = asPageMessage({ type: 'save', params: { section: 'pops', pops: [], provinceId: 9, popDate: '1836.1.1' } });
    assert.ok(message?.type === 'save');
    assert.ok(!('mods' in message.params) && !('workspaceFolders' in message.params));
  });

  test('the states ride with the history section, and nothing that is not a name is kept', () => {
    const message = asPageMessage({
      type: 'save',
      params: {
        section: 'history', data: {}, states: ['ENG_1', 3, null], provinceId: 9, popDate: '1836.1.1',
      },
    });
    assert.ok(message?.type === 'save' && message.params.section === 'history');
    assert.deepStrictEqual(message.params.states, ['ENG_1']);
  });

  test('a history save without states or a localisation carries neither, so neither is written', () => {
    const message = asPageMessage({ type: 'save', params: { section: 'history', data: {}, provinceId: 9, popDate: '1836.1.1' } });
    assert.ok(message?.type === 'save' && message.params.section === 'history');
    assert.strictEqual(message.params.states, undefined);
    assert.strictEqual(message.params.localisation, undefined);
  });

  test('the localisation the Definition Save carries is taken whole', () => {
    const message = asPageMessage({
      type: 'save',
      params: {
        section: 'history', data: {}, provinceId: 9, popDate: '1836.1.1',
        localisation: { text: 'Nova', renameHistoryFile: true },
      },
    });
    assert.ok(message?.type === 'save' && message.params.section === 'history');
    assert.deepStrictEqual(message.params.localisation, { text: 'Nova', renameHistoryFile: true });
  });

  test('a history save carries the climate, and a missing one counts as cleared', () => {
    const base = { type: 'save', params: { section: 'history', data: {}, provinceId: 9, popDate: '1836.1.1' } };
    const withClimate = asPageMessage({ ...base, params: { ...base.params, climate: 'mild_climate' } });
    assert.ok(withClimate?.type === 'save' && withClimate.params.section === 'history');
    assert.strictEqual(withClimate.params.climate, 'mild_climate');
    const without = asPageMessage(base);
    assert.ok(without?.type === 'save' && without.params.section === 'history');
    assert.strictEqual(without.params.climate, '');
  });

  test('Save All carries every section under one message, and leaves out the pops it has none of', () => {
    const message = asPageMessage({
      type: 'save',
      params: {
        section: 'all',
        provinceId: 9,
        popDate: '1836.1.1',
        history: { data: {}, climate: 'mild_climate', states: ['ENG_1', 7] },
        positions: { data: {} },
      },
    });
    assert.ok(message?.type === 'save' && message.params.section === 'all');
    assert.strictEqual(message.params.history.climate, 'mild_climate');
    assert.deepStrictEqual(message.params.history.states, ['ENG_1']);
    assert.deepStrictEqual(message.params.positions.data.unit, undefined);
    assert.strictEqual(message.params.pops, undefined);
  });

  test('Save All without a positions part is dropped: a half-read save would write the wrong file', () => {
    assert.strictEqual(
      asPageMessage({ type: 'save', params: { section: 'all', provinceId: 9, popDate: '1836.1.1', history: { data: {} } } }),
      undefined,
    );
  });

  test('a creation without a whole colour is no creation: the save goes out on its own', () => {
    const message = asPageMessage({
      type: 'save',
      params: {
        section: 'positions',
        data: {},
        provinceId: 9,
        popDate: '1836.1.1',
        create: { isSea: true, name: 'Nova' },
      },
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
