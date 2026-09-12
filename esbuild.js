const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Reports esbuild problems in a format VS Code's problem matcher understands.
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`[ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const shared = {
    bundle: true,
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  };

  const contexts = await Promise.all([
    esbuild.context({
      ...shared,
      entryPoints: [
        { in: 'src/extension.ts', out: 'extension' },
        { in: 'src/server/server.ts', out: 'server' },
      ],
      format: 'cjs',
      platform: 'node',
      outdir: 'dist',
      external: ['vscode'],
    }),
    // The Map Editor page: a browser script, so none of the node settings apply
    // and nothing is external — the webview loads this one file.
    esbuild.context({
      ...shared,
      entryPoints: [{ in: 'src/webview/mapEditorPage.ts', out: 'mapEditorPage' }],
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      outdir: 'dist',
    }),
  ]);

  if (watch) {
    await Promise.all(contexts.map((context) => context.watch()));
  } else {
    await Promise.all(contexts.map((context) => context.rebuild()));
    await Promise.all(contexts.map((context) => context.dispose()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
