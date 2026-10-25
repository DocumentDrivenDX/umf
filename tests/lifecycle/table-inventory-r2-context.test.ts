// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {canonical,canonicalCharged} from '../../src/compilation/bundle/hash';
import {compileTableDeployment} from '../../src/table-deployment';
import {legalSource} from './legal-fixture';
import {readJsonDocumentWithAccounting} from '../../src/model/document-accounting';
import {scanJsonFrameCharged} from '../../src/model/internal/scan-json-frame';
import {inspectR2InventorySourceContext,prepareR2InventorySourceContext} from '../../src/table-migration/inventory';
import {
 ownR2HistoryComponent,ownR2HistoryExecutionWrapper,ownedR2HistoryByteLength,ownedR2HistoryMember,parseR2DiscoverySelectorShape,R2_CONTEXT_BYTE_LIMIT,R2_WORK_EVENT_UNITS,R2_WORK_LIMIT,R2WorkLimitError,R2WorkMeter,snapshotR2HistoryJson,snapshotR2Json,snapshotR2SourceData,
} from '../../src/table-migration/inventory-r2-context';

const emptySelector={
 version:'umf.table-inventory-discovery/0.2',tableIntents:[],conversions:[],
 retiredSeedSets:[],retirements:[],restorations:[],archiveSources:[],tableArchiveSources:[],
} as const;

class RecordingR2WorkMeter extends R2WorkMeter {
 readonly events:{name:keyof typeof R2_WORK_EVENT_UNITS;count:number;path:string}[]=[];
 override charge(event:string,count=1,path='/'):void{
  if(Object.hasOwn(R2_WORK_EVENT_UNITS,event))this.events.push({name:event as keyof typeof R2_WORK_EVENT_UNITS,count,path});super.charge(event,count,path);
 }
}

test('R2-RA-01 ordinary object and array keep valid unknown JSON properties',()=>{
 const raw={unknown:{items:[1,'λ']}};const snapshot=snapshotR2Json(raw,new R2WorkMeter(),'/raw');
 expect(snapshot.value.unknown.items).toEqual([1,'λ']);expect(snapshot.canonical).toContain('unknown');
});

test('R2-RA-02 accessors, hidden keys, symbols and custom prototypes refuse without getter calls',()=>{
 let calls=0;const accessor={};Object.defineProperty(accessor,'x',{enumerable:true,get(){calls++;return 1;}});
 const hidden={x:1};Object.defineProperty(hidden,'y',{value:2,enumerable:false});
 expect(()=>snapshotR2Json(accessor as any,new R2WorkMeter(),'/accessor')).toThrow(/CONTEXT_DESCRIPTOR/);
 expect(()=>snapshotR2Json(hidden as any,new R2WorkMeter(),'/hidden')).toThrow(/CONTEXT_DESCRIPTOR/);
 expect(()=>snapshotR2Json({x:1,[Symbol('s')]:2} as any,new R2WorkMeter(),'/symbol')).toThrow(/CONTEXT_SYMBOL/);
 expect(()=>snapshotR2Json(Object.create({inherited:1}) as any,new R2WorkMeter(),'/prototype')).toThrow(/CONTEXT_PROTOTYPE/);
 expect(calls).toBe(0);
});

test('R2-RA-03 each admitted object charges one captured own-key result and one descriptor per string key',()=>{
 const meter=new RecordingR2WorkMeter();snapshotR2Json({a:1},meter,'/one');
 expect(meter.events.filter(event=>event.name==='rawOwnKeysCall')).toEqual([{name:'rawOwnKeysCall',count:1,path:'/one'}]);
 expect(meter.events.filter(event=>event.name==='rawOwnKeysResult')).toEqual([{name:'rawOwnKeysResult',count:1,path:'/one'}]);
 expect(meter.events.filter(event=>event.name==='ownPropertyDescriptor')).toEqual([{name:'ownPropertyDescriptor',count:1,path:'/one'}]);
});

test('R2-RA-04 exact own-key extent includes symbols and array length before rejection',()=>{
 const meter=new RecordingR2WorkMeter();
 expect(()=>snapshotR2Json({x:1,[Symbol('hidden')]:2} as any,meter,'/symbol')).toThrow(/CONTEXT_SYMBOL/);
 expect(meter.events.find(event=>event.name==='rawOwnKeysResult')).toEqual({name:'rawOwnKeysResult',count:2,path:'/symbol'});
 const arrayMeter=new RecordingR2WorkMeter();snapshotR2Json([1],arrayMeter,'/array');
 expect(arrayMeter.events.find(event=>event.name==='rawOwnKeysResult')).toEqual({name:'rawOwnKeysResult',count:2,path:'/array'});
});

test('R2-RA-05 actual near-limit own-key result overflow refuses before descriptors',()=>{
 let getterCalls=0;const raw:any={visible:1};
 Object.defineProperty(raw,'hidden',{enumerable:false,get(){getterCalls++;return 2;}});
 raw[Symbol('extension')]=3;
 const meter=new RecordingR2WorkMeter();meter.charge('jsonNode',999_997,'/preloaded');
 let caught:unknown;
 try{snapshotR2Json(raw,meter,'/budget');}catch(error){caught=error;}
 expect(caught).toBeInstanceOf(R2WorkLimitError);
 expect(caught).toMatchObject({path:'/budget',dimension:'work'});
 expect(meter.events.find(event=>event.name==='rawOwnKeysResult')).toEqual({name:'rawOwnKeysResult',count:3,path:'/budget'});
 expect(meter.events.some(event=>event.name==='ownPropertyDescriptor')).toBe(false);
 expect(getterCalls).toBe(0);
});

test('R2-RA-06 nested raw nodes each use their own one-call boundary',()=>{
 const meter=new RecordingR2WorkMeter();snapshotR2Json({outer:{inner:1}},meter,'/nested');
 expect(meter.events.filter(event=>event.name==='rawOwnKeysCall')).toHaveLength(2);
 expect(meter.events.filter(event=>event.name==='rawOwnKeysResult').map(event=>event.count)).toEqual([1,1]);
});

test('R2-RA-07 descriptor work is charged before getter-safe data-property refusal',()=>{
 let getterCalls=0;const raw={};Object.defineProperty(raw,'bad',{enumerable:true,get(){getterCalls++;return 1;}});
 const meter=new RecordingR2WorkMeter();expect(()=>snapshotR2Json(raw as any,meter,'/descriptor')).toThrow(/CONTEXT_DESCRIPTOR/);
 expect(meter.events.find(event=>event.name==='ownPropertyDescriptor')).toBeDefined();expect(getterCalls).toBe(0);
});

test('R2-RA-08 array length is accounted but keeps its original special treatment',()=>{
 const meter=new RecordingR2WorkMeter();expect(snapshotR2Json([1,2],meter,'/array').value).toEqual([1,2]);
 expect(meter.events.find(event=>event.name==='rawOwnKeysResult')?.count).toBe(3);
 expect(meter.events.filter(event=>event.name==='ownPropertyDescriptor')).toHaveLength(3);
});

test('R2-RA-09 oversized key byte refusal reports the container without expanding a key path',()=>{
 // Keep the original enumerable-key byte-overflow case: this reaches key-byte
 // admission and proves the byte limit itself refuses before child-path growth.
 const enumerable:any={};Object.defineProperty(enumerable,'k'.repeat(8192),{value:1,enumerable:true});
 const enumerableMeter=new R2WorkMeter();enumerableMeter.chargeBytes(R2_CONTEXT_BYTE_LIMIT-1,'/prefill');
 let enumerableCaught:unknown;try{snapshotR2Json(enumerable,enumerableMeter,'/bounded');}catch(error){enumerableCaught=error;}
 expect(enumerableCaught).toMatchObject({path:'/bounded',dimension:'bytes'});
 for(const descriptor of ['hidden','accessor'] as const){
  let getterCalls=0;const raw:any={};const key='k'.repeat(8192);
  Object.defineProperty(raw,key,descriptor==='hidden'?{value:1,enumerable:false}:{enumerable:true,get(){getterCalls++;return 1;}});
  const meter=new R2WorkMeter();meter.chargeBytes(R2_CONTEXT_BYTE_LIMIT-1,'/prefill');
  let caught:unknown;try{snapshotR2Json(raw,meter,'/bounded');}catch(error){caught=error;}
  expect(caught).toMatchObject({message:'R2_CONTEXT_DESCRIPTOR:/bounded'});
  expect((caught as Error).message.length).toBeLessThan(64);expect(getterCalls).toBe(0);
 }
});

test('R2-RA-10 valid __proto__ extension is copied as inert JSON data',()=>{
 const raw=JSON.parse('{"__proto__":{"safe":true}}') as Record<string,unknown>;
 const owned=snapshotR2Json(raw as any,new R2WorkMeter(),'/proto').value as any;
 expect(Object.getPrototypeOf(owned)).toBeNull();expect(owned.__proto__.safe).toBe(true);
});

test('R2-RA-11 caller mutation cannot change a private root-owned shape snapshot',()=>{
 const raw={first:1,second:{value:2}};const snapshot=snapshotR2Json(raw,new R2WorkMeter(),'/root');
 raw.second.value=9;raw.first=8;
 expect(snapshot.value).toEqual({first:1,second:{value:2}});
});

test('R2-RA-12 original numeric and depth ceilings remain in force',()=>{
 expect(()=>snapshotR2Json(-0 as any,new R2WorkMeter(),'/number')).toThrow(/CONTEXT_NUMBER/);
 let value:any=0;for(let i=0;i<129;i++)value={next:value};
 expect(()=>snapshotR2Json(value,new R2WorkMeter(),'/depth')).toThrow(/CONTEXT_JSON_LIMIT/);
});

test('R2 component depth starts at each component root before bundle-envelope validation',()=>{
 const nested=(levels:number)=>{let value:any=0;for(let i=0;i<levels;i++)value={next:value};return value;};
 const history={profile:'umf.table-inventory-source-history/0.1',plans:[],executions:[]};
 const input={previous:nested(128),next:[],history,selector:emptySelector};
 // The depth-128 component is admitted; validation then rejects its non-bundle
 // envelope at the earlier `previous` component before reaching `next`.
 expect(()=>snapshotR2SourceData(input,new R2WorkMeter())).toThrow('R2_BUNDLE_ENVELOPE:/previous');
});

test('R2 component value ceilings are applied per owned component under one meter',()=>{
 const history={profile:'umf.table-inventory-source-history/0.1',plans:[],executions:[]};
 // Each array component is below its original 100,000-value bound. Their
 // aggregate exceeds it; the unchanged shared work ceiling can refuse first.
 const input={previous:new Array(50_000).fill(null),next:new Array(50_000).fill(null),history,selector:emptySelector};
 let caught:unknown;try{snapshotR2SourceData(input,new R2WorkMeter());}catch(error){caught=error;}
 expect(caught).toBeInstanceOf(R2WorkLimitError);
 expect(caught).toMatchObject({dimension:'work'});
});

test('R2 selector .2 is closed and excludes future review/compiler selectors',()=>{
 expect(parseR2DiscoverySelectorShape(emptySelector).version).toBe('umf.table-inventory-discovery/0.2');
 expect(()=>parseR2DiscoverySelectorShape({...emptySelector,defaultChanges:[]})).toThrow(/SELECTOR_PROFILE_OR_KEYS/);
 expect(()=>parseR2DiscoverySelectorShape({...emptySelector,tableArchiveSources:[{archive:{},materials:[]}]})).toThrow(/TABLE_ARCHIVE_REF/);
});

test('R2 source snapshot owns data so later caller mutation cannot alter it',()=>{
 const input={source:{utf8:'complete original source',format:'json'}};
 const owned=snapshotR2Json(input as {source:{utf8:string;format:string}},new R2WorkMeter(),'/fixture');
 input.source.utf8='mutated';
 expect(owned.value.source.utf8).toBe('complete original source');
 expect(owned.canonical).toContain('complete original source');
});

test('R2 complete legal source preserves its located fixed-work refusal before the unsupported projection gate',()=>{
 const compiled=compileTableDeployment({text:JSON.stringify(legalSource()),configuration:{module:'legal_lifecycle',schema:'inventory_api',ownerRole:'inventory_owner',personRole:'inventory_person',batchRole:'inventory_batch',groupRoles:{billing_admin:'inventory_billing_admin'}}});
 expect(compiled.status).toBe('compiled');if(compiled.status!=='compiled')throw new Error('fixture bundle refused');
 const input={previous:null,next:compiled.bundle,history:{profile:'umf.table-inventory-source-history/0.1',plans:[],executions:[]},selector:emptySelector};
 const meter=new R2WorkMeter(),before=meter.snapshot();
 let refusal:unknown;try{snapshotR2SourceData(input,meter);}catch(error){refusal=error;}
 expect(refusal).toBeInstanceOf(R2WorkLimitError);expect(refusal).toMatchObject({dimension:'work'});
 expect(typeof (refusal as R2WorkLimitError).path).toBe('string');expect((refusal as R2WorkLimitError).path.length).toBeGreaterThan(0);
 expect(meter.snapshot().work).toBeGreaterThan(before.work);
 expect(compiled.bundle.source.utf8).toBeDefined();
});

test('R2 complete legal source reports full fixed-budget admission or a located work-limit refusal',()=>{
 const compiled=compileTableDeployment({text:JSON.stringify(legalSource()),configuration:{module:'legal_lifecycle',schema:'inventory_api',ownerRole:'inventory_owner',personRole:'inventory_person',batchRole:'inventory_batch',groupRoles:{billing_admin:'inventory_billing_admin'}}});
 expect(compiled.status).toBe('compiled');if(compiled.status!=='compiled')throw new Error('fixture bundle refused');
 const originalSource=compiled.bundle.source.utf8,input={previous:null,next:compiled.bundle,history:{profile:'umf.table-inventory-source-history/0.1',plans:[],executions:[]},selector:emptySelector};
 let handle:ReturnType<typeof prepareR2InventorySourceContext>|undefined,refusal:unknown;try{handle=prepareR2InventorySourceContext(input);}catch(error){refusal=error;}
 if(refusal!==undefined){
  expect(refusal).toBeInstanceOf(R2WorkLimitError);expect(refusal).toMatchObject({dimension:'work'});
  expect(typeof (refusal as R2WorkLimitError).path).toBe('string');expect((refusal as R2WorkLimitError).path.length).toBeGreaterThan(0);
 }else{
  if(!handle)throw new Error('R2 source context returned neither a handle nor a refusal.');
  const state=inspectR2InventorySourceContext(handle);expect(state.next.bundle.bundleDigest).toBe(compiled.bundle.bundleDigest);
  expect(state.budget.work).toBeGreaterThan(0);expect(state.budget.work).toBeLessThanOrEqual(R2_WORK_LIMIT);
  expect(state.next.tables.length).toBe(compiled.bundle.expectedCatalog.tables.length);
 }
 expect(input.next.source.utf8).toBe(originalSource);
});

test('R2 source context rejects malformed original history before returning an opaque identity',()=>{
 const compiled=compileTableDeployment({text:JSON.stringify(legalSource()),configuration:{module:'legal_lifecycle',schema:'inventory_api',ownerRole:'inventory_owner',personRole:'inventory_person',batchRole:'inventory_batch',groupRoles:{billing_admin:'inventory_billing_admin'}}});
 expect(compiled.status).toBe('compiled');if(compiled.status!=='compiled')throw new Error('fixture bundle refused');
 const input={previous:null,next:compiled.bundle,history:{profile:'umf.table-inventory-source-history/0.1',plans:[{}],executions:[]},selector:emptySelector};
 expect(()=>prepareR2InventorySourceContext(input)).toThrow();
});

test('R2 shared meter refuses the exact work and subject overflows',()=>{
 const meter=new R2WorkMeter();
 meter.charge('jsonNode',1_000_000,'/limit');
 expect(()=>meter.charge('jsonNode',1,'/overflow')).toThrow(R2WorkLimitError);
 const subjects=new R2WorkMeter();
 for(let index=0;index<99_999;index++)subjects.retainSubject(`/subjects/${index}`);
 expect(()=>subjects.retainSubject('/subjects/99999')).toThrow(R2WorkLimitError);
});

test('R2 JSON reader uses the bounded qualified scanner before JSON tree admission',()=>{
 const meter=new R2WorkMeter();
 expect(()=>readJsonDocumentWithAccounting('{"umf":"0.10.0","umf":"0.10.0"}',meter)).toThrow(/Duplicate JSON member/);
 expect(()=>readJsonDocumentWithAccounting('{"n":9007199254740993}',new R2WorkMeter())).toThrow(/Noninteroperable JSON number/);
 let invalid:unknown;try{readJsonDocumentWithAccounting('{"s":"\\u03bb"}',new R2WorkMeter());}catch(error){invalid=error;}
 expect(invalid).toMatchObject({name:'UmfError',code:'INVALID_DOCUMENT'});
 expect(meter.snapshot().bytes).toBeGreaterThan(0);
});

test('R2 scanner reserves exact decoded UTF-8 bytes before decoding strings or retaining keys',()=>{
 const reservations:{bytes:number;key:boolean}[]=[];let decodedValues=0;
 scanJsonFrameCharged('{"k":"λ😀\\u03bb"}',100,8,()=>{},(bytes,key)=>{reservations.push({bytes,key});},(_value,key)=>{if(!key)decodedValues++;});
 expect(reservations).toEqual([{bytes:1,key:true},{bytes:8,key:false}]);expect(decodedValues).toBe(1);
 let decodedAfterRefusal=0;
 expect(()=>scanJsonFrameCharged('{"x":"long"}',100,8,()=>{},(bytes,key)=>{if(!key&&bytes>0)throw new Error('BYTE_GATE');},(_value,key)=>{if(!key)decodedAfterRefusal++;})).toThrow('BYTE_GATE');
 expect(decodedAfterRefusal).toBe(0);
 const escaped=`"${'\\u03bb'.repeat(1024)}"`;let decodedLarge=false;
 expect(()=>scanJsonFrameCharged(escaped,100,8,()=>{},(bytes)=>{if(bytes===2048)throw new Error('LARGE_BYTE_GATE');},()=>{decodedLarge=true;})).toThrow('LARGE_BYTE_GATE');
 expect(decodedLarge).toBe(false);
 const input='{"s":"long"}',meter=new R2WorkMeter();meter.chargeBytes(R2_CONTEXT_BYTE_LIMIT-input.length-3,'/preloaded');
 expect(()=>readJsonDocumentWithAccounting(input,meter)).toThrow(/R2_CONTEXT_BYTES_LIMIT/);
 // Source bytes plus scanner/document key retention fit; the value string
 // then refuses before its decoded bytes are retained.
 expect(meter.snapshot().bytes).toBe(R2_CONTEXT_BYTE_LIMIT-1);
});

test('R2 scanner reserves exact bytes for escaped scalar widths and rejects decoded duplicate keys',()=>{
 const cases:[string,number][]=[
  ['"\\u0041"',1],
  ['"\\u0000"',1],
  ['"\\u03bb"',2],
  ['"\\u20ac"',3],
  ['"\\ud83d\\ude00"',4],
 ];
 for(const [token,expectedBytes] of cases){
  const reservations:number[]=[];
  scanJsonFrameCharged(token,100,8,()=>{},(bytes)=>{reservations.push(bytes);},()=>{});
  expect(reservations).toEqual([expectedBytes]);
 }
 expect(()=>scanJsonFrameCharged('{"A":1,"\\u0041":2}',100,8,()=>{},()=>{},()=>{})).toThrow();
});


test('R2 descriptor admission rejects hostile JSON shape without invoking getters',()=>{
 let getterCalls=0;const input={};Object.defineProperty(input,'selector',{enumerable:true,get(){getterCalls++;return emptySelector;}});
 expect(()=>snapshotR2Json(input as any,new R2WorkMeter(),'/hostile')).toThrow(/CONTEXT_DESCRIPTOR/);
 expect(getterCalls).toBe(0);
 const hidden={visible:1};Object.defineProperty(hidden,'hidden',{value:2,enumerable:false});
 expect(()=>snapshotR2Json(hidden as any,new R2WorkMeter(),'/hidden')).toThrow(/CONTEXT_DESCRIPTOR/);
 const symbol={visible:1,[Symbol('extension')]:2};expect(()=>snapshotR2Json(symbol as any,new R2WorkMeter(),'/symbol')).toThrow(/CONTEXT_SYMBOL/);
 const sparse:any[]=[];sparse.length=2;sparse[1]='x';expect(()=>snapshotR2Json(sparse as any,new R2WorkMeter(),'/sparse')).toThrow(/CONTEXT_SPARSE_ARRAY/);
 const extra=Object.assign([1],{note:'retained?'});expect(()=>snapshotR2Json(extra as any,new R2WorkMeter(),'/array-property')).toThrow(/CONTEXT_ARRAY_PROPERTY/);
});

test('R2 descriptor admission enforces depth and numeric limits while preserving JSON extensions',()=>{
 const nested=(levels:number)=>{let value:any={leaf:'✓'};for(let i=0;i<levels;i++)value={child:value};return value;};
 expect(snapshotR2Json(nested(127),new R2WorkMeter(),'/depth').value).toBeDefined();
 expect(()=>snapshotR2Json(nested(128),new R2WorkMeter(),'/depth').value).toThrow(/CONTEXT_JSON_LIMIT/);
 for(const number of [-0,Number.MAX_SAFE_INTEGER+1,Infinity])expect(()=>snapshotR2Json(number as any,new R2WorkMeter(),'/number')).toThrow(/CONTEXT_NUMBER/);
 const source={unknownExtension:{unicode:'λ'}};const owned=snapshotR2Json(source,new R2WorkMeter(),'/source');source.unknownExtension.unicode='changed';
 expect(owned.value.unknownExtension.unicode).toBe('λ');expect(owned.canonical).toContain('unknownExtension');
});

test('R2 owned history canonical spans bind exact frozen roots and members',()=>{
 const raw={profile:'umf.table-inventory-source-history/0.1',plans:[{id:'p-λ',ratio:1.25,extension:{zero:0,negativeZero:0}}],executions:[{planDigest:'a'.repeat(64),entryDigest:'b'.repeat(64),seedOutcomes:[]}]};
 const meter=new R2WorkMeter(),owned=snapshotR2HistoryJson(raw,meter);
 expect(owned.canonical).toBe(canonical(raw));expect(ownedR2HistoryByteLength(owned.value,meter)).toBe(new TextEncoder().encode(canonical(raw)).byteLength);
 const plan=ownedR2HistoryMember(owned.value.plans[0],meter,'/history/plans/0');expect(plan?.text).toBe(canonical(owned.value.plans[0]));expect(plan?.byteLength).toBe(new TextEncoder().encode(plan!.text).byteLength);
 expect(ownedR2HistoryMember(raw.plans[0],meter,'/mutable-caller/plans/0')).toBeUndefined();raw.plans[0]!.extension.zero=9;expect((owned.value.plans[0] as any).extension.zero).toBe(0);
 expect(ownedR2HistoryMember(owned.value.plans[0],new R2WorkMeter(),'/foreign/plans/0')).toBeUndefined();
 expect(ownedR2HistoryMember(structuredClone(owned.value.plans[0]),meter,'/clone/plans/0')).toBeUndefined();
 const empty={profile:'umf.table-inventory-source-history/0.1',plans:[],executions:[]},emptyMeter=new R2WorkMeter(),emptyOwned=snapshotR2HistoryJson(empty,emptyMeter);
 expect(emptyOwned.canonical).toBe(canonical(empty));expect(ownedR2HistoryByteLength(emptyOwned.value,emptyMeter)).toBe(new TextEncoder().encode(canonical(empty)).byteLength);
 const copy=structuredClone(raw),copyMeter=new R2WorkMeter(),ownedCopy=ownR2HistoryComponent(copy,copyMeter);
 expect(Object.isFrozen(ownedCopy.value)&&Object.isFrozen(ownedCopy.value.plans)&&Object.isFrozen(ownedCopy.value.plans[0])).toBe(true);
 expect(ownedR2HistoryMember(ownedCopy.value.plans[0],copyMeter,'/controlled-copy/plans/0')?.text).toBe(canonical(copy.plans[0]));
 const execution=ownedR2HistoryExecutionWrapper(owned.value.executions[0],meter,'/wrapper-control');
 expect(ownedR2HistoryMember(execution,meter,'/wrapper-control/member')?.text).toBe(canonical(owned.value.executions[0]));
 const extra=Object.freeze({...owned.value.executions[0],extension:true});expect(()=>ownR2HistoryExecutionWrapper(extra,meter,'/extra')).toThrow(/R2_HISTORY_EXECUTION_SOURCE/);
 let getterCalls=0;const accessor=Object.create(null) as Record<string,unknown>;
 Object.defineProperties(accessor,{planDigest:{enumerable:true,get(){getterCalls++;return 'a'.repeat(64);}},entryDigest:{enumerable:true,value:'b'.repeat(64)},seedOutcomes:{enumerable:true,value:[]}});Object.freeze(accessor);
 expect(()=>ownR2HistoryExecutionWrapper(accessor,meter,'/accessor')).toThrow(/R2_HISTORY_EXECUTION_SOURCE/);expect(getterCalls).toBe(0);
 const custom=Object.freeze(Object.assign(Object.create({foreign:true}),{planDigest:'a'.repeat(64),entryDigest:'b'.repeat(64),seedOutcomes:[]}));
 expect(()=>ownR2HistoryExecutionWrapper(custom,meter,'/custom')).toThrow(/R2_HISTORY_EXECUTION_SOURCE/);
});

test('R2 history spans are not published when charged source admission fails',()=>{
 const raw={profile:'umf.table-inventory-source-history/0.1',plans:[{id:'p'}],executions:[{id:'e'}]},meter=new R2WorkMeter();
 meter.charge('jsonNode',R2_WORK_LIMIT-1,'/near-limit');
 expect(()=>ownR2HistoryComponent(raw,meter)).toThrow(R2WorkLimitError);
 expect(()=>ownedR2HistoryByteLength(raw,meter)).toThrow(R2WorkLimitError);
 expect(ownedR2HistoryByteLength(raw,new R2WorkMeter())).toBeUndefined();expect(ownedR2HistoryMember(raw.plans[0],new R2WorkMeter())).toBeUndefined();
});

test('R2 history metadata and lazy member spans publish only after their charges',()=>{
 class RetentionFailureMeter extends R2WorkMeter{
  failCategory:string|null=null;failDomain:string|null=null;
  override visit(category:string,path:string,count=1):void{if(category===this.failCategory)throw new Error(`CONTROLLED_RETENTION_FAILURE:${category}`);super.visit(category,path,count);}
  override retainBytes(domain:string,count:number,path:string):void{if(domain===this.failDomain)throw new Error(`CONTROLLED_RETENTION_FAILURE:${domain}`);super.retainBytes(domain,count,path);}
 }
 const raw={profile:'umf.table-inventory-source-history/0.1',plans:[{id:'p'}],executions:[{planDigest:'a'.repeat(64),entryDigest:'b'.repeat(64),seedOutcomes:[]}]},meter=new RetentionFailureMeter();
 meter.failCategory='r2-history-member-map-retention';expect(()=>ownR2HistoryComponent(raw,meter)).toThrow(/CONTROLLED_RETENTION_FAILURE/);meter.failCategory=null;
 expect(ownedR2HistoryByteLength(raw,meter)).toBeUndefined();expect(ownedR2HistoryMember(raw.plans[0],meter)).toBeUndefined();
 const owned=snapshotR2HistoryJson(raw,meter),member=owned.value.plans[0]!,beforeFailure=meter.snapshot().bytes;meter.failDomain='r2-history-member-canonical-copy';expect(()=>ownedR2HistoryMember(member,meter)).toThrow(/CONTROLLED_RETENTION_FAILURE/);
 expect(meter.snapshot().bytes).toBe(beforeFailure);meter.failDomain=null;const expected=canonical(member),afterRetry=ownedR2HistoryMember(member,meter);expect(afterRetry?.text).toBe(expected);expect(meter.snapshot().bytes-beforeFailure).toBe(new TextEncoder().encode(expected).byteLength);
 const afterRetryBytes=meter.snapshot().bytes;expect(ownedR2HistoryMember(member,meter)?.text).toBe(expected);expect(meter.snapshot().bytes).toBe(afterRetryBytes);
});

test('R2 canonical string and key bytes are reserved before token construction',()=>{
 const string='x'.repeat(1024),stringMeter=new R2WorkMeter();stringMeter.chargeBytes(R2_CONTEXT_BYTE_LIMIT-(string.length+1),'/preloaded');
 expect(()=>canonicalCharged(string,stringMeter,'/large-string')).toThrow(R2WorkLimitError);
 expect(stringMeter.snapshot().bytes).toBe(R2_CONTEXT_BYTE_LIMIT-(string.length+1));
 const key='k'.repeat(1024),keyMeter=new R2WorkMeter();keyMeter.chargeBytes(R2_CONTEXT_BYTE_LIMIT-(key.length+1),'/preloaded');
 expect(()=>canonicalCharged({[key]:null},keyMeter,'/large-key')).toThrow(R2WorkLimitError);
 expect(keyMeter.snapshot().bytes).toBe(R2_CONTEXT_BYTE_LIMIT-key.length);
});

test('R2 exported selector parser admits unknown input before shape reads and owns its result',()=>{
 let getterCalls=0;const hostile={...emptySelector};Object.defineProperty(hostile,'tableIntents',{enumerable:true,get(){getterCalls++;return []}});
 expect(()=>parseR2DiscoverySelectorShape(hostile as any)).toThrow(/CONTEXT_DESCRIPTOR/);expect(getterCalls).toBe(0);
 const raw={...emptySelector,retiredSeedSets:['seed-original']};const parsed=parseR2DiscoverySelectorShape(raw);
 raw.retiredSeedSets[0]='seed-mutated';expect(parsed.retiredSeedSets[0]).toBe('seed-original');
});

test('R2 table archive material accepts only canonical unpadded base64url',()=>{
 const uuid='00000000-0000-0000-0000-000000000001',digest='a'.repeat(64);
 const archive={profile:'umf.retained-table-archive-ref/0.1',providerId:uuid,storeId:uuid,archiveId:uuid,lineageId:uuid,originalTableToken:uuid,originalPhysicalGeneration:uuid,targetCustody:{profile:'umf.native-target-custody/0.1',custodianId:uuid,registrationId:uuid,resourceId:uuid,incarnation:uuid,registrationDigest:digest},table:'t',record:{module:'m',element:'r'},retirementPlanDigest:digest,retirementSourceDigest:digest,tableMeaningDigest:digest,nativeDomainDigest:digest,archiveSourceDigest:digest};
 const materials=['source','configuration','bundle','plan','source-meaning'].map(kind=>({kind,sha256:digest,bytes:'e30'}));
 expect(parseR2DiscoverySelectorShape({...emptySelector,tableArchiveSources:[{archive,materials}]}).tableArchiveSources).toHaveLength(1);
 const twoCharacterTail=materials.map(item=>({...item,bytes:'AQ'}));expect(parseR2DiscoverySelectorShape({...emptySelector,tableArchiveSources:[{archive,materials:twoCharacterTail}]}).tableArchiveSources).toHaveLength(1);
 for(const bytes of ['e30=','e+0','e/0','e31','A']){
  const bad=materials.map(item=>({...item}));bad[0]={...bad[0]!,bytes};
  expect(()=>parseR2DiscoverySelectorShape({...emptySelector,tableArchiveSources:[{archive,materials:bad}]})).toThrow(/TABLE_ARCHIVE_MATERIAL_BASE64URL/);
 }
});

test('R2 restoration parser preserves old exact branch and admits both closed lineage target modes',()=>{
 const uuid='00000000-0000-0000-0000-000000000001',digest='a'.repeat(64);
 const custody={profile:'umf.native-target-custody/0.1',custodianId:uuid,registrationId:uuid,resourceId:uuid,incarnation:uuid,registrationDigest:digest};
 const archive={profile:'umf.retired-field-archive-ref/0.1',providerId:uuid,archiveId:uuid,tableToken:uuid,targetCustody:custody,retirementPlanDigest:digest,retirementSourceDigest:digest,fieldMeaningDigest:digest};
 const whole={profile:'umf.retained-table-archive-ref/0.1',providerId:uuid,storeId:uuid,archiveId:uuid,lineageId:uuid,originalTableToken:uuid,originalPhysicalGeneration:uuid,targetCustody:custody,table:'t',record:{module:'m',element:'r'},retirementPlanDigest:digest,retirementSourceDigest:digest,tableMeaningDigest:digest,nativeDomainDigest:digest,archiveSourceDigest:digest};
 const lineage={profile:'umf.field-archive-lineage-selection/0.1',providerId:uuid,storeId:uuid,lineageId:uuid,originalTableToken:uuid,wholeTableArchive:whole};
 const field=(extra:any={})=>({table:'t',field:{module:'m',element:'f'},archive,newInstances:{mode:'refuse'},...extra});
 expect(parseR2DiscoverySelectorShape({...emptySelector,restorations:[field()]}).restorations).toHaveLength(1);
 const current={...lineage,target:{kind:'current-descendant',expectedTableToken:uuid}};
 expect(parseR2DiscoverySelectorShape({...emptySelector,restorations:[field({profile:'umf.lineage-field-restoration/0.1',lineage:current})]}).restorations).toHaveLength(1);
 const intents=[{kind:'restore',table:'t',record:{module:'m',element:'r'},archive:whole}];
 const samePlan={...lineage,target:{kind:'same-plan-restored-descendant',tableRestoreIntentIndex:0}};
 expect(parseR2DiscoverySelectorShape({...emptySelector,tableIntents:intents,restorations:[field({profile:'umf.lineage-field-restoration/0.1',lineage:samePlan})]}).restorations).toHaveLength(1);
 expect(()=>parseR2DiscoverySelectorShape({...emptySelector,restorations:[field({profile:'umf.lineage-field-restoration/0.1',lineage:{...current,target:{kind:'current-descendant',expectedTableToken:'bad'}}})]})).toThrow(/FIELD_ARCHIVE_TARGET/);
 expect(()=>parseR2DiscoverySelectorShape({...emptySelector,tableIntents:intents,restorations:[field({profile:'umf.lineage-field-restoration/0.1',lineage:{...samePlan,target:{kind:'same-plan-restored-descendant',tableRestoreIntentIndex:1}}})]})).toThrow(/FIELD_ARCHIVE_TARGET/);
 expect(()=>parseR2DiscoverySelectorShape({...emptySelector,tableIntents:[{...intents[0]!,table:'other'}],restorations:[field({profile:'umf.lineage-field-restoration/0.1',lineage:{...samePlan,target:{kind:'same-plan-restored-descendant',tableRestoreIntentIndex:0}}})]})).toThrow(/FIELD_ARCHIVE_TARGET_BINDING/);
 expect(()=>parseR2DiscoverySelectorShape({...emptySelector,restorations:[field({archive:{...archive,extra:true}})]})).toThrow(/FIELD_ARCHIVE_REF/);
 expect(()=>parseR2DiscoverySelectorShape({...emptySelector,restorations:[field({newInstances:{mode:'fill',expression:{op:'unknown'}}})]})).toThrow();
 expect(parseR2DiscoverySelectorShape({...emptySelector,restorations:[field({newInstances:{mode:'fill',expression:{op:'literal',value:{string:'ok'}}}})]}).restorations).toHaveLength(1);
});

test('R2 parser preserves ordinary u/0 identifiers and rejects actual NUL plus open recipe controls',()=>{
 const ref={module:'module-u0',element:'element-0'};
 expect(parseR2DiscoverySelectorShape({...emptySelector,tableIntents:[{kind:'create',table:'table-u0',record:ref}]}).tableIntents).toHaveLength(1);
 expect(()=>parseR2DiscoverySelectorShape({...emptySelector,tableIntents:[{kind:'create',table:'bad\0id',record:ref}]})).toThrow(/TABLE_INTENT/);
 const conversion={table:'table-u0',field:ref,recipe:{version:'umf.conversion-recipe/0.1',kind:'numeric-exact',parameters:{}},nulls:'preserve',invalid:'abort',recovery:{mode:'irreversible'}};
 expect(parseR2DiscoverySelectorShape({...emptySelector,conversions:[conversion]}).conversions).toHaveLength(1);
 expect(()=>parseR2DiscoverySelectorShape({...emptySelector,conversions:[{...conversion,recipe:{...conversion.recipe,parameters:{unexpected:true}}}]})).toThrow(/CONVERSION_PARAMETERS/);
});
