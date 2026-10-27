import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm,cp} from 'node:fs/promises';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join,resolve,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
if(typeof Bun!=='undefined')(await import('bun:test')).setDefaultTimeout(120_000);

const repo=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const runner=join(repo,'scripts/rust-migration/r8/security-and-or-installed-replay.mjs');
const archive=process.env.UMF_SECURITY_TEST_ARCHIVE;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const execFileAsync=promisify(execFile);

const packageBindingTest=archive?test:test.skip;
packageBindingTest('installed security replay binds the exact package tree to its archive',async()=>{
 const archiveBytes=await readFile(archive),expectedArchiveSha=sha(archiveBytes);
 const work=await mkdtemp(join(tmpdir(),'umf-security-package-binding-'));
 const packageRoot=join(work,'package');await mkdir(packageRoot);
 try{
  const listing=(await execFileAsync('/usr/bin/tar',['-tzf',archive],{maxBuffer:4*1024*1024})).stdout.trim().split('\n');
  for(const member of listing){const relative=member.startsWith('package/')?member.slice('package/'.length):'';assert(relative&&!member.startsWith('/')&&posix.normalize(relative)===relative&&!relative.split('/').includes('..'),`unsafe archive member ${member}`)}
  await execFileAsync('/usr/bin/tar',['-xzf',archive,'--strip-components=1','-C',packageRoot],{maxBuffer:2*1024*1024});
  const bun=Bun.which('bun');assert(bun,'Bun executable is available');
  const invoke=()=>execFileAsync(bun,[runner,'--verify-package',archive,packageRoot,expectedArchiveSha],{cwd:repo,maxBuffer:2*1024*1024});
  const positive=JSON.parse((await invoke()).stdout);
  assert.equal(positive.status,'pass');assert.equal(positive.archiveMemberCount,listing.length);assert.equal(positive.installedFileCount,listing.length);
  assert.deepEqual(positive.controls,{positiveExactTreeAccepted:true,archivePayloadHashMismatchRejected:true,mutatedExtractedFileRejected:true,extraExecutableRejected:true});

  const target=join(packageRoot,'dist/umf-node.js'),original=await readFile(target),mutated=Buffer.from(original);mutated[0]^=1;
  try{
   await writeFile(target,mutated);
   await assert.rejects(invoke(),error=>/installed package member SHA-256 mismatch: dist\/umf-node\.js/.test(String(error.stderr)));
  }finally{await writeFile(target,original)}

  const extra=join(packageRoot,'unexpected-executable.mjs');
  try{
   await writeFile(extra,'throw new Error("unmanifested executable");\n');
   await assert.rejects(invoke(),error=>/installed package file inventory differs from archive/.test(String(error.stderr)));
  }finally{await rm(extra,{force:true})}

  const tamperedRoot=join(work,'tampered/package'),tamperedArchive=join(work,'tampered.tgz');
  await mkdir(join(work,'tampered'),{recursive:true});await cp(packageRoot,tamperedRoot,{recursive:true});
  const payload=join(tamperedRoot,'dist/umf-node.js'),payloadBytes=Buffer.from(await readFile(payload));payloadBytes[0]^=1;await writeFile(payload,payloadBytes);
  await execFileAsync('/usr/bin/tar',['-czf',tamperedArchive,'-C',join(work,'tampered'),...listing],{maxBuffer:2*1024*1024});
  const tamperedArchiveSha=sha(await readFile(tamperedArchive));
  await assert.rejects(execFileAsync(bun,[runner,'--verify-package',tamperedArchive,packageRoot,tamperedArchiveSha],{cwd:repo,maxBuffer:2*1024*1024}),error=>/installed package member SHA-256 mismatch: dist\/umf-node\.js/.test(String(error.stderr)));
 }finally{await rm(work,{recursive:true,force:true})}
});
