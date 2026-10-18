import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {buildKey,checkGeneratedClaim,checkInventory,run} from '../scripts/generated-page-seals';

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
 await expect(run(['--verify-curated'])).rejects.toThrow('GENERATED_SEAL_ARGUMENT');
});
test('missing build secret fails explicitly without attempting a manual signer',async()=>{
 const previous=process.env.INNSIGLE_BUILD_KEY;delete process.env.INNSIGLE_BUILD_KEY;
 try{await expect(run(['--seal'])).rejects.toThrow('INNSIGLE_BUILD_KEY is required');}finally{if(previous===undefined)delete process.env.INNSIGLE_BUILD_KEY;else process.env.INNSIGLE_BUILD_KEY=previous;}
});
