// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {projectBit128Model,recoverBit128ModelProjection} from '../src/projections/bit128-model';
import {encodeBit128Record,decodeBit128Record} from '../src/extensions/binding/bit128-record';
import {encodeBit128FileRecord,decodeBit128FileRecord} from '../src/projections/bit128-file-values';
import {validateBit128Dataset} from '../src/extensions/binding/model-dataset';
import {CHILD} from './helpers/uuid-model-fixtures';
import {mixedModel,compositeModel,associationModel,associationData,values,compositeValues} from './helpers/uuid-composition-fixtures';
test('mixed flat records compose exact scalars with UUID carriers across five targets',()=>{
 for(const system of ['postgresql','sqlserver','avro','parquet','tablespec']){
 const {binding,logical}=mixedModel(system),r=projectBit128Model(binding,logical,'report');expect(r.candidate).toBeDefined();expect(recoverBit128ModelProjection(r,r.candidate!.text).logical).toEqual(logical);
 const row=encodeBit128Record(binding,logical,CHILD,values as any);expect(decodeBit128Record(binding,logical,CHILD,row)).toEqual(values);
 if(!['postgresql','sqlserver'].includes(system))expect(decodeBit128FileRecord(binding,logical,CHILD,encodeBit128FileRecord(binding,logical,CHILD,values as any))).toEqual(values);
 const old=structuredClone(binding);(old.extensions!['umf.binding'] as any).target.subset='uuid-model1';expect(()=>projectBit128Model(old,logical,'report')).toThrow();
 }
});
test('nested arrays/maps and explicit groups preserve order, duplicates, null and empty',()=>{
 for(const system of ['postgresql','sqlserver','avro','parquet','tablespec']){
 const {binding,logical}=compositeModel(system),r=projectBit128Model(binding,logical,'report');expect(r.candidate).toBeDefined();
 const tokens=encodeBit128Record(binding,logical,CHILD,compositeValues as any);expect(decodeBit128Record(binding,logical,CHILD,tokens)).toEqual(compositeValues);
 if(!['postgresql','sqlserver'].includes(system))expect(decodeBit128FileRecord(binding,logical,CHILD,encodeBit128FileRecord(binding,logical,CHILD,compositeValues as any))).toEqual(compositeValues);
 const bad=structuredClone(compositeValues) as any;bad.at(-1).value.group.pop();expect(()=>encodeBit128Record(binding,logical,CHILD,bad)).toThrow();
 }
});
test('association attributes and identities survive; distinct endpoints, not link rows, determine multiplicity',()=>{
 for(const system of ['postgresql','sqlserver','avro','parquet','tablespec']){
 const m=associationModel(system),data=associationData();expect(projectBit128Model(m.binding,m.logical,'report').candidate).toBeDefined();expect(validateBit128Dataset(m.binding,m.logical,data as any)).toEqual(data);
 const bad=structuredClone(data) as any;bad[2].rows[0][2].value.uuid='00112233-4455-6677-8899-aabbccddeeff';expect(()=>validateBit128Dataset(m.binding,m.logical,bad)).toThrow('Orphan');
 const duplicate=structuredClone(data) as any;duplicate[2].rows.push(duplicate[2].rows[0]);expect(()=>validateBit128Dataset(m.binding,m.logical,duplicate)).toThrow('Duplicate');
 }
});
test('composition refuses malformed shapes and unsupported meaning atomically',()=>{
 const m=compositeModel(),row=encodeBit128Record(m.binding,m.logical,CHILD,compositeValues as any);
 const required=structuredClone(compositeValues) as any;required[10].value=null;expect(()=>encodeBit128Record(m.binding,m.logical,CHILD,required)).toThrow();
 const partial={...row,itemMap:'{"values":[{"hi":"1"}]}'};expect(()=>decodeBit128Record(m.binding,m.logical,CHILD,partial)).toThrow();
 expect(()=>decodeBit128Record(m.binding,m.logical,CHILD,{...row,itemMap:'{"x":[],"x":null}'})).toThrow();
 const cycle=structuredClone(m.logical);cycle.modules[0]!.elements.find(e=>e.id==='items')!.itemType={module:'m',element:'itemMap'};expect(()=>projectBit128Model(m.binding,cycle,'report')).toThrow();
 const unknown=structuredClone(m.binding);(unknown.extensions!['umf.binding'] as any).groups[0].future=true;expect(()=>projectBit128Model(unknown,m.logical,'report')).toThrow();
 const bad=structuredClone(compositeValues) as any;bad[10].value.map.values.array=Array(9).fill(null);expect(()=>encodeBit128Record(m.binding,m.logical,CHILD,bad)).toThrow();
});
test('association endpoint alternatives are exclusive and do not invent pair uniqueness',()=>{
 const m=associationModel(),p=m.binding.extensions!['umf.binding'] as any,ref=(element:string)=>({module:'m',element}),assoc=m.logical.modules[0]!.elements.find(e=>e.id==='association')!;
 const d=(m.logical.modules[0]!.relationships as any[])[1];d.source.push(CHILD);d.targetMultiplicity.max='*';
 m.logical.modules[0]!.elements.find(e=>e.id==='left')!.nullability='absent-allowed';
 m.logical.modules[0]!.elements.push({id:'leftAlt',kind:'field',scalarType:'uuid',cardinality:'one',nullability:'absent-allowed',extensions:{}});(assoc.members as any[]).push(ref('leftAlt'));
 p.fields.push({...ref('leftAlt'),storage:'scalar-carrier',carrier:{kind:'words64',highColumn:'alt_hi',lowColumn:'alt_lo',signed:true}});p.relationships[1].source.push({record:CHILD,key:'pk',fields:[ref('leftAlt')]});
 const data=associationData() as any;for(const row of data[2].rows)row.push({field:ref('leftAlt'),value:null});expect(validateBit128Dataset(m.binding,m.logical,data)).toEqual(data);
 data[2].rows[0].at(-1).value={uuid:'ffffffff-ffff-ffff-ffff-ffffffffffff'};expect(()=>validateBit128Dataset(m.binding,m.logical,data)).toThrow('exactly one');
 data[2].rows[0][1].value=null;expect(validateBit128Dataset(m.binding,m.logical,data)).toEqual(data);
});
test('mixed scalar keys use exact mathematical equality and integer128 stays distinct from UUID',()=>{
 const m=mixedModel(),p=m.binding.extensions!['umf.binding'] as any,parent=m.logical.modules[0]!.elements[0]!,ref={module:'m',element:'tenant'};
 m.logical.modules[0]!.elements.push({id:'tenant',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',facets:{integerWidth:{bits:128,signed:false}},extensions:{}});(parent.members as any[]).push(ref);(parent.keys as any[]).push({id:'tenantKey',name:'tenant key',fields:[ref]});p.fields.push({...ref,storage:'column',column:'tenant'});
 const data=associationData().slice(0,2) as any;data[1].rows=[values];data[0].rows[0].push({field:ref,value:{integerToken:'340282366920938463463374607431768211455'}});expect(validateBit128Dataset(m.binding,m.logical,data)[0]!.rows[0]!.at(-1)!.value).toEqual(data[0].rows[0].at(-1).value);
 data[0].rows[0].at(-1).value.integerToken='340282366920938463463374607431768211456';expect(()=>validateBit128Dataset(m.binding,m.logical,data)).toThrow();
});
test('association bounds count distinct endpoints and include zero-degree records',()=>{
 const m=associationModel(),d=(m.logical.modules[0]!.relationships as any[])[1],data=associationData() as any;
 const second=structuredClone(data[1].rows[0]);second[0].value.uuid='00112233-4455-6677-8899-aabbccddeeff';data[1].rows.push(second);data[2].rows[1][2].value.uuid=second[0].value.uuid;
 expect(()=>validateBit128Dataset(m.binding,m.logical,data)).toThrow('multiplicity');
 d.targetMultiplicity.max='*';expect(validateBit128Dataset(m.binding,m.logical,data)).toEqual(data);
 d.targetMultiplicity.min=1;data[2].rows=[];expect(()=>validateBit128Dataset(m.binding,m.logical,data)).toThrow('multiplicity');
});
test('composite mappings distinguish dynamic map values and refuse forged recovery reports',()=>{
 const m=compositeModel('parquet'),r=projectBit128Model(m.binding,m.logical,'report');expect(r.compositeMappings!.some(m=>m.path.some(s=>s.kind==='map-value')&&m.path.some(s=>s.kind==='array-item'))).toBe(true);
 const forged=structuredClone(r);forged.compositeMappings!.pop();expect(()=>recoverBit128ModelProjection(forged,r.candidate!.text)).toThrow();
 const row=encodeBit128Record(m.binding,m.logical,CHILD,compositeValues as any);expect(()=>decodeBit128Record(m.binding,m.logical,CHILD,{...row,detailObject:'null'})).toThrow();
});
