import type { Connection } from 'vscode-languageserver/node';
import {
  DEFAULT_FLAG_NAME_PATTERN,
  DEFAULT_LOC_KEY_PATTERN,
  DEFAULT_IGNORE_MARKER,
  DEFAULT_NULL_TAG_PATTERN,
} from '../model/validationOptions.js';
import { DEFAULT_PROVINCE_FOLDER_PATTERN } from '../model/mapEditor.js';
import { SETTING, SETTINGS_SECTION, type SettingKey } from '../model/settingsKeys.js';
import { DEFAULT_CODEPAGE, isCodepage, type Codepage } from '../io/textCodec.js';

/** The server's view of `victorianTools.*`, mirroring the manifest defaults. */
export interface ServerConfig {
  readonly validationEnabled: boolean;
  /** Idle time before a changed document is revalidated. */
  readonly validationDelayMs: number;
  /** Idle time before the mod index is rebuilt after files change on disk. */
  readonly indexRebuildDelayMs: number;
  /** Index every mod in the workspace at startup instead of on first use. */
  readonly indexOnStartup: boolean;
  /** The Victoria 2 install folder; empty to detect it from the workspace. */
  readonly gamePath: string;
  /** `name`s of the mods being worked on; empty for none (each mod is read with its dependencies). */
  readonly activeMods: readonly string[];
  /** The single-byte code page every mod file is read and written in. */
  readonly encoding: Codepage;
  /** Regex source deciding which loc field values are keys; empty checks every value. */
  readonly locKeyPattern: string;
  /** Regex source narrowing the never-set flag check; empty checks every flag. */
  readonly flagNamePattern: string;
  /** Regex source of the tags meaning "no country"; empty allows no exception. */
  readonly nullTagPattern: string;
  /** Regex source narrowing which `history/provinces` subfolders the Map Editor sees; empty sees all. */
  readonly provinceFolderPattern: string;
  /** A line carrying this marker is not reported; empty turns the escape hatch off. */
  readonly ignoreMarker: string;
}

export const DEFAULT_CONFIG: ServerConfig = {
  validationEnabled: true,
  validationDelayMs: 300,
  indexRebuildDelayMs: 500,
  indexOnStartup: true,
  gamePath: '',
  activeMods: [],
  encoding: DEFAULT_CODEPAGE,
  locKeyPattern: DEFAULT_LOC_KEY_PATTERN,
  flagNamePattern: DEFAULT_FLAG_NAME_PATTERN,
  nullTagPattern: DEFAULT_NULL_TAG_PATTERN,
  provinceFolderPattern: DEFAULT_PROVINCE_FOLDER_PATTERN,
  ignoreMarker: DEFAULT_IGNORE_MARKER,
};

const VALIDATION_DELAY_RANGE = { min: 0, max: 5000 } as const;
const REBUILD_DELAY_RANGE = { min: 50, max: 10000 } as const;

/**
 * Narrow an untyped configuration bag. Every field falls back to its manifest
 * default, and numbers are clamped, so a hand-edited settings.json cannot make
 * the server hang or spin.
 */
export function readServerConfig(configuration: unknown): ServerConfig {
  const root = asRecord(configuration);
  return {
    validationEnabled: readBoolean(at(root, SETTING.validationEnabled), DEFAULT_CONFIG.validationEnabled),
    validationDelayMs: readMilliseconds(
      at(root, SETTING.validationDelay),
      DEFAULT_CONFIG.validationDelayMs,
      VALIDATION_DELAY_RANGE,
    ),
    indexRebuildDelayMs: readMilliseconds(
      at(root, SETTING.indexRebuildDelay),
      DEFAULT_CONFIG.indexRebuildDelayMs,
      REBUILD_DELAY_RANGE,
    ),
    indexOnStartup: readBoolean(at(root, SETTING.indexOnStartup), DEFAULT_CONFIG.indexOnStartup),
    gamePath: readString(at(root, SETTING.gamePath)),
    activeMods: readStringList(at(root, SETTING.activeMods)),
    encoding: readCodepage(at(root, SETTING.encoding)),
    locKeyPattern: readPattern(at(root, SETTING.locKeyPattern), DEFAULT_LOC_KEY_PATTERN),
    flagNamePattern: readPattern(at(root, SETTING.flagNamePattern), DEFAULT_FLAG_NAME_PATTERN),
    nullTagPattern: readPattern(at(root, SETTING.nullTagPattern), DEFAULT_NULL_TAG_PATTERN),
    provinceFolderPattern: readPattern(at(root, SETTING.provinceFolderPattern), DEFAULT_PROVINCE_FOLDER_PATTERN),
    ignoreMarker: readPattern(at(root, SETTING.ignoreMarker), DEFAULT_IGNORE_MARKER),
  };
}

/** Walk a dotted setting key through the nested bag the client sends. */
function at(root: Record<string, unknown> | undefined, key: SettingKey): unknown {
  let value: unknown = root;
  for (const segment of key.split('.')) {
    const record = asRecord(value);
    if (!record) {
      return undefined;
    }
    value = record[segment];
  }
  return value;
}

/** How much of the server a configuration change reaches; see `configChange`. */
export type ConfigChange = 'none' | 'other' | 'layout' | 'recoded';

/**
 * What has to be redone for the new configuration. `recoded` is a layout change
 * that also changed the code page, and it is worth telling apart: a layer set is
 * identified by its roots, so nothing about a cached index says which code page
 * its text was decoded with, and reloading the layout alone would hand every
 * open document back the text read under the page that was just replaced.
 */
export function configChange(left: ServerConfig, right: ServerConfig): ConfigChange {
  if (configEquals(left, right)) {
    return 'none';
  }
  if (left.encoding !== right.encoding) {
    return 'recoded';
  }
  return layoutConfigEquals(left, right) ? 'other' : 'layout';
}

export function configEquals(left: ServerConfig, right: ServerConfig): boolean {
  return (
    left.validationEnabled === right.validationEnabled &&
    left.validationDelayMs === right.validationDelayMs &&
    left.indexRebuildDelayMs === right.indexRebuildDelayMs &&
    left.indexOnStartup === right.indexOnStartup &&
    left.locKeyPattern === right.locKeyPattern &&
    left.flagNamePattern === right.flagNamePattern &&
    left.nullTagPattern === right.nullTagPattern &&
    left.ignoreMarker === right.ignoreMarker &&
    layoutConfigEquals(left, right)
  );
}

/**
 * True when the fields that decide which mods are read, and how, are the same.
 * `encoding` belongs here rather than in the "other" bucket: the index holds
 * text that is already decoded, so a new code page means re-reading everything.
 * `provinceFolderPattern` belongs here for the same kind of reason: only the
 * layout path clears the Map Editor's caches and tells an open page to redraw.
 */
export function layoutConfigEquals(left: ServerConfig, right: ServerConfig): boolean {
  return (
    left.gamePath === right.gamePath &&
    left.encoding === right.encoding &&
    left.provinceFolderPattern === right.provinceFolderPattern &&
    left.activeMods.length === right.activeMods.length &&
    left.activeMods.every((name, position) => name === right.activeMods[position])
  );
}

/** Pull the section from the client, falling back to defaults on any failure. */
export async function fetchServerConfig(connection: Connection): Promise<ServerConfig> {
  try {
    const configuration: unknown = await connection.workspace.getConfiguration(SETTINGS_SECTION);
    return readServerConfig(configuration);
  } catch {
    return DEFAULT_CONFIG;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  // A configuration bag arrives as `unknown` over JSON-RPC; the cast only
  // permits indexed reads, and every field is narrowed before use.
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function readCodepage(value: unknown): Codepage {
  return isCodepage(value) ? value : DEFAULT_CODEPAGE;
}

/** An absent pattern falls back to the manifest default; an empty one is the user's "check everything". */
function readPattern(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim());
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readMilliseconds(
  value: unknown,
  fallback: number,
  range: { readonly min: number; readonly max: number },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(value), range.min), range.max);
}
