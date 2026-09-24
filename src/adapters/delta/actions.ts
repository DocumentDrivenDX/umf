import grammar from '../../../spec/extensions/delta-log/action-schema.json';
import {createValidator} from '../../validation/schema';
import {renderTree,type NativeJson} from '../../model/native-json';
import type {Diagnostic} from '../../model/types';
import {inspectDeltaLog} from './log';
import type {Document} from '../../model/types';
const ajv=createValidator(),validate=ajv.compile(grammar);
/** The tree remains authoritative; the temporary JS view is used only for shape validation. */
export function inspectDeltaActions(doc:Document){
 const report=inspectDeltaLog(doc),diagnostics:Diagnostic[]=[...report.diagnostics];let knownShapesValid=report.parsedAll;
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>{diagnostics.push({code,path,message,severity});if(severity==='error')knownShapesValid=false;};
 function exact(n:NativeJson,s:any,path:string){
  if(s.anyOf){if(n.kind==='null')return;return exact(n,s.anyOf[0],path);}
  if(s.type==='integer'&&n.kind==='number'){
   // Native Long/Int JSON encodings are integer tokens; do not round a JS Number.
   const token=n.value,digits=token.replace(/^-/,'');
   if(!/^-?\d+$/.test(token)||digits.length>19){add('DELTA_ACTION_INTEGER',path,'Expected an exact signed integer token in the declared range','error');return;}
   const value=BigInt(token),min=s.format==='int64'? -9223372036854775808n:BigInt(s.minimum??-2147483648),max=s.format==='int64'?9223372036854775807n:BigInt(s.maximum??2147483647);
   if(value<min||value>max)add('DELTA_ACTION_INTEGER',path,'Integer exceeds its declared signed range','error');
  }
  if(n.kind==='object'&&s.properties)for(const [k,v] of Object.entries(n.members)){const child=Object.hasOwn(s.properties,k)?s.properties[k]:undefined,at=path+'/'+k.replace(/~/g,'~0').replace(/\//g,'~1');if(child)exact(v,child,at);else add('DELTA_ACTION_UNKNOWN_FIELD',at,'Unknown field is preserved without interpretation');}
 }
 for(const line of report.lines){if(line.status!=='parsed'||!line.node||!line.action)continue;const path='/lines/'+(line.line-1),node=line.node;
  if(!validate(JSON.parse(renderTree(node))))for(const e of validate.errors??[])add('DELTA_ACTION_SHAPE',path+e.instancePath,e.message??'Invalid known action shape','error');
  const schema=Object.hasOwn(grammar.properties,line.action)?(grammar.properties as Record<string,unknown>)[line.action]:undefined;if(schema&&node.kind==='object')exact(node.members[line.action]!,schema,path+'/'+line.action);
 }
 add('DELTA_ACTION_CONTEXT_UNVERIFIED','','Field shapes do not validate feature requirements, embedded schemas/statistics, paths, deletion vectors or transaction/snapshot state');
 return {...report,knownShapesValid,diagnostics};
}
