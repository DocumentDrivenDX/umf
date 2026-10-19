// SPDX-License-Identifier: MIT OR Apache-2.0
import type {TableDeclaration,TableRowRule} from '../extensions/tables';
import type {DeploymentContext} from './types';
import {deploymentError} from './configuration';
import {quoteIdentifier as q,quoteText as s} from './sql';
const same=(a:{module:string;element:string},b:{module:string;element:string})=>a.module===b.module&&a.element===b.element;
export function policySql(rule:TableRowRule,table:TableDeclaration,ctx:DeploymentContext,audience:'person'|'batch',path:string,alias?:string,depth=0):string{
 const column=(field:{module:string;element:string})=>(alias?q(alias)+'.':'')+q(ctx.column(table,field));
 if(rule.kind==='deny')return 'FALSE';if(rule.kind==='allow')return 'TRUE';
 if(rule.kind==='owner')return '('+column(rule.field)+' COLLATE pg_catalog."C" = CURRENT_USER::pg_catalog.text COLLATE pg_catalog."C")';
 if(rule.kind==='memberOfRole'){
  const role=ctx.configuration.groupRoles[rule.role];if(!role)deploymentError('Group alias has no trusted native binding',path+'/role');
  return 'pg_catalog.pg_has_role(CURRENT_USER, '+s(role)+", 'MEMBER')";
 }
 if(rule.kind==='memberOf'){
  const groups=Object.keys(ctx.configuration.groupRoles).sort().map(alias=>ctx.configuration.groupRoles[alias]!);if(!groups.length)deploymentError('Per-row group membership requires trusted group-role bindings',path);
  // An unknown per-row group never becomes an arbitrary native-role lookup.
  return '(EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS '+q('umf_group')+' WHERE '+q('umf_group')+'.rolname::pg_catalog.text COLLATE pg_catalog."C" = '+column(rule.field)+' COLLATE pg_catalog."C" AND '+q('umf_group')+'.rolname::pg_catalog.text IN ('+groups.map(s).join(', ')+') AND pg_catalog.pg_has_role(CURRENT_USER, '+q('umf_group')+".oid, 'MEMBER')))";
 }
 if(rule.kind==='any'||rule.kind==='all')return '('+rule.rules.map((r,i)=>policySql(r,table,ctx,audience,path+'/rules/'+i,alias,depth+1)).join(rule.kind==='any'?' OR ':' AND ')+')';
 if(rule.kind!=='via')return deploymentError('Unknown native policy rule',path);
 const walk=(index:number,current:TableDeclaration,currentAlias:string|undefined):string=>{
  if(index===rule.path.length)return policySql(rule.rule,current,ctx,audience,path+'/rule',currentAlias,depth+1);
  const step=rule.path[index]!,bindings=ctx.payload.tables.flatMap(t=>t.foreignKeys.filter(f=>f.relationship?.module===step.module&&f.relationship.id===step.id).map(f=>({table:t,fk:f})));
  if(bindings.length!==1)deploymentError('Via path lacks one original native FK binding',path+'/path/'+index);
  const binding=bindings[0]!,target=ctx.table(binding.fk.target.record);
  const record=ctx.document.modules.find(m=>m.id===target.record.module)!.elements.find(e=>e.id===target.record.element)!;
  const fields=record.keys!.find(k=>k.id===binding.fk.target.key)!.fields;
  const next=step.direction==='forward'?target:binding.table;
  if(next.policy[audience].select.kind==='deny')deploymentError('Via requires an explicit related-table SELECT grant/policy for this audience',path+'/path/'+index);
  if(!same(current.record,step.direction==='forward'?binding.table.record:target.record))deploymentError('Via path changed after admission',path+'/path/'+index);
  const nextAlias='umf_v_'+depth+'_'+index;
  const pairs=binding.fk.fields.map((f,i)=>step.direction==='forward'?[f,fields[i]!] as const:[fields[i]!,f] as const);
  const predicate=pairs.map(([from,to])=>(currentAlias?q(currentAlias):ctx.relation(current))+'.'+q(ctx.column(current,from))+' = '+q(nextAlias)+'.'+q(ctx.column(next,to))).join(' AND ');
  return '(EXISTS (SELECT 1 FROM '+ctx.relation(next)+' AS '+q(nextAlias)+' WHERE '+predicate+' AND '+walk(index+1,next,nextAlias)+'))';
 };
 return walk(0,table,alias);
}
