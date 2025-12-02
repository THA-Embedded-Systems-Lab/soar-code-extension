# Phase 1: Project Scaffolding

## Objective

Set up the basic VS Code extension structure with TypeScript, including the extension manifest, build system, and project organization.

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- VS Code installed
- Basic understanding of TypeScript
- Yeoman and VS Code Extension Generator (optional but recommended)

## Steps

### 1.1 Initialize the Extension Project

#### Option A: Using Yeoman Generator (Recommended)

```bash
# Install Yeoman and the VS Code Extension Generator
npm install -g yo generator-code

# Run the generator
yo code

# Answer the prompts:
# - What type of extension? New Extension (TypeScript)
# - Extension name: soar
# - Identifier: soar
# - Description: Soar language support with LSP, datamap tools, and syntax highlighting
# - Initialize git repository? Yes
# - Bundle extension with webpack? Yes (for better performance)
# - Package manager? npm (or yarn)
```

#### Option B: Manual Setup

If you prefer manual setup or need to customize:

1. Create project directory:
```bash
mkdir soar-vscode-extension
cd soar-vscode-extension
```

2. Initialize npm:
```bash
npm init -y
```

3. Install dependencies:
```bash
npm install --save-dev \
  @types/vscode \
  @types/node \
  typescript \
  @vscode/test-electron \
  esbuild \
  eslint \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin
```

### 1.2 Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "sourceMap": true,
    "rootDir": "src",
    "outDir": "out",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", ".vscode-test"]
}
```

### 1.3 Create package.json (Extension Manifest)

If using Yeoman, update the generated `package.json`. Otherwise, create this file:

```json
{
  "name": "soar",
  "displayName": "Soar",
  "description": "Soar language support with LSP, datamap tools, and syntax highlighting",
  "version": "0.1.0",
  "publisher": "your-publisher-name",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/soar-vscode-extension"
  },
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": [
    "Programming Languages",
    "Linters",
    "Formatters"
  ],
  "keywords": [
    "soar",
    "cognitive architecture",
    "language-server",
    "datamap"
  ],
  "activationEvents": [
    "onLanguage:soar"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "languages": [
      {
        "id": "soar",
        "aliases": ["Soar", "soar"],
        "extensions": [".soar"],
        "configuration": "./language-configuration.json"
      }
    ],
    "grammars": [
      {
        "language": "soar",
        "scopeName": "source.soar",
        "path": "./syntaxes/soar.tmLanguage.json"
      }
    ]
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile && npm run lint",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/vscode": "^1.80.0",
    "@types/node": "^18.x",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@vscode/test-electron": "^2.3.0",
    "eslint": "^8.40.0",
    "typescript": "^5.0.0",
    "@vscode/vsce": "^2.19.0"
  },
  "dependencies": {}
}
```

### 1.4 Create Project Structure

Create the following directory structure:

```bash
mkdir -p src/{client,datamap,providers,ui,server}
mkdir -p src/ui/webview
mkdir -p test/suite
mkdir -p syntaxes
```

### 1.5 Create Extension Entry Point

Create `src/extension.ts`:

```typescript
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
```

### 1.6 Create Language Configuration

Create `language-configuration.json`:

```json
{
    "comments": {
        "lineComment": "#",
        "blockComment": ["###", "###"]
    },
    "brackets": [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
        ["<", ">"]
    ],
    "autoClosingPairs": [
        { "open": "{", "close": "}" },
        { "open": "[", "close": "]" },
        { "open": "(", "close": ")" },
        { "open": "<", "close": ">" },
        { "open": "\"", "close": "\"", "notIn": ["string"] },
        { "open": "|", "close": "|", "notIn": ["string", "comment"] }
    ],
    "surroundingPairs": [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
        ["<", ">"],
        ["\"", "\""],
        ["|", "|"]
    ],
    "folding": {
        "markers": {
            "start": "^\\s*#\\s*region\\b",
            "end": "^\\s*#\\s*endregion\\b"
        }
    }
}
```

### 1.7 Create ESLint Configuration

Create `.eslintrc.json`:

```json
{
    "root": true,
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaVersion": 6,
        "sourceType": "module"
    },
    "plugins": [
        "@typescript-eslint"
    ],
    "rules": {
        "@typescript-eslint/naming-convention": "warn",
        "@typescript-eslint/semi": "warn",
        "curly": "warn",
        "eqeqeq": "warn",
        "no-throw-literal": "warn",
        "semi": "off"
    },
    "ignorePatterns": [
        "out",
        "dist",
        "**/*.d.ts"
    ]
}
```

### 1.8 Create .vscodeignore

Create `.vscodeignore` to exclude unnecessary files from the packaged extension:

```
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
```

### 1.9 Create Basic Test Setup

Create `src/test/runTest.ts`:

```typescript
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        await runTests({ 
            extensionDevelopmentPath, 
            extensionTestsPath 
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
```

Create `src/test/suite/index.ts`:

```typescript
import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true
    });

    const testsRoot = path.resolve(__dirname, '.');

    return new Promise((resolve, reject) => {
        glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
            if (err) {
                return reject(err);
            }

            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                mocha.run(failures => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        resolve();
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}
```

Create `src/test/suite/extension.test.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('your-publisher-name.soar'));
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.getExtension('your-publisher-name.soar');
        await extension?.activate();
        assert.ok(extension?.isActive);
    });
});
```

### 1.10 Install Dependencies

```bash
npm install
```

Also install additional test dependencies:

```bash
npm install --save-dev mocha @types/mocha glob @types/glob
```

### 1.11 Create README

Create `README.md`:

```markdown
# Soar VS Code Extension

A comprehensive VS Code extension for Soar, providing:

- Syntax highlighting
- LSP-based language features (diagnostics, hover, completion, go-to-definition)
- DataMap-based code suggestions
- DataMap validation and checker
- DataMap creation and editing tools

## Features

(To be expanded as features are implemented)

- **Syntax Highlighting**: Full TextMate grammar support for Soar files
- **Language Server**: Integration with Soar Language Server for IDE features
- **DataMap Tools**: Create, edit, and validate Soar datamaps

## Requirements

- VS Code 1.80.0 or higher
- Soar Language Server (bundled with extension)

## Installation

Install from the VS Code Marketplace or build from source.

## Development

See INSTRUCTIONS.md for build instructions.

## License

(Add your license here)
```

### 1.12 Build and Test

1. Compile the extension:
```bash
npm run compile
```

2. Open the project in VS Code:
```bash
code .
```

3. Press F5 to launch the Extension Development Host

4. In the new VS Code window, create a test file `test.soar`

5. Open the Command Palette (Ctrl+Shift+P) and run "Soar: Hello World"

6. Verify you see the message "Hello from Soar Extension!"

## Verification Checklist

- [ ] Project structure is created
- [ ] TypeScript compiles without errors
- [ ] Extension activates in debug mode (F5)
- [ ] Test command "Soar: Hello World" works
- [ ] .soar files are recognized (check bottom-right language indicator)
- [ ] No console errors in Extension Development Host

## Common Issues

**Issue**: Extension doesn't activate
- Check that `activationEvents` includes `onLanguage:soar`
- Verify the extension is listed in Extensions view (Ctrl+Shift+X)

**Issue**: TypeScript compilation errors
- Check Node.js version (should be 16+)
- Run `npm install` again
- Check tsconfig.json paths

**Issue**: Can't launch Extension Development Host
- Close all VS Code windows and try again
- Check for conflicting extensions

## Next Steps

Proceed to Phase 2: `instructions/phase2-syntax.md` to implement syntax highlighting.

## Files Created

- `package.json` - Extension manifest
- `tsconfig.json` - TypeScript configuration
- `language-configuration.json` - Language configuration
- `.eslintrc.json` - Linting rules
- `.vscodeignore` - Packaging exclusions
- `src/extension.ts` - Extension entry point
- `src/test/` - Test infrastructure
- `README.md` - Documentation

## Additional Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [Activation Events](https://code.visualstudio.com/api/references/activation-events)
