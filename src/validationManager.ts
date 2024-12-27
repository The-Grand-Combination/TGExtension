import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { ToolbarProvider } from './toolbarProvider';
import { FileUtils } from './fileUtils';

export class ValidationManager {
    static async validateGame(toolbarProvider: ToolbarProvider): Promise<void> {
        if (!await ConfigManager.validateRootFolder()) return;

        const modFiles = await FileUtils.getModFiles();
        if (modFiles.length === 0) {
            vscode.window.showInformationMessage('No .mod files found in the mod folder.');
            return;
        }

        const selectedMods = await vscode.window.showQuickPick(modFiles, {
            placeHolder: 'Select .mod files to validate',
            canPickMany: true
        });
        if (!selectedMods) return;

        const rootFolder = ConfigManager.getRootFolder()!;
        const katEnginePath = path.join(rootFolder, 'KatEngine.exe');
        
        if (!await FileUtils.fileExists(katEnginePath)) {
            const selection = await vscode.window.showErrorMessage(
                'KatEngine.exe not found in the selected folder.',
                'Download Katerina Engine',
                'OK'
            );
            if (selection === 'Download Katerina Engine') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/Nivaturimika/Katerina-Engine/tree/0.0.11'));
            }
            return;
        }

        const terminal = vscode.window.createTerminal('KatEngine Validation');
        terminal.show();
        terminal.sendText(`cd "${rootFolder}"`);
        const modifiedMods = selectedMods.map(mod => `-mod ${mod}`);
        terminal.sendText(`.\\KatEngine.exe -validate ${modifiedMods.join(' ')}`);

        await ValidationManager.handleValidationOutput(toolbarProvider);
    }

    private static async handleValidationOutput(toolbarProvider: ToolbarProvider): Promise<void> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Validating... This can take a minute.',
            cancellable: false
        }, async () => {
            const errorFilePath = toolbarProvider.getLastErrorFilePath();
            try {
                await ValidationManager.waitForErrorFile(errorFilePath, toolbarProvider);
                const doc = await vscode.workspace.openTextDocument(errorFilePath);
                await vscode.window.showTextDocument(doc);
            } catch (error) {
                vscode.window.showErrorMessage(`Validation error: ${(error as Error).message}`);
            }
        });
    }

    private static async waitForErrorFile(filePath: string, toolbarProvider: ToolbarProvider): Promise<void> {
        const timeoutDuration = 5 * 60 * 1000; // 5 minutes
        const startTime = Date.now();

        while (true) {
            try {
                await fs.promises.access(filePath, fs.constants.F_OK);
                const content = await FileUtils.readFile(filePath);
                toolbarProvider.setLastErrorFilePath(filePath);
                return;
            } catch {
                if (Date.now() - startTime > timeoutDuration) {
                    throw new Error('Timeout waiting for error log file');
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
}
