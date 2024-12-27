import * as vscode from 'vscode';
import { FileUtils } from './fileUtils';
import { ValidationManager } from './validationManager';
import { GameLauncher } from './gameLauncher';
import { ToolbarProvider } from './toolbarProvider';
import { hoverProviders } from './hoverProviders';
import { definitionProviders } from './definitionProviders';

export function activate(context: vscode.ExtensionContext) {

  const toolbarProvider = new ToolbarProvider(context);
  
  context.subscriptions.push(
      vscode.window.registerTreeDataProvider('victorian_tools', toolbarProvider),
      
      vscode.commands.registerCommand('extension.openFileSelection', () => 
          ValidationManager.validateGame(toolbarProvider)
      ),
      
      vscode.commands.registerCommand('extension.openLastErrorFile', async () => {
          const errorPath = toolbarProvider.getLastErrorFilePath();
          if (!errorPath || !await FileUtils.fileExists(errorPath)) {
              vscode.window.showErrorMessage('No error file to open.');
              return;
          }
          const doc = await vscode.workspace.openTextDocument(errorPath);
          await vscode.window.showTextDocument(doc);
      }),
      
      vscode.commands.registerCommand('extension.launchGame', () => 
          GameLauncher.launchGame()
      )
  );

  hoverProviders.forEach(provider => {
      context.subscriptions.push(
          vscode.languages.registerHoverProvider({ scheme: 'file', language: 'paradox' }, {
              provideHover(document, position) {
                  const range = document.getWordRangeAtPosition(position, provider.regex);
                  const match = range ? document.getText(range).match(provider.regex) : null;
                  const text = match ? match[1] || match[0] : null;
                  return text ? provider.handler(text, document) : null;
              }
          })
      );
  });

  definitionProviders.forEach(provider => {
      context.subscriptions.push(
          vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'paradox' }, {
              provideDefinition(document, position) {
                  const range = document.getWordRangeAtPosition(position, provider.regex);
                  const match = range ? document.getText(range).match(provider.regex) : null;
                  const text = match ? match[0] : null;
                  return text ? provider.handler(text, document) : null;
              }
          })
      );
  });
}

export function deactivate() {}