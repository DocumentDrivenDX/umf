import {test,expect} from 'bun:test';
import {projectTableSpecToAvro,projectPostgresqlToAvro,projectSqlServerToAvro,projectParquetToAvro,projectAvroToTableSpec,projectToTableSpecViaAvro,importAvroSchema,exportAvroSchema,type Document} from '../../src';
import {createValidator} from '../../src/validation/schema';
const endings=['\n','\r','\u2028','\u2029'];
test('Priority projection identifier policies require absolute end in runtime and published schemas',async()=>{
 const table=(await Bun.file('fixtures/tablespec/avro-projection.json').json()).cases[0].result;
 const cases:{kind:string;source:Document;policy:any;run:(s:Document,p:any)=>unknown}[]=[{kind:'tablespec',source:table.source,policy:table.policy,run:projectTableSpecToAvro}];
 for(const [kind,run] of [['postgresql',projectPostgresqlToAvro],['sqlserver',projectSqlServerToAvro],['parquet',projectParquetToAvro]] as const){const f=await Bun.file(kind==='parquet'?'fixtures/parquet/avro/projection.json':'fixtures/'+kind+'/avro-projection.json').json();cases.push({kind,source:f.result.source,policy:f.policy,run});}
 const evidence=[];
 for(const c of cases){const check=createValidator().compile((await Bun.file('spec/projections/'+c.kind+'-avro.schema.json').json()).properties.policy);expect(check(c.policy)).toBe(true);
  for(const ending of endings){
   for(const key of ['recordName','namespace']){const policy={...c.policy,[key]:'Invalid'+ending};expect(check(policy)).toBe(false);expect(()=>c.run(c.source,policy)).toThrow();}
   const policy=structuredClone(c.policy);if(c.kind==='parquet')policy.fieldNames={'1':'Invalid'+ending};else policy.fields[Object.keys(policy.fields)[0]!].name='Invalid'+ending;expect(check(policy)).toBe(false);expect(()=>c.run(c.source,policy)).toThrow();
   if(c.kind==='parquet'){const p={...c.policy,fieldNames:{['1'+ending]:'Valid'}};expect(check(p)).toBe(false);expect(()=>c.run(c.source,p)).toThrow();}
  }
  evidence.push({kind:c.kind,lineTerminators:endings.length,runtimeAndSchemaReject:true});
 }
 const source=importAvroSchema('{"type":"record","name":"R","fields":[{"name":"v","type":"int"}]}',{id:'names'}),base={id:'target',tableName:'Valid',fields:{v:{name:'valid',representation:'integer32'}},lossPolicy:'allow-reported-loss'},check=createValidator().compile((await Bun.file('spec/projections/avro-tablespec.schema.json').json()).properties.policy);expect(check(base)).toBe(true);
 for(const ending of endings)for(const policy of [{...base,tableName:'Invalid'+ending},{...base,fields:{v:{...base.fields.v,name:'Invalid'+ending}}}]){expect(check(policy)).toBe(false);expect(()=>projectAvroToTableSpec(source,policy as any)).toThrow();}
 const chain=(await Bun.file('fixtures/validation/tablespec-chains.json').json()).cases[0];expect(()=>projectToTableSpecViaAvro(chain.source,{...chain.policy,toAvro:{...chain.policy.toAvro,lossPolicy:'strict'},toTableSpec:{...chain.policy.toTableSpec,tableName:'Invalid\n'}})).toThrow('second-stage');
 await Bun.write('fixtures/validation/projection-boundaries.json',JSON.stringify({identifierCases:evidence,tableSpecNames:true,blockedChainChecksSecondPolicy:true},null,2)+'\n');
});
test('CONTRACT-038 missing decimal scale is distinct from null and logical annotations require exact strings',()=>{
 const project=(type:any,representation:any)=>{const source=importAvroSchema(JSON.stringify({type:'record',name:'R',fields:[{name:'v',type}]}),{id:'logical'}),before=exportAvroSchema(source),r=projectAvroToTableSpec(source,{id:'target',tableName:'Valid',fields:{v:{name:'value',representation}},lossPolicy:'allow-reported-loss'});expect(exportAvroSchema(source)).toBe(before);return r;};
 const absent=project({type:'bytes',logicalType:'decimal',precision:4},'decimal');expect(absent.status).toBe('projected');expect(JSON.parse(absent.nativeSchema!).columns[0].scale).toBe(0);
 for(const scale of [null,false,'0',[],{}]){const r=project({type:'bytes',logicalType:'decimal',precision:4,scale},'decimal');expect(r.status).toBe('blocked');expect(r.target).toBeUndefined();}
 for(const logicalType of [['timestamp-micros'],'timestamp-micros\n','local-timestamp-micros\n']){const r=project({type:'long',logicalType},typeof logicalType==='string'&&logicalType.startsWith('local')?'local-timestamp':'timestamp');expect(r.status).toBe('blocked');expect(r.target).toBeUndefined();}
});
