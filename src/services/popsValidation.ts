import { VANILLA_POPS } from '../data/vanillaPops.js';
import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import { POPS_FOLDER } from '../model/gamePaths.js';
import type { Range } from '../model/range.js';

/** How many missing files a message names before it stops listing them. */
const LISTED = 6;

export interface PopsAudit {
  /** Date folder → the base game's file names the stack does not provide, in vanilla order. */
  readonly missingByDate: ReadonlyMap<string, readonly string[]>;
}

/**
 * The engine reads a province's starting pops from `history/pops/<date>/`, and
 * a province that ends up with pops but no owner crashes the game. A mod that
 * hides the base game's copy with `replace_path`, or that blanks it file by
 * file, therefore owns the whole set: every file the base game ships for that
 * date has to be there. An empty file is enough — that is what a total
 * conversion ships for the countries it does not use.
 *
 * Matching is by file name, unlike province history: a pops file holds many
 * provinces and its name carries nothing the engine reads, so only a file of
 * the same name takes the base game's copy out of play.
 *
 * `presentFiles` is the stack, not the mod folder, so nothing special is needed
 * for the two ways a mod passes without shipping anything: a mod that does not
 * replace `history` still has the base game's files underneath it, and a submod
 * has whatever the mod it depends on provides.
 *
 * A date folder the stack does not have at all is not judged. The base game
 * ships pops for a second bookmark (`1861.4.14`) that a mod with one bookmark
 * has no use for, and mods that drop it run.
 */
export function auditPops(presentFiles: readonly string[]): PopsAudit {
  const present = presentByDate(presentFiles);
  const missingByDate = new Map<string, readonly string[]>();
  for (const [date, names] of Object.entries(VANILLA_POPS)) {
    const have = present.get(date);
    if (have === undefined) {
      continue;
    }
    const missing = names.filter((name) => !have.has(name.toLowerCase()));
    if (missing.length > 0) {
      missingByDate.set(date, missing);
    }
  }
  return { missingByDate };
}

/** Date folder → the file names the stack provides in it, lowercased. */
function presentByDate(presentFiles: readonly string[]): ReadonlyMap<string, Set<string>> {
  const byDate = new Map<string, Set<string>>();
  for (const relativePath of presentFiles) {
    const match = new RegExp(`^${POPS_FOLDER}/([^/]+)/([^/]+\\.txt)$`, 'i').exec(relativePath);
    const [, date, name] = match ?? [];
    if (date === undefined || name === undefined) {
      continue;
    }
    const names = byDate.get(date) ?? new Set<string>();
    names.add(name.toLowerCase());
    byDate.set(date, names);
  }
  return byDate;
}

/** One finding per date folder; a mod keeps the two bookmarks apart, so the report does too. */
export function popsDiagnostics(audit: PopsAudit, range: Range): Diagnostic[] {
  return [...audit.missingByDate].map(([date, missing]) => popsDiagnostic(date, missing, range));
}

function popsDiagnostic(date: string, missing: readonly string[], range: Range): Diagnostic {
  const total = VANILLA_POPS[date]?.length ?? 0;
  const listed = missing.slice(0, LISTED).join(', ');
  const rest = missing.length > LISTED ? `, and ${String(missing.length - LISTED)} more` : '';
  return diagnostic(
    'error',
    'missing-pops-file',
    `${String(missing.length)} of the ${String(total)} pops files the base game ships for ${date} ` +
      `${missing.length === 1 ? 'is' : 'are'} not in the stack: ${listed}${rest}. ` +
      'The engine reads starting pops from those file names, and a province left with pops but no owner crashes the game. ' +
      `Put each one back under ${POPS_FOLDER}/${date}/ under exactly that name; an empty file is enough.`,
    range,
  );
}
