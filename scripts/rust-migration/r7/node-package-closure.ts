// SPDX-License-Identifier: MIT OR Apache-2.0
// Check that the Node package allowlist contains every local static import.
// The negative control protects against an allowlist that silently regresses.
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, posix, resolve} from 'node:path';

const root = resolve(import.meta.dir, '../../..');
const packageRoot = join(root, 'bindings/core/node');
const npmCache = await mkdtemp(join(tmpdir(), 'umf-node-package-check-'));
let pack: {files: {path: string}[]};
try {
  pack = JSON.parse(execFileSync('npm', [
    'pack', '--dry-run', '--ignore-scripts', '--json', '--cache', npmCache,
  ], {cwd: packageRoot, encoding: 'utf8'}))[0] as {files: {path: string}[]};
} finally {
  await rm(npmCache, {recursive: true, force: true});
}
const members = new Set(pack.files.map(file => file.path));

function validateSource(file: string, source: string, archiveMembers: Set<string>) {
  let importEdges = 0;
  for (const match of source.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*)(['"])([^'"]+)\1/g)) {
    const specifier = match[2]!;
    if (!specifier.startsWith('.')) continue;
    let target = posix.normalize(posix.join(posix.dirname(file), specifier));
    if (!posix.extname(target)) target += '.js';
    if (!archiveMembers.has(target)) throw new Error(`${file} imports missing package member ${target}`);
    importEdges++;
  }
  return importEdges;
}

async function validate(archiveMembers: Set<string>) {
  let importEdges = 0;
  for (const file of archiveMembers) {
    if (file.endsWith('.js')) importEdges += validateSource(file, await readFile(join(packageRoot, file), 'utf8'), archiveMembers);
  }
  return importEdges;
}

const importEdges = await validate(members);
const negative = new Set(members);
negative.delete('src/json-schema-import-session.js');
let negativeControlRejected = false;
try { await validate(negative); }
catch (error) { negativeControlRejected = String(error).includes('src/json-schema-import-session.js'); }
if (!negativeControlRejected) throw new Error('Package closure check did not reject the missing-member negative control');
let sideEffectNegativeControlRejected = false;
try { validateSource('index.js', "import './src/missing-side-effect.js';", members); }
catch (error) { sideEffectNegativeControlRejected = String(error).includes('missing-side-effect.js'); }
if (!sideEffectNegativeControlRejected) throw new Error('Package closure check did not recognize a side-effect import negative control');

console.log(JSON.stringify({status: 'pass', archiveMembers: members.size, importEdges, negativeControlRejected, sideEffectNegativeControlRejected}));
