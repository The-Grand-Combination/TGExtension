
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Up and running');
}

function deactivate() {
    
}

module.exports = {
    activate,
    deactivate
};
