# Soar VS Code Extension

A comprehensive VS Code extension for Soar, providing syntax highlighting, LSP-based language features, and DataMap tools.

## Project Status

✅ **Phase 1 Complete** - Project structure has been bootstrapped!

The extension has been initialized with:
- Package manifest (`package.json`)
- TypeScript configuration (`tsconfig.json`)
- Language configuration for Soar files
- Basic TextMate grammar for syntax highlighting
- Extension entry point with activate/deactivate
- Test infrastructure
- Debug/launch configurations

## Next Steps

### Option A: Using DevContainer (Recommended)

The project includes a DevContainer configuration that provides a complete development environment without installing anything on your host system.

**Requirements:**
- Docker installed on your system
- VS Code with the "Dev Containers" extension

**Steps:**
1. Install Docker: `sudo apt install docker.io && sudo usermod -aG docker $USER`
2. Install "Dev Containers" extension in VS Code
3. Open this folder in VS Code
4. Click "Reopen in Container" when prompted (or use Command Palette: `Dev Containers: Reopen in Container`)
5. Wait for the container to build and dependencies to install (automatic via `postCreateCommand`)
6. Start developing! Press `F5` to test the extension

**What's included in the container:**
- Node.js 20.x
- TypeScript and all npm dependencies
- Java 17 (for Soar Language Server)
- Gradle (for building the language server)
- ESLint extension


### 3. Compile the Extension

```bash
npm run compile
```

### 4. Test the Extension

Press `F5` in VS Code to launch the Extension Development Host, or run:

```bash
# Watch mode (auto-compile on changes)
npm run watch
```

### 5. Try It Out

In the Extension Development Host:
1. Create a new file with `.soar` extension
2. Notice syntax highlighting is active
3. Run command: `Soar: Hello World` (Ctrl+Shift+P)

## Project Structure

```
vs-code-extension/
├── .vscode/                    # VS Code debug configurations
├── instructions/               # Phase-by-phase build instructions
├── src/
│   ├── extension.ts           # Main extension entry point
│   ├── client/                # LSP client (Phase 3)
│   ├── server/                # Server configuration (Phase 3)
│   ├── datamap/               # DataMap logic (Phase 4-6)
│   ├── providers/             # Completion providers (Phase 5)
│   ├── ui/                    # TreeView/Webview UI (Phase 7)
│   └── test/                  # Test files
├── test/
│   ├── suite/                 # Test suites
│   └── fixtures/              # Test Soar files
├── syntaxes/
│   └── soar.tmLanguage.json   # TextMate grammar
├── package.json               # Extension manifest
├── tsconfig.json              # TypeScript config
├── language-configuration.json # Language settings
├── INSTRUCTIONS.md            # Master build plan
├── GET-STARTED.md            # Quick start guide
└── REFERENCES.md              # Resource links
```

## Features

### ✅ Phase 1 Complete
- Basic extension structure
- Language registration for `.soar` files
- Initial syntax highlighting
- Brackets, comments, and auto-closing pairs

### 🚧 Coming Next (Phase 2)
- Enhanced TextMate grammar with full Soar syntax
- Better tokenization and scopes
- Code snippets

### 🔮 Future Phases
- **Phase 3**: LSP integration (diagnostics, hover, go-to-definition)
- **Phase 4**: DataMap core logic
- **Phase 5**: DataMap-based code completions
- **Phase 6**: DataMap validation and checker
- **Phase 7**: DataMap UI (TreeView/Webview)
- **Phase 8**: Testing and packaging

## Development

### Commands

```bash
npm run compile     # Compile TypeScript
npm run watch       # Watch mode (auto-compile)
npm run lint        # Run ESLint
npm test           # Run tests
npm run package    # Package extension as .vsix
```

### Debugging

1. Open this folder in VS Code
2. Press `F5` to launch Extension Development Host
3. Set breakpoints in TypeScript files
4. Test your changes in the debug window

## Building from Instructions

This project includes comprehensive phase-by-phase instructions:

1. **Read** `INSTRUCTIONS.md` for the overall plan
2. **Start** with `GET-STARTED.md` for quick orientation
3. **Follow** `instructions/phase1-scaffolding.md` through `phase8-testing-packaging.md`
4. **Reference** `REFERENCES.md` for external resources

Each phase builds on the previous one and includes:
- Clear objectives
- Step-by-step instructions
- Code examples
- Verification checklists
- Troubleshooting tips

## Contributing

See the instruction files in the `instructions/` directory for detailed implementation guides.

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Soar Language Server](https://github.com/soartech/soar-language-server)
- [VisualSoar](https://github.com/SoarGroup/VisualSoar)
- [Legacy Soar Extension](https://bitbucket.org/bdegrendel/soar-vscode-extension/src/master/)

## License

(Add your license here)
