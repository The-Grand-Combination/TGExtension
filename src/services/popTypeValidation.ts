import {
  POPTYPE_GOODS_FIELDS,
  POPTYPE_INCOME_FIELDS,
  POPTYPE_SCALAR_FIELDS,
  POPTYPE_WEIGHT_FIELDS,
} from '../data/popTypeStructure.js';
import type { Assignment, Document } from '../model/ast.js';
import { hasIdentifier } from './modIndex.js';
import { didYouMean } from './suggestions.js';
import {
  checkColorBlock,
  checkKeyedNumberMap,
  checkKeyedWeightMap,
  checkTableField,
  report,
  reportStrayEntry,
  requireNumericValue,
  walkBlockValue,
  walkWeightBlock,
  type Walk,
} from './validationWalker.js';

/** poptypes/<name>.txt — one pop type per file, fields at the top level. */
export function validatePopTypeFile(walk: Walk, document: Document): void {
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    if (!handlePopTypeField(walk, entry)) {
      report(
        walk,
        entry,
        'unknown-poptype-field',
        `Unknown pop type field '${entry.key.value}'.${didYouMean(entry.key.value.toLowerCase(), popTypeFieldNames())}`,
      );
    }
  }
}

function handlePopTypeField(walk: Walk, entry: Assignment): boolean {
  const keyLower = entry.key.value.toLowerCase();
  if (checkTableField(walk, entry, POPTYPE_SCALAR_FIELDS)) {
    return true;
  }
  if (keyLower === 'color') {
    checkColorBlock(walk, entry);
    return true;
  }
  if (POPTYPE_INCOME_FIELDS.has(keyLower)) {
    return true;
  }
  if (keyLower === 'rebel') {
    walkBlockValue(walk, entry, (block) => { checkKeyedNumberMap(walk, block, 'unit'); });
    return true;
  }
  if (POPTYPE_GOODS_FIELDS.has(keyLower)) {
    walkBlockValue(walk, entry, (block) => { checkKeyedNumberMap(walk, block, 'good'); });
    return true;
  }
  const weightScope = POPTYPE_WEIGHT_FIELDS[keyLower];
  if (weightScope) {
    walkBlockValue(walk, entry, (block) => { walkWeightBlock(walk, block, weightScope); });
    return true;
  }
  if (keyLower === 'promote_to') {
    walkBlockValue(walk, entry, (block) => { checkKeyedWeightMap(walk, block, 'popType', 'pop'); });
    return true;
  }
  if (keyLower === 'ideologies') {
    walkBlockValue(walk, entry, (block) => { checkKeyedWeightMap(walk, block, 'ideology', 'pop'); });
    return true;
  }
  if (keyLower === 'issues') {
    return handleIssuesMap(walk, entry);
  }
  return false;
}

function handleIssuesMap(walk: Walk, entry: Assignment): boolean {
  walkBlockValue(walk, entry, (block) => {
    for (const issueEntry of block.entries) {
      if (issueEntry.kind !== 'assignment') {
        continue;
      }
      const issueLower = issueEntry.key.value.toLowerCase();
      if (!hasIdentifier(walk.index, 'issue', issueLower)) {
        report(
          walk,
          issueEntry,
          'unknown-issue',
          `Unknown issue '${issueEntry.key.value}'.`,
        );
      }
      if (issueEntry.value.kind === 'block') {
        walkWeightBlock(walk, issueEntry.value, 'pop');
      } else {
        requireNumericValue(walk, issueEntry);
      }
    }
  });
  return true;
}

function popTypeFieldNames(): string[] {
  return [
    ...Object.keys(POPTYPE_SCALAR_FIELDS),
    ...POPTYPE_GOODS_FIELDS,
    ...Object.keys(POPTYPE_WEIGHT_FIELDS),
    ...POPTYPE_INCOME_FIELDS,
    'color',
    'rebel',
    'promote_to',
    'ideologies',
    'issues',
  ];
}
