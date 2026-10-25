// SPDX-License-Identifier: MIT OR Apache-2.0
import type {TableDeclaration,TableRowRule} from '../extensions/tables';
import type {DeploymentContext} from './types';
import {deploymentError} from './configuration';
import {quoteIdentifier as q,quoteText as s} from './sql';
import {sqlJoin} from './sql';
const same=(a:{module:string;element:string},b:{module:string;element:string})=>a.module===b.module&&a.element===b.element;
export function policySql(rule:TableRowRule,table:TableDeclaration,ctx:DeploymentContext,audience:'person'|'batch',path:string,alias?:string,depth=0):string{
 const accounting=ctx.accounting;
 const join=(parts:readonly string[],at=path)=>sqlJoin(parts,accounting,at);
 const column=(field:{module:string;element:string})=>join([alias?join([q(alias,accounting,path),'.']):'',q(ctx.column(table,field),accounting,path)]);
 if(rule.kind==='deny')return 'FALSE';if(rule.kind==='allow')return 'TRUE';
 if(rule.kind==='owner')return join(['(',column(rule.field),' COLLATE pg_catalog."C" = CURRENT_USER::pg_catalog.text COLLATE pg_catalog."C")']);
 if(rule.kind==='memberOfRole'){
  const role=ctx.configuration.groupRoles[rule.role];if(!role)deploymentError('Group alias has no trusted native binding',path+'/role');
  return join(['pg_catalog.pg_has_role(CURRENT_USER, ',s(role,accounting,path),", 'MEMBER')"]);
 }
 if(rule.kind==='memberOf'){
  const groupRoles=ctx.configuration.groupRoles;let groupKeyCount=0;for(const name in groupRoles)if(Object.hasOwn(groupRoles,name)){accounting?.visit('sql-policy-group-key-admission',path);groupKeyCount++;}accounting?.visit('sql-policy-group-key-array-retention',path,groupKeyCount);const aliases=Object.keys(groupRoles);aliases.sort((left,right)=>{accounting?.visit('sql-policy-group-key-order',path);return left<right?-1:left>right?1:0;});const groups:string[]=[];for(const name of aliases){accounting?.visit('sql-policy-group-role',path);groups.push(groupRoles[name]!);}if(!groups.length)deploymentError('Per-row group membership requires trusted group-role bindings',path);
  // An unknown per-row group never becomes an arbitrary native-role lookup.
  const chunks:string[]=['(EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS ',q('umf_group',accounting,path), ' WHERE ',q('umf_group',accounting,path),'.rolname::pg_catalog.text COLLATE pg_catalog."C" = ',column(rule.field),' COLLATE pg_catalog."C" AND ',q('umf_group',accounting,path),'.rolname::pg_catalog.text IN ('];for(let i=0;i<groups.length;i++){if(i)chunks.push(', ');chunks.push(s(groups[i]!,accounting,path));}chunks.push(') AND pg_catalog.pg_has_role(CURRENT_USER, ',q('umf_group',accounting,path),".oid, 'MEMBER')))");return join(chunks);
 }
 if(rule.kind==='any'||rule.kind==='all'){const chunks=['('];for(let i=0;i<rule.rules.length;i++){accounting?.visit('sql-policy-rule-child',`${path}/rules/${i}`);if(i)chunks.push(rule.kind==='any'?' OR ':' AND ');chunks.push(policySql(rule.rules[i]!,table,ctx,audience,`${path}/rules/${i}`,alias,depth+1));}chunks.push(')');return join(chunks);}
 if(rule.kind==='related'){
  const target=ctx.table(rule.record),nextAlias='umf_j_'+depth;
  if(target.policy[audience].select.kind==='deny')deploymentError('Related rule requires an explicit related-table SELECT policy/grant for this audience',path+'/record');
  const pairs:string[]=[];for(let i=0;i<rule.matches.length;i++){const pair=rule.matches[i]!;accounting?.visit('sql-policy-related-pair',`${path}/matches/${i}`);pairs.push(join([alias?q(alias,accounting,path):ctx.relation(table),'.',q(ctx.column(table,pair.source),accounting,path),' = ',q(nextAlias,accounting,path),'.',q(ctx.column(target,pair.target),accounting,path)]));}
  const terminal=policySql(rule.rule,target,ctx,audience,path+'/rule',nextAlias,depth+1);
  const pairChunks:string[]=[];for(let i=0;i<pairs.length;i++){if(i)pairChunks.push(' AND ');pairChunks.push(pairs[i]!);}return join(['(EXISTS (SELECT 1 FROM ',ctx.relation(target),' AS ',q(nextAlias,accounting,path),' WHERE ',join(pairChunks),' AND ',terminal,'))']);
 }
 if(rule.kind!=='via')return deploymentError('Unknown native policy rule',path);
 const walk=(index:number,current:TableDeclaration,currentAlias:string|undefined):string=>{
  if(index===rule.path.length)return policySql(rule.rule,current,ctx,audience,path+'/rule',currentAlias,depth+1);
  const step=rule.path[index]!,bindings:{table:TableDeclaration;fk:TableDeclaration['foreignKeys'][number]}[]=[];for(const candidate of ctx.payload.tables){accounting?.visit('sql-policy-via-table',path+'/path/'+index);for(const fk of candidate.foreignKeys){accounting?.visit('sql-policy-via-foreign-key',path+'/path/'+index);if(fk.relationship?.module===step.module&&fk.relationship.id===step.id){accounting?.visit('sql-policy-via-binding-retention',path+'/path/'+index);bindings.push({table:candidate,fk});}}}
  if(bindings.length!==1)deploymentError('Via path lacks one original native FK binding',path+'/path/'+index);
  const binding=bindings[0]!,target=ctx.table(binding.fk.target.record);
  let targetModule:typeof ctx.document.modules[number]|undefined;for(const candidate of ctx.document.modules){accounting?.visit('sql-policy-target-module',path+'/path/'+index);if(candidate.id===target.record.module){targetModule=candidate;break;}}if(!targetModule)deploymentError('Via target Record module is missing',path+'/path/'+index);let record:typeof targetModule.elements[number]|undefined;for(const candidate of targetModule.elements){accounting?.visit('sql-policy-target-record',path+'/path/'+index);if(candidate.id===target.record.element){record=candidate;break;}}if(!record)deploymentError('Via target Record is missing',path+'/path/'+index);let targetKey:NonNullable<typeof record.keys>[number]|undefined;for(const candidate of record.keys??[]){accounting?.visit('sql-policy-target-key',path+'/path/'+index);if(candidate.id===binding.fk.target.key){targetKey=candidate;break;}}if(!targetKey)deploymentError('Via target Key is missing',path+'/path/'+index);const fields=targetKey.fields;
  const next=step.direction==='forward'?target:binding.table;
  if(next.policy[audience].select.kind==='deny')deploymentError('Via requires an explicit related-table SELECT grant/policy for this audience',path+'/path/'+index);
  if(!same(current.record,step.direction==='forward'?binding.table.record:target.record))deploymentError('Via path changed after admission',path+'/path/'+index);
  const nextAlias='umf_v_'+depth+'_'+index;
  const pairs:string[]=[];for(let i=0;i<binding.fk.fields.length;i++){accounting?.visit('sql-policy-via-pair',path+'/path/'+index);const from=step.direction==='forward'?binding.fk.fields[i]!:fields[i]!,to=step.direction==='forward'?fields[i]!:binding.fk.fields[i]!;pairs.push(join([currentAlias?q(currentAlias,accounting,path):ctx.relation(current),'.',q(ctx.column(current,from),accounting,path),' = ',q(nextAlias,accounting,path),'.',q(ctx.column(next,to),accounting,path)]));}
  const pairChunks:string[]=[];for(let i=0;i<pairs.length;i++){if(i)pairChunks.push(' AND ');pairChunks.push(pairs[i]!);}const predicate=join(pairChunks);
  return join(['(EXISTS (SELECT 1 FROM ',ctx.relation(next),' AS ',q(nextAlias,accounting,path),' WHERE ',predicate,' AND ',walk(index+1,next,nextAlias),'))']);
 };
 return walk(0,table,alias);
}
