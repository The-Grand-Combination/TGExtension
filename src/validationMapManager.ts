import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { ToolbarProvider } from './toolbarProvider';
import { FileUtils } from './fileUtils';
import Jimp = require('jimp');

interface ProvinceDefinition {
    id: string;
    red: number;
    green: number;
    blue: number;
    name: string;
    lineNumber: number;
}

interface ColorPosition {
    color: string;
    positions: Array<{ x: number; y: number }>;
}

interface ColorValidationResult {
    undefinedColors: ColorPosition[];
    unusedColors: ProvinceDefinition[];
    provinceCountValid: boolean;
    maxProvinces: number;
    definitionCount: number;
}

export class ValidationMapManager {
    static async validateMap(toolbarProvider: ToolbarProvider): Promise<void> {
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
        const mapPaths = await ValidationMapManager.extractMapPaths(selectedMods, rootFolder);
        const validationResults = await ValidationMapManager.validateProvinceColors(mapPaths);
        await ValidationMapManager.generateValidationReport(validationResults, toolbarProvider);
    }

    private static async extractMapPaths(modFiles: string[], rootFolder: string): Promise<string[]> {
        const mapPaths: string[] = [];

        for (const modFile of modFiles) {
            try {
                const modFilePath = path.join(rootFolder, 'mod', modFile);
                const content = await FileUtils.readFile(modFilePath);
                
                const pathMatch = content.match(/path\s*=\s*"mod\/([^"]+)"/);
                if (pathMatch && pathMatch[1]) {
                    const modPath = pathMatch[1];
                    const mapPath = path.join(rootFolder, 'mod', modPath, 'map');
                    mapPaths.push(mapPath);
                }
            } catch (error) {
                vscode.window.showWarningMessage(`Failed to process mod file ${modFile}: ${(error as Error).message}`);
            }
        }

        return mapPaths;
    }

    private static async validateProvinceColors(mapPaths: string[]): Promise<ColorValidationResult[]> {
        const results: ColorValidationResult[] = [];

        for (const mapPath of mapPaths) {
            try {
                const defaultMapPath = path.join(mapPath, 'default.map');
                const defaultMapContent = await FileUtils.readFile(defaultMapPath);
                const maxProvincesMatch = defaultMapContent.match(/max_provinces\s*=\s*(\d+)/);
                
                if (!maxProvincesMatch) {
                    throw new Error('Could not find max_provinces in default.map');
                }
                
                const maxProvinces = parseInt(maxProvincesMatch[1]);
                console.log('Found max_provinces:', maxProvinces);

                const provinceImagePath = path.join(mapPath, 'provinces.bmp');
                const image = await Jimp.read(provinceImagePath);
                
                const imageColors = new Map<string, Set<string>>();
                image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
                    const red = image.bitmap.data[idx];
                    const green = image.bitmap.data[idx + 1];
                    const blue = image.bitmap.data[idx + 2];
                    const colorKey = `${red},${green},${blue}`;
                    
                    if (!imageColors.has(colorKey)) {
                        imageColors.set(colorKey, new Set());
                    }
                    imageColors.get(colorKey)!.add(`${x},${y}`);
                });

                const definitionsPath = path.join(mapPath, 'definition.csv');
                const definitionsContent = await FileUtils.readFile(definitionsPath);
                
                let highestProvinceId = 0;
                const lines = definitionsContent.split('\n');
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || trimmedLine.startsWith(';')) continue;
                    
                    const parts = trimmedLine.split(';');
                    const provinceId = parseInt(parts[0]);
                    if (!isNaN(provinceId) && provinceId > highestProvinceId) {
                        highestProvinceId = provinceId;
                    }
                }

                console.log('Highest Province ID:', highestProvinceId);
                console.log('Expected max_provinces should be:', highestProvinceId + 1);

                const definitionColors = new Map<string, ProvinceDefinition>();
                definitionsContent
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith(';'))
                    .forEach((line, index) => {
                        const [id, red, green, blue, name] = line.split(';');
                        if (id && red && green && blue) {
                            const colorKey = `${red},${green},${blue}`;
                            definitionColors.set(colorKey, {
                                id,
                                red: parseInt(red),
                                green: parseInt(green),
                                blue: parseInt(blue),
                                name,
                                lineNumber: index + 2
                            });
                        }
                    });

                const undefinedColors: ColorPosition[] = [];
                imageColors.forEach((positions, color) => {
                    if (!definitionColors.has(color)) {
                        const posArray = Array.from(positions)
                            .slice(0, 1)
                            .map(pos => {
                                const [x, y] = pos.split(',').map(Number);
                                return { x, y };
                            });
                        
                        undefinedColors.push({
                            color,
                            positions: posArray
                        });
                    }
                });

                const unusedColors: ProvinceDefinition[] = [];
                definitionColors.forEach((province, colorKey) => {
                    if (!imageColors.has(colorKey)) {
                        unusedColors.push(province);
                    }
                });

                results.push({
                    undefinedColors,
                    unusedColors,
                    provinceCountValid: maxProvinces === highestProvinceId + 1,
                    maxProvinces,
                    definitionCount: highestProvinceId
                });
            } catch (error) {
                console.error('Validation error:', error);
                vscode.window.showErrorMessage(`Failed to validate provinces in ${mapPath}: ${(error as Error).message}`);
            }
        }

        return results;
    }

    private static async generateValidationReport(results: ColorValidationResult[], toolbarProvider: ToolbarProvider): Promise<void> {
        let reportContent = '';

        results.forEach((result, index) => {
            if (result.provinceCountValid) {
                reportContent += `? Province count is valid (max_provinces = ${result.maxProvinces}, highest province ID = ${result.definitionCount})\n\n`;
            } else {
                reportContent += `Province count mismatch:\n`;
                reportContent += `   - max_provinces in default.map: ${result.maxProvinces}\n`;
                reportContent += `   - Highest province ID in definition.csv: ${result.definitionCount}\n`;
                reportContent += `   - Expected max_provinces value: ${result.definitionCount + 1}\n\n`;
            }
            reportContent += '\n';
            if (result.undefinedColors.length > 0) {
                reportContent += 'Colors found in provinces.bmp but not defined in definition.csv:\n';
                result.undefinedColors.forEach(colorData => {
                    reportContent += ` - RGB(${colorData.color}) found at positions:\n`;
                    colorData.positions.forEach(pos => {
                        reportContent += `    * (${pos.x}, ${pos.y})\n`;
                    });
                    if (colorData.positions.length === 1) {
                        reportContent += '    * ... (More)\n';
                    }
                    reportContent += '\n';
                });
                reportContent += '\n';
            }

            if (result.unusedColors.length > 0) {
                reportContent += 'Provinces defined in definition.csv but not used in provinces.bmp:\n';
                result.unusedColors.forEach(province => {
                    reportContent += `- Province ${province.id} (${province.name}): RGB(${province.red},${province.green},${province.blue}) at line ${province.lineNumber}\n`;
                });
                reportContent += '\n';
            }

            if (result.undefinedColors.length === 0 && 
                result.unusedColors.length === 0 && 
                result.provinceCountValid) {
                reportContent += 'All validations passed successfully.\n\n';
            }
        });

        const reportPath = path.join(ConfigManager.getRootFolder()!, 'province_validation_report.txt');

        try {
            await fs.promises.writeFile(reportPath, reportContent);
            const doc = await vscode.workspace.openTextDocument(reportPath);
            await vscode.window.showTextDocument(doc);
            toolbarProvider.setLastErrorFilePath(reportPath);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate validation report: ${(error as Error).message}`);
        }
    }
}