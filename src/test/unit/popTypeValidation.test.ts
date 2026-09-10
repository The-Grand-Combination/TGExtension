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

suite('popTypeValidation', () => {
  test('pop type fields, needs maps, and promotion weights validate', () => {
    const text = `sprite = 1 strata = poor state_capital_only = no
      life_needs = { grain = 1.5 }
      rebel = { infantry = 1.0 }
      promote_to = { soldiers = { factor = 1 modifier = { factor = 0 war = yes } } }
      ideologies = { liberal = { factor = 1 group = { modifier = { factor = 2 literacy = 0.5 } } } }
      migration_target = { factor = 1 modifier = { factor = 2 is_coastal = yes } }`;
    assert.deepStrictEqual(codes(text, 'popType', 'poptypes/farmers.txt'), []);
  });

  test('pop type flags unknown fields and unknown goods', () => {
    assert.ok(codes('spriite = 1', 'popType', 'poptypes/farmers.txt').includes('unknown-poptype-field'));
    assert.ok(
      codes('life_needs = { graain = 1 }', 'popType', 'poptypes/farmers.txt').includes('unknown-good'),
    );
  });
});
