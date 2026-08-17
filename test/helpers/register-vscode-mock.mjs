// Preloaded via --import (see package.json's "test" script) so the loader
// hook is active before any test file's module graph resolves 'vscode'.
import { register } from 'node:module';

register('./vscode-mock-loader.mjs', import.meta.url);
