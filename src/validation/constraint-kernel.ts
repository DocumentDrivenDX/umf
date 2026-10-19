import {currentConstraints,currentDomainPolicy} from './current-policy';
import {canonicalJson} from './json-equality';
import {copyJson,copyJsonCharged,LIMITS} from '../model/json';
import {type Document,type Diagnostic,type Json,pointer,UmfError} from '../model/types';
import {Registry} from '../registry/registry';
import {literalErrors,literalIdentity,numericInterval} from './literal-kernel';
import {assertLiteralPolicy} from './literal-policy';
type Env=Record<string,any>;
const scope=(env:Env,bindings:Env={})=>Object.assign(Object.create(null),env,bindings);
export function checkConstraintProgram(program:unknown):void{assertConstraintProgram(copyJson(program));}
import {assertConstraintProgram} from './constraint-language';
export type ConstraintMeter=(category:string,visits:number)=>void;
export function executeConstraints(document:Document,program:any,policy:any,registry=new Registry(),meter?:ConstraintMeter):Diagnostic[] {
 const copy=(v:unknown)=>copyJsonCharged(v,n=>meter?.('constraint-copy',n));
 document=copy(document) as unknown as Document;program=copy(program);policy=copy(policy);
 assertConstraintProgram(program);if(policy.literal!==undefined)assertLiteralPolicy(policy.literal);
 return interpretConstraints(document,program,policy,registry,meter);
}
/** The interpreter only receives invocation-owned or privately frozen admitted data. */
function interpretConstraints(document:Document,program:any,policy:any,registry:Registry,meter?:ConstraintMeter):Diagnostic[] {
 const diagnostics:Diagnostic[]=[];let visits=0;
 const charge=()=>{meter?.('constraint-instruction',1);if(++visits>5_000_000)throw new UmfError('LIMIT','Constraint operation limit exceeded');};
 const walk=(value:any):void=>{meter?.('constraint-value-visit',1);if(value!==null&&typeof value==='object')for(const child of Object.values(value))walk(child);};
 const canonical=(value:any)=>{if(meter)walk(value);return canonicalJson(value);};
 const external=(doc:Document,payloads:any,scope:any,path:string,p:any):Diagnostic[]=>{const out:Diagnostic[]=[];const add=(key:string,at:string,detail?:string)=>{const rule=p[key];out.push({code:rule.code,path:at,message:detail??rule.message,severity:rule.severity});};for(const [id,payload]of Object.entries(payloads??{})){const at=path+'/extensions/'+pointer(id),declaration=doc.vocabularies[id];if(!declaration){add('undeclared',at);continue;}const entry=registry.get(id,declaration.version);if(!entry)continue;if(!entry.manifest.scopes.includes(scope)){add('scope',at);continue;}if(!entry.structure(payload)){for(const error of entry.structure.errors??[])add('structure',at+error.instancePath,error.message);continue;}if(entry.manifest.capabilities.validation!=='semantic'||!entry.semantics)add('unchecked',at);else try{out.push(...entry.semantics(copyJson(payload),{document:copyJson(doc) as unknown as Document,path:at,scope}));}catch(error){add('failure',at,String(error));}}return out;};
 const evaluate=(e:any,env:Env):any=>{
  charge();if(e===null||typeof e!=='object')return e;if(Array.isArray(e))return e.map(x=>evaluate(x,env));if(Object.hasOwn(e,'var'))return Object.hasOwn(env,e.var)?env[e.var]:undefined;if(!e.op)return Object.fromEntries(Object.entries(e).map(([k,v])=>[k,evaluate(v,env)]));
  const a=()=> (e.args??[]).map((x:any)=>evaluate(x,env));
  if(e.op==='and')return (e.args??[]).every((x:any)=>!!evaluate(x,env));if(e.op==='or')return (e.args??[]).some((x:any)=>!!evaluate(x,env));
  const args=a(),[x,y]=args;
  switch(e.op){
  case 'get':return (y??[]).reduce((v:any,k:any)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k)?v[k]:undefined,x);
  case 'has':{const parts=y??[],parent=parts.slice(0,-1).reduce((v:any,k:any)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k)?v[k]:undefined,x);return parent!==null&&typeof parent==='object'&&Object.hasOwn(parent,parts.at(-1));}
  case 'keys':meter?.('constraint-enumeration',x&&typeof x==='object'?Object.keys(x).length:0);return x&&typeof x==='object'?Object.keys(x):[];
  case 'values':meter?.('constraint-enumeration',x&&typeof x==='object'?Object.keys(x).length:0);return x&&typeof x==='object'?Object.values(x):[];
  case 'entries':meter?.('constraint-enumeration',x&&typeof x==='object'?Object.keys(x).length:0);return x&&typeof x==='object'?Object.entries(x):[];
  case 'without':meter?.('constraint-enumeration',Object.keys(x??{}).length*(1+(y?.length??0)));return Object.fromEntries(Object.entries(x??{}).filter(([k])=>!y.includes(k)));
  case 'flatten':meter?.('constraint-enumeration',(x??[]).reduce((n:number,v:any)=>n+1+(Array.isArray(v)?v.length:0),0));return (x??[]).flat();
  case 'length':return x instanceof Map||x instanceof Set?x.size:x?.length??0;
  case 'eq':return x===undefined||y===undefined?x===y:canonical(x)===canonical(y);
  case 'ne':return x===undefined||y===undefined?x!==y:canonical(x)!==canonical(y);
  case 'lt':return x<y;case 'lte':return x<=y;case 'gt':return x>y;case 'gte':return x>=y;
  case 'in':return y instanceof Map?y.has(canonical(x)):(y??[]).some((v:any)=>canonical(v)===canonical(x));
  case 'not':return !x;
  case 'concat':return args.map((v:any)=>v??'').join('');
  case 'pointer':return pointer(String(x));
  case 'tuple':return args;
  case 'canonical':return canonical(x);
  case 'sort':if(meter){walk(x);meter('constraint-sort',Math.ceil((x?.length??0)*Math.log2((x?.length??0)+1)));}return [...(x??[])].sort();
  case 'set':return new Map<string,any>();
  case 'lookup':return x?.get(canonical(y));
  case 'filter':case 'map':case 'find':case 'some':case 'every':case 'index':{
   const list=x??[],fn=(value:any,index:number)=>evaluate(e.value,scope(env,{[e.as]:value,...(e.index?{[e.index]:index}:{})}));
   if(e.op==='filter')return list.filter(fn);if(e.op==='map')return list.map(fn);if(e.op==='find')return list.find(fn);if(e.op==='some')return list.some(fn);if(e.op==='every')return list.every(fn);
   return new Map(list.map((value:any,index:number)=>[canonical(fn(value,index)),value]));
  }
  case 'literal-errors':return literalErrors(x,y,args[2],args[3],args[4],meter?((doc,field,value)=>{walk(doc);walk(field);walk(value);}):undefined);
  case 'literal-identity':return literalIdentity(x,y,args[2]);
  case 'numeric-interval':return numericInterval(x,y,args[2]);
  case 'registered':return !!registry.get(x,y);
  case 'extension-errors':return external(x,y,args[2],args[3],args[4]);
  default:throw new UmfError('CONSTRAINT_OPCODE','Unknown expression: '+e.op);
  }
 };
 const emit=(data:any,env:Env)=>{const diagnostic=evaluate(data,env);if(!['error','warning'].includes(diagnostic.severity)||typeof diagnostic.path!=='string'||typeof diagnostic.code!=='string'||typeof diagnostic.message!=='string')throw new UmfError('CONSTRAINT_DIAGNOSTIC','Malformed diagnostic');diagnostics.push(diagnostic);};
 const execute=(body:any[],env:Env):void=>{for(const step of body){charge();switch(step.op){case 'let':env[step.name]=evaluate(step.value,env);break;case 'for':{const values=evaluate(step.each,env)??[];values.forEach((value:any,index:number)=>execute(step.body,scope(env,{[step.as]:value,...(step.index?{[step.index]:index}:{})})));break;}case 'if':execute(evaluate(step.test,env)?step.then:step.else??[],scope(env));break;case 'emit':if(step.when===undefined||evaluate(step.when,env))emit(step.diagnostic,env);break;case 'remember':{const set=evaluate(step.set,env) as Map<string,any>,key=canonical(evaluate(step.key,env));if(set.has(key)){if(step.diagnostic)emit(step.diagnostic,env);}else set.set(key,step.value===undefined?true:evaluate(step.value,env));break;}}}};
 execute(program.steps,Object.assign(Object.create(null),{doc:document,policy}));return diagnostics;
}
// Current data is a private immutable snapshot. Admit its closed language once;
// arbitrary public programs still take the defensive admission path above.
assertConstraintProgram(currentConstraints);assertLiteralPolicy(currentDomainPolicy.literal);
export function runCoreConstraints(document:Document,registry=new Registry(),meter?:ConstraintMeter):Diagnostic[]{
 const owned=copyJsonCharged(document,n=>meter?.('constraint-copy',n)) as unknown as Document;
 return interpretConstraints(owned,currentConstraints,currentDomainPolicy,registry,meter);
}
