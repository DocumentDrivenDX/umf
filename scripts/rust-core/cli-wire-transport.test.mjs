// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {chmod, mkdtemp, readdir, readFile, rm, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {runCliWire} from './cli-wire-transport.mjs';
import {encodeWire, resultError} from '../../bindings/core/node/src/wire.js';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

async function temporaryRoot() {
  return mkdtemp(join(tmpdir(), 'umf-cli-wire-test-'));
}

async function assertEmpty(directory) {
  assert.deepEqual(await readdir(directory), []);
}

async function waitUntilGone(pid) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { process.kill(pid, 0); }
    catch (error) { if (error.code === 'ESRCH') return true; throw error; }
    await new Promise((accept) => setTimeout(accept, 50));
  }
  return false;
}

test('stages exact UTF-8 bytes privately, supplies EOF, and removes staging files', async () => {
  const tempRoot = await temporaryRoot();
  const bytes = Buffer.from('{"value":"café 🦉"}\n', 'utf8');
  const child = `const fs=require('node:fs');const crypto=require('node:crypto');const b=fs.readFileSync(0);process.stdout.write(JSON.stringify({bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}));`;
  try {
    const result = await runCliWire({
      command: process.execPath,
      args: ['-e', child],
      wireBytes: bytes,
      cwd: tempRoot,
      env: {...process.env},
      maxBuffer: 4096,
      timeoutMs: 5000,
      label: 'transport-test#exact-bytes',
      tempRoot,
    });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    assert.deepEqual(result.staging, {directoryMode: 0o700, fileMode: 0o600});
    await assertEmpty(tempRoot);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});

test('the unmodified public pipe path still accepts the production CLI wire protocol', () => {
  const executable = process.env.UMF_CLI_PATH ?? join(root, 'target/release/umf');
  const fixture = JSON.parse(readFileSync(join(root, 'tests/rust-core/fixtures/r2/baseline-current-conformance.json'), 'utf8'));
  const resources = {
    coreSchema: JSON.parse(readFileSync(join(root, 'spec/core/schema.json'))),
    referenceSchema: JSON.parse(readFileSync(join(root, 'spec/core/semantic-type-reference.schema.json'))),
    packageSchema: JSON.parse(readFileSync(join(root, 'spec/core/extension-package.schema.json'))),
    constraints: JSON.parse(readFileSync(join(root, 'spec/metamodel/generated/core-constraints.json'))),
    domainPolicy: JSON.parse(readFileSync(join(root, 'spec/metamodel/generated/domain-policy.json'))),
  };
  const request = {op: 'validate', resources, document: fixture.cases[0].document};
  const wire = `${encodeWire(request, {maxDepth: 256, maxValues: 1_200_000})}\n`;
  const run = spawnSync(executable, ['core', '--stdin-wire', '--profile', 'cooperative', '--test-baseline-callback'], {
    cwd: root,
    env: {...process.env, PATH: ''},
    input: wire,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(run.status, 0, run.stderr);
  const envelope = JSON.parse(run.stdout.trim());
  assert.equal(resultError(envelope), null);
  assert.equal(envelope.status, 'ok');
});

test('timeout SIGKILLs a child and descendant holding output pipes, then cleans staging', async () => {
  const tempRoot = await temporaryRoot();
  const pidFile = join(tempRoot, 'descendant.pid');
  const child = `const fs=require('node:fs');const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});const grandchild=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});fs.writeFileSync(process.env.UMF_TEST_DESCENDANT_PID,String(grandchild.pid));setInterval(()=>{},1000);`;
  try {
    await assert.rejects(runCliWire({
      command: process.execPath,
      args: ['-e', child],
      wireBytes: Buffer.from('hang\n'),
      cwd: tempRoot,
      env: {...process.env, UMF_TEST_DESCENDANT_PID: pidFile},
      maxBuffer: 4096,
      timeoutMs: 3000,
      label: 'transport-test#descendant-timeout',
      tempRoot,
    }), (error) => error.code === 'TIMEOUT');
    const descendantPid = Number(await readFile(pidFile, 'utf8'));
    assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);
    assert.equal(await waitUntilGone(descendantPid), true, 'timeout must kill the descendant process group');
    await unlink(pidFile);
    await assertEmpty(tempRoot);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});

test('timeout also reaps descendants after a successful parent exits with inherited pipes open', async () => {
  const tempRoot = await temporaryRoot();
  const pidFile = join(tempRoot, 'descendant.pid');
  const child = `const fs=require('node:fs');const {spawn}=require('node:child_process');const grandchild=spawn(process.execPath,['-e',"setInterval(()=>{},1000)"],{stdio:'inherit'});fs.writeFileSync(process.env.UMF_TEST_DESCENDANT_PID,String(grandchild.pid));grandchild.unref();process.exit(0);`;
  try {
    await assert.rejects(runCliWire({
      command: process.execPath,
      args: ['-e', child],
      wireBytes: Buffer.from('parent-exits-first\n'),
      cwd: tempRoot,
      env: {...process.env, UMF_TEST_DESCENDANT_PID: pidFile},
      maxBuffer: 4096,
      timeoutMs: 3000,
      label: 'transport-test#successful-parent-open-pipe',
      tempRoot,
    }), (error) => error.code === 'TIMEOUT');
    const descendantPid = Number(await readFile(pidFile, 'utf8'));
    assert.equal(await waitUntilGone(descendantPid), true, 'timeout must kill descendants even after a successful parent exit');
    await unlink(pidFile);
    await assertEmpty(tempRoot);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});

test('output overflow is fatal and cleans private staging', async () => {
  const tempRoot = await temporaryRoot();
  try {
    await assert.rejects(runCliWire({
      command: process.execPath,
      args: ['-e', `process.stdout.write('x'.repeat(8192));setInterval(()=>{},1000);`],
      wireBytes: Buffer.from('overflow\n'),
      cwd: tempRoot,
      env: {...process.env},
      maxBuffer: 1024,
      timeoutMs: 5000,
      label: 'transport-test#overflow',
      tempRoot,
    }), (error) => error.code === 'OUTPUT_LIMIT');
    await assertEmpty(tempRoot);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});

test('nonzero exit SIGKILLs remaining process-group members and cleans staging', async () => {
  const tempRoot = await temporaryRoot();
  const pidFile = join(tempRoot, 'descendant.pid');
  const child = `const fs=require('node:fs');const {spawn}=require('node:child_process');const grandchild=spawn(process.execPath,['-e',"setInterval(()=>{},1000)"],{stdio:'inherit'});fs.writeFileSync(process.env.UMF_TEST_DESCENDANT_PID,String(grandchild.pid));grandchild.unref();process.exit(7);`;
  try {
    await assert.rejects(runCliWire({
      command: process.execPath,
      args: ['-e', child],
      wireBytes: Buffer.from('nonzero\n'),
      cwd: tempRoot,
      env: {...process.env, UMF_TEST_DESCENDANT_PID: pidFile},
      maxBuffer: 1024,
      timeoutMs: 5000,
      label: 'transport-test#nonzero',
      tempRoot,
    }), (error) => error.code === 'CHILD_FAILED' && error.details.status === 7);
    const descendantPid = Number(await readFile(pidFile, 'utf8'));
    assert.equal(await waitUntilGone(descendantPid), true, 'nonzero exit must kill remaining group members');
    await unlink(pidFile);
    await assertEmpty(tempRoot);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});

test('signal exit is fatal and SIGKILLs remaining process-group members', async () => {
  const tempRoot = await temporaryRoot();
  const pidFile = join(tempRoot, 'descendant.pid');
  const child = `const fs=require('node:fs');const {spawn}=require('node:child_process');const grandchild=spawn(process.execPath,['-e',"setInterval(()=>{},1000)"],{stdio:'inherit'});fs.writeFileSync(process.env.UMF_TEST_DESCENDANT_PID,String(grandchild.pid));grandchild.unref();process.kill(process.pid,'SIGTERM');`;
  try {
    await assert.rejects(runCliWire({
      command: process.execPath,
      args: ['-e', child],
      wireBytes: Buffer.from('signal\n'),
      cwd: tempRoot,
      env: {...process.env, UMF_TEST_DESCENDANT_PID: pidFile},
      maxBuffer: 1024,
      timeoutMs: 5000,
      label: 'transport-test#signal',
      tempRoot,
    }), (error) => error.code === 'CHILD_FAILED' && error.details.signal === 'SIGTERM');
    const descendantPid = Number(await readFile(pidFile, 'utf8'));
    assert.equal(await waitUntilGone(descendantPid), true, 'signal exit must kill remaining group members');
    await unlink(pidFile);
    await assertEmpty(tempRoot);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});

test('spawn failure removes temporary input and never produces a result', async () => {
  const tempRoot = await temporaryRoot();
  try {
    await assert.rejects(runCliWire({
      command: join(tempRoot, 'missing-cli'),
      args: [],
      wireBytes: Buffer.from('missing\n'),
      cwd: tempRoot,
      env: {...process.env},
      maxBuffer: 1024,
      timeoutMs: 1000,
      label: 'transport-test#spawn-failure',
      tempRoot,
    }), (error) => error.code === 'SPAWN_FAILED');
    await assertEmpty(tempRoot);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});

test('empty, malformed, extra, and mismatching CLI output never produce a passing report', async () => {
  const tempRoot = await temporaryRoot();
  const fakeCli = join(tempRoot, 'bad-cli');
  const report = join(tempRoot, 'report.json');
  const fixture = 'tests/rust-core/fixtures/r3/baseline/operations.json';
  try {
    await writeFile(fakeCli, '#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on(\'end\',()=>{});\n', {mode: 0o700, flag: 'wx'});
    await chmod(fakeCli, 0o700);
    const invoke = async (script) => {
      await writeFile(fakeCli, script, {mode: 0o700, flag: 'w'});
      await rm(report, {force: true});
      return spawnSync(process.execPath, [
        resolve(root, 'scripts/rust-migration/r3/host-replay.mjs'),
        root,
        fixture,
      ], {
        cwd: tempRoot,
        env: {...process.env, UMF_R3_HOST: 'cli', UMF_R3_CLI: fakeCli, UMF_R3_REPORT: report},
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 2 * 1024 * 1024,
      });
    };
    for (const [name, script] of [
      ['empty', '#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on(\'end\',()=>{});\n'],
      ['malformed', '#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on(\'end\',()=>process.stdout.write(\'not-json\'));\n'],
      ['extra', `#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on('end',()=>{const value=JSON.stringify({profile:'umf.core-wire/1',status:'ok',wire:JSON.stringify({kind:'null'})});process.stdout.write(value+'\\n'+value+'\\n')});\n`],
    ]) {
      const result = await invoke(script);
      assert.notEqual(result.status, 0, `${name} output must fail`);
      assert.equal(await readdir(tempRoot).then((files) => files.includes('report.json')), false, `${name} output must not write a receipt`);
    }

    const mismatch = await invoke(`#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({profile:'umf.core-wire/1',status:'ok',wire:JSON.stringify({kind:'null'})})+'\\n'));\n`);
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stdout, /"matches":0/);
    assert.equal(JSON.parse(await readFile(report, 'utf8')).matches, 0);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});
