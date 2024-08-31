import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

class MyTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;
  private lastErrorFilePath: string | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    const selectedFolder = this.context.workspaceState.get<string>('selectedExeFolder');
    const items: vscode.TreeItem[] = [];

    const selectFolderItem = new vscode.TreeItem(
      selectedFolder ? `Root folder: "/${path.basename(selectedFolder)}" (Click to change)` : 'Click to select your Victoria II root folder',
      vscode.TreeItemCollapsibleState.None
    );
    selectFolderItem.command = {
      command: 'extension.selectFolder',
      title: 'Select Folder'
    };
    selectFolderItem.tooltip = 'Click to change your Victoria II root folder.';
    selectFolderItem.iconPath = new vscode.ThemeIcon('folder');
    items.push(selectFolderItem);

    const runButton = new vscode.TreeItem('Run KatEngine Validation', vscode.TreeItemCollapsibleState.None);
    runButton.command = {
      command: 'extension.openFileSelection',
      title: 'Select .mod files'
    };
    runButton.tooltip = 'Click to select .mod files and validate them.';
    runButton.iconPath = new vscode.ThemeIcon('play');
    items.push(runButton);

    const openLastErrorButton = new vscode.TreeItem('Open Last Error File', vscode.TreeItemCollapsibleState.None);
    openLastErrorButton.command = {
      command: 'extension.openLastErrorFile',
      title: 'Open the last Error Log generated by Kate\'s Engine Validator'
    };
    openLastErrorButton.iconPath = new vscode.ThemeIcon('code-oss');
    items.push(openLastErrorButton);

    return Promise.resolve(items);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setLastErrorFilePath(filePath: string): void {
    this.lastErrorFilePath = (filePath);
    this.refresh(); // Refresh to ensure UI reflects changes
  }

  getLastErrorFilePath(): string | undefined {
    return this.lastErrorFilePath;
  }
}

async function deleteAndOpenFile(scenarioErrorsPath: string, treeDataProvider: MyTreeDataProvider): Promise<void> {
  return vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Validating... This can take a minute.',
    cancellable: false
  }, async (progress) => {
    try {
      await new Promise<void>((resolve, reject) => {
        fs.unlink(scenarioErrorsPath, (unlinkErr) => {
          if (unlinkErr && unlinkErr.code !== 'ENOENT') {
            vscode.window.showErrorMessage('Error deleting scenario_errors.txt.');
            reject(unlinkErr);
            return;
          }
          checkFileExistence(scenarioErrorsPath, resolve, reject, progress, treeDataProvider);
        });
      });

      // Open the file automatically after validation is complete
      const lastErrorFilePath = treeDataProvider.getLastErrorFilePath();
      if (lastErrorFilePath) {
        vscode.workspace.openTextDocument(lastErrorFilePath)
          .then(doc => vscode.window.showTextDocument(doc));
      } else {
        vscode.window.showErrorMessage('No error file found to open.');
      }
      
    } catch (error) {
      vscode.window.showErrorMessage(`Error during validation: ${(error as Error).message}`);
    }
  });
}

async function checkFileExistence(
  scenarioErrorsPath: string,
  resolve: () => void,
  reject: (error: Error) => void,
  progress: vscode.Progress<{ message?: string }>,
  treeDataProvider: MyTreeDataProvider
): Promise<void> {
  const timeoutDuration = 5 * 60 * 1000; // 5 minutes in milliseconds
  const startTime = Date.now();

  const checkAccess = (): Promise<void> => {
    return new Promise((innerResolve, innerReject) => {
      fs.access(scenarioErrorsPath, fs.constants.F_OK, (accessErr) => {
        if (!accessErr) {
          // Read the file content
          fs.readFile(scenarioErrorsPath, 'utf8', (readErr, data) => {
            if (readErr) {
              innerReject(readErr);
            } else {
              // Update the tree view with the file content
              treeDataProvider.setLastErrorFilePath(scenarioErrorsPath);
              innerResolve();
            }
          });
        } else {
          innerReject(new Error('File not accessible'));
        }
      });
    });
  };

  while (true) {
    try {
      await checkAccess();
      resolve();
      break; // Exit loop if the file is successfully read and displayed
    } catch (error) {
      // Check if the timeout duration has been exceeded
      if (Date.now() - startTime > timeoutDuration) {
        vscode.window.showErrorMessage('Timeout exceeded while waiting for the error log file.');
        reject(new Error('Timeout exceeded'));
        break;
      }

      progress.report({ message: '' });
      await new Promise(resolve => setTimeout(resolve, 1000)); // Retry after 1 second
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const treeDataProvider = new MyTreeDataProvider(context);
  vscode.window.createTreeView('ke_validate_view', {
    treeDataProvider,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.selectFolder', async () => {
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Folder'
      });

      if (folderUri && folderUri[0]) {
        const folderPath = folderUri[0].fsPath;
        vscode.window.showInformationMessage(`Selected folder: ${folderPath}`);
        context.workspaceState.update('selectedExeFolder', folderPath);
        treeDataProvider.refresh(); // Refresh the view to display the selected folder and the button
      }
    }),

    vscode.commands.registerCommand('extension.openFileSelection', async () => {
      const selectedFolder = context.workspaceState.get<string>('selectedExeFolder');
      if (!selectedFolder) {
        vscode.window.showErrorMessage('No folder selected.');
        return;
      }

      const modFolderPath = path.join(selectedFolder, 'mod');
      fs.readdir(modFolderPath, (err, files) => {
        if (err) {
          vscode.window.showErrorMessage('Error reading mod folder.');
          return;
        }

        const modFiles = files.filter(file => file.endsWith('.mod'));
        if (modFiles.length === 0) {
          vscode.window.showInformationMessage('No .mod files found in the mod folder.');
          return;
        }

        vscode.window.showQuickPick(modFiles, {
          placeHolder: 'Select .mod files to validate',
          canPickMany: true
        }).then(selectedMods => {
          if (selectedMods) {
            const katEnginePath = path.join(selectedFolder, 'KatEngine.exe');
            const scenarioErrorsPath = path.join(os.homedir(), 'AppData', 'Local', 'Katerina Engine', 'scenario_errors.txt');

            fs.access(katEnginePath, fs.constants.F_OK, (err) => {
              if (err) {
                vscode.window.showErrorMessage(
                  'KatEngine.exe not found in the selected folder.',
                  'Download Katerina Engine',
                  'OK'
                ).then(selection => {
                  if (selection === 'Download Katerina Engine') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/Nivaturimika/Katerina-Engine/tree/0.0.11')); // Replace with your documentation link
                  }
                });
                return;
              }

              const command = `.\\KatEngine.exe -validate -mod ${selectedMods.join(' ')}`;
              const terminal = vscode.window.createTerminal('KatEngine Validation');
              terminal.show();
              terminal.sendText(`cd "${selectedFolder}"`);
              terminal.sendText(command);

              deleteAndOpenFile(scenarioErrorsPath, treeDataProvider);
            });
          }
        });
      });
    }),

    vscode.commands.registerCommand('extension.openLastErrorFile', () => {
      const lastErrorFilePath = treeDataProvider.getLastErrorFilePath();
      if (!lastErrorFilePath) {
        try { 
          vscode.workspace.openTextDocument(path.join(os.homedir(), 'AppData', 'Local', 'Katerina Engine', 'scenario_errors.txt'))
          .then(doc => vscode.window.showTextDocument(doc));
        }
        catch {
          vscode.window.showErrorMessage('No error file to open.')
        }  
        return;
      }
      vscode.workspace.openTextDocument(lastErrorFilePath)
        .then(doc => vscode.window.showTextDocument(doc));
    })
  );
}

export function deactivate() {}
