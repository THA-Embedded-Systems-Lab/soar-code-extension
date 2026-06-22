# DevContainer

Develops inside Docker with Node.js 20, Java 17, and all npm dependencies pre-installed.

## Requirements

- Docker
- VS Code with the Dev Containers extension (`ms-vscode-remote.remote-containers`)

## Usage

Open the folder in VS Code and click **"Reopen in Container"** when prompted, or use
`Ctrl+Shift+P` → `Dev Containers: Reopen in Container`.

First run pulls the base image and runs `npm install` — takes 2–5 minutes. Subsequent opens are instant.

## What's inside

- Node.js 20, npm, TypeScript
- Java 17, Gradle
- ESLint VS Code extension

## Common commands

```bash
npm run compile   # build
npm run watch     # watch mode
npm test          # unit tests
```

Press `F5` to debug the extension. The integrated terminal runs inside the container; workspace
files are bind-mounted so changes persist on the host.

## Rebuilding

After editing `devcontainer.json`: `Ctrl+Shift+P` → `Dev Containers: Rebuild Container`.
