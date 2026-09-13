import type { NamedIdentifier, Vocabulary } from '../model/mapEditor.js';
import type { ModIndex } from '../model/modIndex.js';
import type { IdentifierCategory } from '../model/symbols.js';

/** Index entries that are keywords, not things a history file can name. */
const SPECIALS: ReadonlySet<string> = new Set(['this', 'from', 'owner', 'this_union', 'union', 'factory']);

/** The identifier lists the Map Editor form offers, from the mod index and its localisation. */
export function vocabularyOf(index: ModIndex): Vocabulary {
  return {
    countries: namesOf(index, 'country').map((tag) => qualified(index, tag.toUpperCase())),
    goods: namesOf(index, 'good').map((good) => qualified(index, good)),
    terrains: namesOf(index, 'terrain').map((terrain) => qualified(index, terrain)),
    cultures: namesOf(index, 'culture').map((culture) => localised(index, culture)),
    religions: namesOf(index, 'religion').map((religion) => localised(index, religion)),
    popTypes: namesOf(index, 'popType').map((popType) => localised(index, popType)),
    ideologies: namesOf(index, 'ideology').map((ideology) => qualified(index, ideology)),
    buildings: namesOf(index, 'building'),
    rebelTypes: namesOf(index, 'rebelType'),
  };
}

/** `identifier - localised name`: the identifier is what the file holds, and several of them can share one name. */
function qualified(index: ModIndex, id: string): NamedIdentifier {
  const text = textOf(index, id);
  return { id, label: text === '' ? id : `${id} - ${text}` };
}

function localised(index: ModIndex, id: string): NamedIdentifier {
  const text = textOf(index, id);
  return { id, label: text === '' ? id : text };
}

function textOf(index: ModIndex, id: string): string {
  return index.locKeyDefinitions.get(id.toLowerCase())?.text ?? '';
}

function namesOf(index: ModIndex, category: IdentifierCategory): string[] {
  return [...(index.identifiers.get(category) ?? [])].filter((name) => !SPECIALS.has(name)).sort();
}
