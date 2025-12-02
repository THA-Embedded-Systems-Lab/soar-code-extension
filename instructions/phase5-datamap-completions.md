# Phase 5: DataMap-Based Completions

## Objective

Implement intelligent code completions using datamap information to suggest attributes, values, and operators contextually.

## Prerequisites

- Completed Phases 1-4
- Understanding of VS Code CompletionProvider API
- Functional datamap system

## Steps

### 5.1 Create Completion Provider

Create `src/providers/completionProvider.ts`:

```typescript
import * as vscode from 'vscode';
import { SoarDataMap } from '../datamap/index';
import { DataMapUtils } from '../datamap/utils';
import { DataMapNodeType } from '../datamap/types';

export class SoarCompletionProvider implements vscode.CompletionItemProvider {
    private datamap: SoarDataMap;

    constructor(datamap: SoarDataMap) {
        this.datamap = datamap;
    }

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        
        const line = document.lineAt(position).text;
        const beforeCursor = line.substring(0, position.character);

        // Detect if we're completing an attribute (after ^)
        if (beforeCursor.match(/\^\s*[\w-]*$/)) {
            return this.provideAttributeCompletions();
        }

        // Detect if we're in a state pattern
        if (beforeCursor.match(/\(state\s+<\w+>\s+/)) {
            return this.provideStateAttributeCompletions();
        }

        // Default completions
        return this.provideKeywordCompletions();
    }

    private provideAttributeCompletions(): vscode.CompletionItem[] {
        const allAttributes = new Set<string>();
        
        for (const node of this.datamap.getAllNodes()) {
            if (node.type === DataMapNodeType.ATTRIBUTE) {
                allAttributes.add(node.name);
            }
        }

        return Array.from(allAttributes).map(attr => {
            const item = new vscode.CompletionItem(attr, vscode.CompletionItemKind.Field);
            item.detail = 'Attribute from datamap';
            item.insertText = attr;
            return item;
        });
    }

    private provideStateAttributeCompletions(): vscode.CompletionItem[] {
        const commonAttributes = [
            'type', 'operator', 'superstate', 'io', 'name', 
            'problem-space', 'impasse', 'choices'
        ];

        return commonAttributes.map(attr => {
            const item = new vscode.CompletionItem(`^${attr}`, vscode.CompletionItemKind.Field);
            item.detail = 'Common state attribute';
            item.insertText = `^${attr} `;
            return item;
        });
    }

    private provideKeywordCompletions(): vscode.CompletionItem[] {
        const keywords = ['sp', 'gp', 'state', 'operator', 'impasse'];
        
        return keywords.map(keyword => {
            const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
            item.detail = 'Soar keyword';
            return item;
        });
    }

    updateDataMap(datamap: SoarDataMap): void {
        this.datamap = datamap;
    }
}
```

### 5.2 Register Completion Provider

Update `src/extension.ts`:

```typescript
import { SoarCompletionProvider } from './providers/completionProvider';
import { SoarDataMap } from './datamap/index';

export async function activate(context: vscode.ExtensionContext) {
    // ... existing code ...

    // Initialize datamap (for now, create empty one)
    const datamap = new SoarDataMap('workspace-datamap');
    
    // Register completion provider
    const completionProvider = new SoarCompletionProvider(datamap);
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
        { language: 'soar', scheme: 'file' },
        completionProvider,
        '^', // Trigger on ^ character
        ' '  // Trigger on space
    );

    context.subscriptions.push(completionDisposable);
}
```

### 5.3 Load DataMap from Workspace

Create `src/datamap/loader.ts`:

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SoarDataMap } from './index';
import { DataMapParser } from './parser';

export class DataMapLoader {
    
    static async loadFromWorkspace(): Promise<SoarDataMap> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return new SoarDataMap('empty');
        }

        const datamap = new SoarDataMap('workspace-datamap');
        
        // Look for .dm files (VisualSoar format)
        const dmFiles = await vscode.workspace.findFiles('**/*.dm');
        for (const uri of dmFiles) {
            const content = fs.readFileSync(uri.fsPath, 'utf-8');
            const parsed = DataMapParser.parseDataMapFile(content);
            // Merge into main datamap
            this.mergeDataMaps(datamap, parsed);
        }

        // Parse all .soar files
        const soarFiles = await vscode.workspace.findFiles('**/*.soar');
        const parser = new DataMapParser(datamap);
        
        for (const uri of soarFiles) {
            const content = fs.readFileSync(uri.fsPath, 'utf-8');
            parser.parseProduction(content, uri.fsPath);
        }

        return datamap;
    }

    private static mergeDataMaps(target: SoarDataMap, source: SoarDataMap): void {
        // Simple merge - add all nodes from source to target
        for (const node of source.getAllNodes()) {
            // Check if node already exists
            const existing = target.findNodesByName(node.name);
            if (existing.length === 0) {
                target.addNode({
                    name: node.name,
                    type: node.type,
                    parent: node.parent,
                    children: [],
                    comment: node.comment
                });
            }
        }
    }
}
```

### 5.4 Test Completions

Create test file `test/fixtures/test-completions.soar`:

```soar
sp {test*completions
   (state <s> ^type state
              ^  # Type ^ and space to trigger completions
}
```

## Verification Checklist

- [ ] Completion provider created
- [ ] Provider registered for .soar files
- [ ] Completions trigger on ^ character
- [ ] Common attributes suggested
- [ ] DataMap attributes appear in completions
- [ ] Keyword completions work
- [ ] DataMap loaded from workspace files

## Next Steps

Proceed to Phase 6: `instructions/phase6-datamap-checker.md`
