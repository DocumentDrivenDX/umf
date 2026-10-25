// Build, pack, extract, and qualify the standalone browser package. Rust and
// wasm-bindgen compilation are supplied by the caller; this script verifies
// the exact resulting package artifact in Node, Bun, and Chromium.
import {copyFile, cp, mkdir, mkdtemp, readdir, readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import ts from 'typescript-api';

const root = resolve(import.meta.dir, '../../..');
const packageDir = join(root, 'bindings/core/wasm');
const bindgenDir = process.env.UMF_R7_WASM_BINDGEN_PKG;
if (!bindgenDir) throw new Error('Set UMF_R7_WASM_BINDGEN_PKG to the wasm-bindgen --target web output directory');
const tempRoot = await mkdtemp(join(tmpdir(), 'umf-r7-wasm-package-'));
const destination = join(tempRoot, 'tarball');
const extracted = join(tempRoot, 'extracted');
const stagedPackage = join(tempRoot, 'source-package');
const stagedPkg = join(stagedPackage, 'pkg');
const packageFiles = ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm'];
const sha256 = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
const run = (command: string[], cwd: string, env: Record<string, string | undefined> = {}) => {
  const result = Bun.spawnSync(command, {cwd, env: {...process.env, ...env}, stdout: 'pipe', stderr: 'pipe'});
  if (result.exitCode !== 0) throw new Error(`${command.join(' ')} failed (${result.exitCode})\n${result.stdout.toString()}\n${result.stderr.toString()}`);
  return result.stdout.toString();
};

const scanImports = (source: string) => {
  const file = ts.createSourceFile('package.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) throw new Error(`Unrecognized module specifier: ${node.moduleSpecifier.getText(file)}`);
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (node.arguments.length !== 1 || !argument || (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument))) {
        throw new Error(`Non-literal dynamic import is forbidden: ${node.getText(file)}`);
      }
      specifiers.push(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return specifiers;
};
const validateSpecifier = async (
  importer: string,
  packageRoot: string,
  specifier: string,
  isFile: (path: string) => Promise<boolean>,
) => {
  if (!specifier.startsWith('.')) throw new Error(`${importer} has an external or absolute import: ${specifier}`);
  const target = resolve(importer, '..', specifier);
  if (target !== packageRoot && !target.startsWith(`${packageRoot}/`)) throw new Error(`${importer} imports outside the package: ${specifier}`);
  if (!(await isFile(target))) throw new Error(`${importer} imports missing package file ${specifier}`);
};

// Guard the parser/closure checks against the syntax shapes that previously
// escaped a regex scan or caused source strings to be treated as imports.
const verifyScannerControls = async () => {
  const cases = [
    ['const x=1; import \'./outside.js\';', ['./outside.js']],
    ["import{a}from'pkg'", ['pkg']],
    ["export{a}from'pkg'", ['pkg']],
    ["const s=\"import('./not-real.js')\";", []],
    ["import('./dynamic.js')", ['./dynamic.js']],
  ] as const;
  for (const [source, expected] of cases) {
    const actual = scanImports(source);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Bun import scanner control failed for ${source}: ${JSON.stringify(actual)}`);
  }
  for (const source of ['import(variable)', 'import(`./${name}.js`)']) {
    let refusal = '';
    try { scanImports(source); }
    catch (error) { refusal = String(error); }
    if (!refusal.includes('Non-literal dynamic import')) throw new Error(`Non-literal import control was not refused: ${source}`);
  }
  const importer = join(tempRoot, 'control', 'entry.js');
  const packageRoot = join(tempRoot, 'control');
  const isFile = async (path: string) => path === join(packageRoot, 'inside.js');
  for (const [specifier, expectedFailure] of [
    ['pkg', 'external or absolute'],
    ['../../escape.js', 'outside the package'],
    ['./missing.js', 'missing package file'],
  ] as const) {
    let refusal = '';
    try { await validateSpecifier(importer, packageRoot, specifier, isFile); }
    catch (error) { refusal = String(error); }
    if (!refusal.includes(expectedFailure)) throw new Error(`Import-closure control did not refuse ${specifier}: ${refusal}`);
  }
  await validateSpecifier(importer, packageRoot, './inside.js', isFile);
};
await verifyScannerControls();

await cp(packageDir, stagedPackage, {recursive: true});
await mkdir(stagedPkg, {recursive: true});
try {
  run(['bun', join(root, 'scripts/rust-migration/r7/wasm-package-sources.ts'), '--check'], root);
  for (const file of packageFiles) {
    const source = join(bindgenDir, file);
    if (!(await stat(source)).isFile()) throw new Error(`Missing wasm-bindgen output ${source}`);
    await copyFile(source, join(stagedPkg, file));
  }
  await mkdir(destination, {recursive: true});
  const packOutput = run(['bun', 'pm', 'pack', '--ignore-scripts', '--destination', destination], stagedPackage);
  const tarballName = (await readdir(destination)).find(name => name.endsWith('.tgz'));
  if (!tarballName) throw new Error(`bun pm pack made no tarball: ${packOutput}`);
  const tarball = join(destination, tarballName);
  await mkdir(extracted, {recursive: true});
  run(['tar', '-xzf', tarball, '-C', extracted], root);
  const extractedPackage = join(extracted, 'package');
  const required = [
    'package.json', 'index.js', 'index.d.ts', 'src/core-model.js', 'src/wire.js',
    'src/javascript-numeric.js', 'src/bit128.js', 'src/document-comparison.js', 'src/shared-sources.json',
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
  for (const importer of jsFiles) {
    const source = await readFile(importer, 'utf8');
    if (/\b(?:process|Buffer)\b/.test(source)) throw new Error(`${importer} refers to a Node global`);
    for (const specifier of scanImports(source)) {
      await validateSpecifier(importer, extractedPackage, specifier, async target => {
        try { return (await stat(target)).isFile(); }
        catch { return false; }
      });
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
} finally { /* Preserve the extracted artifact under tempRoot for independent inspection. */ }
