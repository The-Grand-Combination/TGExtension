import type { NamedIdentifier, Vocabulary } from '../model/mapEditor.js';
import type { ModIndex } from '../model/modIndex.js';
import type { IdentifierCategory } from '../model/symbols.js';

/** Index entries that are keywords, not things a history file can name. */
const SPECIALS: ReadonlySet<string> = new Set(['this', 'from', 'owner', 'this_union', 'union', 'factory']);

/** The identifier lists the Map Editor form offers, from the mod index and its localisation. */
export function vocabularyOf(index: ModIndex): Vocabulary {
  return {
    countries: namesOf(index, 'country').map((tag) => named(index, tag.toUpperCase(), (text) => `${tag.toUpperCase()} - ${text}`)),
    goods: namesOf(index, 'good').map((good) => named(index, good, (text) => text)),
    // Several terrains share one localised name (every urban_* is "Urban"), so the id stays visible.
    terrains: namesOf(index, 'terrain').map((terrain) => named(index, terrain, (text) => `${text} (${terrain})`)),
    cultures: namesOf(index, 'culture').map((culture) => named(index, culture, (text) => text)),
    religions: namesOf(index, 'religion').map((religion) => named(index, religion, (text) => text)),
    popTypes: namesOf(index, 'popType').map((popType) => named(index, popType, (text) => text)),
    ideologies: namesOf(index, 'ideology'),
    buildings: namesOf(index, 'building'),
    rebelTypes: namesOf(index, 'rebelType'),
  };
}

/** The label built from the localised name, or the identifier alone when the localisation has no text for it. */
function named(index: ModIndex, id: string, label: (text: string) => string): NamedIdentifier {
  const text = index.locKeyDefinitions.get(id.toLowerCase())?.text ?? '';
  return { id, label: text === '' ? id : label(text) };
}

function namesOf(index: ModIndex, category: IdentifierCategory): string[] {
  return [...(index.identifiers.get(category) ?? [])].filter((name) => !SPECIALS.has(name)).sort();
}
