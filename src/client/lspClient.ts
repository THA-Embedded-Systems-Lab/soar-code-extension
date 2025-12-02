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

export function activate(context: ExtensionContext) {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(path.join('out', 'server', 'soarLanguageServer.js'));

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

  // Start the client. This will also launch the server
  client.start();
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
