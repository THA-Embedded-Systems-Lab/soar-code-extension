import * as vscode from 'vscode';

/**
 * Extension activation function
 * Called when the extension is activated (when a .soar file is opened)
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Soar extension is now active');

    // Register a simple command to verify the extension works
    const disposable = vscode.commands.registerCommand('soar.helloWorld', () => {
        vscode.window.showInformationMessage('Hello from Soar Extension!');
    });

    context.subscriptions.push(disposable);

    // TODO: Initialize LSP client (Phase 3)
    // TODO: Initialize datamap providers (Phase 5)
    // TODO: Initialize datamap UI (Phase 7)
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated
 */
export function deactivate() {
    console.log('Soar extension is now deactivated');
    // TODO: Cleanup LSP client (Phase 3)
}
