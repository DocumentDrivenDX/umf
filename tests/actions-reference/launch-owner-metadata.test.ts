// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {mkdtemp, writeFile, chmod, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReferenceHandlerLaunchOwner} from '../../scripts/actions-reference/launch-owner';

test('cold installation metadata can exceed two seconds; a stalled observation refuses before ownership', async () => {
 const root = await mkdtemp(join(tmpdir(), 'umf-launch-metadata-'));
 const original = process.env.UMF_REFERENCE_HANDLER_LAUNCH_DIRECTORY;
 const directory = join(root, 'ownership');
 process.env.UMF_REFERENCE_HANDLER_LAUNCH_DIRECTORY = directory;
 try {
  const executable = join(root, 'docker');
  await writeFile(executable, `#!${process.execPath}
if(process.argv.includes('context'))process.stdout.write('unix:///qualification.sock');else{await Bun.sleep(Number(process.env.UMF_TEST_METADATA_DELAY));process.stdout.write('qualification-daemon');}
`);
  await chmod(executable, 0o700);
  const environment = {...process.env, PATH: root + ':' + process.env.PATH, DOCKER_CONTEXT: undefined, DOCKER_HOST: undefined, UMF_TEST_METADATA_DELAY: '2200'};
  const lease = await ReferenceHandlerLaunchOwner.acquire('umf-actions-handler-' + crypto.randomUUID(), environment);
  try {
   expect(lease.record.endpoint).toBe('unix:///qualification.sock');
   expect(lease.record.daemon).toBe('qualification-daemon');
  } finally { await lease.release(); }
  await expect(ReferenceHandlerLaunchOwner.acquire('umf-actions-handler-' + crypto.randomUUID(), {...environment, UMF_TEST_METADATA_DELAY: '6000'})).rejects.toMatchObject({code: 'LIMIT', message: 'Docker installation observation timed out'});
  expect(await readdir(directory)).not.toContain('active');
 } finally {
  if (original === undefined) delete process.env.UMF_REFERENCE_HANDLER_LAUNCH_DIRECTORY;
  else process.env.UMF_REFERENCE_HANDLER_LAUNCH_DIRECTORY = original;
  await rm(root, {recursive: true, force: true});
 }
}, 15000);
