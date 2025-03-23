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

interface DuplicateValidationResult {
    duplicateIds: Array<{
        id: string;
        lines: number[];
    }>;
    duplicateColors: Array<{
        color: string;
        provinces: Array<{
            id: string;
            name: string;
            lineNumber: number;
        }>;
    }>;
}

interface ColorValidationResult {
    undefinedColors: ColorPosition[];
    unusedColors: ProvinceDefinition[];
    provinceCountValid: boolean;
    maxProvinces: number;
    definitionCount: number;
    duplicates: DuplicateValidationResult;
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
    
        // Use vscode.window.withProgress para mostrar a mensagem de progresso
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Validating map... This can take a minute.',
            cancellable: false
        }, async () => {
            const rootFolder = ConfigManager.getRootFolder()!;
            const mapPaths = await ValidationMapManager.extractMapPaths(selectedMods, rootFolder);
            const validationResults = await ValidationMapManager.validateProvinceColors(mapPaths);
            await ValidationMapManager.generateValidationReport(validationResults, toolbarProvider);
        });
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
                const idMap = new Map<string, number[]>();
                const colorMap = new Map<string, Array<{id: string; name: string; lineNumber: number}>>();

                const duplicates: DuplicateValidationResult = {
                    duplicateIds: [],
                    duplicateColors: []
                };

                definitionsContent
                    .split('\n')
                    .slice(1)
                    .map(line => line.trim())
                    .forEach((line, index) => {
                        const [id, red, green, blue, name] = line.split(';');
                        
                        if (red && green && blue) {
                            const colorKey = `${red},${green},${blue}`;
                            
                            if (!colorMap.has(colorKey)) {
                                colorMap.set(colorKey, []);
                            }
                            colorMap.get(colorKey)!.push({
                                id,
                                name,
                                lineNumber: index + 2
                            });

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

                idMap.forEach((lines, id) => {
                    if (lines.length > 1) {
                        duplicates.duplicateIds.push({
                            id,
                            lines
                        });
                    }
                });

                colorMap.forEach((provinces, color) => {
                    if (provinces.length > 1) {
                        duplicates.duplicateColors.push({
                            color,
                            provinces
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
                    definitionCount: highestProvinceId,
                    duplicates
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
            if (!result.provinceCountValid) {
                reportContent += `Province count mismatch:\n`;
                reportContent += `   - max_provinces in default.map: ${result.maxProvinces}\n`;
                reportContent += `   - Highest province ID in definition.csv: ${result.definitionCount}\n`;
                reportContent += `   - Expected max_provinces value: ${result.definitionCount + 1}\n\n`;
            }

            if (result.duplicates.duplicateIds.length > 0) {
                reportContent += 'Duplicate Province IDs found:\n';
                result.duplicates.duplicateIds.forEach(duplicate => {
                    reportContent += `- ID "${duplicate.id}" appears at lines: ${duplicate.lines.join(', ')}\n`;
                });
                reportContent += '\n';
            }

            if (result.duplicates.duplicateColors.length > 0) {
                reportContent += 'Duplicate RGB colors found:\n';
                result.duplicates.duplicateColors.forEach(duplicate => {
                    reportContent += `- RGB(${duplicate.color}) is used by multiple provinces:\n`;
                    duplicate.provinces.forEach(province => {
                        reportContent += `  * Province ${province.id} (${province.name}) at line ${province.lineNumber}\n`;
                    });
                });
                reportContent += '\n';
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
                result.provinceCountValid &&
                result.duplicates.duplicateIds.length === 0 &&
                result.duplicates.duplicateColors.length === 0) {
                reportContent += 'All validations passed successfully.\n\n';
            }
        });

        const reportPath = path.join(ConfigManager.getRootFolder()!, 'province_validation_report.txt');

        try {
            await fs.promises.writeFile(reportPath, reportContent);
            const doc = await vscode.workspace.openTextDocument(reportPath);
            await vscode.window.showTextDocument(doc);
            // Use setLastMapErrorFilePath instead of setLastErrorFilePath
            toolbarProvider.setLastMapErrorFilePath(reportPath);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate validation report: ${(error as Error).message}`);
        }
    }
}