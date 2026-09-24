/** Host-only fresh qualification runs; this does not itself admit the Key ideal. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';

const scripts = [
 'key-tablespec-oracle', 'key-postgresql-discovery', 'key-postgresql-oracle',
 'key-sqlserver-discovery', 'key-sqlserver-encoding-discovery', 'key-sqlserver-oracle',
 'key-avro-oracle', 'key-parquet-oracle',
 'key-tablespec-browser', 'key-postgresql-catalog-browser', 'key-postgresql-browser',
 'key-sqlserver-browser', 'key-sqlserver-encoding-browser', 'key-sqlserver-projection-browser',
 'key-avro-browser', 'key-avro-projection-browser',
 'key-parquet-browser', 'key-parquet-projection-browser',
];
const commands = [
 ['bun', 'run', 'typecheck'], ['bun', 'run', 'build'],
 ['bun', 'run', 'build:postgresql'], ['bun', 'run', 'test:schemas'],
 ...scripts.map(s => ['bun', `scripts/core-ideals/${s}.ts`]),
];
const path = 'fixtures/validation/key-gate-refresh-evidence.json';
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const verifyOnly = process.argv.includes('--verify-only');
const runs: {command: string[]; exitCode: number; log: string; logSha256: string}[] = verifyOnly ? (await Bun.file(path).json()).runs : [];
if (verifyOnly) {
 assert.deepEqual(runs.map(r => r.command), commands, 'Incomplete command matrix');
 for (const run of runs) {
  assert.equal(run.exitCode, 0);
  assert.equal(digest(new Uint8Array(await Bun.file(run.log).arrayBuffer())), run.logSha256, 'Changed run log');
 }
}
await mkdir('.cache/key-gate-refresh', {recursive: true});
for (const [index, command] of (verifyOnly ? [] : commands).entries()) {
 console.log(JSON.stringify({step: index + 1, total: commands.length, command}));
 const child = Bun.spawn(command, {stdout: 'pipe', stderr: 'pipe', env: process.env});
 const [stdout, stderr, exitCode] = await Promise.all([
  new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
 ]);
 const log = `.cache/key-gate-refresh/${index + 1}.log`;
 await Bun.write(log, stdout + '\n' + stderr);
 runs.push({command, exitCode, log, logSha256: digest(new TextEncoder().encode(stdout + '\n' + stderr))});
 // Persist failures and partial execution as such; a partial record is never a pass.
 await Bun.write(path, JSON.stringify({scope: 'Fresh Key native/browser qualification commands; separate conformance required', complete: false, idealAdmitted: false, nativeEquivalence: false, runs}, null, 2) + '\n');
 assert.equal(exitCode, 0, `Failed command; inspect ${log}`);
}
const paths = ['scripts/core-ideals/key-gate-refresh.ts', ...scripts.map(s => `scripts/core-ideals/${s}.ts`)];
const proofs = [
 'key-tablespec-discovery-native', 'key-tablespec-projection-native', 'key-tablespec-classification-browser',
 'key-postgresql-discovery-native', 'key-postgresql-projection-native', 'key-postgresql-catalog-browser', 'key-postgresql-browser',
 'key-sqlserver-discovery-native', 'key-sqlserver-encoding-native', 'key-sqlserver-projection-native',
 'key-sqlserver-browser', 'key-sqlserver-encoding-browser', 'key-sqlserver-projection-browser',
 'key-avro-discovery-native', 'key-avro-projection-native', 'key-avro-browser', 'key-avro-projection-browser',
 'key-parquet-discovery-native', 'key-parquet-projection-native', 'key-parquet-browser', 'key-parquet-projection-browser',
];
for (const stem of proofs) {
 const name = stem + '.json';
 const p = `fixtures/validation/${name}`, record = await Bun.file(p).json();
 assert.ok(record.sha256 && Object.keys(record.sha256).length, `Missing proof fingerprints: ${p}`);
 paths.push(p);
 for (const [source, hash] of Object.entries(record.sha256)) {
  // Only current Key binding proofs participate; historical core qualification is separate.
  assert.equal(digest(new Uint8Array(await Bun.file(source).arrayBuffer())), hash, `Stale proof ${p}: ${source}`);
  paths.push(source);
 }
}
const sha256 = Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p => [p, digest(new Uint8Array(await Bun.file(p).arrayBuffer()))])));
await Bun.write(path, JSON.stringify({scope: 'Fresh Key native/browser qualification commands; separate conformance required', complete: true, idealAdmitted: false, nativeEquivalence: false, runs, sha256}, null, 2) + '\n');
console.log(JSON.stringify({complete: true, commands: runs.length, fingerprints: Object.keys(sha256).length, idealAdmitted: false}));
