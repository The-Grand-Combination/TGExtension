import {
  EVENT_BODY_FIELDS,
  EVENT_EFFECT_FIELDS,
  EVENT_LOC_FIELDS,
  EVENT_TRIGGER_FIELDS,
} from '../data/eventStructure.js';
import type { Block, Document, Entry } from '../model/ast.js';
import { asBlock, blockKeysOf, firstByKey } from '../model/astQuery.js';
import { diagnostic } from '../model/diagnostic.js';
import type { ScopeType } from '../model/symbols.js';
import {
  checkLocKey,
  checkPicture,
  eachAssignment,
  report,
  walkBlockValue,
  walkEffectEntries,
  walkTriggerEntries,
  walkWeightBlock,
  type Walk,
} from './validationWalker.js';

/** events/<name>.txt — `country_event` / `province_event` blocks. */
export function validateEventFile(walk: Walk, document: Document): void {
  for (const assignment of blockKeysOf(document)) {
    const keyLower = assignment.key.value.toLowerCase();
    const scope: ScopeType | undefined =
      keyLower === 'country_event' ? 'country' : keyLower === 'province_event' ? 'province' : undefined;
    const block = asBlock(assignment.value);
    if (scope && block) {
      validateEventBody(walk, block, scope);
    }
  }
}

function validateEventBody(walk: Walk, body: Block, scope: ScopeType): void {
  checkDuplicateEventId(walk, body);
  eachAssignment(walk, body.entries, (entry) => {
    const keyLower = entry.key.value.toLowerCase();
    if (EVENT_BODY_FIELDS.has(keyLower)) {
      if (EVENT_LOC_FIELDS.has(keyLower)) {
        checkLocKey(walk, entry);
      } else if (keyLower === 'picture') {
        checkPicture(walk, entry, 'eventPicture');
      }
      return;
    }
    if (EVENT_TRIGGER_FIELDS.has(keyLower)) {
      walkBlockValue(walk, entry, (block) => { walkTriggerEntries(walk, block.entries, scope); });
    } else if (EVENT_EFFECT_FIELDS.has(keyLower)) {
      walkBlockValue(walk, entry, (block) => { walkEffectEntries(walk, block.entries, scope); });
    } else if (keyLower === 'mean_time_to_happen') {
      walkBlockValue(walk, entry, (block) => { walkWeightBlock(walk, block, scope); });
    } else if (keyLower === 'option') {
      walkBlockValue(walk, entry, (block) => { walkOptionBlock(walk, block, scope); });
    } else {
      report(walk, entry, 'unknown-event-field', `Unknown event field '${entry.key.value}'.`);
    }
  });
}

function checkDuplicateEventId(walk: Walk, body: Block): void {
  const idAssignment = firstByKey(body.entries, 'id');
  if (idAssignment?.value.kind !== 'scalar') {
    return;
  }
  const id = idAssignment.value.value;
  const occurrences = walk.index.eventOccurrences.get(id) ?? [];
  const elsewhere = occurrences.filter((occurrence) => occurrence.filePath !== walk.currentFile);
  const localCount = walk.localEventIdCounts.get(id) ?? 0;
  if (elsewhere.length === 0 && localCount <= 1) {
    return;
  }
  const places = [...new Set(elsewhere.map((occurrence) => occurrence.filePath))];
  if (localCount > 1) {
    places.unshift('this file');
  }
  walk.diagnostics.push(
    diagnostic(
      'error',
      'duplicate-event-id',
      `Event id ${id} is also defined in ${places.join(', ')}.`,
      idAssignment.value.range,
    ),
  );
}

function walkOptionBlock(walk: Walk, body: Block, scope: ScopeType): void {
  const effectEntries: Entry[] = [];
  for (const entry of body.entries) {
    if (entry.kind === 'assignment') {
      const keyLower = entry.key.value.toLowerCase();
      if (keyLower === 'name') {
        checkLocKey(walk, entry);
        continue;
      }
      if (keyLower === 'ai_chance') {
        walkBlockValue(walk, entry, (block) => { walkWeightBlock(walk, block, scope); });
        continue;
      }
    }
    effectEntries.push(entry);
  }
  walkEffectEntries(walk, effectEntries, scope);
}
