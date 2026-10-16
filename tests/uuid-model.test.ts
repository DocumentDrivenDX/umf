import {test,expect} from 'bun:test';
import {uuidModel,PARENT,CHILD} from './helpers/uuid-model-fixtures';
import {projectBit128Model,recoverBit128ModelProjection,encodeBit128Record,decodeBit128Record,inspectBit128Binding} from '../src';
const uuid='00112233-4455-6677-8899-aabbccddeeff';
test('complete model expands Keys, indexes and foreign keys into every paired slot',()=>{
 for(const system of ['postgresql','sqlserver'])for(const kind of ['native-uuid','bytes16','uuid-text','words64']){
  const {binding,logical}=uuidModel(kind,system),result=projectBit128Model(binding,logical,'strict');
  expect(inspectBit128Binding(binding,logical).complete).toBe(true);expect(result.status).toBe('projected');
  expect(result.candidate!.text).toContain('FOREIGN KEY');expect(result.candidate!.text).toContain('parent_lookup');
  if(kind==='words64')expect(result.candidate!.text).toContain(system==='postgresql'?'FOREIGN KEY ("parent_hi", "parent_lo")':'FOREIGN KEY ([parent_hi], [parent_lo])');
  expect(recoverBit128ModelProjection(result,result.candidate!.text)).toEqual({logical,binding});
  expect(()=>recoverBit128ModelProjection(result,result.candidate!.text+' ')).toThrow();
  const values=[{field:{module:'m',element:'childId'},value:{uuid}},{field:{module:'m',element:'parentRef'},value:null}];
  const slots=encodeBit128Record(binding,logical,CHILD,values);expect(decodeBit128Record(binding,logical,CHILD,slots)).toEqual(values);
  expect(()=>decodeBit128Record(binding,logical,CHILD,{...slots,extra:'0'})).toThrow();
  if(kind==='words64')expect(()=>decodeBit128Record(binding,logical,CHILD,{...slots,parent_hi:'0'})).toThrow();
 }
});
test('no unbound meaning, carrier mismatch, index cross-owner or foreign layout can disappear',()=>{
 const mutate=[
  (p:any,l:any)=>p.relationships[0].fields.reverse().push({module:'m',element:'childId'}),
  (p:any)=>p.fields[2].carrier.signed=false,
  (p:any)=>p.indexes[0].on.push({field:{module:'m',element:'parentId'}}),
  (p:any)=>p.fields.pop(),
  (p:any,l:any)=>l.modules[0].relationships[0].targetMultiplicity.max='*',
  (p:any)=>p.elements[1].table='parents',
  (p:any)=>p.fields[2].carrier.lowColumn='id_hi',
  (p:any)=>p.indexes[0].predicate={language:'sql',version:'1',expression:'unsafe'},
 ];
 for(const change of mutate){const {binding,logical}=uuidModel();change(binding.extensions!['umf.binding'],logical);expect(()=>projectBit128Model(binding,logical,'report')).toThrow();}
});
test('declared participation/lifecycle and NULL defaults are residuals, never implicit enforcement',()=>{
 const {binding,logical}=uuidModel();(logical.modules[0]!.relationships as any)[0].sourceMultiplicity.min=1;
 expect(projectBit128Model(binding,logical,'strict').status).toBe('blocked');
 expect(projectBit128Model(binding,logical,'report').residuals.length).toBe(1);
 const pure=uuidModel();pure.logical.modules[0]!.elements[4]!.default={on:'missing-or-null',value:{uuid}};
 expect(projectBit128Model(pure.binding,pure.logical,'strict').status).toBe('blocked');
 expect(projectBit128Model(pure.binding,pure.logical,'report').candidate!.text).toContain('DEFAULT');
});
test('empty allowed-value declarations refuse before native output',()=>{
 const {binding,logical}=uuidModel();logical.modules[0]!.elements[4]!.allowedValues=[];
 expect(()=>projectBit128Model(binding,logical,'strict')).toThrow();
 expect(()=>encodeBit128Record(binding,logical,CHILD,[{field:{module:'m',element:'childId'},value:{uuid}},{field:{module:'m',element:'parentRef'},value:{uuid}}])).toThrow();
});
test('full-row codecs cannot bypass unsupported target/carrier or native name checks',()=>{
 for(const mutate of [(p:any)=>p.target.version='999',(p:any)=>p.fields[0].carrier.signed=false,(p:any)=>p.fields[2].carrier.highColumn='ID_HI',(p:any)=>p.elements[0].table='unsafe;table']){
  const {binding,logical}=uuidModel('words64','sqlserver');mutate(binding.extensions!['umf.binding']);expect(()=>encodeBit128Record(binding,logical,PARENT,[{field:{module:'m',element:'parentId'},value:{uuid}}])).toThrow();
 }
});
test('SQL Server filtered-index session conditions are part of the public model result and DDL',()=>{
 const {binding,logical}=uuidModel('words64','sqlserver'),r=projectBit128Model(binding,logical,'strict');expect(r.nativeRequirements).toHaveLength(1);expect(r.nativeRequirements[0]!.scope).toBe('connection');expect(r.nativeRequirements[0]!.statements).toContain('SET QUOTED_IDENTIFIER ON;');expect(r.candidate!.text.startsWith('SET ANSI_NULLS ON;')).toBe(true);
});
