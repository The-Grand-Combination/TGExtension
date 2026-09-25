import type { PopEntry, ProvinceHistory } from '../../model/mapEditor.js';
import type { Field } from '../fields.js';

/**
 * What the tabs hand the panel: how to read each form, what each was built
 * from, and what is carried across a re-render. A Save writes one file, and the
 * other tabs are still holding what was typed into them; that is carried over
 * the re-render the save triggers, and a form that was not touched is not.
 */
export interface Forms {
  historyRead: (() => ProvinceHistory) | null;
  popsRead: (() => PopEntry[]) | null;
  /** The two pick lists Save All needs and no single tab's Save reads: where a
   * history file goes, and the pops file a block would be created in. */
  historyFolder: (() => string) | null;
  popsFile: (() => string) | null;
  /** The climate and continent boxes and the states list, also read when a save has to create the province. */
  climateInput: Field | null;
  continentInput: Field | null;
  statesRead: (() => string[]) | null;
  /** What each form was built from, to tell a form that was touched from one that was not. */
  historyRendered: string;
  popsRendered: string;
  climateRendered: string;
  continentRendered: string;
  statesRendered: string;
  carriedHistory: ProvinceHistory | null;
  carriedPops: readonly PopEntry[] | null;
  carriedClimate: string | null;
  carriedContinent: string | null;
  carriedStates: readonly string[] | null;
  /** The localisation row: the Definition tab has one Save, and it writes this too. */
  nameInput: Field | null;
  seaInput: HTMLInputElement | null;
  renameInput: HTMLInputElement | null;
  /** The Definition tab's Save, for Enter in the name field to reach. */
  definitionSave: HTMLButtonElement | null;
}

export const forms: Forms = {
  historyRead: null,
  popsRead: null,
  historyFolder: null,
  popsFile: null,
  climateInput: null,
  continentInput: null,
  statesRead: null,
  historyRendered: '',
  popsRendered: '',
  climateRendered: '',
  continentRendered: '',
  statesRendered: '',
  carriedHistory: null,
  carriedPops: null,
  carriedClimate: null,
  carriedContinent: null,
  carriedStates: null,
  nameInput: null,
  seaInput: null,
  renameInput: null,
  definitionSave: null,
};
