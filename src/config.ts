import * as vscode from 'vscode';
import {
  DEFAULT_FLAG_NAME_PATTERN,
  DEFAULT_LOC_KEY_PATTERN,
  DEFAULT_IGNORE_MARKER,
  DEFAULT_NULL_TAG_PATTERN,
  DEFAULT_SUPPRESS_NULL_TAG_WARNINGS,
} from './model/validationOptions.js';
import { DEFAULT_COUNTRY_COLORS_TINT, DEFAULT_PROVINCE_FOLDER_PATTERN } from './model/mapEditor.js';
import { qualifiedSettingKey, SETTING, SETTINGS_SECTION } from './model/settingsKeys.js';


/** `name`s of the mods being worked on, as stored in `victorianTools.activeMods`. */
export function readActiveMods(): string[] {
  const value = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<unknown>(SETTING.activeMods);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** The selection belongs to the workspace when there is one, else to the user settings. */
export function writeActiveMods(names: readonly string[]): Thenable<void> {
  const target =
    (vscode.workspace.workspaceFolders ?? []).length > 0
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  return vscode.workspace.getConfiguration(SETTINGS_SECTION).update(SETTING.activeMods, [...names], target);
}

/** `victorianTools.gamePath` as typed; empty when the install is to be detected. */
export function readGamePath(): string {
  const value = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<unknown>(SETTING.gamePath);
  return typeof value === 'string' ? value.trim() : '';
}

/** The install folder is a property of the machine, so it goes to the user settings, never into a shared workspace. */
export function writeGamePath(gamePath: string): Thenable<void> {
  return vscode.workspace
    .getConfiguration(SETTINGS_SECTION)
    .update(SETTING.gamePath, gamePath.trim() === '' ? undefined : gamePath.trim(), vscode.ConfigurationTarget.Global);
}

/**
 * The regex deciding which loc field values are keys, as stored in
 * `victorianTools.localisation.keyPattern`. Empty is a real setting (check
 * every value), so it is never normalized away.
 */
export function readLocKeyPattern(): string {
  const value = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<unknown>(SETTING.locKeyPattern);
  return typeof value === 'string' ? value : DEFAULT_LOC_KEY_PATTERN;
}

export function writeLocKeyPattern(pattern: string): Thenable<void> {
  return vscode.workspace.getConfiguration(SETTINGS_SECTION).update(SETTING.locKeyPattern, pattern, patternTarget());
}

/**
 * The regex narrowing the never-set flag check, as stored in
 * `victorianTools.flags.namePattern`. Empty checks every flag.
 */
export function readFlagNamePattern(): string {
  const value = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<unknown>(SETTING.flagNamePattern);
  return typeof value === 'string' ? value : DEFAULT_FLAG_NAME_PATTERN;
}

export function writeFlagNamePattern(pattern: string): Thenable<void> {
  return vscode.workspace.getConfiguration(SETTINGS_SECTION).update(SETTING.flagNamePattern, pattern, patternTarget());
}

/**
 * The regex matching tags that mean "no country", as stored in
 * `victorianTools.nullTags.pattern`. Empty allows no exception.
 */
export function readNullTagPattern(): string {
  const value = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<unknown>(SETTING.nullTagPattern);
  return typeof value === 'string' ? value : DEFAULT_NULL_TAG_PATTERN;
}

export function writeNullTagPattern(pattern: string): Thenable<void> {
  return vscode.workspace.getConfiguration(SETTINGS_SECTION).update(SETTING.nullTagPattern, pattern, patternTarget());
}

/**
 * Whether the tags that pattern matches are reported at all, as stored in
 * `victorianTools.nullTags.suppressWarnings`. On by default.
 */
export function readNullTagSuppress(): boolean {
  const value = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<unknown>(SETTING.nullTagSuppress);
  return typeof value === 'boolean' ? value : DEFAULT_SUPPRESS_NULL_TAG_WARNINGS;
}

export function writeNullTagSuppress(suppress: boolean): Thenable<void> {
  return vscode.workspace.getConfiguration(SETTINGS_SECTION).update(SETTING.nullTagSuppress, suppress, patternTarget());
}

/**
 * The marker that silences a line, as stored in `victorianTools.ignoreMarker`.
 * Empty turns the escape hatch off. Never trimmed: trailing space is part of it
 * if the user typed it.
 */
export function readIgnoreMarker(): string {
  const value = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<unknown>(SETTING.ignoreMarker);
  return typeof value === 'string' ? value : DEFAULT_IGNORE_MARKER;
}

export function writeIgnoreMarker(marker: string): Thenable<void> {
  return vscode.workspace.getConfiguration(SETTINGS_SECTION).update(SETTING.ignoreMarker, marker, patternTarget());
}

/**
 * The regex narrowing which `history/provinces` subfolders the Map Editor reads,
 * as stored in `victorianTools.mapEditor.provinceFolderPattern`. Empty uses every
 * folder.
 */
export function readProvinceFolderPattern(): string {
  const value = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<unknown>(SETTING.provinceFolderPattern);
  return typeof value === 'string' ? value : DEFAULT_PROVINCE_FOLDER_PATTERN;
}

export function writeProvinceFolderPattern(pattern: string): Thenable<void> {
  return vscode.workspace.getConfiguration(SETTINGS_SECTION).update(SETTING.provinceFolderPattern, pattern, patternTarget());
}

/**
 * The Country Colors tint of the Map Editor, 0-100, as stored in
 * `victorianTools.mapEditor.countryColorsTint`. Anything else falls back to the default.
 */
export function readCountryColorsTint(): number {
  const value = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<unknown>(SETTING.countryColorsTint);
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : DEFAULT_COUNTRY_COLORS_TINT;
}

/** A viewing preference, so it goes to the user settings. */
export function writeCountryColorsTint(percent: number): Thenable<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return vscode.workspace
    .getConfiguration(SETTINGS_SECTION)
    .update(SETTING.countryColorsTint, clamped === DEFAULT_COUNTRY_COLORS_TINT ? undefined : clamped, vscode.ConfigurationTarget.Global);
}

export function affectsCountryColorsTint(event: vscode.ConfigurationChangeEvent): boolean {
  return event.affectsConfiguration(qualifiedSettingKey(SETTING.countryColorsTint));
}

/** True when a configuration change touches anything the settings page shows. */
export function affectsSettingsPage(event: vscode.ConfigurationChangeEvent): boolean {
  const keys = [SETTING.activeMods, SETTING.gamePath, SETTING.locKeyPattern, SETTING.flagNamePattern, SETTING.nullTagPattern, SETTING.nullTagSuppress, SETTING.ignoreMarker, SETTING.countryColorsTint, SETTING.provinceFolderPattern];
  return keys.some((key) => event.affectsConfiguration(qualifiedSettingKey(key)));
}

/** A naming convention belongs to the mod, so it goes to the workspace when there is one. */
function patternTarget(): vscode.ConfigurationTarget {
  return (vscode.workspace.workspaceFolders ?? []).length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}
