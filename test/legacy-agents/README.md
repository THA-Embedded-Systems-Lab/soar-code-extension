# Legacy Project Validation Tests

Ensures backward compatibility with VisualSoar projects by validating that
legacy projects load correctly without schema errors.

## Purpose

These tests verify that valid Soar projects from the legacy VisualSoar software
continue to work correctly with the current extension. This ensures we maintain
backward compatibility when updating schemas or project loading logic.

## Structure

- **BW-Hierarchical/** - Hierarchical Blocks World agent
- **water-jug-simple/** - Simple water jug problem agent
- **project-validation.test.ts** - Automated validation test suite

## How It Works

The test suite automatically discovers all `.vsa.json` project files in this
directory and validates:

1. **Schema Validation** - Projects load without schema validation errors
2. **Datamap Integrity** - All vertices are indexed and edges reference valid targets
3. **Layout Structure** - Layout nodes are properly indexed and structured

For each project, three tests are generated:

- Load without validation errors
- Valid datamap structure
- Valid layout structure

## Adding Test Projects

1. Copy a legacy VisualSoar project directory into `test/legacy-agents/`
2. Ensure it contains a `.vsa.json` file and associated `.soar` files
3. Run tests - the project will be automatically discovered and validated
4. Fix any validation errors that appear (or update schema if project is valid)

## Example Project Structure

```
BW-Hierarchical/
  BW-Hierarchical.vsa.json    # Project definition
  BW-Hierarchical.soar        # Main source file
  BW-Hierarchical/            # Operator folders
    operator1.soar
    operator2/
      ...
```

## Running Tests

```bash
npm run test          # Unit tests only
npm run test:ci       # Full integration test suite
```

**Note:** These are unit tests that don't require the VS Code extension
\*environment. They test the ProjectLoader and schema validation directly.
