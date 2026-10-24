// SPDX-License-Identifier: MIT OR Apache-2.0
import {hashCanonical} from '../compilation/bundle/hash';
import type {TableDeclaration} from '../extensions/tables';
import type {DeploymentContext,TableDeploymentBundle} from './types';
import {deploymentError} from './configuration';
import {columnDefinitionSql,expressionSql,nativeTypeExpectation,quoteIdentifier as q,quoteText} from './sql';
import {policySql} from './policies';
import {domainPredicates} from './domains';
import {deriveTableGrantEffectRow,mutableTableGrantColumns,renderTableGrantSql} from './grants';
const keyName=(table:string,id:string):string=>'umf_k_'+hashCanonical([table,id]).slice(0,32);
export function deploymentSteps(ctx:DeploymentContext):TableDeploymentBundle['expectedCatalog']{
 const keys:TableDeploymentBundle['expectedCatalog']['keys']=[];
 const expectations:TableDeploymentBundle['expectedCatalog']['columns']=[];
 const checks:TableDeploymentBundle['expectedCatalog']['checks']=[],foreignKeys:TableDeploymentBundle['expectedCatalog']['foreignKeys']=[],indexes:TableDeploymentBundle['expectedCatalog']['indexes']=[];
 const relationNames=new Set(ctx.payload.tables.flatMap(t=>[t.name,...t.indexes.map(i=>i.name)]));
 for(const[i,table]of ctx.payload.tables.entries()){
  const path=ctx.path+'/tables/'+i,record=ctx.document.modules.find(m=>m.id===table.record.module)!.elements.find(e=>e.id===table.record.element)!;
  if([table.name,...table.indexes.map(index=>index.name)].some(name=>/^umf_lifecycle_/i.test(name)))deploymentError('Native lifecycle metadata relation/index names are reserved',path);
  const columns=table.columns.map((c,j)=>{
   const field=ctx.field(c.field),p=path+'/columns/'+j;
   // Unknown logical qualifiers must not acquire an executable interpretation.
   if(Object.keys(field.extensions).length||field.semanticTypes?.length)deploymentError('Selected Field extension/semantic type requires a qualified native interpretation',p);
   domainPredicates(c,field);
   if(c.nativeType.kind==='numeric'&&(field.facets?.precision!==c.nativeType.precision||field.facets?.scale!==c.nativeType.scale))deploymentError('Native numeric capacity must equal the declared logical precision/scale',p);
   if(['char','float4','float8','timestamp'].includes(c.nativeType.kind))deploymentError('Native padding/float/time codec is not yet qualified',p);
   if(c.nativeType.kind==='bytea'&&field.scalarType!=='binary')deploymentError('bits128 bytea requires a separately qualified width constraint',p);
   const sql=columnDefinitionSql(c,field.nullability!=='required');
   expectations.push({table:table.id,name:c.name,field:c.field,sourcePath:p,...nativeTypeExpectation(c.nativeType),nullable:field.nullability!=='required',collation:['text','varchar'].includes(c.nativeType.kind)?'C':null,identity:c.generated?(c.generated.generation==='always'?'a':'d'):'',definitionSql:sql});
   return sql;
  });
  const constraintNames=new Set([...table.checks,...table.foreignKeys].map(c=>c.name));
  for(const key of record.keys!){
   if(key.fields.length>32)deploymentError('PostgreSQL Key exceeds32 columns',path+'/record');
   const name=keyName(table.id,key.id);
   if(relationNames.has(name)||constraintNames.has(name))deploymentError('Generated Key name collides with an authored native name',path);
   relationNames.add(name);constraintNames.add(name);
   const names=key.fields.map(f=>ctx.column(table,f));
   const definitionSql='CONSTRAINT '+q(name)+' '+(key.primary?'PRIMARY KEY':'UNIQUE')+' ('+names.map(q).join(', ')+')';
   columns.push(definitionSql);
   keys.push({table:table.id,id:key.id,name,primary:key.primary===true,columns:names,definitionSql});
  }
  for(const c of table.columns){
   const name='umf_d_'+hashCanonical([table.id,c.field,'finite-domain']).slice(0,32),column=q(c.name);
   const predicate=domainPredicates(c,ctx.field(c.field)).join(' AND ');
   if(predicate){
    if(constraintNames.has(name))deploymentError('Generated domain constraint name collision',path);
    constraintNames.add(name);
    const definitionSql='CONSTRAINT '+q(name)+' CHECK ('+predicate+')';
    columns.push(definitionSql);checks.push({table:table.id,id:'domain:'+c.field.module+'.'+c.field.element,name,definitionSql});
   }
  }
  for(const check of table.checks){const definitionSql='CONSTRAINT '+q(check.name)+' CHECK ('+expressionSql(check.expression,table,ctx)+')';columns.push(definitionSql);checks.push({table:table.id,id:check.id,name:check.name,definitionSql});}
  ctx.add('table',path,'CREATE TABLE '+ctx.relation(table)+' (\n  '+columns.join(',\n  ')+'\n)',{operation:'create-table',subject:{kind:'table',table:table.id,record:table.record,declaration:table,catalog:{columns:expectations.filter(item=>item.table===table.id),keys:keys.filter(item=>item.table===table.id),checks:checks.filter(item=>item.table===table.id)}}});
  ctx.add('table',path,'ALTER TABLE '+ctx.relation(table)+' ENABLE ROW LEVEL SECURITY',{operation:'enable-rls',subject:{kind:'tableState',table:table.id,record:table.record}});
  ctx.add('table',path,'ALTER TABLE '+ctx.relation(table)+' FORCE ROW LEVEL SECURITY',{operation:'force-rls',subject:{kind:'tableState',table:table.id,record:table.record}});
 }
 // All tables exist before edges; constraint order never implies dependency order.
 for(const[i,table]of ctx.payload.tables.entries()){
  const path=ctx.path+'/tables/'+i;
  for(const[j,fk]of table.foreignKeys.entries()){
   const target=ctx.table(fk.target.record),key=keys.find(k=>k.table===target.id&&k.id===fk.target.key)!;
   if(!key)deploymentError('Foreign Key target has no deployed exact Key',path+'/foreignKeys/'+j);
   const action={restrict:'RESTRICT',noAction:'NO ACTION',cascade:'CASCADE',setNull:'SET NULL'};
   const deferrability=fk.deferrable===false?'NOT DEFERRABLE':fk.deferrable==='immediate'?'DEFERRABLE INITIALLY IMMEDIATE':'DEFERRABLE INITIALLY DEFERRED';
   const definitionSql='CONSTRAINT '+q(fk.name)+' FOREIGN KEY ('+fk.fields.map(f=>q(ctx.column(table,f))).join(', ')+') REFERENCES '+ctx.relation(target)+' ('+key.columns.map(q).join(', ')+') ON UPDATE '+action[fk.onUpdate]+' ON DELETE '+action[fk.onDelete]+' '+deferrability;
   foreignKeys.push({table:table.id,id:fk.id,name:fk.name,targetKey:key.name,definitionSql});
   ctx.add('foreignKey',path+'/foreignKeys/'+j,'ALTER TABLE '+ctx.relation(table)+' ADD '+definitionSql,{operation:'add-foreign-key',subject:{kind:'foreignKey',table:table.id,id:fk.id}});
  }
  for(const[j,index]of table.indexes.entries()){
   const definitionSql='USING btree ('+index.fields.map(f=>q(ctx.column(table,f))).join(', ')+')'+(index.include.length?' INCLUDE ('+index.include.map(f=>q(ctx.column(table,f))).join(', ')+')':'');
   indexes.push({table:table.id,id:index.id,name:index.name,unique:index.unique,definitionSql});
   ctx.add('index',path+'/indexes/'+j,'CREATE '+(index.unique?'UNIQUE ':'')+'INDEX '+q(index.name)+' ON '+ctx.relation(table)+' '+definitionSql,{operation:'add-index',subject:{kind:'index',table:table.id,id:index.id}});
  }
  emitPolicies(table,path,ctx);
 }
 const comments:NonNullable<TableDeploymentBundle['expectedCatalog']['comments']>=[];
 for(const [i,table] of ctx.payload.tables.entries()){
  const record=ctx.document.modules.find(m=>m.id===table.record.module)!.elements.find(e=>e.id===table.record.element)!;
  const path=ctx.path+'/tables/'+i;
  const add=(text:string,column?:string)=>{
   if(text.includes('\0'))deploymentError('PostgreSQL comments cannot contain NUL',path);
   comments.push({table:table.id,...(column===undefined?{}:{column}),text});
   ctx.add('comment',path+'/comments'+(column===undefined?'':'/'+table.columns.findIndex(c=>c.name===column)),
    'COMMENT ON '+(column===undefined?'TABLE ':'COLUMN ')+ctx.relation(table)+(column===undefined?'':'.'+q(column))+' IS '+quoteText(text),
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
 ctx.add('grant',path,'REVOKE ALL PRIVILEGES ON TABLE '+relation+' FROM PUBLIC',{operation:'revoke-public',subject:{kind:'publicGrant',table:table.id,privilege:'all'}});
 const record=ctx.document.modules.find(m=>m.id===table.record.module)!.elements.find(e=>e.id===table.record.element)!;
 const mutable=mutableTableGrantColumns(table,table.record.module,record);
 for(const audience of ['person','batch'] as const){
  const role=audience==='person'?ctx.configuration.personRole:ctx.configuration.batchRole;
  for(const command of ['select','insert','update','delete'] as const){
   const rule=table.policy[audience][command],p=path+'/policy/'+audience+'/'+command;
   const expression=policySql(rule,table,ctx,audience,p),name='umf_'+audience+'_'+command;
   const clauses=command==='insert'?' WITH CHECK ('+expression+')':command==='update'?' USING ('+expression+') WITH CHECK ('+expression+')':' USING ('+expression+')';
   ctx.add('policy',p,'CREATE POLICY '+q(name)+' ON '+relation+' AS PERMISSIVE FOR '+command.toUpperCase()+' TO '+q(role)+clauses,{operation:'create-policy',subject:{kind:'policy',table:table.id,audience,command}});
   if(rule.kind==='deny')continue;
   if(command==='update'&&!mutable.length)deploymentError('UPDATE has no mutable ordinary columns',p);
   const grant=deriveTableGrantEffectRow({table,recordModule:table.record.module,record,schema:ctx.configuration.schema,role,audience,command});
   ctx.add('grant',p,renderTableGrantSql(grant,'grant'),{operation:'grant-table',subject:{kind:'tableGrant',table:table.id,role,privilege:command,columns:command==='update'?mutable:null}});
  }
  const identities=table.columns.filter(c=>c.generated);
  // Sequence names are assigned by PostgreSQL. Grant through the exact table/column
  // binding in a separately qualified host step, never a guessed truncated name.
  if(identities.length&&table.policy[audience].insert.kind!=='deny')deploymentError('Identity sequence privilege qualification is pending',path);
 }
}
