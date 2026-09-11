import * as assert from 'node:assert';
import type { FileType } from '../../model/fileType.js';
import { validateSemantics } from '../../services/semanticValidation.js';
import { parseDocument } from '../../services/syntaxValidation.js';
import { buildTestIndex } from './testIndex.js';

const index = buildTestIndex();

function codes(text: string, fileType: FileType = 'event', currentFile = 'events/Test.txt'): string[] {
  const { document } = parseDocument(text);
  return validateSemantics(document, fileType, index, currentFile).map((item) => item.code);
}

suite('technologyValidation — technologies and inventions', () => {
  test('technology bodies accept modifiers, unit stats, and max_<building>', () => {
    const text = `tech_a = { area = doctrine year = 1836 cost = 100
      supply_consumption = 0.2 max_fort = 1
      infantry = { attack = 1 defence = 2 }
      rgo_goods_output = { grain = 0.25 }
      ai_chance = { factor = 1 modifier = { factor = 0 war = yes } } }`;
    assert.deepStrictEqual(codes(text, 'technology', 'technologies/army_tech.txt'), []);
    assert.ok(codes('tech_b = { max_frt = 1 }', 'technology', 'technologies/army_tech.txt').includes('unknown-tech-field'));
    assert.ok(
      codes('tech_c = { infantry = { atack = 1 } }', 'technology', 'technologies/army_tech.txt').includes('unknown-unit-modifier'),
    );
  });

  test('a technology can enable a crime', () => {
    const text = 'tech_a = { year = 1836 cost = 100 enable_crime = machine_politics }';
    assert.deepStrictEqual(codes(text, 'technology', 'technologies/army_tech.txt'), []);
    assert.ok(
      codes('tech_b = { enable_crime = not_a_crime }', 'technology', 'technologies/army_tech.txt').includes('unknown-crime'),
    );
  });

  test('invention limit, chance, and effect validate', () => {
    const text = `inv_a = { limit = { war = yes } chance = { base = 1 }
      news = yes
      effect = { activate_building = fort rgo_goods_output = { grain = 0.25 } shared_prestige = 5 } }`;
    assert.deepStrictEqual(codes(text, 'invention', 'inventions/army_inventions.txt'), []);
    assert.ok(
      codes('inv_b = { effect = { activate_buildling = fort } }', 'invention', 'inventions/army_inventions.txt').includes('unknown-invention-effect'),
    );
  });
});
