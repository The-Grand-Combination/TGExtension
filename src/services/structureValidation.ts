import type { Assignment, Block, Document, Entry, Value } from '../model/ast.js';
import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import type { FileType } from '../model/fileType.js';
import { didYouMean } from './suggestions.js';

const EVENT_TOP_LEVEL_KEYS: readonly string[] = ['country_event', 'province_event'];
const DECISION_TOP_LEVEL_KEYS: readonly string[] = ['political_decisions'];

/** Apply per-file-type structural rules (events, decisions). */
export function validateStructure(document: Document, fileType: FileType): Diagnostic[] {
  switch (fileType) {
    case 'event':
      return validateEvents(document);
    case 'decision':
      return validateDecisions(document);
    default:
      return [];
  }
}

function validateTopLevel(
  document: Document,
  allowedKeys: readonly string[],
  out: Diagnostic[],
): void {
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      out.push(
        diagnostic(
          'error',
          'unexpected-top-level',
          `Only '${allowedKeys.join("' / '")}' blocks are allowed at the top of this file.`,
          entry.range,
        ),
      );
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (!allowedKeys.includes(keyLower)) {
      out.push(
        diagnostic(
          'error',
          'unknown-top-level-key',
          `Unknown top-level key '${entry.key.value}'.${didYouMean(keyLower, allowedKeys)}`,
          entry.key.range,
        ),
      );
      continue;
    }
    if (entry.value.kind !== 'block') {
      out.push(
        diagnostic(
          'error',
          'expected-block',
          `'${entry.key.value}' expects a { ... } block.`,
          entry.key.range,
        ),
      );
    }
  }
}

function assignmentsOf(entries: readonly Entry[]): Assignment[] {
  return entries.filter((entry): entry is Assignment => entry.kind === 'assignment');
}

function findByKey(entries: readonly Entry[], key: string): Assignment[] {
  const lower = key.toLowerCase();
  return assignmentsOf(entries).filter((assignment) => assignment.key.value.toLowerCase() === lower);
}

function firstByKey(entries: readonly Entry[], key: string): Assignment | undefined {
  return findByKey(entries, key)[0];
}

function asBlock(value: Value): Block | undefined {
  return value.kind === 'block' ? value : undefined;
}

function validateEvents(document: Document): Diagnostic[] {
  const out: Diagnostic[] = [];
  validateTopLevel(document, EVENT_TOP_LEVEL_KEYS, out);
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (!EVENT_TOP_LEVEL_KEYS.includes(keyLower)) {
      continue;
    }
    const block = asBlock(entry.value);
    if (block) {
      checkEvent(entry, block, out);
    }
  }
  return out;
}

function checkEvent(entry: Assignment, block: Block, out: Diagnostic[]): void {
  const headRange = entry.key.range;

  if (!firstByKey(block.entries, 'id')) {
    out.push(diagnostic('error', 'event-missing-id', "Event is missing required 'id'.", headRange));
  }
  if (!firstByKey(block.entries, 'title')) {
    out.push(diagnostic('warning', 'event-missing-title', "Event is missing 'title'.", headRange));
  }
  if (!firstByKey(block.entries, 'desc')) {
    out.push(diagnostic('warning', 'event-missing-desc', "Event is missing 'desc'.", headRange));
  }

  if (findByKey(block.entries, 'option').length === 0) {
    out.push(
      diagnostic(
        'warning',
        'event-no-option',
        "Event has no 'option'; the player cannot dismiss it.",
        headRange,
      ),
    );
  }
}

function validateDecisions(document: Document): Diagnostic[] {
  const out: Diagnostic[] = [];
  validateTopLevel(document, DECISION_TOP_LEVEL_KEYS, out);
  const wrappers = findByKey(document.entries, 'political_decisions');

  if (wrappers.length === 0) {
    return out;
  }

  for (const wrapper of wrappers) {
    const block = asBlock(wrapper.value);
    if (!block) {
      continue;
    }
    for (const entry of block.entries) {
      if (entry.kind !== 'assignment') {
        continue;
      }
      const decisionBlock = asBlock(entry.value);
      if (decisionBlock) {
        checkDecision(entry, decisionBlock, out);
      }
    }
  }
  return out;
}

const DECISION_EXPECTED_FIELDS = ['potential', 'effect'] as const;

function checkDecision(entry: Assignment, block: Block, out: Diagnostic[]): void {
  const headRange = entry.key.range;
  for (const field of DECISION_EXPECTED_FIELDS) {
    if (!firstByKey(block.entries, field)) {
      out.push(
        diagnostic(
          'warning',
          `decision-missing-${field}`,
          `Decision '${entry.key.value}' is missing '${field}'.`,
          headRange,
        ),
      );
    }
  }
}
