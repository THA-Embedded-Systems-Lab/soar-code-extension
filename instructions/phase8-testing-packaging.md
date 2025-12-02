# Phase 8: Testing & Packaging

## Objective

Create comprehensive tests, package the extension, and prepare for publication.

## Steps

### 8.1 Write Unit Tests

Expand `test/suite/extension.test.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { SoarDataMap } from '../../src/datamap/index';

suite('Extension Integration Tests', () => {
    
    test('Extension activates', async () => {
        const ext = vscode.extensions.getExtension('your-publisher.soar');
        assert.ok(ext);
        await ext!.activate();
        assert.strictEqual(ext!.isActive, true);
    });

    test('Language is registered', () => {
        const langs = vscode.languages.getLanguages();
        return langs.then(languages => {
            assert.ok(languages.includes('soar'));
        });
    });

    test('Commands are registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('soar.restartLanguageServer'));
        assert.ok(commands.includes('soar.datamap.refresh'));
    });
});
```

### 8.2 Run Tests

```bash
npm test
```

### 8.3 Package Extension

Install vsce:

```bash
npm install -g @vscode/vsce
```

Package:

```bash
vsce package
```

This creates `soar-0.1.0.vsix`

### 8.4 Test Packaged Extension

Install locally:

```bash
code --install-extension soar-0.1.0.vsix
```

### 8.5 Publish (Optional)

Create publisher account at https://marketplace.visualstudio.com/

```bash
vsce publish
```

## Verification Checklist

- [ ] All tests pass
- [ ] Extension packages without errors
- [ ] Packaged extension installs correctly
- [ ] All features work in packaged version
- [ ] README is complete
- [ ] LICENSE file exists

## Files Created

This completes the Soar VS Code extension build process!
