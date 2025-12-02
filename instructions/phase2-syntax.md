# Phase 2: Syntax Highlighting

## Objective

Implement comprehensive syntax highlighting for Soar using a TextMate grammar file. This will provide colorization and basic tokenization for Soar code.

## Prerequisites

- Completed Phase 1 (Project scaffolding)
- Understanding of TextMate grammar syntax
- Access to the legacy Soar extension grammar for reference

## Background

TextMate grammars use regular expressions to identify and scope language tokens. VS Code uses these scopes to apply syntax highlighting based on the user's theme.

## Steps

### 2.1 Study Soar Syntax

Before writing the grammar, understand Soar's syntax elements:

- **Comments**: `#` for line comments
- **Productions**: `sp { ... }` blocks
- **Conditions**: LHS (left-hand side) patterns
- **Actions**: RHS (right-hand side) actions
- **Variables**: Start with `<` and end with `>`
- **Attributes**: Preceded by `^`
- **Preferences**: `+`, `-`, `=`, `<`, `>`, etc.
- **Functions**: `(write |hello|)`, `(halt)`, etc.
- **Operators**: `<<`, `>>`, `<=>`, etc.
- **String literals**: `|enclosed in pipes|`
- **Numbers**: Integers and floats
- **Keywords**: `sp`, `gp`, `state`, `operator`, `impasse`, etc.

### 2.2 Create TextMate Grammar

Create `syntaxes/soar.tmLanguage.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "Soar",
  "scopeName": "source.soar",
  "patterns": [
    { "include": "#comments" },
    { "include": "#production" },
    { "include": "#keywords" },
    { "include": "#strings" },
    { "include": "#numbers" },
    { "include": "#variables" },
    { "include": "#attributes" },
    { "include": "#operators" },
    { "include": "#functions" },
    { "include": "#preferences" }
  ],
  "repository": {
    "comments": {
      "patterns": [
        {
          "name": "comment.line.number-sign.soar",
          "match": "#.*$"
        }
      ]
    },
    "production": {
      "patterns": [
        {
          "name": "meta.production.soar",
          "begin": "\\b(sp|gp)\\s*\\{",
          "beginCaptures": {
            "1": { "name": "keyword.control.production.soar" }
          },
          "end": "\\}",
          "patterns": [
            { "include": "#comments" },
            { "include": "#production-name" },
            { "include": "#production-body" }
          ]
        }
      ]
    },
    "production-name": {
      "patterns": [
        {
          "name": "entity.name.function.production.soar",
          "match": "\\b[a-zA-Z][a-zA-Z0-9_-]*\\*?\\b"
        }
      ]
    },
    "production-body": {
      "patterns": [
        { "include": "#comments" },
        { "include": "#conditions" },
        { "include": "#actions" },
        { "include": "#variables" },
        { "include": "#attributes" },
        { "include": "#strings" },
        { "include": "#numbers" },
        { "include": "#operators" },
        { "include": "#functions" },
        { "include": "#preferences" }
      ]
    },
    "conditions": {
      "patterns": [
        {
          "name": "meta.condition.soar",
          "begin": "\\(",
          "end": "\\)",
          "patterns": [
            { "include": "#comments" },
            { "include": "#state-keyword" },
            { "include": "#variables" },
            { "include": "#attributes" },
            { "include": "#operators" },
            { "include": "#strings" },
            { "include": "#numbers" },
            { "include": "#conditions" }
          ]
        }
      ]
    },
    "actions": {
      "patterns": [
        {
          "name": "keyword.operator.action.soar",
          "match": "-->"
        }
      ]
    },
    "keywords": {
      "patterns": [
        {
          "name": "keyword.control.soar",
          "match": "\\b(sp|gp|source|learn|watch|excise|chunk|rl)\\b"
        }
      ]
    },
    "state-keyword": {
      "patterns": [
        {
          "name": "keyword.other.state.soar",
          "match": "\\b(state|impasse|operator|superstate|problem-space|type|name|io|input-link|output-link)\\b"
        }
      ]
    },
    "strings": {
      "patterns": [
        {
          "name": "string.quoted.pipe.soar",
          "begin": "\\|",
          "end": "\\|",
          "patterns": [
            {
              "name": "constant.character.escape.soar",
              "match": "\\\\."
            }
          ]
        },
        {
          "name": "string.quoted.double.soar",
          "begin": "\"",
          "end": "\"",
          "patterns": [
            {
              "name": "constant.character.escape.soar",
              "match": "\\\\."
            }
          ]
        }
      ]
    },
    "numbers": {
      "patterns": [
        {
          "name": "constant.numeric.float.soar",
          "match": "\\b-?[0-9]+\\.[0-9]+([eE][+-]?[0-9]+)?\\b"
        },
        {
          "name": "constant.numeric.integer.soar",
          "match": "\\b-?[0-9]+\\b"
        }
      ]
    },
    "variables": {
      "patterns": [
        {
          "name": "variable.other.soar",
          "match": "<[a-zA-Z][a-zA-Z0-9_-]*>"
        }
      ]
    },
    "attributes": {
      "patterns": [
        {
          "name": "entity.other.attribute-name.soar",
          "match": "\\^[a-zA-Z][a-zA-Z0-9_-]*"
        }
      ]
    },
    "operators": {
      "patterns": [
        {
          "name": "keyword.operator.comparison.soar",
          "match": "(<>|<=|>=|<=>|<<>>|<|>|==|=)"
        },
        {
          "name": "keyword.operator.logical.soar",
          "match": "(<<|>>)"
        },
        {
          "name": "keyword.operator.test.soar",
          "match": "\\b(\\+|-)\\b"
        }
      ]
    },
    "functions": {
      "patterns": [
        {
          "name": "meta.function-call.soar",
          "begin": "\\(\\s*(write|halt|crlf|cmd|exec|interrupt|tcl)\\b",
          "beginCaptures": {
            "1": { "name": "support.function.builtin.soar" }
          },
          "end": "\\)",
          "patterns": [
            { "include": "#strings" },
            { "include": "#numbers" },
            { "include": "#variables" }
          ]
        },
        {
          "name": "meta.function-call.math.soar",
          "begin": "\\(\\s*(\\+|-|\\*|/|div|mod|abs|sqrt|sin|cos|tan|atan2|int|float)\\b",
          "beginCaptures": {
            "1": { "name": "support.function.math.soar" }
          },
          "end": "\\)",
          "patterns": [
            { "include": "#numbers" },
            { "include": "#variables" },
            { "include": "#functions" }
          ]
        }
      ]
    },
    "preferences": {
      "patterns": [
        {
          "name": "keyword.operator.preference.soar",
          "match": "\\s(\\+|!|~|-|@|#|\\^|=|<|>|&)(?=\\s|\\)|$)"
        }
      ]
    }
  }
}
```

### 2.3 Update Language Configuration

Enhance `language-configuration.json` with word patterns:

```json
{
  "comments": {
    "lineComment": "#"
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
  },
  "wordPattern": "(-?\\d*\\.\\d\\w*)|([^\\`\\~\\!\\@\\#\\%\\^\\&\\*\\(\\)\\-\\=\\+\\[\\{\\]\\}\\\\\\|\\;\\:\\'\\\"\\,\\.\\<\\>\\/\\?\\s]+)"
}
```

### 2.4 Verify Grammar Registration

Ensure `package.json` correctly references the grammar:

```json
{
  "contributes": {
    "languages": [
      {
        "id": "soar",
        "aliases": ["Soar", "soar"],
        "extensions": [".soar"],
        "configuration": "./language-configuration.json",
        "icon": {
          "light": "./icons/soar-icon-light.png",
          "dark": "./icons/soar-icon-dark.png"
        }
      }
    ],
    "grammars": [
      {
        "language": "soar",
        "scopeName": "source.soar",
        "path": "./syntaxes/soar.tmLanguage.json"
      }
    ]
  }
}
```

### 2.5 Create Test Soar Files

Create `test/fixtures/example.soar` to test syntax highlighting:

```soar
# This is a comment
# Example Soar production

sp {propose*operator*hello-world
   (state <s> ^type state
              ^superstate nil)
-->
   (<s> ^operator <o> +)
   (<o> ^name hello-world)
}

sp {apply*hello-world
   (state <s> ^operator <o>
              ^io.output-link <out>)
   (<o> ^name hello-world)
-->
   (write |Hello, World!|)
   (halt)
}

# More complex example with various syntax elements
sp {elaborate*state*name
   (state <s> ^superstate.operator.name <name>)
-->
   (<s> ^name <name>)
}

sp {apply*operator*with-math
   (state <s> ^operator <o>
              ^value <v>)
   (<o> ^name calculate)
-->
   (<s> ^result (+ <v> 10)
        ^result2 (* <v> 2))
}

# Test preferences
sp {propose*operator*with-preferences
   (state <s> ^type state)
-->
   (<s> ^operator <o1> + =
        ^operator <o2> + <)
   (<o1> ^name best-operator)
   (<o2> ^name worst-operator)
}

# Test conditions with negation
sp {apply*check-no-flag
   (state <s> ^operator <o>
             -^flag-set)
   (<o> ^name check-flag)
-->
   (write |Flag is not set|)
}

# Test disjunctions
sp {elaborate*with-disjunction
   (state <s> ^value << red green blue >>)
-->
   (<s> ^color-detected true)
}
```

### 2.6 Test Syntax Highlighting

1. Compile the extension:
```bash
npm run compile
```

2. Launch Extension Development Host (F5)

3. Open the test file `test/fixtures/example.soar`

4. Verify that the following elements are highlighted:
   - Comments (gray/green)
   - Keywords (`sp`, `state`, `operator`) (purple/blue)
   - Variables (`<s>`, `<o>`) (blue/cyan)
   - Attributes (`^name`, `^type`) (light blue)
   - Strings (`|Hello, World!|`) (orange/red)
   - Numbers (green)
   - Functions (`write`, `halt`, `+`, `*`) (yellow)
   - Operators (`-->`, `^`) (white/gray)
   - Preferences (`+`, `=`, `<`) (pink/magenta)

### 2.7 Refine Grammar Based on Testing

Based on your testing, you may need to adjust:

1. **Precedence**: Order of patterns matters - more specific patterns should come first
2. **Scope names**: Ensure they follow TextMate conventions
3. **Regex patterns**: Fine-tune to avoid false positives/negatives
4. **Nested structures**: Ensure proper handling of nested parentheses and braces

### 2.8 Add Snippets (Optional)

Create `snippets/soar.json` for code snippets:

```json
{
  "Soar Production": {
    "prefix": "sp",
    "body": [
      "sp {${1:production-name}",
      "   (state <s> ^${2:attribute} ${3:value})",
      "-->",
      "   (<s> ^${4:result} ${5:value})",
      "}"
    ],
    "description": "Create a new Soar production"
  },
  "Operator Proposal": {
    "prefix": "propose",
    "body": [
      "sp {propose*operator*${1:operator-name}",
      "   (state <s> ^type state",
      "              ${2:^condition})",
      "-->",
      "   (<s> ^operator <o> +)",
      "   (<o> ^name ${1:operator-name})",
      "}"
    ],
    "description": "Propose an operator"
  },
  "Operator Application": {
    "prefix": "apply",
    "body": [
      "sp {apply*${1:operator-name}",
      "   (state <s> ^operator <o>)",
      "   (<o> ^name ${1:operator-name})",
      "-->",
      "   ${2:# actions}",
      "}"
    ],
    "description": "Apply an operator"
  },
  "Write Statement": {
    "prefix": "write",
    "body": [
      "(write |${1:message}|)"
    ],
    "description": "Write output"
  }
}
```

Register snippets in `package.json`:

```json
{
  "contributes": {
    "snippets": [
      {
        "language": "soar",
        "path": "./snippets/soar.json"
      }
    ]
  }
}
```

### 2.9 Add Icon (Optional)

Create simple icon files for better visual identification:

1. Create `icons/` directory
2. Add `soar-icon-light.png` and `soar-icon-dark.png` (16x16 or 32x32 px)
3. Update `package.json` as shown in step 2.4

## Verification Checklist

- [ ] TextMate grammar file created and properly formatted
- [ ] Grammar registered in package.json
- [ ] Language configuration includes proper brackets and pairs
- [ ] Test Soar file displays correct syntax highlighting
- [ ] Comments are highlighted
- [ ] Keywords are highlighted
- [ ] Variables (< >) are highlighted
- [ ] Attributes (^) are highlighted
- [ ] Strings (| |) are highlighted
- [ ] Numbers are highlighted
- [ ] Functions are highlighted
- [ ] Operators are highlighted
- [ ] Preferences are highlighted
- [ ] No errors in Developer Tools console
- [ ] Snippets work (if implemented)

## Common Issues

**Issue**: No syntax highlighting appears
- Check that the grammar file has correct JSON syntax
- Verify `scopeName` matches between grammar and package.json
- Restart Extension Development Host (Ctrl+R in the debug window)

**Issue**: Some tokens not highlighted correctly
- Check regex patterns in the grammar
- Verify pattern order (more specific first)
- Test regex patterns using tools like regex101.com

**Issue**: Highlighting breaks after certain characters
- Check for unescaped special regex characters
- Ensure proper handling of nested structures
- Review `begin`/`end` patterns for correctness

## Testing Tips

1. **Test edge cases**: Empty productions, nested parentheses, unusual spacing
2. **Test all token types**: Ensure comprehensive coverage
3. **Compare with legacy extension**: Use as reference for expected behavior
4. **Test with different themes**: Some themes may not have all scopes defined

## Reference Materials

- Legacy Soar extension grammar: `https://bitbucket.org/bdegrendel/soar-vscode-extension/src/master/syntaxes/`
- TextMate grammar documentation: `https://macromates.com/manual/en/language_grammars`
- VS Code syntax highlighting guide: `https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide`
- Scope naming conventions: `https://www.sublimetext.com/docs/scope_naming.html`

## Next Steps

Proceed to Phase 3: `instructions/phase3-lsp.md` to integrate the Soar Language Server.

## Files Created/Modified

- `syntaxes/soar.tmLanguage.json` - TextMate grammar
- `language-configuration.json` - Language configuration (enhanced)
- `snippets/soar.json` - Code snippets (optional)
- `test/fixtures/example.soar` - Test file
- `package.json` - Updated contributions
