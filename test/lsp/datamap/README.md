# LSP Datamap Validation Tests

Tests for datamap validation across complete Soar projects.

## Structure

- **fixtures/** - Complete Soar projects (`.vsa.json` + `.soar` files)
- **expected/** - JSON files with expected validation errors **per `.soar` file**
- **helpers/** - Test runner that validates datamap errors for each file

## How It Works

For each `.vsa.json` project in `fixtures/`, the test suite loads the project
and validates each `.soar` file individually against the project's datamap.

**Key difference from previous approach:** Each `.soar` file has its own
\*expected validation file, rather than one file per project.

Mapping:

- `fixtures/old/test_operator.soar` → `expected/old/test_operator.soar.json`
- `fixtures/old/test-validation.soar` → `expected/old/test-validation.soar.json`

The test suite:

1. Finds all `.vsa.json` project files (recursively)
2. For each project:
   - Loads the project using `ProjectLoader`
   - Extracts all `.soar` files referenced in the layout
   - For each `.soar` file:
     - Parses and validates it against the project's datamap
     - Compares validation errors against the file's expected `.soar.json`
     - Auto-generates expected file if missing (test fails, review required)

## Adding Tests

### Adding a new .soar file to an existing project

1. Add the `.soar` file to the project's fixture directory
2. Reference it in the project's layout (`.vsa.json`)
3. Run tests - an expected file will be auto-generated at `expected/<path>/<file>.soar.json`
4. Review the generated expected file and verify correctness
5. Re-run tests to confirm they pass

### Adding a new test project

1. Create a new directory in `fixtures/`
2. Add the `.vsa.json` project file with datamap definitions
3. Add `.soar` source files and reference them in the layout
4. Run tests - expected files will be auto-generated for each `.soar` file
5. Review all generated expected files
6. Re-run tests to confirm they pass

## Example Structure

```
fixtures/
  old/
    test-project.vsa.json           # Project with datamap
    test-validation.soar            # Soar code to validate
    test_operator.soar
    elaborations.soar

expected/
  old/
    test-validation.soar.json       # Expected errors for this file
    test_operator.soar.json         # Expected errors for this file
    elaborations.soar.json          # Expected errors for this file
```

## Benefits of Per-File Validation

- **Modularity** - Easy to see which errors come from which file
- **Maintainability** - Updating one file doesn't affect others' expected results
- **Clarity** - Test failures clearly indicate which file has issues
- **Granularity** - Can focus on specific file validations

**Note:** Keep individual test files focused on specific validation scenarios to
\*ensure clear, maintainable tests.
