import assert from 'node:assert/strict';
import {copyFile, mkdir, mkdtemp, readFile, rm, symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const evidence=path.resolve(process.argv[2]??'');
assert.ok(process.argv[2], 'usage: node|bun access-temporal-installed-suite.mjs <evidence-directory>');
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const packet=path.resolve(evidence,'../r8-access-temporal/reference-packet.json');
const receipt=JSON.parse(await readFile(path.join(evidence,'archive-receipt.json'),'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(digest(await readFile(path.join(evidence,receipt.sdkArchive))),receipt.sdkArchiveSha256,'retained SDK archive hash');
assert.equal(digest(await readFile(path.join(evidence,receipt.archiveManifest))),receipt.archiveManifestSha256,'retained archive manifest hash');
assert.equal(digest(await readFile(packet)),receipt.packetSha256,'frozen packet hash');
const temp=await mkdtemp(path.join(tmpdir(),'umf-access-temporal-installed-suite-'));
const packageRoot=path.join(temp,'package');
const consumer=path.join(temp,'consumer');
const nodeModules=path.join(consumer,'node_modules/@umf');
const run=(command,args,options={})=>{
  const result=spawnSync(command,args,{cwd:repo,encoding:'utf8',stdio:'inherit',...options});
  if(result.error)throw result.error;
  assert.equal(result.status,0,`${command} ${args.join(' ')} exited ${result.status}`);
};
try {
  await mkdir(packageRoot,{recursive:true});
  run('tar',['-xzf',path.join(evidence,receipt.sdkArchive),'-C',temp]);
  await mkdir(nodeModules,{recursive:true});
  await symlink(packageRoot,path.join(nodeModules,'core'));
  const scripts=path.join(repo,'scripts/rust-migration/r8');
  const probe=path.join(consumer,'access-temporal-installed-probe.mjs');
  await copyFile(path.join(scripts,'access-temporal-installed-probe.mjs'),probe);
  run('node',[probe,packet],{cwd:consumer});
  run('bun',[probe,packet],{cwd:consumer});
  run('node',[path.join(scripts,'access-temporal-installed-native-controls.mjs'),packageRoot]);
  run('node',[path.join(scripts,'access-temporal-installed-browser.mjs'),consumer,packet]);
  console.log(JSON.stringify({status:'passed',archive:path.join(evidence,receipt.sdkArchive),packet,temporaryInstallation:packageRoot}));
} finally {
  await rm(temp,{recursive:true,force:true});
}
