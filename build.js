import esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

async function build() {
  const entries = [
    { entry: 'src/content.js', out: 'dist/content.js' },
    { entry: 'src/background.js', out: 'dist/background.js' },
    { entry: 'src/popup.js', out: 'dist/popup.js' }
  ];

  if (isWatch) {
    console.log('👀 Starting watch mode on src/ ...');
    for (const { entry, out } of entries) {
      const ctx = await esbuild.context({
        entryPoints: [entry],
        bundle: true,
        format: 'iife',
        outfile: out,
        platform: 'browser',
        target: ['chrome110'],
        minify: false,
        sourcemap: false
      });
      await ctx.watch();
    }
    console.log('✔ Watching for file changes in src/ ... (Press Ctrl+C to stop)');
  } else {
    console.log('Building starlight-to-md extension bundles...');
    for (const { entry, out } of entries) {
      await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        format: 'iife',
        outfile: out,
        platform: 'browser',
        target: ['chrome110'],
        minify: false,
        sourcemap: false
      });
      console.log(`✔ ${out} built successfully`);
    }
  }
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
