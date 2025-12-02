# Getting Started - Quick Guide

## Welcome!

This repository contains comprehensive step-by-step instructions for building a complete Soar VS Code extension from scratch. You now have everything you need to start building!

## What You Have

✅ **Master Plan** (`INSTRUCTIONS.md`) - Overview and roadmap  
✅ **8 Phase-by-Phase Guides** (`instructions/phase1-8.md`) - Detailed implementation steps  
✅ **References** (`REFERENCES.md`) - All resources and links you'll need

## Quick Start

### 1. Read the Master Plan

Start by reading `INSTRUCTIONS.md` to understand:
- The overall project goals
- The 8 phases of development
- Project structure
- Success criteria

### 2. Set Up Your Environment

Before starting Phase 1, make sure you have:
- **Node.js 16+** installed
- **npm** or **yarn** package manager
- **VS Code** installed
- **Git** for version control
- **Java 11+** (needed for the Language Server)

### 3. Follow the Phases in Order

Work through each phase sequentially:

1. **Phase 1** - Project scaffolding (Basic structure)
2. **Phase 2** - Syntax highlighting (TextMate grammar)
3. **Phase 3** - LSP integration (Language server)
4. **Phase 4** - DataMap logic (Core TypeScript port)
5. **Phase 5** - DataMap completions (Code suggestions)
6. **Phase 6** - DataMap checker (Validation)
7. **Phase 7** - DataMap UI (TreeView/Webview)
8. **Phase 8** - Testing & packaging (Finalization)

### 4. Test After Each Phase

Don't move to the next phase until the current one is working:
- Run `npm run compile` after changes
- Press `F5` to test in Extension Development Host
- Verify the checklist items at the end of each phase

### 5. Reference Materials

Keep `REFERENCES.md` handy for:
- Links to source repositories
- API documentation
- Code examples
- Troubleshooting tips

## Recommended Workflow

```bash
# 1. Start with Phase 1
cd /home/moritz/Documents/Soar-Repositories/vs-code-extension
cat instructions/phase1-scaffolding.md

# 2. Follow the instructions step by step

# 3. After completing each section, test
npm run compile
# Press F5 in VS Code to test

# 4. Commit your progress
git add .
git commit -m "Completed Phase 1: Project scaffolding"

# 5. Move to next phase
cat instructions/phase2-syntax.md
```

## Key Files to Reference

### During Development
- **Phase instructions**: `instructions/phase*.md`
- **API reference**: `REFERENCES.md`
- **Project plan**: `INSTRUCTIONS.md`

### Existing Code to Study
- **Legacy extension grammar**: Check the Bitbucket repo (see REFERENCES.md)
- **VisualSoar DataMap code**: Check GitHub repo (see REFERENCES.md)
- **Soar Language Server**: Check GitHub repo (see REFERENCES.md)

## Tips for Success

### 1. Start Simple
- Get Phase 1 working completely before moving on
- Don't try to implement everything at once
- A minimal viable product (Phases 1-3) is a great milestone

### 2. Test Frequently
- Test after each major change
- Use the Extension Development Host (F5) liberally
- Check the Developer Tools console for errors

### 3. Use Existing Code as Reference
- The legacy extension has a working TextMate grammar
- VisualSoar has the DataMap logic you need to port
- Don't reinvent the wheel - adapt existing solutions

### 4. Ask for Help When Needed
- VS Code API documentation is comprehensive
- Stack Overflow has answers for common extension issues
- The Soar community can help with Soar-specific questions

### 5. Document as You Go
- Add comments to your code
- Update the README with features as you implement them
- Keep notes about decisions and challenges

## Common Pitfalls to Avoid

❌ **Don't skip Phase 1** - The scaffolding is critical  
❌ **Don't bundle incomplete features** - Test each phase thoroughly  
❌ **Don't ignore TypeScript errors** - They'll cause runtime issues  
❌ **Don't forget to register contributions** - Update package.json  
❌ **Don't package without testing** - Always test the .vsix locally

## What Each Phase Delivers

| Phase | Deliverable                | Time Estimate |
| ----- | -------------------------- | ------------- |
| 1     | Working extension skeleton | 2-3 hours     |
| 2     | Syntax highlighting        | 3-4 hours     |
| 3     | LSP integration            | 4-6 hours     |
| 4     | DataMap core logic         | 6-8 hours     |
| 5     | Code completions           | 2-3 hours     |
| 6     | DataMap validation         | 3-4 hours     |
| 7     | DataMap UI                 | 4-6 hours     |
| 8     | Testing & packaging        | 2-3 hours     |

**Total estimated time**: 26-37 hours

## Checkpoints

Use these checkpoints to verify you're on track:

### ✅ After Phase 1
- Extension activates
- Can create .soar files
- Basic structure in place

### ✅ After Phase 3 (MVP)
- Syntax highlighting works
- Language server connects
- Basic IDE features work
- **This is a good stopping point for an initial release**

### ✅ After Phase 6
- DataMap parsing works
- Completions are intelligent
- Validation catches errors

### ✅ After Phase 8 (Complete)
- All features working
- Tests passing
- Extension packaged
- Documentation complete

## Next Steps

**You're ready to begin!**

1. Open `INSTRUCTIONS.md` and read it thoroughly
2. Open `instructions/phase1-scaffolding.md`
3. Follow the steps one by one
4. Test frequently
5. Have fun building!

## Need Help?

If you get stuck:

1. **Check the phase instructions** - They're comprehensive
2. **Review REFERENCES.md** - Find relevant documentation
3. **Look at examples** - Study the legacy extension and VisualSoar
4. **Check VS Code samples** - Microsoft provides many examples
5. **Debug systematically** - Use VS Code's debugging tools

## Good Luck!

You have everything you need to build a complete, professional Soar VS Code extension. Take it one phase at a time, test thoroughly, and don't hesitate to iterate.

Happy coding! 🚀

---

**Quick Command Reference**

```bash
# Compile
npm run compile

# Watch mode (auto-compile)
npm run watch

# Run tests
npm test

# Lint code
npm run lint

# Package extension
vsce package

# Install locally
code --install-extension soar-0.1.0.vsix
```

---

**File Structure Reference**

```
vs-code-extension/
├── INSTRUCTIONS.md          ← Start here
├── REFERENCES.md            ← Keep this handy
├── GET-STARTED.md          ← You are here
├── README.md               ← Update as you build
└── instructions/
    ├── phase1-scaffolding.md         ← Begin with this
    ├── phase2-syntax.md
    ├── phase3-lsp.md
    ├── phase4-datamap-logic.md
    ├── phase5-datamap-completions.md
    ├── phase6-datamap-checker.md
    ├── phase7-datamap-ui.md
    └── phase8-testing-packaging.md
```
