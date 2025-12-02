# Phase 3: LSP Integration

## Objective

Integrate the SoarTech Soar Language Server to provide IDE features including diagnostics, hover information, code completion, and go-to-definition functionality.

## Prerequisites

- Completed Phase 1 (Project scaffolding)
- Completed Phase 2 (Syntax highlighting)
- Access to the Soar Language Server repository
- Understanding of Language Server Protocol (LSP)

## Background

The Language Server Protocol enables language-specific features in editors. The Soar Language Server (from SoarTech) provides:

- **Diagnostics**: Parse errors and warnings
- **Hover**: Documentation and type information
- **Completion**: Context-aware code suggestions
- **Go to Definition**: Navigate to production definitions
- **Find References**: Find all uses of a symbol

## Steps

### 3.1 Install LSP Dependencies

Install the VS Code language client library:

```bash
npm install vscode-languageclient
```

### 3.2 Obtain the Soar Language Server

You have several options:

#### Option A: Clone and Build from Source

```bash
# Clone the repository
cd server/
git clone https://github.com/soartech/soar-language-server.git
cd soar-language-server

# Build the server (requires Java and Gradle)
./gradlew build

# The JAR file will be in build/libs/
```

#### Option B: Download Pre-built Binary

If available, download a pre-built JAR from the releases page.

#### Option C: Use Existing Installation

If the server is already installed on the system, reference its path.

### 3.3 Create Server Configuration

Create `src/server/serverConfig.ts`:

```typescript
import * as path from 'path';
import * as fs from 'fs';

export interface ServerConfig {
    command: string;
    args: string[];
    options?: any;
}

/**
 * Get the Soar Language Server configuration
 * @param extensionPath The extension's installation path
 */
export function getServerConfig(extensionPath: string): ServerConfig | null {
    // Option 1: Bundled JAR in extension
    const bundledJar = path.join(extensionPath, 'server', 'soar-language-server.jar');
    
    if (fs.existsSync(bundledJar)) {
        return {
            command: 'java',
            args: ['-jar', bundledJar],
            options: {}
        };
    }

    // Option 2: Check for system-installed server
    // You can add logic here to check common installation paths
    
    // Option 3: Use environment variable
    const serverPath = process.env.SOAR_LSP_SERVER;
    if (serverPath && fs.existsSync(serverPath)) {
        return {
            command: 'java',
            args: ['-jar', serverPath],
            options: {}
        };
    }

    return null;
}

/**
 * Validate that Java is installed and accessible
 */
export async function validateJava(): Promise<boolean> {
    const { exec } = require('child_process');
    
    return new Promise((resolve) => {
        exec('java -version', (error: any) => {
            resolve(!error);
        });
    });
}
```

### 3.4 Create LSP Client

Create `src/client/lspClient.ts`:

```typescript
import * as path from 'path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import { getServerConfig, validateJava } from '../server/serverConfig';

let client: LanguageClient | undefined;

/**
 * Start the Soar Language Server client
 */
export async function startLanguageClient(context: vscode.ExtensionContext): Promise<void> {
    // Validate Java installation
    const javaInstalled = await validateJava();
    if (!javaInstalled) {
        const message = 'Java is required for Soar language features. Please install Java and reload the window.';
        vscode.window.showErrorMessage(message, 'Install Java').then(selection => {
            if (selection === 'Install Java') {
                vscode.env.openExternal(vscode.Uri.parse('https://adoptium.net/'));
            }
        });
        return;
    }

    // Get server configuration
    const serverConfig = getServerConfig(context.extensionPath);
    if (!serverConfig) {
        const message = 'Soar Language Server not found. Some features will be unavailable.';
        vscode.window.showWarningMessage(message);
        return;
    }

    // Define server options
    const serverOptions: ServerOptions = {
        command: serverConfig.command,
        args: serverConfig.args,
        options: serverConfig.options
    };

    // Define client options
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'soar' },
            { scheme: 'untitled', language: 'soar' }
        ],
        synchronize: {
            // Notify the server about file changes to '.soar' files in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.soar')
        },
        outputChannelName: 'Soar Language Server',
        revealOutputChannelOn: 2, // RevealOutputChannelOn.Info
    };

    // Create and start the language client
    client = new LanguageClient(
        'soarLanguageServer',
        'Soar Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client and server
    try {
        await client.start();
        console.log('Soar Language Server started successfully');
        vscode.window.showInformationMessage('Soar Language Server is now active');
    } catch (error) {
        console.error('Failed to start Soar Language Server:', error);
        vscode.window.showErrorMessage(`Failed to start Soar Language Server: ${error}`);
    }

    // Register client for disposal
    context.subscriptions.push({
        dispose: () => stopLanguageClient()
    });
}

/**
 * Stop the Soar Language Server client
 */
export async function stopLanguageClient(): Promise<void> {
    if (client) {
        await client.stop();
        client = undefined;
        console.log('Soar Language Server stopped');
    }
}

/**
 * Restart the Soar Language Server client
 */
export async function restartLanguageClient(context: vscode.ExtensionContext): Promise<void> {
    await stopLanguageClient();
    await startLanguageClient(context);
}

/**
 * Get the active language client
 */
export function getLanguageClient(): LanguageClient | undefined {
    return client;
}
```

### 3.5 Update Extension Entry Point

Update `src/extension.ts` to initialize the LSP client:

```typescript
import * as vscode from 'vscode';
import { startLanguageClient, stopLanguageClient, restartLanguageClient } from './client/lspClient';

/**
 * Extension activation function
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('Soar extension is now active');

    // Start the Language Server
    await startLanguageClient(context);

    // Register commands
    registerCommands(context);

    // TODO: Initialize datamap providers (Phase 5)
    // TODO: Initialize datamap UI (Phase 7)
}

/**
 * Extension deactivation function
 */
export async function deactivate() {
    console.log('Soar extension is now deactivated');
    await stopLanguageClient();
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext) {
    // Restart language server command
    const restartCommand = vscode.commands.registerCommand('soar.restartLanguageServer', async () => {
        await restartLanguageClient(context);
        vscode.window.showInformationMessage('Soar Language Server restarted');
    });

    // Show output channel command
    const showOutputCommand = vscode.commands.registerCommand('soar.showOutputChannel', () => {
        // The LSP client automatically creates an output channel
        vscode.commands.executeCommand('soar.languageServer.showOutputChannel');
    });

    context.subscriptions.push(restartCommand, showOutputCommand);
}
```

### 3.6 Update package.json

Add commands and configuration to `package.json`:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "soar.restartLanguageServer",
        "title": "Restart Language Server",
        "category": "Soar"
      },
      {
        "command": "soar.showOutputChannel",
        "title": "Show Language Server Output",
        "category": "Soar"
      }
    ],
    "configuration": {
      "type": "object",
      "title": "Soar",
      "properties": {
        "soar.languageServer.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable the Soar Language Server"
        },
        "soar.languageServer.path": {
          "type": "string",
          "default": "",
          "description": "Custom path to the Soar Language Server JAR file"
        },
        "soar.languageServer.javaPath": {
          "type": "string",
          "default": "java",
          "description": "Path to the Java executable"
        },
        "soar.languageServer.javaOptions": {
          "type": "array",
          "default": [],
          "description": "Additional Java options (e.g., ['-Xmx512m'])"
        },
        "soar.trace.server": {
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off",
          "description": "Trace communication between VS Code and the language server"
        }
      }
    }
  }
}
```

### 3.7 Implement Configuration Support

Update `src/server/serverConfig.ts` to use VS Code settings:

```typescript
import * as vscode from 'vscode';

export function getServerConfig(extensionPath: string): ServerConfig | null {
    const config = vscode.workspace.getConfiguration('soar');
    
    // Check if language server is enabled
    if (!config.get<boolean>('languageServer.enabled', true)) {
        return null;
    }

    // Get custom paths from settings
    const customServerPath = config.get<string>('languageServer.path');
    const javaPath = config.get<string>('languageServer.javaPath', 'java');
    const javaOptions = config.get<string[]>('languageServer.javaOptions', []);

    // Priority 1: Custom path from settings
    if (customServerPath && fs.existsSync(customServerPath)) {
        return {
            command: javaPath,
            args: [...javaOptions, '-jar', customServerPath],
            options: {}
        };
    }

    // Priority 2: Bundled JAR
    const bundledJar = path.join(extensionPath, 'server', 'soar-language-server.jar');
    if (fs.existsSync(bundledJar)) {
        return {
            command: javaPath,
            args: [...javaOptions, '-jar', bundledJar],
            options: {}
        };
    }

    // Priority 3: Environment variable
    const serverPath = process.env.SOAR_LSP_SERVER;
    if (serverPath && fs.existsSync(serverPath)) {
        return {
            command: javaPath,
            args: [...javaOptions, '-jar', serverPath],
            options: {}
        };
    }

    return null;
}
```

### 3.8 Bundle the Server

If bundling the server with the extension:

1. Build the Soar Language Server JAR
2. Copy the JAR to `server/soar-language-server.jar`
3. Update `.vscodeignore` to include the server:

```
# .vscodeignore
.vscode/**
.vscode-test/**
src/**
test/**
node_modules/**
.gitignore
.eslintrc.json
**/*.map
**/*.ts
tsconfig.json
instructions/**
INSTRUCTIONS.md

# Include the server
!server/soar-language-server.jar
```

### 3.9 Create Status Bar Item

Add a status bar item to show server status in `src/client/lspClient.ts`:

```typescript
let statusBarItem: vscode.StatusBarItem;

export async function startLanguageClient(context: vscode.ExtensionContext): Promise<void> {
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(loading~spin) Soar LSP Starting...';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // ... existing code ...

    // Update status on successful start
    client.onReady().then(() => {
        statusBarItem.text = '$(check) Soar LSP';
        statusBarItem.tooltip = 'Soar Language Server is running';
    });

    // Update status on error
    client.onDidChangeState((event) => {
        if (event.newState === State.Stopped) {
            statusBarItem.text = '$(error) Soar LSP';
            statusBarItem.tooltip = 'Soar Language Server stopped';
        }
    });
}
```

### 3.10 Test the Integration

1. Ensure the server JAR is accessible
2. Compile the extension:
```bash
npm run compile
```

3. Launch Extension Development Host (F5)

4. Open a `.soar` file

5. Verify:
   - Status bar shows "Soar LSP"
   - No errors in "Soar Language Server" output channel
   - Diagnostics appear for syntax errors
   - Hover shows information (if implemented by server)
   - Go to definition works (if implemented by server)

### 3.11 Create Test File

Create `test/fixtures/test-lsp.soar`:

```soar
# This file tests LSP features

# Test 1: Valid production (should have no errors)
sp {test*valid-production
   (state <s> ^type state)
-->
   (<s> ^test-attribute value)
}

# Test 2: Syntax error (should show diagnostic)
sp {test*syntax-error
   (state <s> ^type state
   # Missing closing parenthesis
-->
   (<s> ^error true)
}

# Test 3: Reference to production (test go-to-definition)
sp {test*reference
   (state <s> ^type state)
-->
   (<s> ^uses test*valid-production)
}
```

## Verification Checklist

- [ ] Language client package installed
- [ ] Server configuration implemented
- [ ] LSP client created and properly configured
- [ ] Extension activates LSP client on .soar files
- [ ] Server JAR is accessible (bundled or configured path)
- [ ] Java validation works
- [ ] Status bar item shows server status
- [ ] Commands registered (restart server, show output)
- [ ] Configuration options work
- [ ] Diagnostics appear for syntax errors
- [ ] Hover information displayed (if server supports)
- [ ] Go to definition works (if server supports)
- [ ] Completion works (if server supports)
- [ ] Output channel shows server logs
- [ ] No errors in Developer Console

## Common Issues

**Issue**: Server fails to start
- Verify Java is installed: `java -version`
- Check server JAR exists at configured path
- Review "Soar Language Server" output channel for errors
- Check file permissions on JAR

**Issue**: No diagnostics or LSP features
- Verify server is actually running (check status bar)
- Ensure file is saved (.soar extension)
- Check that `documentSelector` matches your files
- Review server output for protocol errors

**Issue**: High memory usage
- Add Java memory limits in settings: `['-Xmx512m']`
- Check for memory leaks in server implementation

**Issue**: Server crashes frequently
- Check server logs in output channel
- Verify server JAR is compatible with Java version
- Report issues to Soar Language Server repository

## Troubleshooting Commands

Add a diagnostics command in `src/extension.ts`:

```typescript
const diagnosticsCommand = vscode.commands.registerCommand('soar.showDiagnostics', async () => {
    const client = getLanguageClient();
    const javaInstalled = await validateJava();
    const serverConfig = getServerConfig(context.extensionPath);
    
    const info = {
        'Client Status': client ? 'Running' : 'Not running',
        'Java Installed': javaInstalled ? 'Yes' : 'No',
        'Server Config': serverConfig ? 'Found' : 'Not found',
        'Server Path': serverConfig?.args[serverConfig.args.length - 1] || 'N/A'
    };
    
    const message = Object.entries(info)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    
    vscode.window.showInformationMessage(message, { modal: true });
});

context.subscriptions.push(diagnosticsCommand);
```

Register in package.json:

```json
{
  "command": "soar.showDiagnostics",
  "title": "Show Language Server Diagnostics",
  "category": "Soar"
}
```

## Next Steps

Proceed to Phase 4: `instructions/phase4-datamap-logic.md` to port VisualSoar's DataMap logic.

## Files Created/Modified

- `src/client/lspClient.ts` - LSP client implementation
- `src/server/serverConfig.ts` - Server configuration
- `src/extension.ts` - Updated with LSP initialization
- `package.json` - Added commands and configuration
- `.vscodeignore` - Updated to include/exclude server
- `test/fixtures/test-lsp.soar` - Test file
