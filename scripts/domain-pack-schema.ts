// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../src/model/types';
import {resolve} from 'node:path';

type SchemaKind = 'domain-pack' | 'dataset-source';
type CommandResult = {stdout: string; stderr: string; exitCode: number};
type CliRunner = (root: string, args: string[]) => CommandResult;

const root = resolve(import.meta.dir, '..');
const prettyJson = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

function runRustCli(repoRoot: string, args: string[]): CommandResult {
 const result = Bun.spawnSync({
  cmd: ['cargo', 'run', '--offline', '--locked', '-q', '-p', 'umf-cli', '--', ...args],
  cwd: repoRoot,
  stdout: 'pipe',
  stderr: 'pipe',
 });
 return {
  stdout: result.stdout.toString(),
  stderr: result.stderr.toString(),
  exitCode: result.exitCode,
 };
}

function rustSchema(repoRoot: string, kind: SchemaKind, runCli: CliRunner): {raw: string; value: unknown} {
 const args = ['domain-pack', 'schema', '--kind', kind, '--version', '1.0.0', '--pretty'];
 const result = runCli(repoRoot, args);
 if (result.exitCode !== 0) {
  const details = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
  throw new Error(`Rust domain-pack schema CLI refused ${kind}: ${details}`);
 }
 let value: unknown;
 try {
  value = JSON.parse(result.stdout);
 } catch (error) {
  throw new Error(`Rust domain-pack schema CLI returned invalid JSON for ${kind}: ${String(error)}`);
 }
 if (!value || typeof value !== 'object' || Array.isArray(value)) {
  throw new Error(`Rust domain-pack schema CLI returned a non-object schema for ${kind}`);
 }
 return {raw: result.stdout, value};
}

export function createDomainPackSchemaArtifacts(repoRoot = root, runCli: CliRunner = runRustCli): Map<string, string> {
 const domainPack = rustSchema(repoRoot, 'domain-pack', runCli);
 const datasetSource = rustSchema(repoRoot, 'dataset-source', runCli);
 const manifest = {
  id: 'umf.domain-pack', version: '1.0.0', coreVersion: CURRENT_CORE_VERSION,
  description: 'Portable sample-domain pack metadata with opaque implementation and schema references',
  schema: domainPack.value,
  semantics: 'References are data. No imports, fetching, generation, loading or ontology semantics are authorized.',
  scopes: ['document'], capabilities: {validation: 'structural', directions: [], evidence: ['tests/domain-packs/schema.test.ts']},
 };
 const sourcePackage = {
  ...manifest, id: 'umf.dataset-source',
  description: 'Dataset source references and provenance, without retrieval or authentication',
  schema: datasetSource.value,
 };
 return new Map([
  ['spec/extensions/domain-pack/schema.json', domainPack.raw],
  ['spec/extensions/domain-pack/package.json', prettyJson(manifest)],
  ['spec/extensions/dataset-source/schema.json', datasetSource.raw],
  ['spec/extensions/dataset-source/package.json', prettyJson(sourcePackage)],
 ]);
}

export async function writeDomainPackSchemaArtifacts(options: {check?: boolean; repoRoot?: string; runCli?: CliRunner} = {}): Promise<void> {
 const repoRoot = options.repoRoot ?? root;
 const artifacts = createDomainPackSchemaArtifacts(repoRoot, options.runCli ?? runRustCli);
 for (const [relativePath, contents] of artifacts) {
  const path = resolve(repoRoot, relativePath);
  if (options.check) {
   if (!await Bun.file(path).exists() || await Bun.file(path).text() !== contents) throw new Error(`Stale ${relativePath}`);
  } else {
   await Bun.write(path, contents);
  }
 }
}

if (import.meta.main) {
 try {
  await writeDomainPackSchemaArtifacts({check: process.argv.includes('--check')});
 } catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
 }
}
