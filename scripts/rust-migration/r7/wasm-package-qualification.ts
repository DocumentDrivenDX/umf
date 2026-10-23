// Build, pack, extract, and qualify the standalone browser package. Rust and
// wasm-bindgen compilation are supplied by the caller; this script verifies
// the exact resulting package artifact in Node, Bun, and Chromium.
import {copyFile, cp, mkdir, mkdtemp, readdir, readFile, rm, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dir, '../../..');
const packageDir = join(root, 'bindings/core/wasm');
const bindgenDir = process.env.UMF_R7_WASM_BINDGEN_PKG;
if (!bindgenDir) throw new Error('Set UMF_R7_WASM_BINDGEN_PKG to the wasm-bindgen --target web output directory');
const tempRoot = await mkdtemp(join(tmpdir(), 'umf-r7-wasm-package-'));
const destination = join(tempRoot, 'tarball');
const extracted = join(tempRoot, 'extracted');
const stagedPkg = join(packageDir, 'pkg');
const preservedPkg = join(tempRoot, 'preserved-pkg');
const packageFiles = ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm'];
const sha256 = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
const run = (command: string[], cwd: string, env: Record<string, string | undefined> = {}) => {
  const result = Bun.spawnSync(command, {cwd, env: {...process.env, ...env}, stdout: 'pipe', stderr: 'pipe'});
  if (result.exitCode !== 0) throw new Error(`${command.join(' ')} failed (${result.exitCode})\n${result.stdout.toString()}\n${result.stderr.toString()}`);
  return result.stdout.toString();
};

let pkgDirectoryPreviouslyExisted = false;
try {
  pkgDirectoryPreviouslyExisted = (await stat(stagedPkg)).isDirectory();
  if (pkgDirectoryPreviouslyExisted) await cp(stagedPkg, preservedPkg, {recursive: true});
} catch { /* first build */ }
await mkdir(stagedPkg, {recursive: true});
try {
  for (const file of packageFiles) {
    const source = join(bindgenDir, file);
    if (!(await stat(source)).isFile()) throw new Error(`Missing wasm-bindgen output ${source}`);
    await copyFile(source, join(stagedPkg, file));
  }
  await mkdir(destination, {recursive: true});
  const packOutput = run(['bun', 'pm', 'pack', '--destination', destination], packageDir);
  const tarballName = (await readdir(destination)).find(name => name.endsWith('.tgz'));
  if (!tarballName) throw new Error(`bun pm pack made no tarball: ${packOutput}`);
  const tarball = join(destination, tarballName);
  await mkdir(extracted, {recursive: true});
  run(['tar', '-xzf', tarball, '-C', extracted], root);
  const extractedPackage = join(extracted, 'package');
  const required = [
    'package.json', 'index.js', 'index.d.ts', 'src/core-model.js', 'src/wire.js',
    'src/javascript-numeric.js', 'src/bit128.js', 'src/shared-sources.json',
    'pkg/umf_core_wasm.js', 'pkg/umf_core_wasm_bg.wasm',
  ];
  for (const file of required) if (!(await stat(join(extractedPackage, file))).isFile()) throw new Error(`Tarball is missing ${file}`);
  const pkg = JSON.parse(await readFile(join(extractedPackage, 'package.json'), 'utf8'));
  if (pkg.name !== '@umf/core-rust-wasm' || pkg.type !== 'module') throw new Error('Unexpected extracted package metadata');
  if (pkg.dependencies || pkg.optionalDependencies || pkg.peerDependencies) throw new Error('WASM package unexpectedly depends on an external package');

  const jsFiles: string[] = [];
  const collectJs = async (directory: string) => {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await collectJs(path);
      else if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(path);
    }
  };
  await collectJs(extractedPackage);
  const importPattern = /\b(?:import|export)\s*(?:(?:[^'";]*?\s+from\s*)?)(['"])([^'"]+)\1|\bimport\s*\(\s*(['"])([^'"]+)\3\s*\)/g;
  for (const importer of jsFiles) {
    const source = await readFile(importer, 'utf8');
    if (/\b(?:process|Buffer)\b/.test(source)) throw new Error(`${importer} refers to a Node global`);
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[2] ?? match[4];
      if (typeof specifier !== 'string') throw new Error(`${importer} contains an unreadable import`);
      if (!specifier.startsWith('.')) throw new Error(`${importer} has an external or absolute import: ${specifier}`);
      const target = resolve(importer, '..', specifier);
      if (target !== extractedPackage && !target.startsWith(`${extractedPackage}/`)) throw new Error(`${importer} imports outside the package: ${specifier}`);
      if (!(await stat(target)).isFile()) throw new Error(`${importer} imports missing package file ${specifier}`);
    }
  }

  const fileHashes = Object.fromEntries(await Promise.all(required.map(async file => [file, await sha256(join(extractedPackage, file))] as const)));
  const runtime = (command: string[]) => JSON.parse(run(command, root, {UMF_R7_WASM_PACKAGE: extractedPackage}));
  const node = runtime(['node', 'scripts/rust-migration/r7/wasm-package-runtime.mjs']);
  const bun = runtime(['bun', 'scripts/rust-migration/r7/wasm-package-runtime.mjs']);
  const browser = JSON.parse(run(['bun', 'scripts/rust-migration/r7/wasm-package-browser.ts'], root, {
    UMF_R7_WASM_PACKAGE: extractedPackage,
  }).trim().split('\n').at(-1)!);
  console.log(JSON.stringify({
    status: 'pass',
    packer: 'bun pm pack 1.4.3; npm-compatible .tgz',
    tarball: {path: tarball, name: tarballName, sha256: await sha256(tarball)},
    extractedPackage,
    files: fileHashes,
    node,
    bun,
    chromium: browser,
  }, null, 2));
} finally {
  await rm(stagedPkg, {recursive: true, force: true});
  if (pkgDirectoryPreviouslyExisted) await cp(preservedPkg, stagedPkg, {recursive: true});
}
