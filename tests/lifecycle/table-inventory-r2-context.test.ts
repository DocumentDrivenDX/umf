// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment} from '../../src/table-deployment';
import {legalSource} from './legal-fixture';
import {readJsonDocumentWithAccounting} from '../../src/model/document-accounting';
import {scanJsonFrameCharged} from '../../src/model/internal/scan-json-frame';
import {
 parseR2DiscoverySelectorShape,R2_CONTEXT_BYTE_LIMIT,R2_WORK_EVENT_UNITS,R2WorkLimitError,R2WorkMeter,snapshotR2Json,snapshotR2SourceData,
} from '../../src/table-migration/inventory-r2-context';

const emptySelector={
 version:'umf.table-inventory-discovery/0.2',tableIntents:[],conversions:[],
 retiredSeedSets:[],retirements:[],restorations:[],archiveSources:[],tableArchiveSources:[],
} as const;

class RecordingR2WorkMeter extends R2WorkMeter {
 readonly events:{name:keyof typeof R2_WORK_EVENT_UNITS;count:number;path:string}[]=[];
 override charge(event:keyof typeof R2_WORK_EVENT_UNITS,count=1,path='/'):void{
  this.events.push({name:event,count,path});super.charge(event,count,path);
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

test('R2 component depth starts at each component root, not the request envelope',()=>{
 const nested=(levels:number)=>{let value:any=0;for(let i=0;i<levels;i++)value={next:value};return value;};
 const history={profile:'umf.table-inventory-source-history/0.1',plans:[],executions:[]};
 const input={previous:nested(128),next:[],history,selector:emptySelector};
 expect(()=>snapshotR2SourceData(input,new R2WorkMeter())).toThrow('R2_BUNDLE_ENVELOPE:/next');
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

test('R2 context meters exact source verification and one parsed-source index before refusing unmetered catalog projection',()=>{
 const compiled=compileTableDeployment({text:JSON.stringify(legalSource()),configuration:{module:'legal_lifecycle',schema:'inventory_api',ownerRole:'inventory_owner',personRole:'inventory_person',batchRole:'inventory_batch',groupRoles:{billing_admin:'inventory_billing_admin'}}});
 expect(compiled.status).toBe('compiled');if(compiled.status!=='compiled')throw new Error('fixture bundle refused');
 const input={previous:null,next:compiled.bundle,history:{profile:'umf.table-inventory-source-history/0.1',plans:[],executions:[]},selector:emptySelector};
 const meter=new R2WorkMeter(),before=meter.snapshot();
 expect(()=>snapshotR2SourceData(input,meter)).toThrow(/UNSUPPORTED_METERED_CATALOG_PROJECTION/);
 expect(meter.snapshot().work).toBeGreaterThan(before.work);
 expect(compiled.bundle.source.utf8).toBeDefined();
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
 expect(()=>readJsonDocumentWithAccounting('{"s":"\\u03bb"}',new R2WorkMeter())).toThrow(/INVALID_DOCUMENT|invalid/i);
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
 expect(meter.snapshot().bytes).toBe(R2_CONTEXT_BYTE_LIMIT-2);
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
 const extra:any[]=[1];extra.note='retained?';expect(()=>snapshotR2Json(extra as any,new R2WorkMeter(),'/array-property')).toThrow(/CONTEXT_ARRAY_PROPERTY/);
});

test('R2 descriptor admission enforces depth and numeric limits while preserving JSON extensions',()=>{
 const nested=(levels:number)=>{let value:any={leaf:'✓'};for(let i=0;i<levels;i++)value={child:value};return value;};
 expect(snapshotR2Json(nested(127),new R2WorkMeter(),'/depth').value).toBeDefined();
 expect(()=>snapshotR2Json(nested(128),new R2WorkMeter(),'/depth').value).toThrow(/CONTEXT_JSON_LIMIT/);
 for(const number of [-0,Number.MAX_SAFE_INTEGER+1,Infinity])expect(()=>snapshotR2Json(number as any,new R2WorkMeter(),'/number')).toThrow(/CONTEXT_NUMBER/);
 const source={unknownExtension:{unicode:'λ'}};const owned=snapshotR2Json(source,new R2WorkMeter(),'/source');source.unknownExtension.unicode='changed';
 expect(owned.value.unknownExtension.unicode).toBe('λ');expect(owned.canonical).toContain('unknownExtension');
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
