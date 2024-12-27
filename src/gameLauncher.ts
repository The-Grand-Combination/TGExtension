
import * as vscode from 'vscode';
import * as path from 'path';
import { FileUtils } from './fileUtils';
import { ConfigManager } from './configManager';

export class GameLauncher {
    static async launchGame(): Promise<void> {
        if (!await ConfigManager.validateRootFolder()) return;

        const modFiles = await FileUtils.getModFiles();
        if (modFiles.length === 0) {
            vscode.window.showInformationMessage('No .mod files found in the mod folder.');
            return;
        }

        const selectedMods = await vscode.window.showQuickPick(modFiles, {
            placeHolder: 'Select .mod files to run.',
            canPickMany: true
        });
        if (!selectedMods) return;

        const rootFolder = ConfigManager.getRootFolder()!;
        const gamePath = path.join(rootFolder, 'v2game.exe');
        
        if (!await FileUtils.fileExists(gamePath)) {
            vscode.window.showErrorMessage('v2game.exe not found in the selected folder. Are you sure you got the correct root folder?');
            return;
        }

        const terminal = vscode.window.createTerminal('Game Launcher');
        terminal.show();
        terminal.sendText(`cd "${rootFolder}"`);
        const modifiedMods = selectedMods.map(mod => `'-mod=mod/${mod}'`);
        terminal.sendText(`.\\v2game.exe ${modifiedMods.join(' ')}`);
    }
}
