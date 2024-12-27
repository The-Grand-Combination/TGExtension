import * as path from 'path';
import * as vscode from 'vscode';
import { FileUtils } from './fileUtils';
import { LocalizationManager } from './localizationManager';

interface DefinitionProvider {
    regex: RegExp;
    handler: (text: string, document: vscode.TextDocument) => Promise<vscode.Location | undefined>;
}

export const definitionProviders: DefinitionProvider[] = [
    {
        regex: /\b(has_country_flag|clr_country_flag|add_country_flag|title|desc|name|news_desc_short|news_desc_medium|news_desc_long)\s*=\s*["']?[\w-]+["']?/,
        handler: async (text: string, document: vscode.TextDocument) => {
            const locPath = LocalizationManager.getLocalizationPath(document);
            if (!await FileUtils.fileExists(locPath)) return undefined;

            const key = text.split('=')[1].trim().replace(/['"]+/g, '');
            const files = await FileUtils.findFiles(locPath, '.csv');

            for (const file of files) {
                const filePath = path.join(locPath, file);
                const content = await FileUtils.readFile(filePath);
                const lines = content.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    const [csvKey] = lines[i].split(';');
                    if (csvKey === key) {
                        return new vscode.Location(
                            vscode.Uri.file(filePath),
                            new vscode.Position(i, 0)
                        );
                    }
                }
            }

            const targetFile = await LocalizationManager.ensureLocalizationFile(locPath);
            const content = await FileUtils.readFile(targetFile);
            return new vscode.Location(
                vscode.Uri.file(targetFile),
                new vscode.Position(content.split('\n').length, 0)
            );
        }
    },
    {
        regex: /\b(?!AND\b|NOT\b)[A-Z0-9]{3}\b/,
        handler: async (text: string, document: vscode.TextDocument) => {
            const parentDir = path.dirname(document.uri.fsPath);
            const historyPath = path.join(parentDir, '../history/countries');
            
            if (!await FileUtils.fileExists(historyPath)) return undefined;

            const files = (await FileUtils.findFiles(historyPath, '')).filter(file => file.startsWith(text));
            if (files.length === 0) return undefined;

            return new vscode.Location(
                vscode.Uri.file(path.join(historyPath, files[0])),
                new vscode.Position(0, 0)
            );
        }
    }
];
