import type { Vocabulary } from '../model/mapEditor.js';
import type { ModIndex } from '../model/modIndex.js';
import type { IdentifierCategory } from '../model/symbols.js';

/** Index entries that are keywords, not things a history file can name. */
const SPECIALS: ReadonlySet<string> = new Set(['this', 'from', 'owner', 'this_union', 'union', 'factory']);

/** The identifier lists the Map Editor form suggests, from the mod index. */
export function vocabularyOf(index: ModIndex): Vocabulary {
  return {
    countries: namesOf(index, 'country').map((tag) => tag.toUpperCase()),
    goods: namesOf(index, 'good'),
    terrains: namesOf(index, 'terrain'),
    cultures: namesOf(index, 'culture'),
    religions: namesOf(index, 'religion'),
    ideologies: namesOf(index, 'ideology'),
    buildings: namesOf(index, 'building'),
    popTypes: namesOf(index, 'popType'),
    rebelTypes: namesOf(index, 'rebelType'),
  };
}

function namesOf(index: ModIndex, category: IdentifierCategory): string[] {
  return [...(index.identifiers.get(category) ?? [])].filter((name) => !SPECIALS.has(name)).sort();
}
