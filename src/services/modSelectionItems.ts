import type { ModDescriptor } from '../model/modDescriptor.js';
import { baseMods, submodsOf } from './modLayout.js';

/** A pickable mod row; `label` may carry a `$(codicon)`. */
export interface ModRow {
  readonly kind: 'mod';
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly picked: boolean;
}

export interface SeparatorRow {
  readonly kind: 'separator';
  readonly label: string;
}

export type ModSelectionItem = ModRow | SeparatorRow;

/**
 * Every installed mod as a pickable row, one family per base mod (no
 * `dependencies`): a heading, the base mod, then the submods that depend on it,
 * directly or through another submod. Mods whose dependency is not installed
 * close the list under their own heading. Any combination may be picked.
 */
export function modSelectionItems(mods: readonly ModDescriptor[], selected: readonly string[]): ModSelectionItem[] {
  const items: ModSelectionItem[] = [];
  const placed = new Set<string>();
  for (const base of baseMods(mods)) {
    const submods = submodsOf(mods, base.name);
    items.push({ kind: 'separator', label: base.name });
    items.push(row(base, '$(package)', 'base mod', selected));
    placed.add(base.name);
    for (const submod of submods) {
      items.push(row(submod, '$(arrow-small-right)', `submod of ${submod.dependencies.join(', ')}`, selected));
      placed.add(submod.name);
    }
  }
  const orphans = mods.filter((mod) => !placed.has(mod.name));
  if (orphans.length > 0) {
    items.push({ kind: 'separator', label: 'Dependency not installed' });
    for (const orphan of orphans) {
      items.push(row(orphan, '$(warning)', `needs ${orphan.dependencies.join(', ')}`, selected));
    }
  }
  return items;
}

function row(mod: ModDescriptor, icon: string, description: string, selected: readonly string[]): ModRow {
  return {
    kind: 'mod',
    name: mod.name,
    label: `${icon} ${mod.name}`,
    description,
    picked: selected.includes(mod.name),
  };
}
