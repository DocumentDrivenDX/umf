// SPDX-License-Identifier: MIT OR Apache-2.0
import {refKey,TableContext} from './context';
import type {TableLifecyclePayload,TableRef,TableRowRule} from './types';
const commands=['select','insert','update','delete'] as const;
export function inspectPolicies(payload:TableLifecyclePayload,ctx:TableContext):void{
 const edges=new Map<string,Set<string>>();ctx.visit('table-policy-tables',ctx.path+'/tables',payload.tables.length);
 for(const[i,table]of payload.tables.entries()){
  const id=refKey(table.record);edges.set(id,new Set());
  const inspect=(rule:TableRowRule,record:TableRef,path:string,depth=0):void=>{
   ctx.visit('table-policy-node',path);if(!ctx.charge(path,depth))return;
   if(rule.kind==='owner'||rule.kind==='memberOf'){
    const field=ctx.field(rule.field,path+'/field'),target=ctx.element(record);
    if(!target?.members?.some(m=>refKey(m)===refKey(rule.field))||field?.scalarType!=='string')ctx.add('TABLES_POLICY_FIELD',path+'/field','Owner/group rule requires a text Field of the current policy Record');
   }else if(rule.kind==='any'||rule.kind==='all')for(const[j,child]of rule.rules.entries())inspect(child,record,path+'/rules/'+j,depth+1);
   else if(rule.kind==='related'){
    const origin=payload.tables.find(t=>refKey(t.record)===refKey(record));
    const destination=payload.tables.find(t=>refKey(t.record)===refKey(rule.record));
    if(rule.record.module!==ctx.module.id||!origin||!destination){ctx.add('TABLES_POLICY_TABLE',path+'/record','Related rule requires original tables in this plugin module');return;}
    ctx.unique(rule.matches,pair=>refKey(pair.source)+'='+refKey(pair.target),path+'/matches','association field pair');
    for(const[j,pair]of rule.matches.entries()){
     const location=path+'/matches/'+j,a=ctx.field(pair.source,location+'/source'),b=ctx.field(pair.target,location+'/target');
     if(!origin.columns.some(c=>refKey(c.field)===refKey(pair.source))||!destination.columns.some(c=>refKey(c.field)===refKey(pair.target)))ctx.add('TABLES_POLICY_FIELD',location,'Association fields must be mapped by their respective source and target tables');
     if(a&&b&&(a.cardinality!=='one'||b.cardinality!=='one'||a.scalarType!==b.scalarType))ctx.add('TABLES_POLICY_DOMAIN',location,'Association equality requires the same singleton scalar carrier without coercion');
    }
    edges.get(id)!.add(refKey(destination.record));
    inspect(rule.rule,destination.record,path+'/rule',depth+1);
   }
   else if(rule.kind==='via'){
    let current=record;let valid=true;
    ctx.visit('table-policy-path-steps',path+'/path',rule.path.length);for(const[j,step]of rule.path.entries()){
     const location=path+'/path/'+j;
     if(step.module!==ctx.module.id){ctx.add('TABLES_POLICY_MODULE',location,'Via paths cannot access another plugin module');valid=false;break;}
     const relation=ctx.module.relationships?.find(r=>r.id===step.id);
     const source=relation?.source,target=relation?.target;
     if(!source||!target||source.length!==1||target.length!==1){ctx.add('TABLES_POLICY_RELATIONSHIP',location,'Via requires a single bound core relationship');valid=false;break;}
     const from=step.direction==='forward'?source[0]!:target[0]!,to=step.direction==='forward'?target[0]!:source[0]!;
     if(refKey(current)!==refKey(from)){ctx.add('TABLES_POLICY_PATH',location,'Via path does not continue from the current Record');valid=false;break;}
     const bindings=payload.tables.flatMap(t=>t.foreignKeys.filter(f=>f.relationship?.module===step.module&&f.relationship.id===step.id).map(f=>({table:t,key:f})));
     if(bindings.length!==1){ctx.add('TABLES_POLICY_MAPPING',location,'Via requires one explicit native foreign-key binding');valid=false;break;}
     const destination=payload.tables.find(t=>refKey(t.record)===refKey(to));
     if(!destination){ctx.add('TABLES_POLICY_TABLE',location,'Via target has no table in this module');valid=false;break;}
     edges.get(id)!.add(refKey(destination.record));
     current=to;
    }
    if(valid)inspect(rule.rule,current,path+'/rule',depth+1);
   }
  };
  for(const audience of ['person','batch'] as const){ctx.visit('table-policy-commands',ctx.path+'/tables/'+i+'/policy/'+audience,commands.length);
   for(const command of commands)inspect(table.policy[audience][command],table.record,ctx.path+'/tables/'+i+'/policy/'+audience+'/'+command);
   const rules=table.policy[audience];
   if((rules.update.kind!=='deny'||rules.delete.kind!=='deny')&&rules.select.kind==='deny')ctx.add('TABLES_POLICY_SELECT',ctx.path+'/tables/'+i+'/policy/'+audience,'UPDATE/DELETE require explicit native SELECT policy/grants; the compiler cannot broaden them');
  }
 }
 const active=new Set<string>(),done=new Set<string>();
 const visit=(id:string):void=>{
  if(active.has(id)){ctx.add('TABLES_POLICY_CYCLE',ctx.path+'/tables','Cyclic native policy dependencies are unsupported');return;}
  if(done.has(id))return;active.add(id);for(const target of edges.get(id)??[])visit(target);active.delete(id);done.add(id);
 };
 for(const id of edges.keys())visit(id);
}
