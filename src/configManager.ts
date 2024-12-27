
import * as vscode from 'vscode';
import * as path from 'path';
export class ConfigManager {
    static getConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('configs');
    }

    static getRootFolder(): string | undefined {
        return this.getConfig().get<string>('vic2_root_folder');
    }

    static getModFolderPath(): string | undefined {
        const rootFolder = this.getRootFolder();
        return rootFolder ? path.join(rootFolder, 'mod') : undefined;
    }

    static async validateRootFolder(): Promise<boolean> {
        const rootFolder = this.getRootFolder();
        if (!rootFolder) {
            await vscode.window.showErrorMessage('No root folder configured in the settings.');
            return false;
        }
        return true;
    }
}
