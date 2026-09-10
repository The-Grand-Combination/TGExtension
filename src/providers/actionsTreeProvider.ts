import * as vscode from 'vscode';

/** The fixed list of actions shown in the Victorian Tools side bar. */
const ACTIONS: readonly { label: string; command: string; icon: string; tooltip: string }[] = [
  {
    label: 'Generate Full Report',
    command: 'victorian-tools.generateFullReport',
    icon: 'checklist',
    tooltip: 'Validate every file of the selected mods and list all errors and warnings.',
  },
  {
    label: 'Map Report',
    command: 'victorian-tools.generateMapReport',
    icon: 'map',
    tooltip: 'Check provinces.bmp, terrain.bmp and rivers.bmp of the selected mods against each other and definition.csv.',
  },
  {
    label: 'Enforce Colormaps',
    command: 'victorian-tools.enforceColormaps',
    icon: 'symbol-color',
    tooltip: 'Rewrite the palettes of map/terrain.bmp and map/rivers.bmp to the standard ones; pixels are untouched.',
  },
  {
    label: 'Launch Game',
    command: 'victorian-tools.launchGame',
    icon: 'play',
    tooltip: 'Pick the mods to play with (pre-filled with the mods being worked on) and start Victoria 2.',
  },
  {
    label: 'Settings',
    command: 'victorian-tools.openSettings',
    icon: 'settings-gear',
    tooltip: 'The game folder and the mods and submods being worked on.',
  },
];

export class ActionsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    return ACTIONS.map((action) => {
      const item = new vscode.TreeItem(action.label, vscode.TreeItemCollapsibleState.None);
      item.command = { command: action.command, title: action.label };
      item.iconPath = new vscode.ThemeIcon(action.icon);
      item.tooltip = action.tooltip;
      return item;
    });
  }
}
