// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {resolve} from 'node:path';
import {parseEntry} from '../../docs/helix/05-deploy/microsite/explorer-model';
const root=resolve(import.meta.dir,'../..');
const site=root+'/docs/helix/05-deploy/microsite';
const source=await Bun.file(site+'/catalog-sources/legal/ontology.json').text();
const entry={id:'legal-current',title:'Legal',category:'domain',path:'legal.json',format:'json',text:source} as const;
const digest=(text:string)=>new Bun.CryptoHasher('sha256').update(text).digest('hex');

test('site source profiles and retained legal ontology use actual current core only',async()=>{
 const profiles=await Bun.file(root+'/docs/helix/05-deploy/reference/profiles.json').json();
 expect(profiles.coreProfiles.map((profile:any)=>profile.version)).toEqual(['0.10.0']);
 const parsed=parseEntry(entry);expect(parsed.valid).toBe(true);expect(parsed.document!.umf).toBe('0.10.0');
 expect(source).toBe(await Bun.file(root+'/spec/domain-packs/legal/ontology.json').text());
 const catalog=await Bun.file(site+'/dist/schema-catalog.json').json();
 const versions=catalog.entries.flatMap((entry:any)=>{try{const value=JSON.parse(entry.text);return typeof value.umf==='string'?[value.umf]:[]}catch{return []}});
 expect(new Set(versions)).toEqual(new Set(['0.10.0']));
 expect(catalog.entries.some((entry:any)=>entry.id==='fixtures/core/schema-properties.json')).toBe(false);
 expect(catalog.entries.some((entry:any)=>entry.id==='docs/helix/05-deploy/reference/examples/orders.json')).toBe(true);
 const builder=await Bun.file(site+'/build-explorer.ts').text();
 expect(builder).not.toContain("const path='fixtures/core/schema-properties.json'");
 const provenance=await Bun.file(site+'/catalog-sources/legal/provenance.json').json();
 expect(provenance.files['ontology.json']).toBe(digest(source));
 expect(provenance.current_source_derivation.changed_json_pointers).toEqual(['/umf']);
 expect(provenance.current_source_derivation.original_snapshot_sha256).not.toBe(digest(source));
});

test('schema explorer refuses retired core markers without replacing source meaning',()=>{
 const current=JSON.parse(source);
 for(const umf of ['0.7.0','0.8.0','0.9.0'])expect(()=>parseEntry({...entry,text:JSON.stringify({...current,umf})})).toThrow();
 expect(JSON.parse(source).umf).toBe('0.10.0');
});

test('published navigation and build no longer select the retired mutation owners',async()=>{
 const index=await Bun.file(site+'/dist/index.html').text();
 const docs=await Bun.file(site+'/dist/docs.html').text();
 expect(index).not.toContain('href="action-compiler.html"');
 expect(index).toContain('href="reference/workbench.html"');
 expect(docs).toContain('core 0.10.0 only');
 expect(docs).not.toContain('Core 0.8.0 adds');
 expect(docs).not.toContain('Download the current SDK');
 const workflow=await Bun.file(root+'/.github/workflows/microsite.yml').text();
 for(const name of ['build-truss-browser.ts','build-action-compiler.ts','verify-action-compiler.ts','tsconfig.actions.json'])expect(workflow).not.toContain(name);
 expect(workflow).toContain('rm -rf docs/helix/05-deploy/microsite/dist/action-compiler docs/helix/05-deploy/microsite/dist/truss-browser');
 expect(workflow).toContain('Build browser playground');expect(workflow).toContain('Build generated reference and fixed browser tools');
 expect(workflow.indexOf('Remove retired pre-0.10')).toBeLessThan(workflow.indexOf('bun scripts/generated-page-seals.ts --inventory'));
 const signing=await Bun.file(root+'/.innsigle/generated-pages.json').json();
 expect(signing.files).not.toContain('docs/helix/05-deploy/microsite/dist/action-compiler.html');
 const inertTypes=await Bun.file(site+'/action-runtime-assets.d.ts').text();expect(inertTypes).not.toContain('MutationCompiler');expect(inertTypes).not.toContain('buildBrowserAssets');expect(inertTypes).toContain('interface LoadInput');
 expect(await Bun.file(root+'/.innsigle/public/claims/action-compiler-html.attestation.json').exists()).toBe(false);
 expect(await Bun.file(site+'/dist/.well-known/innsigle/claims/action-compiler-html.attestation.json').exists()).toBe(false);
 for(const name of ['action-compiler.ts','action-compiler.html','build-action-compiler.ts','build-truss-browser.ts','truss-catalog-worker.ts','verify-action-compiler.ts'])expect(await Bun.file(site+'/'+name).exists()).toBe(false);
});

test('local preview refuses old generated demo assets even before publication cleanup',async()=>{
 const original=Bun.serve;let fetcher:((request:Request)=>Promise<Response>)|undefined;
 try{
  Bun.serve=((config:any)=>{fetcher=config.fetch;return {port:4178}}) as any;
  await import('../../docs/helix/05-deploy/microsite/serve');
 }finally{Bun.serve=original;}
 expect(fetcher).toBeDefined();
 for(const path of ['/action-compiler.html','/action-compiler.js','/action-compiler/model.json','/truss-browser/store.js','/truss-catalog-worker.js']){
  expect((await fetcher!(new Request('http://127.0.0.1'+path))).status).toBe(404);
 }
 expect((await fetcher!(new Request('http://127.0.0.1/'))).status).toBe(200);
});
