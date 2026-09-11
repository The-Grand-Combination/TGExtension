import type { Connection } from 'vscode-languageserver/node';
import {
  DEFAULT_FLAG_NAME_PATTERN,
  DEFAULT_LOC_KEY_PATTERN,
  DEFAULT_IGNORE_MARKER,
  DEFAULT_NULL_TAG_PATTERN,
} from '../model/validationOptions.js';

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
  /** Regex source deciding which loc field values are keys; empty checks every value. */
  readonly locKeyPattern: string;
  /** Regex source narrowing the never-set flag check; empty checks every flag. */
  readonly flagNamePattern: string;
  /** Regex source of the tags meaning "no country"; empty allows no exception. */
  readonly nullTagPattern: string;
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
  locKeyPattern: DEFAULT_LOC_KEY_PATTERN,
  flagNamePattern: DEFAULT_FLAG_NAME_PATTERN,
  nullTagPattern: DEFAULT_NULL_TAG_PATTERN,
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
  const validation = asRecord(root?.['validation']);
  const index = asRecord(root?.['index']);
  return {
    validationEnabled: readBoolean(validation?.['enable'], DEFAULT_CONFIG.validationEnabled),
    validationDelayMs: readMilliseconds(
      validation?.['delay'],
      DEFAULT_CONFIG.validationDelayMs,
      VALIDATION_DELAY_RANGE,
    ),
    indexRebuildDelayMs: readMilliseconds(
      index?.['rebuildDelay'],
      DEFAULT_CONFIG.indexRebuildDelayMs,
      REBUILD_DELAY_RANGE,
    ),
    indexOnStartup: readBoolean(index?.['onStartup'], DEFAULT_CONFIG.indexOnStartup),
    gamePath: readString(root?.['gamePath']),
    activeMods: readStringList(root?.['activeMods']),
    ...readRuleConfig(root),
  };
}

/** The four rule-tuning strings; each is taken as typed, or falls back to its manifest default. */
function readRuleConfig(
  root: Record<string, unknown> | undefined,
): Pick<ServerConfig, 'locKeyPattern' | 'flagNamePattern' | 'nullTagPattern' | 'ignoreMarker'> {
  const localisation = asRecord(root?.['localisation']);
  const flags = asRecord(root?.['flags']);
  const nullTags = asRecord(root?.['nullTags']);
  return {
    locKeyPattern: readPattern(localisation?.['keyPattern'], DEFAULT_LOC_KEY_PATTERN),
    flagNamePattern: readPattern(flags?.['namePattern'], DEFAULT_FLAG_NAME_PATTERN),
    nullTagPattern: readPattern(nullTags?.['pattern'], DEFAULT_NULL_TAG_PATTERN),
    ignoreMarker: readPattern(root?.['ignoreMarker'], DEFAULT_IGNORE_MARKER),
  };
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

/** True when the fields that decide which mods are read are the same. */
export function layoutConfigEquals(left: ServerConfig, right: ServerConfig): boolean {
  return (
    left.gamePath === right.gamePath &&
    left.activeMods.length === right.activeMods.length &&
    left.activeMods.every((name, position) => name === right.activeMods[position])
  );
}

/** Pull `victorianTools` from the client, falling back to defaults on any failure. */
export async function fetchServerConfig(connection: Connection): Promise<ServerConfig> {
  try {
    const configuration: unknown = await connection.workspace.getConfiguration('victorianTools');
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
