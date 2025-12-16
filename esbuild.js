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
    plugins: [esbuildProblemMatcherPlugin, copySchemaPlugin],
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
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), serverCtx.watch()]);
  } else {
    await Promise.all([extensionCtx.rebuild(), serverCtx.rebuild()]);
    await extensionCtx.dispose();
    await serverCtx.dispose();
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
