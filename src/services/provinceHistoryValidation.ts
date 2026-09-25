import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import { PROVINCE_HISTORY_FOLDER } from '../model/gamePaths.js';
import {
  describeProvince,
  landProvinces,
  type DeclaredProvince,
  type ProvinceScope,
} from './declaredProvinces.js';
import type { LoadedLayeredFile } from './modLayers.js';
import { runToEnd, type WorkUnits } from './scheduling.js';

/**
 * Keys a land province's history has to set. Without `life_rating` the province
 * takes no migrants and grows nothing; without `trade_goods` it produces
 * nothing at all. Neither stops the game loading, which is what makes a
 * province missing one easy to ship and hard to notice.
 */
const REQUIRED_KEYS: readonly string[] = ['life_rating', 'trade_goods'];

export interface ProvinceHistoryAuditInput extends ProvinceScope {
  /** `map/definition.csv`, for the provinces it declares and where it declares them. */
  readonly definitionText: string | undefined;
  /** Every file under `history/provinces`, already read. */
  readonly files: readonly LoadedLayeredFile[];
}

export interface ProvinceHistoryAudit {
  /** Findings about a province with no history at all, reported where it is declared. */
  readonly definition: Diagnostic[];
  /** Findings about a history file, by its mod-relative path. */
  readonly byFile: Map<string, Diagnostic[]>;
}

/**
 * Every land province the map declares needs a file under `history/provinces`,
 * and what those files say has to include `life_rating` and `trade_goods`.
 *
 * Two things make this less simple than it sounds. The engine takes a
 * province's id from the digits its file name starts with, and it loads *every*
 * file claiming an id rather than one of them — vanilla itself ships two files
 * for 1396 — so a province's history is the merge of all of them. And a file
 * that is deliberately empty is an idiom rather than an oversight: a mod that
 * replaces `history` ships one empty file per vanilla province to neutralise
 * them. An empty file still fails this check, but only for a province the map
 * itself declares; the thousands of neutralising files are for provinces the
 * mod's own `definition.csv` no longer has.
 */
export function auditProvinceHistory(input: ProvinceHistoryAuditInput): ProvinceHistoryAudit {
  const audit = emptyAudit();
  runToEnd(provinceHistoryAuditUnits(input, audit));
  return audit;
}

export function emptyAudit(): ProvinceHistoryAudit {
  return { definition: [], byFile: new Map<string, Diagnostic[]>() };
}

/** `auditProvinceHistory` as work units, one per declared province; the findings land in `into`. */
export function* provinceHistoryAuditUnits(input: ProvinceHistoryAuditInput, into: ProvinceHistoryAudit): WorkUnits {
  const land = landProvinces(input.definitionText, input);
  if (land.length === 0) {
    // No definition.csv in the stack: nothing says which provinces exist.
    return;
  }
  const byId = filesByProvinceId(input.files);
  for (const province of land) {
    const claiming = byId.get(province.id);
    if (claiming === undefined) {
      into.definition.push(withoutHistory(province));
      continue;
    }
    const keys = keysOf(claiming);
    const missing = REQUIRED_KEYS.filter((key) => !keys.has(key));
    if (missing.length > 0) {
      addTo(into.byFile, reportedOn(claiming), incomplete(province, claiming, missing));
    }
    yield claiming.reduce((size, file) => size + file.text.length, 0);
  }
}

/**
 * Province id → every file claiming it, in load order. The id is the digits the
 * file name starts with, which is all the engine reads of the name.
 */
function filesByProvinceId(files: readonly LoadedLayeredFile[]): ReadonlyMap<string, LoadedLayeredFile[]> {
  const byId = new Map<string, LoadedLayeredFile[]>();
  for (const file of files) {
    const id = provinceIdOf(file.relativePath);
    if (id === undefined) {
      continue;
    }
    const claiming = byId.get(id) ?? [];
    claiming.push(file);
    byId.set(id, claiming);
  }
  return byId;
}

function provinceIdOf(relativePath: string): string | undefined {
  const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  return name.toLowerCase().endsWith('.txt') ? /^(\d+)/.exec(name)?.[1] : undefined;
}

/** The top-level keys every file claiming the province sets between them. */
function keysOf(claiming: readonly LoadedLayeredFile[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const file of claiming) {
    for (const entry of file.document().entries) {
      // A dated block is a later change; the province still has to start with a value.
      if (entry.kind === 'assignment' && entry.key.type !== 'date') {
        keys.add(entry.key.value.toLowerCase());
      }
    }
  }
  return keys;
}

/** The last file to claim the id: the engine applies them in order, so that one has the final say. */
function reportedOn(claiming: readonly LoadedLayeredFile[]): string {
  return claiming[claiming.length - 1]?.relativePath ?? '';
}

function withoutHistory(province: DeclaredProvince): Diagnostic {
  const fileName = `${province.id} - ${province.name === '' ? '<name>' : province.name}.txt`;
  return diagnostic(
    'error',
    'missing-province-history',
    `${describeProvince(province)} has no file under ${PROVINCE_HISTORY_FOLDER}. Every land province the map declares needs ` +
      `one, named for its id: "${fileName}".`,
    province.range,
  );
}

function incomplete(
  province: DeclaredProvince,
  claiming: readonly LoadedLayeredFile[],
  missing: readonly string[],
): Diagnostic {
  const others = claiming.slice(0, -1).map((file) => `"${file.relativePath}"`);
  const alsoClaimed =
    others.length === 0
      ? ''
      : ` The engine reads ${String(others.length)} more file(s) for this province — ${others.join(', ')} — ` +
        'and none of them sets it either.';
  return diagnostic(
    'error',
    'incomplete-province-history',
    `${describeProvince(province)} does not set ${list(missing)}. A land province needs both "life_rating" and ` +
      '"trade_goods": without the first it takes no migrants, without the second it produces nothing.' +
      alsoClaimed,
    { start: 0, end: 0 },
  );
}

function list(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(' or ');
}

function addTo(byFile: Map<string, Diagnostic[]>, filePath: string, found: Diagnostic): void {
  const existing = byFile.get(filePath) ?? [];
  existing.push(found);
  byFile.set(filePath, existing);
}
