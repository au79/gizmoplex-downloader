import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { inject } = require('postject/dist/api.js');
const root = path.resolve(import.meta.dirname, '..');
const outputDirectory = path.join(root, 'dist', 'standalone');
const workDirectory = await mkdtemp(path.join(tmpdir(), 'gizmoplex-sea-'));
const bundlePath = path.join(workDirectory, 'app.cjs');
const configPath = path.join(workDirectory, 'sea-config.json');
const blobPath = path.join(workDirectory, 'sea-prep.blob');
const binaryName = `gizmoplex-downloader-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`;
const binaryPath = path.join(outputDirectory, binaryName);

try {
  await mkdir(outputDirectory, { recursive: true });
  await build({
    bundle: true,
    entryPoints: [path.join(root, 'scripts', 'sea-entry.mjs')],
    format: 'cjs',
    legalComments: 'none',
    outfile: bundlePath,
    platform: 'node',
    sourcemap: false,
  });

  await writeFile(configPath, JSON.stringify({
    main: bundlePath,
    output: blobPath,
    disableExperimentalSEAWarning: true,
  }));
  execFileSync(process.execPath, ['--experimental-sea-config', configPath], { stdio: 'inherit' });

  await copyFile(process.execPath, binaryPath);
  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--remove-signature', binaryPath], { stdio: 'inherit' });
  }

  await inject(binaryPath, 'NODE_SEA_BLOB', await readFile(blobPath), {
    machoSegmentName: 'NODE_SEA',
    sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  });
  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--sign', '-', binaryPath], { stdio: 'inherit' });
  }
  if (process.platform !== 'win32') await chmod(binaryPath, 0o755);
  console.log(`Created ${path.relative(root, binaryPath)}`);
} finally {
  await rm(workDirectory, { recursive: true, force: true });
}
