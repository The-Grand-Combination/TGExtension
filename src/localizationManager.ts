import * as vscode from 'vscode';
import * as path from 'path';
import { FileUtils } from './fileUtils';

export class LocalizationManager {
    static readonly DEFAULT_LOCALIZATION_CONTENT = 'CODE;ENGLISH;FRENCH;GERMAN;POLISH;SPANISH;ITALIAN;SWEDISH;CZECH;HUNGARIAN;DUTCH;PORTUGUESE;RUSSIAN;FINNISH;x\n';

    static getLocalizationPath(document: vscode.TextDocument): string {
        return path.join(path.dirname(document.uri.fsPath), '../localisation');
    }

    static async searchLocalization(text: string, document: vscode.TextDocument): Promise<string | undefined> {
        const locPath = this.getLocalizationPath(document);
        if (!await FileUtils.fileExists(locPath)) return undefined;

        const files = await FileUtils.findFiles(locPath, '.csv');
        for (const file of files) {
            const content = await FileUtils.readFile(path.join(locPath, file));
            const lines = content.split('\n');
            for (const line of lines) {
                const [key, value] = line.split(';');
                if (key === text) return value;
            }
        }
        return undefined;
    }

    static async ensureLocalizationFile(locPath: string): Promise<string> {
        const targetFile = path.join(locPath, 'vt_localization.csv');
        if (!await FileUtils.fileExists(targetFile)) {
            await FileUtils.writeFile(targetFile, this.DEFAULT_LOCALIZATION_CONTENT);
        }
        return targetFile;
    }
}
