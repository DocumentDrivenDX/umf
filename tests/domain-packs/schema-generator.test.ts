// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterEach, expect, test} from 'bun:test';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeDomainPackSchemaArtifacts} from '../../scripts/domain-pack-schema';

const roots: string[] = [];
afterEach(async () => {for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true});});

test('a Rust CLI refusal aborts generation before writing any artifacts', async () => {
 const root = await mkdtemp(join(tmpdir(), 'umf-domain-pack-schema-')); roots.push(root);
 const calls: string[][] = [];
 await expect(writeDomainPackSchemaArtifacts({
  repoRoot: root,
  runCli: (_repoRoot, args) => {
   calls.push(args);
   return {stdout: '', stderr: 'unsupported domain-pack schema version: 2.0.0', exitCode: 2};
  },
 })).rejects.toThrow('Rust domain-pack schema CLI refused domain-pack: unsupported domain-pack schema version: 2.0.0');
 expect(calls).toEqual([['domain-pack', 'schema', '--kind', 'domain-pack', '--version', '1.0.0', '--pretty']]);
 expect(await Bun.file(join(root, 'spec/extensions/domain-pack/schema.json')).exists()).toBe(false);
});

test('a dataset-source CLI refusal leaves all four artifacts unwritten', async () => {
 const root = await mkdtemp(join(tmpdir(), 'umf-domain-pack-schema-')); roots.push(root);
 const calls: string[][] = [];
 await expect(writeDomainPackSchemaArtifacts({
  repoRoot: root,
  runCli: (_repoRoot, args) => {
   calls.push(args);
   return args[3] === 'domain-pack'
    ? {stdout: '{"$id":"urn:umf:domain-pack:1.0.0"}', stderr: '', exitCode: 0}
    : {stdout: '', stderr: 'unsupported domain-pack schema version: 2.0.0', exitCode: 2};
  },
 })).rejects.toThrow('Rust domain-pack schema CLI refused dataset-source: unsupported domain-pack schema version: 2.0.0');
 expect(calls.map(args => args[3])).toEqual(['domain-pack', 'dataset-source']);
 for (const path of [
  'spec/extensions/domain-pack/schema.json', 'spec/extensions/domain-pack/package.json',
  'spec/extensions/dataset-source/schema.json', 'spec/extensions/dataset-source/package.json',
 ]) expect(await Bun.file(join(root, path)).exists()).toBe(false);
});

test('--check refuses missing and stale artifacts without changing them', async () => {
 const root = await mkdtemp(join(tmpdir(), 'umf-domain-pack-schema-')); roots.push(root);
 const runCli = (_repoRoot: string, args: string[]) => ({
  stdout: JSON.stringify({$id: `urn:umf:${args[3]}:1.0.0`}), stderr: '', exitCode: 0,
 });
 const first = 'spec/extensions/domain-pack/schema.json';
 await expect(writeDomainPackSchemaArtifacts({repoRoot: root, runCli, check: true})).rejects.toThrow(`Stale ${first}`);
 expect(await Bun.file(join(root, first)).exists()).toBe(false);

 const stale = 'stale bytes\n';
 await mkdir(join(root, 'spec/extensions/domain-pack'), {recursive: true});
 await Bun.write(join(root, first), stale);
 await expect(writeDomainPackSchemaArtifacts({repoRoot: root, runCli, check: true})).rejects.toThrow(`Stale ${first}`);
 expect(await Bun.file(join(root, first)).text()).toBe(stale);
 expect(await Bun.file(join(root, 'spec/extensions/domain-pack/package.json')).exists()).toBe(false);
 expect(await Bun.file(join(root, 'spec/extensions/dataset-source/schema.json')).exists()).toBe(false);
 expect(await Bun.file(join(root, 'spec/extensions/dataset-source/package.json')).exists()).toBe(false);
});
