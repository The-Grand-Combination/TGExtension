import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

interface ToolbarItem {
    label: string;
    collapsibleState: vscode.TreeItemCollapsibleState;
    command?: vscode.Command;
    tooltip?: string;
    iconName: string;
}

export class ToolbarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private lastErrorFilePath: string;
    private lastMapErrorFilePath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.lastErrorFilePath = path.join(os.homedir(), 'AppData', 'Local', 'Katerina Engine', 'scenario_errors.txt');
        this.lastMapErrorFilePath = path.join(os.homedir(), 'AppData', 'Local', 'province_validation_report.txt');
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): vscode.TreeItem[] {
        const toolbarItems: ToolbarItem[] = [
            {
                label: 'Run KatEngine Validation',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'extension.openFileSelection',
                    title: 'Select .mod files'
                },
                tooltip: 'Click to select .mod files and validate them.',
                iconName: 'debug-alt'
            },
            {
                label: 'Open Last Error File',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'extension.openLastErrorFile',
                    title: 'Open the last Error Log'
                },
                tooltip: 'Opens the last game validation error log.',
                iconName: 'code-oss'
            },
            {
                label: 'Run Map Validation',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'extension.openFileSelectionMap',
                    title: 'Select .mod files'
                },
                tooltip: 'Click to select .mod files and validate their maps.',
                iconName: 'globe'
            },
            {
                label: 'Open Last Map Error File',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'extension.openLastMapErrorFile',
                    title: 'Open the last Map Validation Report'
                },
                tooltip: 'Opens the last map validation report.',
                iconName: 'map'
            },
            {
                label: 'Rename Generator',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'extension.openRenameGenerator',
                    title: 'Open Province Rename Generator'
                },
                tooltip: 'Generate province rename code snippets.',
                iconName: 'edit'
            },
            {
                label: 'Province History Generator',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'extension.openProvinceHistoryGenerator',
                    title: 'Open Province History Generator'
                },
                tooltip: 'Generate province history snippets.',
                iconName: 'edit'
            },
            {
                label: 'Province Pop Generator',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'extension.openProvincePopGenerator',
                    title: 'Open Province Pop Generator'
                },
                tooltip: 'Generate province pop snippets.',
                iconName: 'edit'
            },
            {
                label: 'Launch Game',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'extension.launchGame',
                    title: 'Pick mods and launch game'
                },
                iconName: 'play'
            },
            {
                label: 'Open Extension Settings',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'workbench.action.openSettings',
                    arguments: ['configs.vic2_root_folder'],
                    title: 'Open Extension Settings'
                },
                tooltip: 'Click to configure the extension settings.',
                iconName: 'gear'
            }
        ];

        return toolbarItems.map(item => {
            const treeItem = new vscode.TreeItem(item.label, item.collapsibleState);
            treeItem.command = item.command;
            treeItem.tooltip = item.tooltip;
            treeItem.iconPath = new vscode.ThemeIcon(item.iconName);
            return treeItem;
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    setLastErrorFilePath(filePath: string): void {
        this.lastErrorFilePath = filePath;
        this.refresh();
    }

    getLastErrorFilePath(): string {
        return this.lastErrorFilePath;
    }

    setLastMapErrorFilePath(filePath: string): void {
        this.lastMapErrorFilePath = filePath;
        this.refresh();
    }

    getLastMapErrorFilePath(): string {
        return this.lastMapErrorFilePath;
    }
}