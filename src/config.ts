import * as vscode from 'vscode';
import {
  DEFAULT_FLAG_NAME_PATTERN,
  DEFAULT_LOC_KEY_PATTERN,
  DEFAULT_IGNORE_MARKER,
  DEFAULT_NULL_TAG_PATTERN,
} from './model/validationOptions.js';

const SECTION = 'victorianTools';
const ACTIVE_MODS = 'activeMods';
const GAME_PATH = 'gamePath';
const LOC_KEY_PATTERN = 'localisation.keyPattern';
const FLAG_NAME_PATTERN = 'flags.namePattern';
const NULL_TAG_PATTERN = 'nullTags.pattern';
const IGNORE_MARKER = 'ignoreMarker';

/** `name`s of the mods being worked on, as stored in `victorianTools.activeMods`. */
export function readActiveMods(): string[] {
  const value = vscode.workspace.getConfiguration(SECTION).get<unknown>(ACTIVE_MODS);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** The selection belongs to the workspace when there is one, else to the user settings. */
export function writeActiveMods(names: readonly string[]): Thenable<void> {
  const target =
    (vscode.workspace.workspaceFolders ?? []).length > 0
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  return vscode.workspace.getConfiguration(SECTION).update(ACTIVE_MODS, [...names], target);
}

/** `victorianTools.gamePath` as typed; empty when the install is to be detected. */
export function readGamePath(): string {
  const value = vscode.workspace.getConfiguration(SECTION).get<unknown>(GAME_PATH);
  return typeof value === 'string' ? value.trim() : '';
}

/** The install folder is a property of the machine, so it goes to the user settings, never into a shared workspace. */
export function writeGamePath(gamePath: string): Thenable<void> {
  return vscode.workspace
    .getConfiguration(SECTION)
    .update(GAME_PATH, gamePath.trim() === '' ? undefined : gamePath.trim(), vscode.ConfigurationTarget.Global);
}

/**
 * The regex deciding which loc field values are keys, as stored in
 * `victorianTools.localisation.keyPattern`. Empty is a real setting (check
 * every value), so it is never normalized away.
 */
export function readLocKeyPattern(): string {
  const value = vscode.workspace.getConfiguration(SECTION).get<unknown>(LOC_KEY_PATTERN);
  return typeof value === 'string' ? value : DEFAULT_LOC_KEY_PATTERN;
}

export function writeLocKeyPattern(pattern: string): Thenable<void> {
  return vscode.workspace.getConfiguration(SECTION).update(LOC_KEY_PATTERN, pattern, patternTarget());
}

/**
 * The regex narrowing the never-set flag check, as stored in
 * `victorianTools.flags.namePattern`. Empty checks every flag.
 */
export function readFlagNamePattern(): string {
  const value = vscode.workspace.getConfiguration(SECTION).get<unknown>(FLAG_NAME_PATTERN);
  return typeof value === 'string' ? value : DEFAULT_FLAG_NAME_PATTERN;
}

export function writeFlagNamePattern(pattern: string): Thenable<void> {
  return vscode.workspace.getConfiguration(SECTION).update(FLAG_NAME_PATTERN, pattern, patternTarget());
}

/**
 * The regex matching tags that mean "no country", as stored in
 * `victorianTools.nullTags.pattern`. Empty allows no exception.
 */
export function readNullTagPattern(): string {
  const value = vscode.workspace.getConfiguration(SECTION).get<unknown>(NULL_TAG_PATTERN);
  return typeof value === 'string' ? value : DEFAULT_NULL_TAG_PATTERN;
}

export function writeNullTagPattern(pattern: string): Thenable<void> {
  return vscode.workspace.getConfiguration(SECTION).update(NULL_TAG_PATTERN, pattern, patternTarget());
}

/**
 * The marker that silences a line, as stored in `victorianTools.ignoreMarker`.
 * Empty turns the escape hatch off. Never trimmed: trailing space is part of it
 * if the user typed it.
 */
export function readIgnoreMarker(): string {
  const value = vscode.workspace.getConfiguration(SECTION).get<unknown>(IGNORE_MARKER);
  return typeof value === 'string' ? value : DEFAULT_IGNORE_MARKER;
}

export function writeIgnoreMarker(marker: string): Thenable<void> {
  return vscode.workspace.getConfiguration(SECTION).update(IGNORE_MARKER, marker, patternTarget());
}

/** True when a configuration change touches anything the settings page shows. */
export function affectsSettingsPage(event: vscode.ConfigurationChangeEvent): boolean {
  const keys = [ACTIVE_MODS, GAME_PATH, LOC_KEY_PATTERN, FLAG_NAME_PATTERN, NULL_TAG_PATTERN, IGNORE_MARKER];
  return keys.some((key) => event.affectsConfiguration(`${SECTION}.${key}`));
}

/** A naming convention belongs to the mod, so it goes to the workspace when there is one. */
function patternTarget(): vscode.ConfigurationTarget {
  return (vscode.workspace.workspaceFolders ?? []).length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}
