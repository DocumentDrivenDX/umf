import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const root=resolve('.');
await import(root+'/scripts/codegen/entry.ts');
const {discoverTableMigrationChanges}=await import(root+'/src/table-migration/reviewed.ts');
const fixture=JSON.parse(readFileSync(root+'/docs/helix/04-build/evidence/rust-migration/r3/sol-implementation-closure/frozen.json','utf8')).cases[0].request;
const doc=JSON.parse(fixture.previous.source.utf8),m=doc.modules[0],rec=m.elements.find((e:any)=>e.kind==='record'),table=m.extensions['umf.tables'].tables[0];
for(let i=0;i<256;i++){const id='meterField'+i;m.elements.splice(m.elements.indexOf(rec),0,{id,kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});rec.members.push({module:m.id,element:id});table.columns.push({field:{module:m.id,element:id},name:'meter_'+i,nativeType:{kind:'text'}});}
const nextDoc=structuredClone(doc);for(const f of nextDoc.modules[0].elements)if(f.id.startsWith('meterField'))f.nullability='required';
const call=(operation:string,request:any)=>JSON.parse((globalThis as any)['__umf_'+operation](JSON.stringify(request)));
const deploy=(d:any)=>{const result=call('table_deploy',{text:JSON.stringify(d),format:'json',module:m.id,configuration:fixture.previous.configuration});if(result.result?.status!=='compiled')throw Error(JSON.stringify(result));return result.result.bundle;};
const previous=deploy(doc),next=deploy(nextDoc),candidates=discoverTableMigrationChanges(previous,next);
const markers=candidates.map(({oldValue,newValue,...marker}:any)=>marker);
const options={version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],reviewedChanges:markers,validations:[]};
const request={...fixture,previous,next,options,id:'bounded-inner-scans'};
const expected=call('table_migrate',request);
if(expected.result?.status!=='compiled')throw Error(JSON.stringify(expected));
// Capture into scratch; retained expectations must not be overwritten.
const dir='/private/tmp/sol-final-review/migration-scan-recapture';mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/scan-inputs.json',JSON.stringify({previous,next,options,candidates}));
const {gzipSync}=await import('node:zlib');writeFileSync(dir+'/frozen.json.gz',gzipSync(Buffer.from(JSON.stringify({cases:[{id:'sol-final-large-reviewed-catalog-inner-scans',operation:'compileTableMigration',request,expected}]}))));
console.log(JSON.stringify({columns:previous.expectedCatalog.columns.length,markers:markers.length,steps:expected.result.plan.steps.length}));
