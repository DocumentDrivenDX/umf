// SPDX-License-Identifier: MIT OR Apache-2.0
import {hashCanonical,hashCanonicalCharged} from '../compilation/bundle/hash';
import type {TableDeclaration} from '../extensions/tables';
import type {DeploymentContext,TableDeploymentBundle} from './types';
import {deploymentError} from './configuration';
import {columnDefinitionSql,expressionSql,nativeTypeExpectation,quoteIdentifier as q,quoteText,sqlJoin} from './sql';
import {policySql} from './policies';
import {domainPredicates} from './domains';
import {deriveTableGrantEffectRow,mutableTableGrantColumns,renderTableGrantSql} from './grants';
const keyName=(table:string,id:string,ctx:DeploymentContext,path:string):string=>'umf_k_'+(ctx.accounting?hashCanonicalCharged([table,id],ctx.accounting,path):hashCanonical([table,id])).slice(0,32);
export function deploymentSteps(ctx:DeploymentContext):TableDeploymentBundle['expectedCatalog']{
 const join=(parts:readonly string[],path=ctx.path)=>sqlJoin(parts,ctx.accounting,path);
 ctx.accounting?.visit('ddl-result-carriers',ctx.path,6);
 const keys:TableDeploymentBundle['expectedCatalog']['keys']=[];
 const expectations:TableDeploymentBundle['expectedCatalog']['columns']=[];
 const checks:TableDeploymentBundle['expectedCatalog']['checks']=[],foreignKeys:TableDeploymentBundle['expectedCatalog']['foreignKeys']=[],indexes:TableDeploymentBundle['expectedCatalog']['indexes']=[];
 const relationNames=new Set<string>();for(let ti=0;ti<ctx.payload.tables.length;ti++){const t=ctx.payload.tables[ti]!;ctx.accounting?.visit('ddl-relation-name-table',ctx.path+'/tables',1);relationNames.add(t.name);for(const index of t.indexes){ctx.accounting?.visit('ddl-relation-name-index',ctx.path+'/tables/'+ti+'/indexes');relationNames.add(index.name);}}
 for(const[i,table]of ctx.payload.tables.entries()){
  const path=ctx.path+'/tables/'+i;ctx.accounting?.visit('ddl-table-carriers',path,3);let recordModule:typeof ctx.document.modules[number]|undefined;for(const candidate of ctx.document.modules){ctx.accounting?.visit('ddl-record-module-predicate',path);if(candidate.id===table.record.module){recordModule=candidate;break;}}if(!recordModule)deploymentError('Missing original Record module',path);let record:typeof recordModule.elements[number]|undefined;for(const candidate of recordModule.elements){ctx.accounting?.visit('ddl-record-element-predicate',path);if(candidate.id===table.record.element){record=candidate;break;}}if(!record)deploymentError('Missing original Record',path);
  let reserved=/^umf_lifecycle_/i.test(table.name);for(const index of table.indexes){ctx.accounting?.visit('ddl-reserved-index-name-predicate',path);if(/^umf_lifecycle_/i.test(index.name))reserved=true;}if(reserved)deploymentError('Native lifecycle metadata relation/index names are reserved',path);
  const columns:string[]=[],domainByColumn:string[][]=[];for(let j=0;j<table.columns.length;j++){const c=table.columns[j]!;
   ctx.accounting?.visit('ddl-column',`${path}/columns/${j}`);
   const field=ctx.field(c.field),p=path+'/columns/'+j;
   // Unknown logical qualifiers must not acquire an executable interpretation.
   let hasExtensions=false;for(const extensionKey in field.extensions)if(Object.hasOwn(field.extensions,extensionKey)){ctx.accounting?.visit('ddl-field-extension-scan',p);hasExtensions=true;}if(hasExtensions||field.semanticTypes?.length)deploymentError('Selected Field extension/semantic type requires a qualified native interpretation',p);
   const domain=domainPredicates(c,field,ctx.accounting,`${p}/domain`);ctx.accounting?.visit('ddl-domain-predicate-array-retention',p);domainByColumn.push(domain);
   if(c.nativeType.kind==='numeric'&&(field.facets?.precision!==c.nativeType.precision||field.facets?.scale!==c.nativeType.scale))deploymentError('Native numeric capacity must equal the declared logical precision/scale',p);
   if(['char','float4','float8','timestamp'].includes(c.nativeType.kind))deploymentError('Native padding/float/time codec is not yet qualified',p);
   if(c.nativeType.kind==='bytea'&&field.scalarType!=='binary')deploymentError('bits128 bytea requires a separately qualified width constraint',p);
   const sql=columnDefinitionSql(c,field.nullability!=='required',ctx.accounting,p);
   ctx.accounting?.visit('ddl-column-expectation-retain',p);
   const typeExpectation=nativeTypeExpectation(c.nativeType,ctx.accounting,p);
   ctx.accounting?.visit('ddl-column-expectation-object',p,11);
   expectations.push({table:table.id,name:c.name,field:c.field,sourcePath:p,...typeExpectation,nullable:field.nullability!=='required',collation:['text','varchar'].includes(c.nativeType.kind)?'C':null,identity:c.generated?(c.generated.generation==='always'?'a':'d'):'',definitionSql:sql});
   ctx.accounting?.visit('ddl-column-sql-retain',p);columns.push(sql);
  }
  const constraintNames=new Set<string>();for(const item of table.checks){ctx.accounting?.visit('ddl-constraint-name',path);constraintNames.add(item.name);}for(const item of table.foreignKeys){ctx.accounting?.visit('ddl-constraint-name',path);constraintNames.add(item.name);}
  for(const key of record.keys!){
   if(key.fields.length>32)deploymentError('PostgreSQL Key exceeds32 columns',path+'/record');
   ctx.accounting?.visit('ddl-key-name-hash',path+'/record');const name=keyName(table.id,key.id,ctx,path+'/record');
   if(relationNames.has(name)||constraintNames.has(name))deploymentError('Generated Key name collides with an authored native name',path);
   ctx.accounting?.visit('ddl-key-name-retention',path);relationNames.add(name);constraintNames.add(name);
   ctx.accounting?.visit('ddl-key-output-carriers',path+'/record',2);const names:string[]=[];for(const field of key.fields){ctx.accounting?.visit('ddl-key-field',path+'/record');ctx.accounting?.visit('ddl-key-field-retention',path+'/record');names.push(ctx.column(table,field));}
   const nameParts:string[]=[];for(let ni=0;ni<names.length;ni++){if(ni){ctx.accounting?.visit('ddl-key-separator-retention',path);nameParts.push(', ');}const quoted=q(names[ni]!,ctx.accounting,path);ctx.accounting?.visit('ddl-key-name-part-retention',path);nameParts.push(quoted);}
   const definitionSql=join(['CONSTRAINT ',q(name,ctx.accounting,path),' ',key.primary?'PRIMARY KEY':'UNIQUE',' (',join(nameParts,path),')'],path);
   ctx.accounting?.visit('ddl-key-definition-retain',path);
   columns.push(definitionSql);
   ctx.accounting?.visit('ddl-key-catalog-object-construction',path,6);
   ctx.accounting?.visit('ddl-key-retain',path);
   keys.push({table:table.id,id:key.id,name,primary:key.primary===true,columns:names,definitionSql});
  }
  for(let ci=0;ci<table.columns.length;ci++){const c=table.columns[ci]!;
   ctx.accounting?.visit('ddl-domain-constraint-identity',path+'/columns/'+ci);const name='umf_d_'+(ctx.accounting?hashCanonicalCharged([table.id,c.field,'finite-domain'],ctx.accounting,`${path}/columns/${ci}`):hashCanonical([table.id,c.field,'finite-domain'])).slice(0,32);
   ctx.accounting?.visit('ddl-domain-output-carrier',`${path}/columns/${ci}`);const domainParts=domainByColumn[ci]!,domainChunks:string[]=[];for(let di=0;di<domainParts.length;di++){ctx.accounting?.visit('ddl-domain-predicate-read',`${path}/columns/${ci}`);if(di){ctx.accounting?.visit('ddl-domain-and-retention',`${path}/columns/${ci}`);domainChunks.push(' AND ');}ctx.accounting?.visit('ddl-domain-chunk-retention',`${path}/columns/${ci}`);domainChunks.push(domainParts[di]!);}const predicate=join(domainChunks,path);
   if(predicate){
    if(constraintNames.has(name))deploymentError('Generated domain constraint name collision',path);
    constraintNames.add(name);
    const definitionSql=join(['CONSTRAINT ',q(name,ctx.accounting,path),' CHECK (',predicate,')'],path);
    ctx.accounting?.visit('ddl-domain-check-retain',path);columns.push(definitionSql);ctx.accounting?.visit('ddl-domain-check-retain',path);checks.push({table:table.id,id:'domain:'+c.field.module+'.'+c.field.element,name,definitionSql});
   }
  }
  for(const check of table.checks){ctx.accounting?.visit('ddl-check',path+'/checks');const definitionSql=join(['CONSTRAINT ',q(check.name,ctx.accounting,path),' CHECK (',expressionSql(check.expression,table,ctx),')'],path);ctx.accounting?.visit('ddl-check-definition-retain',path);columns.push(definitionSql);ctx.accounting?.visit('ddl-check-record-retain',path);checks.push({table:table.id,id:check.id,name:check.name,definitionSql});}
  const columnChunks:string[]=[];for(let ci=0;ci<columns.length;ci++){ctx.accounting?.visit('ddl-create-table-column',path);if(ci)columnChunks.push(',\n  ');columnChunks.push(columns[ci]!);}const emittedColumns=join(columnChunks,path);
  const embeddedColumns:typeof expectations=[];for(const item of expectations){ctx.accounting?.visit('ddl-create-table-expectation-filter',path);if(item.table===table.id)embeddedColumns.push(item);}const embeddedKeys:typeof keys=[];for(const item of keys){ctx.accounting?.visit('ddl-create-table-key-filter',path);if(item.table===table.id)embeddedKeys.push(item);}const embeddedChecks:typeof checks=[];for(const item of checks){ctx.accounting?.visit('ddl-create-table-check-filter',path);if(item.table===table.id)embeddedChecks.push(item);}
  ctx.add('table',path,join(['CREATE TABLE ',ctx.relation(table),' (\n  ',emittedColumns,'\n)'],path),{operation:'create-table',subject:{kind:'table',table:table.id,record:table.record,declaration:table,catalog:{columns:embeddedColumns,keys:embeddedKeys,checks:embeddedChecks}}});
  ctx.add('table',path,'ALTER TABLE '+ctx.relation(table)+' ENABLE ROW LEVEL SECURITY',{operation:'enable-rls',subject:{kind:'tableState',table:table.id,record:table.record}});
  ctx.add('table',path,'ALTER TABLE '+ctx.relation(table)+' FORCE ROW LEVEL SECURITY',{operation:'force-rls',subject:{kind:'tableState',table:table.id,record:table.record}});
 }
 // All tables exist before edges; constraint order never implies dependency order.
 for(const[i,table]of ctx.payload.tables.entries()){
  const path=ctx.path+'/tables/'+i;
  for(const[j,fk]of table.foreignKeys.entries()){
   const target=ctx.table(fk.target.record);let key:typeof keys[number]|undefined;for(const candidate of keys){ctx.accounting?.visit('ddl-foreign-key-key-scan',path+'/foreignKeys');if(candidate.table===target.id&&candidate.id===fk.target.key){key=candidate;break;}}
   if(!key)deploymentError('Foreign Key target has no deployed exact Key',path+'/foreignKeys/'+j);
   const action={restrict:'RESTRICT',noAction:'NO ACTION',cascade:'CASCADE',setNull:'SET NULL'};
   const deferrability=fk.deferrable===false?'NOT DEFERRABLE':fk.deferrable==='immediate'?'DEFERRABLE INITIALLY IMMEDIATE':'DEFERRABLE INITIALLY DEFERRED';
   ctx.accounting?.visit('ddl-foreign-key-output-carriers',path+'/foreignKeys/'+j,4);const localColumns:string[]=[];for(const field of fk.fields){ctx.accounting?.visit('ddl-foreign-key-field',path+'/foreignKeys/'+j);localColumns.push(q(ctx.column(table,field),ctx.accounting,path));}const targetColumns:string[]=[];for(const col of key.columns){ctx.accounting?.visit('ddl-foreign-key-target-column',path+'/foreignKeys/'+j);targetColumns.push(q(col,ctx.accounting,path));}
   const localChunks:string[]=[];for(let k=0;k<localColumns.length;k++){if(k)localChunks.push(', ');localChunks.push(localColumns[k]!);}const targetChunks:string[]=[];for(let k=0;k<targetColumns.length;k++){if(k)targetChunks.push(', ');targetChunks.push(targetColumns[k]!);}const local=join(localChunks,path),remote=join(targetChunks,path);
   const definitionSql=join(['CONSTRAINT ',q(fk.name,ctx.accounting,path),' FOREIGN KEY (',local,') REFERENCES ',ctx.relation(target),' (',remote,') ON UPDATE ',action[fk.onUpdate],' ON DELETE ',action[fk.onDelete],' ',deferrability],path);
   ctx.accounting?.visit('ddl-foreign-key-retention',path);
   foreignKeys.push({table:table.id,id:fk.id,name:fk.name,targetKey:key.name,definitionSql});
   ctx.add('foreignKey',path+'/foreignKeys/'+j,join(['ALTER TABLE ',ctx.relation(table),' ADD ',definitionSql],path),{operation:'add-foreign-key',subject:{kind:'foreignKey',table:table.id,id:fk.id}});
  }
  for(const[j,index]of table.indexes.entries()){
   ctx.accounting?.visit('ddl-index-output-carriers',path+'/indexes/'+j,3);const indexFields:string[]=[];for(const field of index.fields){ctx.accounting?.visit('ddl-index-field',path+'/indexes/'+j);indexFields.push(q(ctx.column(table,field),ctx.accounting,path));}const includeFields:string[]=[];for(const field of index.include){ctx.accounting?.visit('ddl-index-include-field',path+'/indexes/'+j);includeFields.push(q(ctx.column(table,field),ctx.accounting,path));}
   const indexChunks:string[]=['USING btree ('];for(let k=0;k<indexFields.length;k++){if(k)indexChunks.push(', ');indexChunks.push(indexFields[k]!);}indexChunks.push(')');if(index.include.length){indexChunks.push(' INCLUDE (');for(let k=0;k<includeFields.length;k++){if(k)indexChunks.push(', ');indexChunks.push(includeFields[k]!);}indexChunks.push(')');}const definitionSql=join(indexChunks,path);
   ctx.accounting?.visit('ddl-index-retention',path);
   indexes.push({table:table.id,id:index.id,name:index.name,unique:index.unique,definitionSql});
   ctx.add('index',path+'/indexes/'+j,join(['CREATE ',index.unique?'UNIQUE ':'','INDEX ',q(index.name,ctx.accounting,path),' ON ',ctx.relation(table),' ',definitionSql],path),{operation:'add-index',subject:{kind:'index',table:table.id,id:index.id}});
  }
  emitPolicies(table,path,ctx);
 }
 const comments:NonNullable<TableDeploymentBundle['expectedCatalog']['comments']>=[];
 for(const [i,table] of ctx.payload.tables.entries()){
  let module:typeof ctx.document.modules[number]|undefined;for(const candidate of ctx.document.modules){ctx.accounting?.visit('ddl-comment-record-module-scan',ctx.path+'/tables/'+i);if(candidate.id===table.record.module){module=candidate;break;}}if(!module)deploymentError('Missing original Record module',ctx.path+'/tables/'+i);let record:typeof module.elements[number]|undefined;for(const candidate of module.elements){ctx.accounting?.visit('ddl-comment-record-scan',ctx.path+'/tables/'+i);if(candidate.id===table.record.element){record=candidate;break;}}if(!record)deploymentError('Missing original Record',ctx.path+'/tables/'+i);
  const path=ctx.path+'/tables/'+i;
  const add=(text:string,column?:string)=>{
   if(text.includes('\0'))deploymentError('PostgreSQL comments cannot contain NUL',path);
   ctx.accounting?.visit('ddl-comment-object-construction',path,column===undefined?2:3);ctx.accounting?.visit('ddl-comment-retention',path);comments.push({table:table.id,...(column===undefined?{}:{column}),text});
   let columnIndex=-1;if(column!==undefined)for(let ci=0;ci<table.columns.length;ci++){ctx.accounting?.visit('ddl-comment-column-scan',path);if(table.columns[ci]!.name===column){columnIndex=ci;break;}}
   ctx.add('comment',path+'/comments'+(column===undefined?'':'/'+columnIndex),
    join(['COMMENT ON ',column===undefined?'TABLE ':'COLUMN ',ctx.relation(table),column===undefined?'':'.'+q(column,ctx.accounting,path),' IS ',quoteText(text,ctx.accounting,path)],path),
    {operation:'set-comment',subject:{kind:'comment',table:table.id,column:column??null,text}});
  };
  if(record.description!==undefined)add(record.description);
  for(const column of table.columns){const field=ctx.field(column.field);if(field.description!==undefined)add(field.description,column.name);}
 }
 return {tables:ctx.payload.tables,columns:expectations,keys,checks,foreignKeys,indexes,...(comments.length?{comments}:{})};
}
function emitPolicies(table:TableDeclaration,path:string,ctx:DeploymentContext):void{
 const relation=ctx.relation(table);
 // PUBLIC gets no implicit data capability. Host catalog admission separately rejects inherited/other ACLs.
 ctx.add('grant',path,sqlJoin(['REVOKE ALL PRIVILEGES ON TABLE ',relation,' FROM PUBLIC'],ctx.accounting,path),{operation:'revoke-public',subject:{kind:'publicGrant',table:table.id,privilege:'all'}});
 let recordModule:typeof ctx.document.modules[number]|undefined;for(const candidate of ctx.document.modules){ctx.accounting?.visit('ddl-policy-record-module',path);if(candidate.id===table.record.module){recordModule=candidate;break;}}if(!recordModule)deploymentError('Missing original Record module',path);let record:typeof recordModule.elements[number]|undefined;for(const candidate of recordModule.elements){ctx.accounting?.visit('ddl-policy-record',path);if(candidate.id===table.record.element){record=candidate;break;}}if(!record)deploymentError('Missing original Record',path);
 const mutable=mutableTableGrantColumns(table,table.record.module,record,ctx.accounting,path+'/grant-columns');
 for(const audience of ['person','batch'] as const){
  const role=audience==='person'?ctx.configuration.personRole:ctx.configuration.batchRole;
  for(const command of ['select','insert','update','delete'] as const){
   const rule=table.policy[audience][command],p=path+'/policy/'+audience+'/'+command;
   const expression=policySql(rule,table,ctx,audience,p),name='umf_'+audience+'_'+command;
   const clauses=command==='insert'?sqlJoin([' WITH CHECK (',expression,')'],ctx.accounting,p):command==='update'?sqlJoin([' USING (',expression,') WITH CHECK (',expression,')'],ctx.accounting,p):sqlJoin([' USING (',expression,')'],ctx.accounting,p);
   ctx.add('policy',p,sqlJoin(['CREATE POLICY ',q(name,ctx.accounting,p),' ON ',relation,' AS PERMISSIVE FOR ',command.toUpperCase(),' TO ',q(role,ctx.accounting,p),clauses],ctx.accounting,p),{operation:'create-policy',subject:{kind:'policy',table:table.id,audience,command}});
   if(rule.kind==='deny')continue;
   if(command==='update'&&!mutable.length)deploymentError('UPDATE has no mutable ordinary columns',p);
   const grant=deriveTableGrantEffectRow({table,recordModule:table.record.module,record,schema:ctx.configuration.schema,role,audience,command},ctx.accounting,p);
   ctx.add('grant',p,renderTableGrantSql(grant,'grant',ctx.accounting,p),{operation:'grant-table',subject:{kind:'tableGrant',table:table.id,role,privilege:command,columns:command==='update'?mutable:null}});
  }
  const identities:typeof table.columns=[];for(const column of table.columns){ctx.accounting?.visit('ddl-generated-column-scan',path);if(column.generated){ctx.accounting?.visit('ddl-generated-column-retention',path);identities.push(column);}}
  // Sequence names are assigned by PostgreSQL. Grant through the exact table/column
  // binding in a separately qualified host step, never a guessed truncated name.
  if(identities.length&&table.policy[audience].insert.kind!=='deny')deploymentError('Identity sequence privilege qualification is pending',path);
 }
}
