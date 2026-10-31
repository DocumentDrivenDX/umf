// SPDX-License-Identifier: MIT OR Apache-2.0
// Source closure and deterministic digest helpers for the browser WASM build.
import {createHash} from 'node:crypto';
import {readdir, readFile, stat} from 'node:fs/promises';
import {dirname, join, relative, resolve, sep} from 'node:path';

type Reader = (path: string) => Promise<Uint8Array>;
const packages = [
  'bindings/core/wasm',
  'crates/umf-core-wire',
  'crates/umf-codegen',
  'crates/umf-core',
  'crates/umf-core/vendor/saphyr-parser',
];
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const repoPath = (path: string) => path.split(sep).join('/');

async function filesUnder(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, {withFileTypes: true}); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function collectWasmCargoInputHashes(root: string, read: Reader = readFile): Promise<Record<string, string>> {
  const repo = resolve(root);
  const paths = new Set<string>();
  const rustSources: string[] = [];
  for (const packagePath of packages) {
    const packageRoot = join(repo, packagePath);
    const manifest = join(packageRoot, 'Cargo.toml');
    paths.add(manifest);
    try { if ((await stat(join(packageRoot, 'build.rs'))).isFile()) paths.add(join(packageRoot, 'build.rs')); } catch { /* optional build script */ }
    for (const path of await filesUnder(join(packageRoot, 'src'))) {
      paths.add(path);
      if (path.endsWith('.rs')) rustSources.push(path);
    }
  }

  // Rust include macros make compile inputs outside the crate source tree.
  // Resolve literal include_str!/include_bytes! operands relative to the Rust
  // source that contains them, including test-only references conservatively.
  for (const source of rustSources) {
    const contents = new TextDecoder().decode(await read(source));
    const include = /include_(?:str|bytes)!\s*\(\s*"((?:[^"\\]|\\.)*)"/g;
    for (const match of contents.matchAll(include)) {
      const operand = match[1];
      if (operand === undefined) continue;
      const relativePath = operand.replaceAll('\\"', '"').replaceAll('\\\\', '\\');
      const target = resolve(dirname(source), relativePath);
      try { if ((await stat(target)).isFile()) paths.add(target); }
      catch { throw new Error(`Unresolved literal Rust include ${repoPath(relative(repo, source))}: ${relativePath}`); }
    }
  }

  const hashes: Record<string, string> = {};
  for (const path of [...paths].sort()) hashes[repoPath(relative(repo, path))] = sha256(await read(path));
  return hashes;
}

export function provenanceBytes(value: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

export function releaseManifestBytes(payload: Record<string, string>): Uint8Array {
  return provenanceBytes({version: 1, sha256: Object.fromEntries(Object.entries(payload).sort())});
}

export function digest(bytes: Uint8Array): string { return sha256(bytes); }
