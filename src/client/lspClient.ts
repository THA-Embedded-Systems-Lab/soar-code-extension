/**
 * LSP Client for Soar Extension
 *
 * Connects the VS Code extension to the Soar language server
 */

import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;
let clientReadyPromise: Promise<void> | null = null;

export async function activate(context: ExtensionContext): Promise<void> {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for Soar documents
    documentSelector: [{ scheme: 'file', language: 'soar' }],
    synchronize: {
      // Notify the server about file changes to .soar and project files
      fileEvents: workspace.createFileSystemWatcher('**/*.{soar,vsa.json,vsproj,soarproj}'),
    },
  };

  // Create the language client and start it
  client = new LanguageClient(
    'soarLanguageServer',
    'Soar Language Server',
    serverOptions,
    clientOptions
  );

  // Add error handlers
  client.onDidChangeState(event => {
    console.log(`LSP Client state changed: ${event.oldState} -> ${event.newState}`);
  });

  // Start the client. This will also launch the server
  // Store the promise so tests can wait for it
  clientReadyPromise = client.start().catch(error => {
    console.error('Failed to start LSP client:', error);
    throw error;
  });
  await clientReadyPromise;
  console.log('LSP client started successfully');
}

/**
 * Wait for the LSP client to be fully initialized and ready
 */
export async function waitForReady(): Promise<void> {
  if (clientReadyPromise) {
    await clientReadyPromise;
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

export function restart(): Thenable<void> {
  if (!client) {
    return Promise.resolve();
  }
  return client.restart();
}

export function getClient(): LanguageClient | undefined {
  return client;
}

/**
 * Notify the LSP server to load a specific project file
 */
export async function notifyProjectChanged(projectFile: string): Promise<void> {
  if (!client) {
    console.log('LSP client not initialized, skipping project notification');
    return;
  }

  // Wait for the client to be ready before sending notifications
  if (clientReadyPromise) {
    try {
      await clientReadyPromise;
    } catch (error) {
      console.error('LSP client failed to initialize:', error);
      return;
    }
  }

  try {
    console.log(`Notifying LSP server of project change: ${projectFile}`);
    await client.sendNotification('soar/projectChanged', { projectFile });
    console.log('LSP server notified successfully');
  } catch (error) {
    console.error('Failed to notify LSP of project change:', error);
  }
}
