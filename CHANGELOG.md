## [unreleased]

### Documentation

- Add 0.6.0 changelog ([91d7626](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/91d7626cfd0be5b6df306abdd24101e97b2b204e))

### Miscellaneous Tasks

- Add automatic release note generation ([433db55](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/433db5564e7abf5b887a8a7e78f888ad9c203810))

## [0.6.0] - 2026-03-10

### Features

- Initial commit Soar MCP Server ([a8f4f86](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/a8f4f864f9de3e335accb8c03364364bce326980))
- _(mcp)_ Add layout management tools ([d96b8f7](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/d96b8f7ecbe308f98bc3aaccb50dc646c2a5b7e6))
- Add debug adapter protocol via xml sml interface ([50f1f3b](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/50f1f3b688dd01e462daa7df776271b37483c3fb))
- Add support for setting variable view depth in Soar SML debug session ([ff93c64](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/ff93c649e9b1b31174bc3056641dd2f7744dc221))

### Bug Fixes

- High level operator name to state name not valid with datamap ([fa8be98](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/fa8be98661f9db2999ee3157e6fac5605a678bfb))
- Parallel mcp calls lead to duplicate datamap ids. ([3e6a167](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/3e6a1671d04621f264129293ea871fb1dcf68062))
- Remove duplicate ID generation for datamap and layout vertices ([0fc5d5c](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/0fc5d5c340ec3bd04eb2108c06e13cc6b9acb112))
- Add default rules for legacy agents. ([e3f8f6b](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/e3f8f6bb8b376a07c81fe1f09cdfdd1cab5d39a8))
- Update dependencies and fix tests ([332b6e5](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/332b6e5c9982b649f48d0b7e43eee7e00c2e964e))

### Documentation

- 0.5.0 changelog ([ac32450](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/ac32450935894d96af64c9e95a3a54f7d94e6d3a))
- Add Agents.ms and llm.md ([26296fc](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/26296fc87b0bf0ec5145fbd31e0243ae5054a231))

### Styling

- Fix lint warnings ([f51b3c7](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/f51b3c7ce8bbdfde63dacc8ae7ec26c4673f7eb2))

## [0.5.0] - 2026-02-16

### Features

- Add impasse operator creation ([fe143cb](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/fe143cbd6eecb1c8addc02fc7057750fdec2cec9))

### Bug Fixes

- Update iconography ([#1](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/1)) ([a56e238](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/a56e2385d39397889f19b6cc03f735fd22d82bd3))

### Refactor

- _(layout)_ Consolidate code and add tests ([3673050](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/36730500a53de88fcfc9d6183210e94525799b8f))

### Documentation

- Update changelog ([c341fdb](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/c341fdb9bea633c747560ba7800edea604706b98))

### Testing

- Add datamap manipulation test ([93b0e9f](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/93b0e9f1864f5b9cbd4f317ce8885d27da14d847))

### Miscellaneous Tasks

- Prepare 0.5.0 release ([8941438](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/8941438661236a56d4d11ed6058e2c61c52d41a4))

## [0.4.1] - 2026-02-16

### Testing

- Extend timeout for undo manager test ([83cf33d](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/83cf33d8baddc7626a785d8477f98f2db437bdf7))

### Miscellaneous Tasks

- Add changelog and create changelog configuration ([b06c04d](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/b06c04df02e40b689c7e431ac6cfa718709cf77a))
- Release 0.4.1 ([0d4bd4e](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/0d4bd4e94f1045b154c9adecd31c52d5ec96ae67))

## [0.4.0] - 2026-02-15

### Features

- Enhance project loading and datamap validation with new indexing and metadata features ([2bf66b1](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/2bf66b158ecb5a48b3ef5bf53351b1f0ee8c528b))
- Undo/ redo ([#2](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/2)) ([97702db](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/97702db30a59407087f1a2b993fff4dc826197ca))

### Bug Fixes

- _(parser)_ Enhance parsing logic to handle strings and parentheses correctly; add new test fixtures ([#10](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/10)) ([6b6bf0b](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/6b6bf0bb438af28f6d1827738044b5b2e1b93513))
- _(parser)_ Enhance attribute parsing to support path disjunction and update test fixtures ([#11](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/11)) ([7e057ea](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/7e057ea52190d2a0aa775ce75032d7ee018c51ed))
- Use syntax of unmaintained soar extension ([#8](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/8)) ([d5a7cb6](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/d5a7cb6f6fc4c56d4a1c7087464aac6969436932))
- Add missing automatic test files ([3523cbd](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/3523cbd336918c22b998465f58e697b51dc85a32))
- _(datamap)_ Add test ([#7](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/7)) ([70ffe04](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/70ffe04dc3704576974943e0db30cebe30da4dbc))
- _(projectManager)_ Implement file system watcher for active project file changes ([#3](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/issues/3)) ([8148e10](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/8148e1010132a978419cddf37b212824058f6dec))
- _(undoManager)_ Reduce max stack size from 50 to 25 and update related tests ([c81b98b](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/c81b98b0d4379d899faf3ef396e203bc50cb196a))

### Other

- Update tests ([edf74a1](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/edf74a175be6419b78e3d54673005560f0c81df0))

### Refactor

- Improve test suite setup ([621b9fb](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/621b9fb23bc366a80494d568db77ba685ec6be5b))

### Documentation

- Update readme ([aa73bc3](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/aa73bc36a14574782ef686885d63d04fd23d5434))

### Miscellaneous Tasks

- Use x server for linux ([ba789e7](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/ba789e7e1e2bc20cca8f9a9698d67f69e55b12d1))

## [0.3.1] - 2025-12-16

### Miscellaneous Tasks

- Update package version to 0.3.1 and add ajv dependency ([363bcef](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/363bcef34e6d26b59aff4c7d86002ffd1c0c742f))

## [0.3.0] - 2025-12-16

### Features

- _(tests)_ Add SmartSander test case and corresponding fixture for unbound variable diagnostics ([bfd4386](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/bfd438602d641959099e72fbda800b8f020be082))
- _(layout)_ Enhance addFile functionality to support folder path overrides and add programmatic file addition method ([2b4e683](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/2b4e683206d4aca9752b4d68b46931aca7b91c37))
- _(source-scripts)_ Implement source script management and diagnostics analysis ([f00d4f1](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/f00d4f156387a6a686fd8109464e8dba7466d0c6))
- _(definition-provider)_ Add definition provider for source scripts and corresponding tests ([baebd65](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/baebd65b13952a2c9d554e53c25f7319e01c4a62))
- _(validation)_ [**breaking**] Implement project schema validation and diagnostics reporting ([3c2957c](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/3c2957c6f473015879aa27adc5e6432b64dfe45a))

### Bug Fixes

- Resolve testing timeout issues ([74d4233](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/74d423360731b180283cbea2842d0ad6168cb72f))
- _(layout)_ Update source reference management and ensure directory creation for new files ([f93f373](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/f93f3733a9f3def688a1c9817dd57ddecc48fdd9))

## [0.2.1] - 2025-12-06

### Features

- _(datamap)_ Enhance linked attribute functionality and add CRUD tests ([a32a957](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/a32a9576f48b6c371b83d94da4c41a9c465484dc))
- _(datamap)_ Add hasLinkedSiblings attribute and update tree view representation ([98a8d96](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/98a8d969e9c6e967a133525cefda73de8ef227d9))
- Update version to 0.2.1 and change icon for SOAR_ID type in datamap tree view ([a070261](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/a0702612cde0be90a7eff4fbc734cc6612251281))

### Bug Fixes

- _(projectManager)_ Implement active project change event and refactor project loading logic ([3bf01ed](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/3bf01edb75e98697b4cd66970bc14bed4d61a29d))

### Testing

- Add water jug simple for linked test ([ee5f166](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/ee5f166acd918ca83d92dd5d74a58215d8af313f))

## [0.2.0] - 2025-12-05

### Features

- _(parser)_ Enhance attribute parsing to support context-aware attributes and multiple values ([d0c8e48](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/d0c8e484c3905d3cefa22bf225ea2b9615ac08e3))
- _(parser)_ Enhance context attribute parsing to support new patterns and multiple values ([9f115d3](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/9f115d328a3888dcd92b1417baed8143f2ab18da))
- _(parser)_ Skip validation for '-' in attributes and add tests for WME removal ([f4e95d9](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/f4e95d9f6777e0fcd9dd58ce52987dc945d226a9))
- _(parser)_ Update validation command to target selected project instead of workspace ([cf821ec](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/cf821ecb1d790376fb028f0913b0a8dd440c0c9b))
- _(parser)_ Enhance project loading by adding recursive search for project files in subdirectories ([f51c219](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/f51c2198f81559bca90f7f974bbcb8e77b5d273d))
- Add project creation command and test ([ce2fee9](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/ce2fee994840a432557b0073b5a3b414c52cfe30))
- _(tests)_ Add validation test for created project without datamap errors ([faae259](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/faae259aa68cde4df7f71310cc1bec1f3cbbad95))
- _(tests)_ Add tests for deleting operators and restoring initial state ([848504d](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/848504ddc7cbdd714d9d534de33b08a2219ec64f))
- _(layout)_ Enhance layout view to highlight currently viewed datamap ([28de2e3](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/28de2e354ac2444caaecde28309ea72224dbe179))
- _(datamap)_ Improve datamap ID handling and update layout view messaging ([767a4da](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/767a4da7168bf8fb1def051cd7416f07f2a0e64b))
- _(commands)_ Remove 'Add Substate' command from extension and package.json ([845e1fd](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/845e1fd958c11421cea38b8fcfa2fed9b3f1328e))
- _(lsp)_ Implement project change notification handling in LSP server and improve context aware autocompletions ([785252d](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/785252d4699adda8bd8aa4a2d67eae0bb9c15ba4))
- _(datamap)_ Enhance attribute validation with detailed error messages and path analysis ([0449049](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/0449049cac9706d93e8a2d560d0cb7ba6fdd5252))
- _(tests)_ Add unit tests for completion logic and datamap attribute suggestions ([5e08608](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/5e08608b8171b1127f0ac6c9c2ffb313e6369e37))
- _(datamap)_ Add validation for unbound variables in production attributes ([e52e35e](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/e52e35ef005483636c4af7e198751df38003770d))
- _(datamap)_ Escalate missing LSP in completion tests to failure; reduce logging for tests ([92df03c](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/92df03c7207bde816545f8c377b0938c1228158b))
- Add VisualSoar feature specification document ([6505fbe](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/6505fbe050a86fe0139194a5832579654e01752c))
- _(validation)_ Add command to find missing files and validate project structure ([82c9f7e](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/82c9f7e5ff02c6d7ae1da40ab367cbdbbeee384f))
- _(schema)_ Add project schema for VisualSoar with detailed definitions and properties ([43863e4](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/43863e4282dcaa617042937d3c47c855f29ba52e))
- _(validation)_ Enhance datamap validation to include document text for precise error reporting ([0e85066](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/0e85066e89504d4f4e5ebf8215766bf3389e8276))
- _(validation)_ Enhance enumeration validation to utilize variable bindings for context ([49c8f0a](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/49c8f0a8406cacc481210290c64962255dd9ec36))
- _(validation)_ Improve error reporting by adding precise attribute range detection ([e66ce58](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/e66ce582600351ce3ac88ab12a5254bc250c2299))
- _(parser)_ Implement comment stripping to preserve line structure during parsing ([d44a25e](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/d44a25e00ab3041dec7d474697784e55d8b513df))
- _(docs)_ Update VisualSoar feature specification to a comparison format with VS Code Extension ([4c6ff71](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/4c6ff71f64c55bd01f22d97e54c1a3a7f5dd6d0f))
- _(package)_ Update version to 0.2.0 ([1f3bc7e](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/1f3bc7e9760b699c7a94b9023349532cde6c8e73))

### Bug Fixes

- Increase timeout duration ([b54f733](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/b54f733b3eb9511833267461b645d35d9ab6150a))
- _(tests)_ Correct attribute completion syntax in test cases ([a216daa](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/a216daa8a7d4d2274582b1899844a9d66e1b48fe))
- _(tests)_ Increase tests and add missing parenthesis ([a15c963](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/a15c963c52f80c64c744999abd4ec36928558eb2))

### Refactor

- _(parser)_ Streamline validation methods and enhance enumeration checks ([8a6ff2e](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/8a6ff2eb2a662bdd1a7222a270bc1d6a7fe5ac1a))
- _(tests)_ Remove typo validation in test project ([acaeafd](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/acaeafd7d05017d055ebf7c46f9cf337cf596cac))

### Testing

- _(parser)_ Add enumeration error detection for project validation ([1e477e6](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/1e477e643d38c7a7c0ecdf9e9ae5b4723e29efe1))
- Add test for operator and high level operator creation ([617c522](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/617c522bd2c768e6e0d9d7579edebcbd1e95a3fb))

### Miscellaneous Tasks

- Reduce dependency and reduce trigger frequency ([b94099b](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/b94099ba81fd1815e5dd9dbfffe5bde81fd6becd))
- Update code formatting ([36e234e](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/36e234e031d42abfa3fd7590728a39afabea00a2))

## [0.1.8] - 2025-12-03

### Features

- Implement project management features including project selection and loading from file ([d93f3dd](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/d93f3dd1456e369dff366e0a8422163128ab69f6))

## [0.1.7] - 2025-12-03

### Features

- Enhance collectProjectFiles method to include parent folder path and improve orphaned files report formatting ([978d7f8](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/978d7f83e745d0b3297e4efd733db94e0b65fe50))

### Bug Fixes

- Update version number to 0.1.7 in package.json ([0e5dae5](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/0e5dae55b48a6f3231b77aa414d39b9b4675bfc2))

## [0.1.5] - 2025-12-03

### Features

- Add layout tree provider and project synchronization utilities ([872b89c](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/872b89c3353f1c3544a611a0c44902ed222765e8))
- Add commands to view datamap and root datamap in the layout ([4537e2f](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/4537e2f0940f54536bd5b0dc4f1bdc4185c434e0))
- Enhance datamap validation with detailed error range and improve parser position calculations ([20fe1fd](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/20fe1fd6cc70181696e5c3c4e844988234ce3ba5))
- Add CI workflow for build, test, and linting processes ([2f0b0a5](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/2f0b0a5f45120fbb38bafcc56396662b4e84535b))
- Update version to 0.1.4, change activation event, and add restart command for LSP client ([0d01531](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/0d01531d5173aacd80a9932daa44165c9acd3239))
- Add MIT license and update publisher and repository details in package.json ([d0ce063](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/d0ce063c5c43b07be51dbbe137bf07aa86437da3))
- Enhance CI workflow with release job and update Node.js caching ([8b83dca](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/8b83dca185202b50e2ea7b5ec4971fb7a1721ee0))

### Bug Fixes

- Update validation message and severity for missing attributes in datamap ([c5918cb](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/c5918cbc3068dddf67d755c6a34011ead664aa40))
- Enhance LayoutTreeItem to support parent path for file resource URIs ([23857ef](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/23857ef6667c15830f3e6119467961442833f349))
- Remove Java feature configuration from devcontainer setup ([5a5a1e9](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/5a5a1e9956569ea790edbbd7ad246acc9c5878d2))
- Dependency ([6331690](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/633169097fbf957edc74a4c221b9c4e7760331e1))
- Align lock file with package.json ([5a01bcf](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/5a01bcfa0c55ea921463c3fcbe9fc4d21321bd57))
- Standardize quotes and remove redundant linting steps in CI workflow ([88387a7](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/88387a741abbda014b0d8ea6a81a79527aabe9b0))
- Update CI workflow to use Node.js 20.x and streamline test execution ([618940b](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/618940b59240661e859a967c8b20ff17b5073708))
- Remove pre-commit checks from CI workflow ([f526482](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/f526482b1d85f67b8427ac699a27b94174358ec9))
- Update publisher name and repository URL in package.json; correct extension identifier in tests ([9847333](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/9847333d37c2c1391c2c0efaab801fa9f45d76f4))
- Update version number to 0.1.5 in package.json ([c5e5865](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/c5e58655ee80af92a9ed642a623ddd34dbaeaebd))

### Documentation

- Update documentation ([3eeb1cb](https://github.com/THA-Embedded-Systems-Lab/soar-code-extension/commit/3eeb1cb6e3b4b577e73d91549781d29aefdabda5))
