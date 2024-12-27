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

    constructor(private context: vscode.ExtensionContext) {
        this.lastErrorFilePath = path.join(os.homedir(), 'AppData', 'Local', 'Katerina Engine', 'scenario_errors.txt');
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
                iconName: 'code-oss'
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
}