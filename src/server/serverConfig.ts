import type { Connection } from 'vscode-languageserver/node';

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
}

export const DEFAULT_CONFIG: ServerConfig = {
  validationEnabled: true,
  validationDelayMs: 300,
  indexRebuildDelayMs: 500,
  indexOnStartup: true,
  gamePath: '',
  activeMods: [],
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
  };
}

export function configEquals(left: ServerConfig, right: ServerConfig): boolean {
  return (
    left.validationEnabled === right.validationEnabled &&
    left.validationDelayMs === right.validationDelayMs &&
    left.indexRebuildDelayMs === right.indexRebuildDelayMs &&
    left.indexOnStartup === right.indexOnStartup &&
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
