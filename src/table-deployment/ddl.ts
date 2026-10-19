// SPDX-License-Identifier: MIT OR Apache-2.0
import {hashCanonical} from '../compilation/bundle/hash';
import type {TableDeclaration} from '../extensions/tables';
import type {DeploymentContext,TableDeploymentBundle} from './types';
import {deploymentError} from './configuration';
import {expressionSql,literalSql,nativeType,nativeTypeExpectation,quoteIdentifier as q} from './sql';
import {policySql} from './policies';
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
   if(field.facets&&Object.keys(field.facets).some(k=>!['precision','scale'].includes(k)))deploymentError('Logical facet requires a qualified native constraint',p);
   if(field.allowedValues?.length)deploymentError('Logical allowedValues requires an explicit qualified native constraint',p);
   if(c.nativeType.kind==='numeric'&&(field.facets?.precision!==c.nativeType.precision||field.facets?.scale!==c.nativeType.scale))deploymentError('Native numeric capacity must equal the declared logical precision/scale',p);
   if(['char','float4','float8','timestamp'].includes(c.nativeType.kind))deploymentError('Native padding/float/time codec is not yet qualified',p);
   if(c.nativeType.kind==='bytea'&&field.scalarType!=='binary')deploymentError('bits128 bytea requires a separately qualified width constraint',p);
   let sql=q(c.name)+' '+nativeType(c.nativeType);
   if(['text','varchar'].includes(c.nativeType.kind))sql+=' COLLATE pg_catalog."C"';
   if(field.nullability==='required')sql+=' NOT NULL';
   if(c.generated)sql+=' GENERATED '+(c.generated.generation==='always'?'ALWAYS':'BY DEFAULT')+' AS IDENTITY';
   if(c.default){
    const value=c.default.kind==='literal'?literalSql(c.default.value):c.default.kind==='randomUuid'?'pg_catalog.gen_random_uuid()':'CURRENT_TIMESTAMP';
    sql+=' DEFAULT '+value;
   }
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
   const kind=c.nativeType.kind;
   const predicate=kind==='numeric'?`${column} NOT IN ('NaN'::pg_catalog.numeric, 'Infinity'::pg_catalog.numeric, '-Infinity'::pg_catalog.numeric)`:
    kind==='date'?`${column} >= '0001-01-01'::pg_catalog.date AND ${column} <= '9999-12-31'::pg_catalog.date`:
    kind==='timestamptz'?`${column} >= '0001-01-01T00:00:00Z'::pg_catalog.timestamptz AND ${column} <= '9999-12-31T23:59:59.999999Z'::pg_catalog.timestamptz`:null;
   if(predicate){
    if(constraintNames.has(name))deploymentError('Generated domain constraint name collision',path);
    constraintNames.add(name);
    const definitionSql='CONSTRAINT '+q(name)+' CHECK ('+predicate+')';
    columns.push(definitionSql);checks.push({table:table.id,id:'domain:'+c.field.module+'.'+c.field.element,name,definitionSql});
   }
  }
  for(const check of table.checks){const definitionSql='CONSTRAINT '+q(check.name)+' CHECK ('+expressionSql(check.expression,table,ctx)+')';columns.push(definitionSql);checks.push({table:table.id,id:check.id,name:check.name,definitionSql});}
  ctx.add('table',path,'CREATE TABLE '+ctx.relation(table)+' (\n  '+columns.join(',\n  ')+'\n)');
  ctx.add('table',path,'ALTER TABLE '+ctx.relation(table)+' ENABLE ROW LEVEL SECURITY');
  ctx.add('table',path,'ALTER TABLE '+ctx.relation(table)+' FORCE ROW LEVEL SECURITY');
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
   ctx.add('foreignKey',path+'/foreignKeys/'+j,'ALTER TABLE '+ctx.relation(table)+' ADD '+definitionSql);
  }
  for(const[j,index]of table.indexes.entries()){
   const definitionSql='USING btree ('+index.fields.map(f=>q(ctx.column(table,f))).join(', ')+')'+(index.include.length?' INCLUDE ('+index.include.map(f=>q(ctx.column(table,f))).join(', ')+')':'');
   indexes.push({table:table.id,id:index.id,name:index.name,unique:index.unique,definitionSql});
   ctx.add('index',path+'/indexes/'+j,'CREATE '+(index.unique?'UNIQUE ':'')+'INDEX '+q(index.name)+' ON '+ctx.relation(table)+' '+definitionSql);
  }
  emitPolicies(table,path,ctx);
 }
 return {tables:ctx.payload.tables,columns:expectations,keys,checks,foreignKeys,indexes};
}
function emitPolicies(table:TableDeclaration,path:string,ctx:DeploymentContext):void{
 const relation=ctx.relation(table);
 // PUBLIC gets no implicit data capability. Host catalog admission separately rejects inherited/other ACLs.
 ctx.add('grant',path,'REVOKE ALL PRIVILEGES ON TABLE '+relation+' FROM PUBLIC');
 const record=ctx.document.modules.find(m=>m.id===table.record.module)!.elements.find(e=>e.id===table.record.element)!;
 const mutable=table.columns.filter(c=>c.immutable!==true&&!c.generated&&!record.keys!.some(k=>k.fields.some(f=>f.module===c.field.module&&f.element===c.field.element)));
 for(const audience of ['person','batch'] as const){
  const role=audience==='person'?ctx.configuration.personRole:ctx.configuration.batchRole;
  for(const command of ['select','insert','update','delete'] as const){
   const rule=table.policy[audience][command],p=path+'/policy/'+audience+'/'+command;
   const expression=policySql(rule,table,ctx,audience,p),name='umf_'+audience+'_'+command;
   const clauses=command==='insert'?' WITH CHECK ('+expression+')':command==='update'?' USING ('+expression+') WITH CHECK ('+expression+')':' USING ('+expression+')';
   ctx.add('policy',p,'CREATE POLICY '+q(name)+' ON '+relation+' AS PERMISSIVE FOR '+command.toUpperCase()+' TO '+q(role)+clauses);
   if(rule.kind==='deny')continue;
   if(command==='update'&&!mutable.length)deploymentError('UPDATE has no mutable ordinary columns',p);
   const privilege=command==='update'?'UPDATE ('+mutable.map(c=>q(c.name)).join(', ')+')':command.toUpperCase();
   ctx.add('grant',p,'GRANT '+privilege+' ON TABLE '+relation+' TO '+q(role));
  }
  const identities=table.columns.filter(c=>c.generated);
  // Sequence names are assigned by PostgreSQL. Grant through the exact table/column
  // binding in a separately qualified host step, never a guessed truncated name.
  if(identities.length&&table.policy[audience].insert.kind!=='deny')deploymentError('Identity sequence privilege qualification is pending',path);
 }
}
