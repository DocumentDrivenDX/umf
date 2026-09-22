import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importSqlServerCatalog,getSqlServerColumnMetadata,parseNativeJson} from '../../src';
import {inspectSqlServerFacetType as inspect} from '../../src/adapters/sqlserver/facet-type';
const proof=await Bun.file('fixtures/validation/facets-sqlserver-discovery-native.json').json();
const source=importSqlServerCatalog(proof.sourceText,{id:'sqlserver-facets'}),columns=getSqlServerColumnMetadata(source);
const column=(table:string,name='value')=>columns.find(c=>c.table.name===table&&c.element.name===name)!.nativeColumn;
const result=(id:string)=>proof.cases.find((r:any)=>r.id===id).actual;
test('pinned native discovery preserves exact outputs and current inputs',async()=>{
 expect(proof.serverVersion).toBe('16.0.4295.3');expect(proof.observational).toBe(false);expect(proof.serializationRecoveries).toBe(2);expect(proof.columns).toBe(37);expect(proof.cases.length).toBe(86);
 for(const [path,sha] of Object.entries(proof.sha256 as Record<string,string>))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(sha);
 for(const row of proof.cases){expect(row.actual.error,row.id).toBe(row.error);expect(row.actual.value,row.id).toBe(row.expected);}
 expect(result('decimal-checked-still-rounds').value).toBe('1.24');
 expect(result('roundabort-warnings-OFF-ON-OFF')).toMatchObject({error:0,value:null});
 expect(result('roundabort-warnings-ON-ON-OFF').error).toBe(8115);
 expect(result('nvarchar-isolated-surrogate').value).toBe('00D8');expect(result('sentinel-malformed-surrogate').value).toBe('00D8');
 expect(result('len-misses-trailing-spaces').value).toBe('6100200020002000');expect(result('sentinel-counts-spaces').error).toBe(547);
 expect(result('float-narrowing').value).toBe('1.0000000000000000e+000');expect(result('float64-retains').value).toBe('1.0000000000000002e+000');
 expect(result('filtered-index-accepts-duplicates').value).toBe('2');expect(result('disabled-index-accepts-duplicates').value).toBe('2');
});
test('native type observations distinguish unsigned integers, decimal scale and storage units',()=>{
 let observed=0,unsupported=0;
 for(const c of columns){const before=JSON.stringify(c.nativeColumn),r=inspect(c.nativeColumn);expect(r.native).toEqual(c.nativeColumn);expect(JSON.stringify(c.nativeColumn)).toBe(before);if(r.state==='observed')observed++;else unsupported++;}
 expect({observed,unsupported}).toEqual({observed:34,unsupported:3});
 expect(inspect(column('integers','tiny')).meaning).toEqual({family:'integer',bits:8,signed:false});
 expect(inspect(column('integers','wide')).meaning).toEqual({family:'integer',bits:64,signed:true});
 expect(inspect(column('decimal3838')).meaning).toEqual({family:'decimal',precision:38,scale:38,inputRounding:'session-dependent'});
 expect(inspect(column('nvarchar1')).meaning).toMatchObject({family:'string',maxBytes:2,maxUtf16Units:1,representation:'utf16-code-units'});
 expect(inspect(column('bytes_bound')).meaning).toEqual({family:'binary',size:'max',maxBytes:null,padding:'variable'});
 expect(inspect(column('floats','low_precision')).meaning).toEqual({family:'float',bits:32,mantissaBits:24});
 expect(inspect(column('alias_value')).state).toBe('unsupported');expect(inspect(column('temporal')).state).toBe('unsupported');
});
test('inconsistent and inexact native metadata refuses without normalization; unknown detail stays attached',()=>{
 for(const [key,value] of [['precision','5.00000000000000001'],['scale','-0'],['max_length','5e-4000'],['precision','39'],['scale','6'],['max_length','9'],['system_type_id','108'],['user_type_id','257'],['is_assembly_type','true'],['is_user_defined','true'],['type_schema','"custom"'],['collation_name','"custom"']] as const){
  const c=structuredClone(column('decimal52'));if(c.kind!=='object')throw Error('object');c.members[key]=parseNativeJson(value);const r=inspect(c);expect(r.state,key+':'+value).toBe('unsupported');expect(r.native).toEqual(c);
 }
 const c=structuredClone(column('nvarchar1'));if(c.kind!=='object')throw Error('object');c.members.max_length=parseNativeJson('3');expect(inspect(c).state).toBe('unsupported');
 c.members.max_length=parseNativeJson('2.00e0');c.members.future=parseNativeJson('{"unbounded":1e999,"integer":9007199254740993}');const r=inspect(c);expect(r.state).toBe('observed');expect(r.native).toEqual(c);
 let calls=0;expect(()=>inspect({get kind(){calls++;return 'object';}} as any)).toThrow();expect(calls).toBe(0);
});
