// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import coreSchema from '../../spec/core/schema.json';
import {coreKindOperationSchema as kinds} from '../../src/model/field-kind';
import {recordCase} from '../../scripts/core-ideals/record-tablespec-cases';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {projectRecordToTableSpec} from '../../src/core-ideals/record-tablespec-projection';
import {projectFieldToTableSpec} from '../../src/core-ideals/field-tablespec-projection';
import {projectFieldToPostgresql} from '../../src/core-ideals/field-postgresql-projection';
import {projectRecordToPostgresql} from '../../src/core-ideals/record-postgresql-projection';
import {exportTableSpec} from '../../src/adapters/tablespec';
import {backend} from '../../native/postgresql/runtime';
import {CURRENT_CORE_VERSION,type Document} from '../../src/model/types';
const table=await Bun.file('fixtures/validation/field-tablespec-projection.json').json(),postgres=await Bun.file('fixtures/validation/field-postgresql-projection-native.json').json();
function currentDocument(source:Document):Document {
 const document=structuredClone(source);document.umf=CURRENT_CORE_VERSION;return document;
}
function currentAuthor(author:any){
 return declareCoreElementKind(currentDocument(author.source),author.identity,author.provenance.kind);
}
// Re-execute the current authoring/projection APIs, never rewrite a retained
// operation receipt's version or provenance. Native input equality below is a
// functional regression check, not a fresh native execution observation.
async function currentProjection(file:string,row:any){
 const author=currentAuthor(row.author),request=structuredClone(row.request);
 if(request.fields)request.fields=request.fields.map((field:any)=>({...field,author:currentAuthor(field.author)}));
 switch(file){
  case 'field-tablespec':return projectFieldToTableSpec(author,request);
  case 'record-tablespec':return projectRecordToTableSpec(author,request);
  case 'field-postgresql':return projectFieldToPostgresql(author,request,backend);
  case 'record-postgresql':return projectRecordToPostgresql(author,request,backend);
  default:throw Error('Unknown projection policy suite');
 }
}
// Namespaced records intentionally have residuals. Generate a separate honest
// no-loss control rather than removing the residuals from a retained receipt.
const control=recordCase();
control.source.modules.forEach(module=>module.namespace='');
control.request.fields=control.request.fields.map(field=>({...field,author:declareCoreElementKind(control.source,field.author.identity,'field')}));
const cleanRecord=projectRecordToTableSpec(declareCoreElementKind(control.source,control.author.identity,'record'),control.request);
const suites=[{file:'field-tablespec',rows:table.rows},{file:'record-tablespec',rows:table.records},{file:'field-postgresql',rows:postgres.rows},{file:'record-postgresql',rows:postgres.recordRows}];
for(const suite of suites){const validator=createValidator();validator.addSchema(coreSchema);validator.addSchema(kinds);const check=validator.compile(await Bun.file('spec/core/'+suite.file+'-projection.schema.json').json());
 test(suite.file+' schema enforces strict/report loss and atomic candidate rules',async()=>{
  const results:any[]=[];
  for(const row of suite.rows){
   expect(check(row.result)).toBe(false);
   const result=await currentProjection(suite.file,row);
   expect(check(result)).toBe(true);
   expect(result.status).toBe(row.result.status);
   expect(result.source).toEqual(currentDocument(row.result.source));
   expect(result.residuals).toHaveLength(row.result.residuals.length);
   expect('mapping' in result?result.mapping:result.mappings).toEqual(row.result.mapping??row.result.mappings);
   if(suite.file.endsWith('postgresql'))expect('nativeSql' in result?result.nativeSql:undefined).toBe(row.result.nativeSql);
   else if(result.target)expect(exportTableSpec(result.target)).toBe(row.text??exportTableSpec(row.result.target));
   else expect(Object.hasOwn(row.result,'target')).toBe(false);
   results.push(result);
  }
  if(suite.file==='record-tablespec'){expect(check(cleanRecord)).toBe(true);results.push(cleanRecord);}
  const clean=results.find(result=>result.status==='projected'&&!result.residuals.length);
  expect(clean).toBeDefined();
  const copy=()=>JSON.parse(JSON.stringify(clean));
  const residual={path:'/modules/0',value:{meaning:'retained'},reason:'Not expressed',outcome:'unknown',recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'};
  let value=copy();value.request.mode='strict';value.residuals=[residual];expect(check(value)).toBe(false);
  value.request.mode='report';value.diagnostics=[{code:'LOSS',path:'/modules/0',message:'Not expressed',severity:'warning'}];expect(check(value)).toBe(true);
  value.diagnostics[0].severity='error';expect(check(value)).toBe(false);
  value=copy();value.request.mode='strict';if(value.mapping)value.mapping.outcome='unknown';else value.mappings[0].outcome='unknown';expect(check(value)).toBe(false);
  value.request.mode='report';expect(check(value)).toBe(false);value.residuals=[residual];expect(check(value)).toBe(true);
  value.status='blocked';expect(check(value)).toBe(false);delete value.target;delete value.nativeSql;value.diagnostics=[{code:'LOSS',path:'/modules/0',message:'Not expressed',severity:'error'}];expect(check(value)).toBe(true);
  value.residuals=[];expect(check(value)).toBe(false);value.residuals=[residual];value.diagnostics=[];expect(check(value)).toBe(false);
  value.diagnostics=[{code:'LOSS',path:'/modules/0',message:'Not expressed',severity:'warning'}];expect(check(value)).toBe(false);
 });
}
