
import * as fs from 'fs';
import { ConfigManager } from './configManager';

export class FileUtils {
    static async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    static async readFile(filePath: string): Promise<string> {
        return fs.promises.readFile(filePath, 'utf-8');
    }

    static async writeFile(filePath: string, content: string): Promise<void> {
        return fs.promises.writeFile(filePath, content);
    }

    static async findFiles(directory: string, extension: string): Promise<string[]> {
        const files = await fs.promises.readdir(directory);
        return files.filter(file => file.endsWith(extension));
    }

    static async getModFiles(): Promise<string[]> {
        const modFolder = ConfigManager.getModFolderPath();
        if (!modFolder) return [];
        return this.findFiles(modFolder, '.mod');
    }
}