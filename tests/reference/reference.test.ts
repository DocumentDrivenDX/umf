// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect,afterAll} from 'bun:test';
import {resolve,join} from 'node:path';
import {unlink} from 'node:fs/promises';
import Ajv from 'ajv/dist/2020';
import {identity,aggregate,structuralDiff,search,assertJoins,exclude,type Evidence,type Entry} from '../../docs/helix/05-deploy/reference/model';
import {normalize,correspondence,observeRecordedHashes} from '../../scripts/reference/evidence';
import {rendererArguments,assertRendererInputs} from '../../scripts/reference/renderer-package';
import {checkBoundaries,allowed} from '../../scripts/reference/check-boundaries';
import {execute} from '../../docs/helix/05-deploy/reference/runtime';
const root=resolve(import.meta.dir,'../..'),dist=join(root,'docs/helix/05-deploy/microsite/dist/reference');
const index=await Bun.file(join(dist,'index.json')).json();
const sha=(s:string|Uint8Array)=>new Bun.CryptoHasher('sha256').update(s).digest('hex');
const entry=async(id:string)=>Bun.file(join(dist,index.entries.find((e:any)=>e.id===id).href)).json();
let interruptedDrift:{path:string;original:string}|undefined;
afterAll(async()=>{if(interruptedDrift){const {path,original}=interruptedDrift,current=await Bun.file(path).text();if(current===original+'\n<!-- deliberate drift -->\n')await Bun.write(path,original);else if(current!==original)throw Error('Unexpected page bytes during drift-test cleanup; preserving them');}});

// @covers US-089-AC1 @covers US-089-AC3
test('every extension version and its exact manifest/schema are present',async()=>{
 const discovered=await Array.fromAsync(new Bun.Glob('spec/extensions/*/package.json').scan({cwd:root}));expect(index.entries.filter((e:any)=>e.kind==='extension')).toHaveLength(discovered.length);
 for(const p of discovered){const m=await Bun.file(join(root,p)).json(),e=await entry(identity('extension',m.id,m.version));expect(e.data.manifest).toEqual(m);expect(e.data.schemaId).toBe(identity('schema',p.replace('package.json','schema.json'),''));}
 const sdk=await entry(identity('extension','umf.actions','0.1.0'));expect(sdk.data.registration.mode).toBe('sdk-default');expect((await entry(identity('extension','umf.ddd','0.1.0'))).data.registration.mode).toBe('explicit');
});
// @covers US-089-AC1 @covers US-089-AC2
test('all schema files and exact core profiles are accounted for',async()=>{
 const paths=(await Promise.all(['spec/core/**/*.json','spec/extensions/**/*.json','spec/projections/**/*.json'].map(p=>Array.fromAsync(new Bun.Glob(p).scan({cwd:root}))))).flat();let count=0;
 for(const path of paths){const value=await Bun.file(join(root,path)).json();if(!value?.$schema&&!value?.$id)continue;expect(index.entries.some((e:any)=>e.id===identity('schema',path,''))).toBe(true);count++;}expect(index.entries.filter((e:any)=>e.kind==='schema')).toHaveLength(count);
 const profiles=await Bun.file(join(root,'docs/helix/05-deploy/reference/profiles.json')).json();for(const p of profiles.coreProfiles)expect((await entry(identity('schema',p.schemaPath,''))).data.profileVersions).toEqual([p.version]);
 const current=await entry(identity('schema','spec/core/schema.json',''));for(const name of ['inspectCoreSchemaProperties','resolveCoreDefault'])expect(current.links).toContain(identity('api','.',name));expect(current.links).toContain(identity('example','core-semantic'));
});
// @covers US-089-AC1 @covers US-089-AC11
test('every emitted record validates, resolves its joins and matches signed-manifest asset closure',async()=>{
 const ajv=new Ajv({strict:true,allowUnionTypes:true}),schema=await Bun.file(join(root,'docs/helix/05-deploy/reference/schemas/entry.json')).json(),check=ajv.compile(schema);const records:Entry[]=[];
 for(const row of index.entries){const bytes=await Bun.file(join(dist,row.href)).bytes();expect(sha(bytes)).toBe(row.sha256);const e=JSON.parse(new TextDecoder().decode(bytes));if(!check(e))throw Error(JSON.stringify(check.errors));records.push(e as Entry);}expect(()=>assertJoins(records)).not.toThrow();
 const manifest=await Bun.file(join(dist,'manifest.json')).json();for(const o of manifest.outputs){const bytes=await Bun.file(join(dist,o.path)).bytes();expect(bytes.length).toBe(o.bytes);expect(sha(bytes)).toBe(o.sha256);}
 for(const view of ['index','core','extensions','integrations','api','examples','workbench']){const html=await Bun.file(join(dist,view+'.html')).text();expect(html).toContain(sha(await Bun.file(join(dist,'manifest.json')).bytes()));expect(html).toContain('integrity="sha256-');}
},30000);
// @covers US-089-AC4 @covers US-089-AC5
test('real independent oracle failures and qualified priority results remain separate',async()=>{
 const python=await entry(identity('integration','json-schema-python'));expect(python.data.evidence[0].outcome).toBe('mixed');expect(python.data.correspondence).toBe('unknown');
 for(const system of ['tablespec','postgresql','sqlserver','avro','parquet']){const e=await entry(identity('integration',system+'-field-native'));expect(e.data.evidence[0].outcome).toBe('passed');expect(e.data.evidence[0].closureComplete).toBe(false);}
 expect(normalize('protobuf-descriptor',{nativeDescriptorTextEquality:false})).toBe('failed');expect(()=>normalize('protobuf-descriptor',{files:['proof']})).toThrow();
 expect(()=>normalize('json-schema-python',{records:[]})).toThrow();
});
// @covers US-089-AC5
test('source hash changes and missing dependency closures cannot become current evidence',()=>{
 expect(correspondence(['source.ts'],[{path:'source.ts',sha256:'old'}],{'source.ts':'new'})).toBe('historical');
 expect(correspondence(['source.ts','lock'],[{path:'source.ts',sha256:'same'}],{'source.ts':'same'})).toBe('unknown');
 expect(correspondence(['source.ts'],[{path:'source.ts',sha256:'same'}],{'source.ts':'same'})).toBe('matching');
 expect(correspondence([],[],{})).toBe('unknown');
 expect(correspondence(['source.ts'],[{path:'source.ts',sha256:'same'},{path:'dist/umf.js',sha256:'recorded'}],{'source.ts':'same'})).toBe('unknown');
 expect(correspondence(['source.ts'],[{path:'source.ts',sha256:'old'},{path:'dist/umf.js',sha256:'recorded'}],{'source.ts':'new'})).toBe('historical');
});
// @covers US-089-AC5
test('ambient distribution artifacts never enter evidence observations',async()=>{
 const path='dist/reference-evidence-ambient-control.txt',file=join(root,path);
 if(await Bun.file(file).exists())throw Error('Control path already exists');
 const hashes=[{path,sha256:'recorded'},{path:'./'+path,sha256:'recorded'},{path:'.//'+path,sha256:'recorded'}];
 try{
  expect(await observeRecordedHashes(hashes)).toEqual({});
  await Bun.write(file,'first ambient build');expect(await observeRecordedHashes(hashes)).toEqual({});
  await Bun.write(file,'different host/build bytes');expect(await observeRecordedHashes(hashes)).toEqual({});
 }finally{if(await Bun.file(file).exists())await unlink(file);}
});
// @covers US-089-AC5
test('conflicting observations and supersession cycles refuse optimistic aggregation',()=>{
 const a={id:'a',scope:'exact subset',outcome:'passed',correspondence:'matching',supersedes:[]} as unknown as Evidence,b={...a,id:'b',outcome:'failed'} as Evidence;
 expect(aggregate([a,b]).correspondence).toBe('conflicting');expect(aggregate([a,{...b,supersedes:['a']}]).correspondence).toBe('matching');
 expect(()=>aggregate([{...a,supersedes:['b']},{...b,supersedes:['a']}])).toThrow('cyclic');
 expect(()=>aggregate([{...a,supersedes:['missing']}])).toThrow('missing');
});
// @covers US-089-AC2
test('schema comparison is structural, bounded and preserves exact token spelling',()=>{
 expect(structuralDiff({integerToken:'9007199254740993'},{integerToken:'9007199254740994'})[0]).toEqual({pointer:'/integerToken',change:'changed',before:'9007199254740993',after:'9007199254740994'});
 expect(structuralDiff({fields:['a','b']},{fields:['b','a']})).toHaveLength(1);
 expect(search(index.entries,'umf.ddd','extension').length).toBeGreaterThan(0);
});
// @covers US-089-AC1
test('exclusions require an existing source and nonempty reason',()=>{
 const e={id:'x',sources:[{path:'schema.json'}]} as Entry;expect(exclude([e],[{path:'schema.json',reason:'Reviewed obsolete standalone profile'}])).toHaveLength(0);
 expect(()=>exclude([e],[{path:'missing.json',reason:'Absent'}])).toThrow('invalid exclusion');expect(()=>exclude([e],[{path:'schema.json',reason:''}])).toThrow('invalid exclusion');
});
// @covers US-089-AC6 @covers US-089-AC7 @covers US-089-AC8
test('public Bun runtime preserves unknown payload, validates current core and refuses unsafe input',async()=>{
 const expected=await Bun.file(join(root,'docs/helix/05-deploy/reference/examples/expected.json')).json();
 const source=await Bun.file(join(root,'docs/helix/05-deploy/reference/examples/unknown.json')).text();const request={protocol:1 as const,requestId:'test',operationId:'core-write',coreProfile:'0.10.0',registryProfile:'empty',inputs:{source}};
 const result=await execute(request);expect(result.state).toBe('completed');expect(result.outputs[0]!.text.includes('keepMe')).toBe(expected.unknownPayloadRetained);expect(result.diagnostics.some(d=>d.code==='UNKNOWN_EXTENSION')).toBe(true);
 const invalid=await execute({...request,inputs:{source:'{broken'}});expect(invalid.state==='refused').toBe(expected.malformedInputRefused);expect(invalid.retainedSources[0]!.text).toBe('{broken');expect(invalid.outputs).toHaveLength(0);
 const over=await execute({...request,inputs:{source:'x'.repeat(4_000_001)}});expect(over.state).toBe('refused');expect(over.diagnostics[0]!.code).toBe('REFERENCE_LIMIT');
 const uuid=await Bun.file(join(root,'docs/helix/05-deploy/reference/examples/uuid.json')).text();expect((await execute({...request,operationId:'core-validate',coreProfile:'0.10.0',inputs:{source:uuid}})).state).toBe('completed');
});
// @covers US-089-AC1 @covers US-089-AC10
test('boundary checker rejects actual forbidden source and import cycle injections',async()=>{
 const dir=join(root,'docs/helix/05-deploy/reference/model'),a=join(dir,'negative-a.ts'),b=join(dir,'negative-b.ts');
 try{await Bun.write(a,"import fs from 'node:fs';\n");await expect(checkBoundaries()).rejects.toThrow('forbidden import');await Bun.write(a,"import './negative-b';\n");await Bun.write(b,"import './negative-a';\n");await expect(checkBoundaries()).rejects.toThrow('cycle');}
 finally{for(const path of [a,b])if(await Bun.file(path).exists())await unlink(path);}
 expect((await checkBoundaries()).files).toBeGreaterThan(10);
});

// @covers US-089-AC10
test('a second isolated generation matches; drift check refuses tampering without rewriting',async()=>{
 const manifest=await Bun.file(join(dist,'manifest.json')).text();
 const check=()=>{const child=Bun.spawn(['bun','scripts/reference/build.ts','--check',...(process.env.UMF_REFERENCE_CANDIDATE?['--candidate',process.env.UMF_REFERENCE_CANDIDATE]:[])],{cwd:root,stdout:'pipe',stderr:'pipe'});return Promise.all([child.exited,new Response(child.stderr).text(),new Response(child.stdout).text()]);};
 const good=await check();if(good[0]!==0)throw Error(String(good[1]));expect(await Bun.file(join(dist,'manifest.json')).text()).toBe(manifest);
 const path=join(dist,'index.html'),original=await Bun.file(path).text();
 try{interruptedDrift={path,original};await Bun.write(path,original+'\n<!-- deliberate drift -->\n');const bad=await check();expect(bad[0]).not.toBe(0);expect(String(bad[1])).toContain('REFERENCE_DRIFT');expect(await Bun.file(path).text()).toBe(original+'\n<!-- deliberate drift -->\n');}
 finally{await Bun.write(path,original);interruptedDrift=undefined;}
},600000);

// @covers US-089-AC11 -- host-neutral compiler notices remain source-bound.
test('reference manifest retains every Protobuf notice producer input',async()=>{
 const manifest=await Bun.file(join(dist,'manifest.json')).json();
 for(const path of ['scripts/build-protobuf.ts','scripts/build-postgresql.ts','scripts/protobuf-module-notices.ts','native/protobuf/go.mod','native/protobuf/go.sum']){
  const record=manifest.inputs.find((i:any)=>i.path===path);expect(record).toBeDefined();
  expect(record.sha256).toBe(sha(await Bun.file(join(root,path)).bytes()));
 }
});

// Candidate admission is explicit; the installed consumer pin is never an implicit fallback.
test('reference renderer candidate arguments reject missing, repeated and unknown options',()=>{
 expect(allowed('scripts/reference/renderer-package.ts','scripts/schema-browser-integrity.ts')).toBe(true);
 expect(allowed('scripts/reference/build.ts','scripts/schema-browser-integrity.ts')).toBe(false);
 expect(allowed('docs/helix/05-deploy/microsite/reference/index.ts','scripts/schema-browser-integrity.ts')).toBe(false);
 expect(()=>assertRendererInputs([{path:'installed/index.js',sha256:'old'}],'mounted',{'index.js':'current'})).toThrow('REFERENCE_RENDERER');
 expect(()=>assertRendererInputs([{path:'mounted/index.js',sha256:'old'}],'mounted',{'index.js':'current'})).toThrow('REFERENCE_RENDERER');
 expect(()=>assertRendererInputs([{path:'mounted/index.js',sha256:'current'}],'mounted',{'index.js':'current'})).not.toThrow();
 expect(rendererArguments([])).toEqual({check:false,candidate:undefined});
 expect(rendererArguments(['--check'])).toEqual({check:true,candidate:undefined});
 for(const args of [['--candidate'],['--candidate','--check'],['--check','--check'],['--unpublished']])expect(()=>rendererArguments(args)).toThrow('REFERENCE_INPUT');
 expect(rendererArguments(['--candidate','/private/tmp/concrete-renderer','--check'])).toEqual({check:true,candidate:'/private/tmp/concrete-renderer'});
});
