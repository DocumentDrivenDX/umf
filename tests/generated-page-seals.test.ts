import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildKey,checkGeneratedClaim,checkInventory,checkExistingClaims,generatedClaimName,run} from '../scripts/generated-page-seals';

test('site publication requires only the registered build environment signer',()=>{
 const keys={keys:[{key_id:'build',role:'build'}]},config={issuer:{key_id:'build'},keys:{build:{key_id:'build'}}};
 expect(buildKey(config,keys)).toBe('build');
 for(const invalid of [{issuer:{key_id:'human'},keys:config.keys},{issuer:config.issuer},{...config,keys:{build:{key_id:'unknown'}}},{...config,onepassword:{private_key_ref:'op://legacy/key'}},{...config,keys:{...config.keys,human:{key_id:'human'}}},{...config,signing_key:'legacy.pem'},{...config,keys:{build:{key_id:'build',onepassword:'op://legacy/build'}}}])expect(()=>buildKey(invalid,keys)).toThrow();
 expect(()=>buildKey(config,{keys:[{key_id:'build',role:'human'}]})).toThrow();
 expect(()=>buildKey(config,{keys:[{key_id:'build',role:'build',revoked_at:'2026-10-18'}]})).toThrow();
});
test('complete site inventory includes root, Actions and Reference with no unsigned exceptions',()=>{
 const pages=['docs/helix/05-deploy/microsite/dist/index.html','docs/helix/05-deploy/microsite/dist/actions/index.html','docs/helix/05-deploy/microsite/dist/reference/index.html'];
 expect(()=>checkInventory(pages,pages)).not.toThrow();
 for(const declared of [[],[...pages,...pages],[...pages,'outside.html'],[...pages,'docs/helix/05-deploy/microsite/dist/reference/../index.html'],pages.slice(1)])expect(()=>checkInventory(declared,pages)).toThrow();
 expect(()=>checkInventory(pages,[...pages,'docs/helix/05-deploy/microsite/dist/explorer.html'])).toThrow();
});
test('existing public claims must name actual pages without requiring future seals',()=>{
 const pages=['docs/helix/05-deploy/microsite/dist/index.html','docs/helix/05-deploy/microsite/dist/actions/index.html','docs/helix/05-deploy/microsite/dist/reference/core.html'];
 const claims=pages.map(generatedClaimName);
 expect(claims).toEqual(['index-html.attestation.json','actions-index-html.attestation.json','reference-core-html.attestation.json']);
 for(const existing of [[],claims.slice(0,1),claims])expect(()=>checkExistingClaims(pages,existing)).not.toThrow();
 for(const orphan of ['explorer-html.attestation.json','schema-browser-html.attestation.json','unknown.json'])expect(()=>checkExistingClaims(pages,[...claims,orphan])).toThrow('GENERATED_SEAL_ORPHAN');
});
test('inventory refuses orphan JSON before sealing while empty or partial claims remain admissible',async()=>{
 const root=await mkdtemp(join(tmpdir(),'umf-page-claim-inventory-'));
 try{
  const site='docs/helix/05-deploy/microsite/dist',pages=[site+'/index.html',site+'/actions/index.html',site+'/reference/core.html'];
  const configs:Record<string,unknown>={
   '.innsigle/config.json':{issuer:{key_id:'build'},keys:{build:{key_id:'build'}},content_globs:[site+'/*.html',site+'/actions/*.html',site+'/reference/*.html'],default_composition:'model-primary',kind_from_frontmatter:false},
   '.innsigle/public/keys.json':{keys:[{key_id:'build',role:'build'}]},
   '.innsigle/generated-pages.json':{profile:'umf.generated-page-seals/1',files:pages},
   '.innsigle/generated-colo.json':{composition:'model-primary'},
  };
  for(const [path,value] of Object.entries(configs))await Bun.write(join(root,path),JSON.stringify(value));
  for(const page of pages)await Bun.write(join(root,page),'<!doctype html><title>Inventory fixture</title>');
  await expect(run(['--inventory'],root)).resolves.toBeUndefined();
  const claims=join(root,'.innsigle/public/claims');await mkdir(claims,{recursive:true});
  await Bun.write(join(claims,'index-html.attestation.json'),'{}');
  // Endorsements live separately and must not be mistaken for page claims.
  await Bun.write(join(root,'.innsigle/public/endorsements/build.json'),'{}');
  await expect(run(['--inventory'],root)).resolves.toBeUndefined();
  await expect(run(['--check'],root)).rejects.toThrow('GENERATED_SEAL_DIGEST');
  for(const orphan of ['explorer-html.attestation.json','schema-browser-html.attestation.json','unrelated.json']){
   const path=join(claims,orphan);await Bun.write(path,'{}');
   await expect(run(['--inventory'],root)).rejects.toThrow('GENERATED_SEAL_ORPHAN public claims have no configured page: '+orphan);
   await rm(path);
  }
  const served=join(root,site,'.well-known/innsigle/claims');
  await Bun.write(join(served,'index-html.attestation.json'),'{}');
  await expect(run(['--inventory'],root)).resolves.toBeUndefined();
  for(const orphan of ['explorer-html.attestation.json','schema-browser-html.attestation.json']){
   const path=join(served,orphan);await Bun.write(path,'{}');
   await expect(run(['--inventory'],root)).rejects.toThrow('GENERATED_SEAL_ORPHAN public claims have no configured page: '+orphan);
   await rm(path);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
test('valid digest cannot hide a human signer or mixed claim on any site page',()=>{
 const bytes=Buffer.from('site HTML'),colophon={composition:'model-primary'},claim={payload:{issuer:{key_id:'build'},subjects:[{digest:{alg:'sha256',value:createHash('sha256').update(bytes).digest('hex')}}],colophon},signatures:[{key_id:'build'}]};
 expect(()=>checkGeneratedClaim(bytes,claim,'build',colophon)).not.toThrow();
 expect(()=>checkGeneratedClaim(Buffer.from('changed'),claim,'build',colophon)).toThrow();
 const human=structuredClone(claim);human.payload.issuer.key_id='human';human.signatures[0]!.key_id='human';expect(()=>checkGeneratedClaim(bytes,human,'build',colophon)).toThrow();
 const mixed=structuredClone(claim);mixed.payload.colophon.composition='mixed';expect(()=>checkGeneratedClaim(bytes,mixed,'build',colophon)).toThrow();
});
test('actual publication inventory and workflow require no interactive credentials',async()=>{
 await run(['--inventory']);
 const config=await Bun.file('.innsigle/config.json').json(),colo=await Bun.file('.innsigle/colo.json').json(),workflow=await Bun.file('.github/workflows/microsite.yml').text();
 expect(config.onepassword).toBeUndefined();expect(Object.keys(config.keys)).toEqual(['build']);expect(config.issuer.key_id).toBe(config.keys.build.key_id);expect(colo.composition).toBe('model-primary');
 expect(workflow).not.toContain('--verify-curated');expect(workflow).toContain('INNSIGLE_BUILD_KEY: ${{ secrets.INNSIGLE_BUILD_KEY }}');
 expect(workflow.indexOf('bun scripts/generated-page-seals.ts --inventory')).toBeLessThan(workflow.indexOf('bun run check:metamodel'));
 await expect(run(['--verify-curated'])).rejects.toThrow('GENERATED_SEAL_ARGUMENT');
});
test('missing build secret fails explicitly without attempting a manual signer',async()=>{
 const previous=process.env.INNSIGLE_BUILD_KEY;delete process.env.INNSIGLE_BUILD_KEY;
 try{await expect(run(['--seal'])).rejects.toThrow('INNSIGLE_BUILD_KEY is required');}finally{if(previous===undefined)delete process.env.INNSIGLE_BUILD_KEY;else process.env.INNSIGLE_BUILD_KEY=previous;}
});
