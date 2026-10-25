// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {generatePythonClient} from '../src/access';
import {createPythonClientRustCandidateV3} from '../src/node-v3';
import {tableOperationSource} from '../tests/unified/table-operation-fixture';

const probeUrl=new URL('./rust-migration/r7/codegen-host-read-gate0-probe.mjs',import.meta.url);
const {runLegacyReadProbe}=await import(probeUrl.href) as {runLegacyReadProbe:(generate:typeof generatePythonClient,commerce:string,nativeTable:string)=>unknown};

const source=await Bun.file(new URL('../tests/unified/commerce.json',import.meta.url)).text();
const nativeTable=JSON.stringify(tableOperationSource());
const canonical=(value:unknown):string=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);

test('packed V3 repair candidate preserves all frozen Gate 0 observations',async()=>{
 const generator=await createPythonClientRustCandidateV3();
 expect(runLegacyReadProbe(generator,source,nativeTable)).toEqual(runLegacyReadProbe(generatePythonClient,source,nativeTable));
});

test('V3 defers records getter until after the legacy-action semantic refusal',async()=>{
 const generator=await createPythonClientRustCandidateV3();
 const document=JSON.parse(source);
 document.modules[0].actions=[{id:'legacy-action'}];
 let recordReads=0;
 let caught:unknown;
 try{generator({text:JSON.stringify(document),package:'shop',get records(){recordReads++;throw new Error('records must remain behind legacy-action gate');}} as any);}
 catch(error){caught=error;}
 expect(recordReads).toBe(0);
 expect(caught).toMatchObject({code:'ACCESS_UNSUPPORTED'});
});

test('V3 preserves a late output package getter containing an unpaired UTF-16 unit',async()=>{
 const generator=await createPythonClientRustCandidateV3();
 let reads=0;
 const result=generator({text:source,get package(){reads++;return reads<=4?'shop':'x\ud800';}} as any);
 expect(reads).toBe(11);
 expect(result.files[0]?.path).toBe('x\ud800/__init__.py');
 expect(result.files.map(file=>file.path)).toContain('x\ud800/source.json');
});

test('V3 preserves control failures while decoding host reads and recovers',async()=>{
 let recordsRead=false;
 let throwFromMeter=true;
 const generator=await createPythonClientRustCandidateV3({controls:{meter(){if(recordsRead&&throwFromMeter){throwFromMeter=false;throw new Error('meter failed during host-response decode');}}}});
 const request={text:source,package:'shop',get records(){recordsRead=true;return [{module:'commerce',element:'Customer'}];}};
 let caught:unknown;
 try{generator(request as any);}catch(error){caught=error;}
 expect(caught).toMatchObject({code:'METER_FAILURE'});
 const recovered=generator({text:source,package:'shop',records:[{module:'commerce',element:'Customer'}]} as any);
 expect(recovered.files.length).toBeGreaterThan(0);
});

test('V3 preserves lone-surrogate selected record IDs through the late missing-record error',async()=>{
 const generator=await createPythonClientRustCandidateV3();
 const request={text:source,package:'shop',records:[{module:'\ud800',element:'x'}]};
 const observe=(run:typeof generatePythonClient)=>{try{return {ok:true,value:run(request as any)}}catch(error){const value=error as Error&{code?:string;path?:string};return {ok:false,code:value.code,path:value.path,message:value.message}}};
 expect(observe(generator)).toEqual(observe(generatePythonClient));
 expect(observe(generator)).toMatchObject({ok:false,code:'ACCESS_UNSUPPORTED',path:'\ud800.x',message:'Selected Record not found'});
});

test('V3 preserves lone-surrogate selected action IDs through the late missing-action error',async()=>{
 const generator=await createPythonClientRustCandidateV3();
 const request={text:source,package:'shop',actions:[{module:'\ud800',action:'x'}]};
 const observe=(run:typeof generatePythonClient)=>{try{return {ok:true,value:run(request as any)}}catch(error){const value=error as Error&{code?:string;path?:string};return {ok:false,code:value.code,path:value.path,message:value.message}}};
 expect(observe(generator)).toEqual(observe(generatePythonClient));
 expect(observe(generator)).toMatchObject({ok:false,code:'ACCESS_UNSUPPORTED',path:'\ud800.x',message:'Selected Action not found'});
});

test('V3 repair candidate still matches the frozen 31-request R3 corpus',async()=>{
 const generator=await createPythonClientRustCandidateV3();
 const corpus=JSON.parse(await Bun.file(new URL('../docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json',import.meta.url)).text());
 const cases=corpus.cases.filter((item:any)=>item.operation==='generatePythonClient');
 for(const item of cases){
  let actual:any;
  try{actual={ok:true,result:generator(item.request)};}
  catch(error){const value=error as Error&{code?:string;path?:string};actual={ok:false,error:{code:value.code,message:value.message,path:value.path}};}
  expect(canonical(actual)).toBe(canonical(item.expected));
 }
 expect(cases).toHaveLength(31);
});
