# LSP Syntax Tests

Tests for Soar language parser syntax error detection.

## Structure

- **fixtures/** - Soar files with intentional syntax errors
- **expected/** - JSON files with expected diagnostic messages for each fixture
- **helpers/** - Test runner that validates parser diagnostics

## How It Works

For each `.soar` file in `fixtures/`, there must be a corresponding `.soar.json`
file in `expected/` containing an array of expected diagnostic objects (range,
message, severity, source).

The test suite:

1. Parses each fixture file using `SoarParser`
2. Compares actual diagnostics against expected diagnostics
3. Auto-generates expected files if missing (test fails, review required)

## Adding Tests

1. Create a new `.soar` file in `fixtures/` with the syntax error to test
2. Run tests - an expected file will be auto-generated
3. Review the generated `expected/<file>.soar.json` and verify correctness
4. Re-run tests to confirm they pass

## Example

**Fixture:** `missing-braces.soar`

```soar
sp {missing
  (state <s> ^name test)
  (<s> ^io <io>)
```

**Expected:** `missing-braces.soar.json`

```json
[{
  "range": { "start": { "line": 0, "character": 0 }, ... },
  "message": "Production parse error: Unmatched opening brace",
  "severity": 1,
  "source": "soar-parser"
}]
```
