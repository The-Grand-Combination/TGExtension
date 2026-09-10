import * as assert from 'node:assert';
import { resolveKeyAt, symbolHoverMarkdown, syntaxFor } from '../../services/symbolHover.js';
import { EFFECTS } from '../../data/effects.js';
import { TRIGGERS } from '../../data/triggers.js';
import { SCOPE_CHANGERS } from '../../data/scopes.js';

suite('symbolHover — content', () => {
  test('every trigger, effect, and scope has a doc', () => {
    for (const [name, definition] of Object.entries(TRIGGERS)) {
      assert.ok(definition.doc.length > 0, `trigger ${name} has no doc`);
    }
    for (const [name, definition] of Object.entries(EFFECTS)) {
      assert.ok(definition.doc.length > 0, `effect ${name} has no doc`);
    }
    for (const [name, definition] of Object.entries(SCOPE_CHANGERS)) {
      assert.ok(definition.doc.length > 0, `scope ${name} has no doc`);
    }
  });

  test('renders a trigger with syntax and scopes', () => {
    const markdown = symbolHoverMarkdown('owns');
    assert.ok(markdown, 'expected hover for owns');
    assert.ok(markdown.includes('**owns** _(trigger)_'), markdown);
    assert.ok(markdown.includes('owns = <province id>'), markdown);
    assert.ok(markdown.includes('country, province scope'), markdown);
  });

  test('renders both sections when a name is trigger and effect', () => {
    const markdown = symbolHoverMarkdown('war');
    assert.ok(markdown, 'expected hover for war');
    assert.ok(markdown.includes('_(trigger)_'), markdown);
    assert.ok(markdown.includes('_(effect)_'), markdown);
  });

  test('renders block syntax with optional fields marked', () => {
    assert.strictEqual(
      syntaxFor('relation', TRIGGERS['relation']?.arg ?? { kind: 'scalar', accepts: [] }),
      'relation = { who = TAG value = n }',
    );
    const war = syntaxFor('war', EFFECTS['war']?.arg ?? { kind: 'scalar', accepts: [] });
    assert.ok(war.includes('war = TAG  or  war = {'), war);
    assert.ok(war.includes('[target = TAG]'), war);
  });

  test('renders scope changers and keywords', () => {
    const scope = symbolHoverMarkdown('any_owned');
    assert.ok(scope?.includes('Produces province scope'), scope);
    const keyword = symbolHoverMarkdown('limit');
    assert.ok(keyword?.includes('Filter'), keyword);
    assert.strictEqual(symbolHoverMarkdown('definitely_not_a_symbol'), undefined);
  });
});

suite('symbolHover — key position', () => {
  test('resolves words only in key position', () => {
    const text = 'trigger = { war = no owns = 620 }';
    const atWar = resolveKeyAt(text, text.indexOf('war') + 1);
    assert.strictEqual(atWar?.name, 'war');
    assert.strictEqual(resolveKeyAt(text, text.indexOf('no') + 1), undefined);
    assert.strictEqual(resolveKeyAt(text, text.indexOf('620') + 1), undefined);
  });

  test('supports comparison operators as key position', () => {
    const text = 'prestige >= 10';
    assert.strictEqual(resolveKeyAt(text, 2)?.name, 'prestige');
  });
});
