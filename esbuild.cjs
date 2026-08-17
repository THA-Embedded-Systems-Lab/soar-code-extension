const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Plugin to copy schema file to dist directory
 */
const copySchemaPlugin = {
  name: 'copy-schema',
  setup(build) {
    build.onEnd(() => {
      const schemaSource = path.join(__dirname, 'project.schema.json');
      const schemaDest = path.join(__dirname, 'dist', 'project.schema.json');
      try {
        fs.copyFileSync(schemaSource, schemaDest);
        console.log('[schema] Copied project.schema.json to dist/');
      } catch (err) {
        console.error('[schema] Failed to copy schema file:', err.message);
      }
    });
  },
};

/**
 * Plugin to mark dist/ as CommonJS.
 *
 * The root package.json has "type": "module" (source is authored as ESM),
 * but these bundles are still emitted as CJS (format: 'cjs' below) — VS
 * Code's extension host loads dist/extension.js via require(), and the MCP
 * server is spawned as a plain child process. Without this, Node would
 * treat dist/*.js as ESM (inheriting the root package.json) and refuse to
 * run the bundled require() calls.
 */
const distPackageJsonPlugin = {
  name: 'dist-package-json',
  setup(build) {
    build.onEnd(() => {
      const distPackageJson = path.join(__dirname, 'dist', 'package.json');
      try {
        fs.writeFileSync(distPackageJson, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
        console.log('[dist] Wrote dist/package.json ({ type: "commonjs" })');
      } catch (err) {
        console.error('[dist] Failed to write dist/package.json:', err.message);
      }
    });
  },
};

async function main() {
  // Build extension
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    define: { 'import.meta.url': 'importMetaUrl' },
    banner: { js: "const importMetaUrl = require('url').pathToFileURL(__filename).href;" },
    plugins: [esbuildProblemMatcherPlugin, copySchemaPlugin, distPackageJsonPlugin],
  });

  // Build language server
  const serverCtx = await esbuild.context({
    entryPoints: ['src/server/soarLanguageServer.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/server.js',
    external: ['vscode'],
    logLevel: 'silent',
    define: { 'import.meta.url': 'importMetaUrl' },
    banner: { js: "const importMetaUrl = require('url').pathToFileURL(__filename).href;" },
    plugins: [esbuildProblemMatcherPlugin, distPackageJsonPlugin],
  });

  // Build MCP server
  const mcpServerCtx = await esbuild.context({
    entryPoints: ['src/mcp/soarMcpServer.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/mcpServer.js',
    external: ['vscode'],
    logLevel: 'silent',
    define: { 'import.meta.url': 'importMetaUrl' },
    banner: { js: "const importMetaUrl = require('url').pathToFileURL(__filename).href;" },
    plugins: [esbuildProblemMatcherPlugin, distPackageJsonPlugin],
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), serverCtx.watch(), mcpServerCtx.watch()]);
  } else {
    await Promise.all([extensionCtx.rebuild(), serverCtx.rebuild(), mcpServerCtx.rebuild()]);
    await extensionCtx.dispose();
    await serverCtx.dispose();
    await mcpServerCtx.dispose();
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
