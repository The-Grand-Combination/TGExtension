/**
 * The `contributes.configuration` keys, in one place. The client reads them as
 * dotted paths through `workspace.getConfiguration`; the server walks the same
 * paths through the untyped bag it is sent. `victorianTools.trace.server` is
 * not here: `vscode-languageclient` owns it, and no code of ours reads it.
 */
export const SETTINGS_SECTION = 'victorianTools';

export const SETTING = {
  activeMods: 'activeMods',
  encoding: 'encoding',
  gamePath: 'gamePath',
  ignoreMarker: 'ignoreMarker',
  locKeyPattern: 'localisation.keyPattern',
  flagNamePattern: 'flags.namePattern',
  nullTagPattern: 'nullTags.pattern',
  nullTagSuppress: 'nullTags.suppressWarnings',
  countryColorsTint: 'mapEditor.countryColorsTint',
  provinceFolderPattern: 'mapEditor.provinceFolderPattern',
  validationEnabled: 'validation.enable',
  validationDelay: 'validation.delay',
  indexRebuildDelay: 'index.rebuildDelay',
  indexOnStartup: 'index.onStartup',
} as const;

export type SettingKey = (typeof SETTING)[keyof typeof SETTING];

/** `victorianTools.localisation.keyPattern`, as `settings.json` and the manifest spell it. */
export function qualifiedSettingKey(key: SettingKey): string {
  return `${SETTINGS_SECTION}.${key}`;
}
