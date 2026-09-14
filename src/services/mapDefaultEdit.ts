import type { Document } from '../model/ast.js';
import { asBlock, firstByKey } from '../model/astQuery.js';
import type { TextPatch } from './textPatch.js';

/**
 * `map/default.map`, as the Map Editor touches it when a province is created:
 * `max_provinces` has to leave room for the new id — the engine sizes its
 * province table with it and ignores anything at or over it — and a sea
 * province has to be listed in `sea_starts`. Nothing else in the file is read
 * or moved.
 */

export interface DefaultMapChange {
  /** `max_provinces` must be over this id; a file that already allows it is left alone. */
  readonly provinceId: number;
  readonly isSea: boolean;
}

export function planDefaultMapEdit(document: Document, change: DefaultMapChange): TextPatch[] {
  const patches: TextPatch[] = [];
  const room = roomPatch(document, change.provinceId);
  if (room) { patches.push(room); }
  const sea = change.isSea ? seaPatch(document, change.provinceId) : undefined;
  if (sea) { patches.push(sea); }
  return patches;
}

/** `max_provinces` is a count, not a last id: it has to be over the id, not equal to it. */
function roomPatch(document: Document, provinceId: number): TextPatch | undefined {
  const entry = firstByKey(document.entries, 'max_provinces');
  if (entry?.value.kind !== 'scalar') {
    return undefined;
  }
  const current = Number(entry.value.value);
  if (Number.isFinite(current) && current > provinceId) {
    return undefined;
  }
  return { start: entry.value.range.start, end: entry.value.range.end, text: String(provinceId + 1) };
}

/** The id joins the numbers already in `sea_starts`, after the last of them. */
function seaPatch(document: Document, provinceId: number): TextPatch | undefined {
  const entry = firstByKey(document.entries, 'sea_starts');
  const block = entry ? asBlock(entry.value) : undefined;
  if (!block) {
    return undefined;
  }
  const numbers = block.entries.filter((entry) => entry.kind === 'scalar');
  if (numbers.some((entry) => entry.value === String(provinceId))) {
    return undefined;
  }
  const last = numbers[numbers.length - 1];
  const at = last ? last.range.end : block.range.start + 1;
  return { start: at, end: at, text: ' ' + String(provinceId) };
}
