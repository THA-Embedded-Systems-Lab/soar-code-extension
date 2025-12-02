# References and Resources

This document provides links and references to all the key resources needed for building the Soar VS Code extension.

## Source Code Repositories

### Soar Language Server
- **Repository**: <https://github.com/soartech/soar-language-server>
- **Language**: Java
- **Key Locations**:
  - Main source: `src/main/java/com/soartech/soar/lsp/`
  - Resources: `src/main/resources/`
  - Build: `build.gradle`
- **Purpose**: LSP implementation for Soar providing diagnostics, hover, completion, and navigation

### Legacy Soar VS Code Extension
- **Repository**: <https://bitbucket.org/bdegrendel/soar-vscode-extension/src/master/>
- **Language**: JavaScript/TypeScript
- **Key Locations**:
  - Grammar: `syntaxes/soar.tmLanguage.json`
  - Extension: `extension.js`
  - Package: `package.json`
- **Purpose**: Reference for TextMate grammar and basic extension structure

### VisualSoar
- **Repository**: <https://github.com/SoarGroup/VisualSoar>
- **Language**: Java
- **Key Locations**:
  - DataMap logic: `src/main/java/edu/umich/soar/visualsoar/datamap/`
  - DataMap checker: `src/main/java/edu/umich/soar/visualsoar/datamap/DataMapChecker.java`
  - DataMap nodes: `src/main/java/edu/umich/soar/visualsoar/datamap/DataMapNode.java`
  - Parser: `src/main/java/edu/umich/soar/visualsoar/parser/`
  - UI: `src/main/java/edu/umich/soar/visualsoar/graph/`
- **Purpose**: Reference for DataMap data structures, validation logic, and UI patterns

## Documentation Resources

### VS Code Extension Development
- **Extension API**: <https://code.visualstudio.com/api>
- **Extension Guides**: <https://code.visualstudio.com/api/extension-guides/overview>
- **Extension Manifest**: <https://code.visualstudio.com/api/references/extension-manifest>
- **Activation Events**: <https://code.visualstudio.com/api/references/activation-events>
- **Contribution Points**: <https://code.visualstudio.com/api/references/contribution-points>

### Language Server Protocol
- **LSP Specification**: <https://microsoft.github.io/language-server-protocol/>
- **LSP Overview**: <https://microsoft.github.io/language-server-protocol/overviews/lsp/overview/>
- **vscode-languageclient**: <https://www.npmjs.com/package/vscode-languageclient>
- **vscode-languageserver**: <https://www.npmjs.com/package/vscode-languageserver>

### TextMate Grammars
- **Language Grammars**: <https://macromates.com/manual/en/language_grammars>
- **Syntax Highlight Guide**: <https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide>
- **Scope Naming**: <https://www.sublimetext.com/docs/scope_naming.html>
- **TextMate Language Grammar**: <https://macromates.com/manual/en/language_grammars>

### TypeScript
- **TypeScript Handbook**: <https://www.typescriptlang.org/docs/handbook/intro.html>
- **TypeScript for VS Code**: <https://code.visualstudio.com/docs/languages/typescript>

## VS Code API References

### Key APIs Used

#### Language Features
- `vscode.languages.registerCompletionItemProvider` - Code completions
- `vscode.languages.createDiagnosticCollection` - Error/warning diagnostics
- `vscode.languages.registerHoverProvider` - Hover information
- `vscode.languages.registerDefinitionProvider` - Go to definition

#### UI Components
- `vscode.window.createTreeView` - Tree view in sidebar
- `vscode.window.createWebviewPanel` - Webview panels
- `vscode.window.showInformationMessage` - Notifications
- `vscode.window.createStatusBarItem` - Status bar items

#### File System
- `vscode.workspace.findFiles` - Find files by pattern
- `vscode.workspace.createFileSystemWatcher` - Watch file changes
- `vscode.workspace.getConfiguration` - Get settings

#### Commands
- `vscode.commands.registerCommand` - Register commands
- `vscode.commands.executeCommand` - Execute commands

## Soar-Specific Resources

### Soar Documentation
- **Soar Manual**: <https://soar.eecs.umich.edu/documentation>
- **Soar Tutorial**: <https://soar.eecs.umich.edu/tutorial>
- **Soar Syntax**: <https://github.com/SoarGroup/Soar/wiki/SyntaxQuickReference>

### Soar Community
- **Soar Group**: <https://github.com/SoarGroup>
- **Soar Wiki**: <https://github.com/SoarGroup/Soar/wiki>
- **Soar Downloads**: <https://soar.eecs.umich.edu/downloads>

## Code Examples and Patterns

### Example VS Code Extensions
- **Python Extension**: <https://github.com/microsoft/vscode-python>
- **Java Extension**: <https://github.com/redhat-developer/vscode-java>
- **C/C++ Extension**: <https://github.com/microsoft/vscode-cpptools>

### LSP Examples
- **LSP Sample**: <https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample>
- **LSP Multi-Root Sample**: <https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-multi-server-sample>

### TreeView Examples
- **TreeView Sample**: <https://github.com/microsoft/vscode-extension-samples/tree/main/tree-view-sample>
- **Custom Editor Sample**: <https://github.com/microsoft/vscode-extension-samples/tree/main/custom-editor-sample>

## Tools and Libraries

### Build and Package Tools
- **vsce** (VS Code Extension Manager): <https://github.com/microsoft/vscode-vsce>
- **TypeScript Compiler**: <https://www.typescriptlang.org/>
- **esbuild**: <https://esbuild.github.io/>
- **webpack**: <https://webpack.js.org/>

### Testing
- **@vscode/test-electron**: <https://www.npmjs.com/package/@vscode/test-electron>
- **Mocha**: <https://mochajs.org/>
- **VS Code Testing Guide**: <https://code.visualstudio.com/api/working-with-extensions/testing-extension>

### Linting
- **ESLint**: <https://eslint.org/>
- **@typescript-eslint**: <https://typescript-eslint.io/>

## Java Tools (for Language Server)

### Build Tools
- **Gradle**: <https://gradle.org/>
- **Maven**: <https://maven.apache.org/>

### Java Downloads
- **Adoptium JDK**: <https://adoptium.net/>
- **Oracle JDK**: <https://www.oracle.com/java/technologies/downloads/>

## Key npm Packages

```json
{
  "vscode": "^1.80.0",
  "vscode-languageclient": "^9.0.0",
  "@vscode/test-electron": "^2.3.0",
  "@vscode/vsce": "^2.19.0",
  "typescript": "^5.0.0",
  "@types/node": "^18.x",
  "@types/vscode": "^1.80.0",
  "eslint": "^8.40.0",
  "@typescript-eslint/eslint-plugin": "^6.0.0",
  "@typescript-eslint/parser": "^6.0.0",
  "mocha": "^10.0.0",
  "@types/mocha": "^10.0.0"
}
```

## Important Code Locations

### In This Project

Once built, key locations will be:

```
src/
├── extension.ts                 # Main entry point
├── client/
│   └── lspClient.ts            # LSP client implementation
├── server/
│   └── serverConfig.ts         # Server configuration
├── datamap/
│   ├── index.ts                # Core datamap class
│   ├── types.ts                # Type definitions
│   ├── parser.ts               # Datamap parser
│   ├── validator.ts            # Datamap validation
│   ├── diagnostics.ts          # VS Code diagnostics integration
│   ├── loader.ts               # Datamap loader
│   └── utils.ts                # Utility functions
├── providers/
│   └── completionProvider.ts  # Code completion provider
└── ui/
    ├── treeview.ts             # TreeView provider
    └── webview/
        └── datamapPanel.ts     # Webview panel
```

### VisualSoar Key Files

For reference when porting DataMap logic:

```
src/main/java/edu/umich/soar/visualsoar/
├── datamap/
│   ├── DataMap.java                # Main datamap class
│   ├── DataMapNode.java            # Node representation
│   ├── SoarWorkingMemoryModel.java # WM model
│   ├── DataMapChecker.java         # Validation logic
│   └── DataMapTree.java            # Tree structure
├── parser/
│   ├── ParseException.java
│   ├── SoarParser.java             # Main parser
│   └── TokenMgrError.java
└── graph/
    └── DataMapGraph.java           # Graph visualization
```

## Troubleshooting Resources

### Common Issues
- **Extension Not Activating**: Check activation events in package.json
- **LSP Not Starting**: Verify Java installation and server JAR path
- **Syntax Highlighting Not Working**: Validate TextMate grammar JSON
- **TypeScript Errors**: Check tsconfig.json and type definitions

### Debugging
- **VS Code Extension Host**: Press F5 to launch debug instance
- **Developer Tools**: Help > Toggle Developer Tools
- **Extension Logs**: View > Output > Select "Soar Language Server"

## Publishing

### Marketplace
- **Publisher Portal**: <https://marketplace.visualstudio.com/manage>
- **Publishing Guide**: <https://code.visualstudio.com/api/working-with-extensions/publishing-extension>
- **Marketplace Guidelines**: <https://code.visualstudio.com/api/references/extension-guidelines>

### GitHub Actions
- **CI/CD for Extensions**: <https://code.visualstudio.com/api/working-with-extensions/continuous-integration>

## Additional Resources

### Soar Papers and Publications
- Original Soar papers and academic publications can provide context
- Check <https://soar.eecs.umich.edu/publications>

### Community Support
- Stack Overflow: Tag questions with `vscode-extensions` and `soar`
- VS Code Extension Discord: Community discussions
- Soar mailing lists: For Soar-specific questions

## Version Information

This guide was created for:
- **VS Code API**: 1.80.0+
- **Node.js**: 16.x or later
- **TypeScript**: 5.0+
- **LSP**: 3.17
- **Java**: 11+ (for Language Server)

## License Information

Make sure to review licenses for:
- VS Code Extension API (MIT)
- Soar Language Server (check repository)
- VisualSoar (check repository)
- Any dependencies you include

## Contact and Contribution

- For issues with this extension: Create issues in your repository
- For Soar Language Server issues: <https://github.com/soartech/soar-language-server/issues>
- For VisualSoar issues: <https://github.com/SoarGroup/VisualSoar/issues>
- For VS Code Extension API issues: <https://github.com/microsoft/vscode/issues>
