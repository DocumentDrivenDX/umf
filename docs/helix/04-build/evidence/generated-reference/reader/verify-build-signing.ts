import {mkdtemp,mkdir,rm,chmod,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run} from '/Users/erik/.codex/worktrees/d8be/umf/scripts/generated-page-seals';
import {generateEd25519,b64url} from '/private/tmp/umf-signing-cli/src/crypto.mjs';
const root='/Users/erik/.codex/worktrees/d8be/umf',fixture=await mkdtemp(join(tmpdir(),'umf-build-seal-test-')),cli='/private/tmp/umf-signing-cli/src/cli.mjs';
const previousKey=process.env.INNSIGLE_BUILD_KEY,previousOp=process.env.INNSIGLE_OP_BIN;
try{
 const material=generateEd25519(),config=await Bun.file(join(root,'.innsigle/config.json')).json(),colo=await Bun.file(join(root,'.innsigle/generated-colo.json')).json();
 config.issuer={...config.issuer,id:'local-build-check',key_id:material.keyId,public_key:b64url(material.publicKeyRaw),key_url:'https://example.invalid/.well-known/innsigle/keys.json'};config.keys.build.key_id=material.keyId;
 const pages=['index.html','actions/index.html','reference/index.html'].map(path=>config.content_root+'/'+path);
 await mkdir(join(fixture,'.git'));for(const page of pages)await Bun.write(join(fixture,page),'<!doctype html><html><body>Automated signing check</body></html>');
 await Bun.write(join(fixture,'.innsigle/config.json'),JSON.stringify(config));await Bun.write(join(fixture,'.innsigle/generated-colo.json'),JSON.stringify(colo));await Bun.write(join(fixture,'.innsigle/generated-pages.json'),JSON.stringify({profile:'umf.generated-page-seals/1',files:pages}));
 await Bun.write(join(fixture,'.innsigle/public/keys.json'),JSON.stringify({innsigle_issuer:'1',issuer_id:config.issuer.id,issuer_name:config.issuer.name,keys:[{key_id:material.keyId,alg:'ed25519',public_key:b64url(material.publicKeyRaw),role:'build',created_at:new Date().toISOString(),revoked_at:null}]}));
 const trap=join(fixture,'op-forbidden'),marker=join(fixture,'op-was-called');await Bun.write(trap,'#!/bin/sh\ntouch "'+marker+'"\nexit 99\n');await chmod(trap,0o700);
 const signer=Bun.spawn([process.execPath,join(root,'scripts/generated-page-seals.ts'),'--seal','--innsigle',cli],{cwd:fixture,env:{...process.env,INNSIGLE_BUILD_KEY:material.privateKeyPem,INNSIGLE_OP_BIN:trap},stdout:'inherit',stderr:'inherit'});if(await signer.exited)throw Error('Automated signer fixture failed');await run(['--check','--innsigle',cli],fixture);
 const child=Bun.spawn(['node',cli,'verify','--all'],{cwd:fixture,stdout:'pipe',stderr:'pipe'});const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);if(code)throw Error(out+err);
 let called=false;try{await access(marker);called=true;}catch{}if(called)throw Error('1Password command was invoked');
 console.log(JSON.stringify({outcome:'passed',pages:pages.length,signatures:'Real Ed25519 with ephemeral test key',onePasswordInvocations:0,checks:['Root, Actions and Reference pages sealed and verified','Public claims synchronized before verification','Build environment key only; no interactive signer']}));
}finally{
 if(previousKey===undefined)delete process.env.INNSIGLE_BUILD_KEY;else process.env.INNSIGLE_BUILD_KEY=previousKey;
 if(previousOp===undefined)delete process.env.INNSIGLE_OP_BIN;else process.env.INNSIGLE_OP_BIN=previousOp;
 await rm(fixture,{recursive:true,force:true});
}
