import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from 'vscode-languageclient/node';
import { enforceColormapsCommand } from './commands/enforceColormapsCommand.js';
import { generateFullReportCommand } from './commands/generateFullReportCommand.js';
import { generateMapReportCommand } from './commands/generateMapReportCommand.js';
import { launchGameCommand } from './commands/launchGameCommand.js';
import { openMapEditorCommand } from './commands/openMapEditorCommand.js';
import type { PickMemory } from './commands/pickMods.js';
import { ActionsTreeProvider } from './providers/actionsTreeProvider.js';
import { MapEditorPanel } from './providers/mapEditorPanel.js';
import { SettingsPanel } from './providers/settingsPanel.js';

let client: LanguageClient | undefined;

/**
 * Composition root for the client half of the extension. Starts the Victoria 2
 * language server and routes matching documents to it. All analysis logic lives
 * in the server; this file only wires VS Code to it.
 */
export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  // Everything the mod index reads, so the server can rebuild it when a file
  // changes outside the editor. `default.map` needs the `.map` glob; a `.mod`
  // descriptor change re-reads which mods are stacked.
  const fileWatchers = [
    vscode.workspace.createFileSystemWatcher(
      '**/{common,map,poptypes,technologies,inventions,units,events,decisions,localisation,news,history}/**/*.{txt,csv,map}',
    ),
    vscode.workspace.createFileSystemWatcher('**/gfx/pictures/{events,decisions}/**/*.{tga,dds}'),
    vscode.workspace.createFileSystemWatcher('**/*.mod'),
  ];
  context.subscriptions.push(...fileWatchers);

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', pattern: '**/events/**/*.txt' },
      { scheme: 'file', pattern: '**/decisions/**/*.txt' },
      { scheme: 'file', pattern: '**/common/**/*.txt' },
      { scheme: 'file', pattern: '**/poptypes/**/*.txt' },
      { scheme: 'file', pattern: '**/technologies/**/*.txt' },
      { scheme: 'file', pattern: '**/inventions/**/*.txt' },
      { scheme: 'file', pattern: '**/news/**/*.txt' },
      { scheme: 'file', pattern: '**/history/**/*.txt' },
      { scheme: 'file', pattern: '**/units/**/*.txt' },
      { scheme: 'file', pattern: '**/map/**/*.txt' },
      { scheme: 'file', pattern: '**/map/**/*.csv' },
      { scheme: 'file', pattern: '**/map/default.map' },
      { scheme: 'file', pattern: '**/interface/**/*.txt' },
      { scheme: 'file', pattern: '**/battleplans/**/*.txt' },
      { scheme: 'file', pattern: '**/tutorial/**/*.txt' },
      { scheme: 'file', pattern: '**/script/**/*.txt' },
      { scheme: 'file', pattern: '**/*.gui' },
      { scheme: 'file', pattern: '**/*.gfx' },
      { scheme: 'file', pattern: '**/*.sfx' },
      { scheme: 'file', pattern: '**/*.mod' },
    ],
    synchronize: { configurationSection: 'victorianTools', fileEvents: fileWatchers },
  };

  client = new LanguageClient(
    'victorianTools',
    'Victorian Tools Language Server',
    serverOptions,
    clientOptions,
  );

  const settingsPanel = new SettingsPanel(() => client);
  settingsPanel.listenTo(client);
  const pickMemory = workspacePickMemory(context.workspaceState);
  const mapEditorPanel = new MapEditorPanel(() => client);
  context.subscriptions.push(
    settingsPanel,
    mapEditorPanel,
    vscode.commands.registerCommand(
      'victorian-tools.openMapEditor',
      openMapEditorCommand(() => client, pickMemory, mapEditorPanel),
    ),
    vscode.commands.registerCommand('victorian-tools.restartServer', (): void => {
      void client?.restart();
    }),
    vscode.commands.registerCommand(
      'victorian-tools.generateFullReport',
      generateFullReportCommand(() => client, pickMemory),
    ),
    vscode.commands.registerCommand(
      'victorian-tools.generateMapReport',
      generateMapReportCommand(() => client, pickMemory),
    ),
    vscode.commands.registerCommand(
      'victorian-tools.enforceColormaps',
      enforceColormapsCommand(() => client, pickMemory),
    ),
    vscode.commands.registerCommand('victorian-tools.launchGame', launchGameCommand(() => client, pickMemory)),
    vscode.commands.registerCommand('victorian-tools.openSettings', (): void => {
      settingsPanel.open();
    }),
    vscode.window.registerTreeDataProvider('victorianTools.actions', new ActionsTreeProvider()),
  );

  void client.start();
}

const LAST_PICK_KEY = 'victorianTools.lastPickedMods';

/** The last mods picked for a report or a launch, kept with the workspace. */
function workspacePickMemory(state: vscode.Memento): PickMemory {
  return {
    recall: (): readonly string[] => {
      const stored = state.get<unknown>(LAST_PICK_KEY);
      return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : [];
    },
    remember: (names): Thenable<void> => state.update(LAST_PICK_KEY, [...names]),
  };
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
