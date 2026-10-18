import {LIMITS,copyJson} from '../model/json';
import {UmfError,type Diagnostic,type Document,type Element} from '../model/types';
import {parseBits128} from '../model/bit128';
import {parseUuid} from '../model/uuid';
import {assertLiteralPolicy} from './literal-policy';
// Only explicit immutable copies receive admission reuse. Mutable caller policy
// objects are checked on every invocation, including after a previous success.
const admittedPolicies=new WeakSet<object>();
function admitPolicy(p:any):void{if(!admittedPolicies.has(p))assertLiteralPolicy(p);}
export function prepareLiteralPolicy(input:unknown):any{
 const policy=copyJson(input);assertLiteralPolicy(policy);
 const freeze=(value:any):void=>{if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};
 freeze(policy);admittedPolicies.add(policy as object);return policy;
}
class LiteralFault extends Error{constructor(readonly reason:string,readonly path='',readonly detail=''){super(reason);}}
const fail=(reason:string,path='',detail=''):never=>{throw new LiteralFault(reason,path,detail);};
const at=(value:any,path:string[])=>path.reduce((v,k)=>v&&typeof v==='object'&&Object.hasOwn(v,k)?v[k]:undefined,value);
const lookup=(map:any,key:any)=>typeof key==='string'&&Object.hasOwn(map,key)?map[key]:undefined;
/** Exact coefficient machinery, independent of named UMF domains. */
export function exactCoefficient(token:string,scale:number,precision?:number):bigint {
 const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);if(!m||m[0]!==token)fail('numeric-token');
 const matched=m!,digits=(matched[2]!+(matched[3]??'')).replace(/^0+/,'');if(!digits)return 0n;
 const exponent=matched[4]??'0';if(exponent.length>32)fail('numeric-exponent');
 const shift=BigInt(exponent)-BigInt((matched[3]??'').length)+BigInt(scale);let result=digits;
 if(shift<0n){const cut=-shift;if(cut>BigInt(digits.length))fail('numeric-rounding');const end=digits.length-Number(cut);if(/[^0]/.test(digits.slice(end)))fail('numeric-rounding');result=digits.slice(0,end);}else{if(BigInt(digits.length)+shift>BigInt(Math.min(precision??LIMITS.maxTextLength,LIMITS.maxTextLength)))fail('numeric-resource');result+='0'.repeat(Number(shift));}
 if(precision!==undefined&&result.length>precision)fail('numeric-precision');return BigInt((matched[1]??'')+(result||'0'));
}
function unicodeCount(value:string):number{let count=0;for(let i=0;i<value.length;i++,count++){const c=value.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=value.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))fail('unicode');}else if(c>=0xdc00&&c<=0xdfff)fail('unicode');}return count;}
const known=(value:any,keys:string[],path:string)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail('object',path);for(const key of Object.keys(value))if(!keys.includes(key))fail('unknown',path+'/'+key,key);};
function identity(field:any,value:any,p:any):string {
 const f=p.fields;if(value===null)fail('null-equality');const family=lookup(p.families,field[f.family]);if(!family?.equality||!value||typeof value!=='object'||Object.keys(value).length!==p.wrapperKeys||!Object.hasOwn(value,family.carrier))fail('equality');
 const v=value[family.carrier],facets=field[f.facets]??{};let result:any;
 switch(family.mechanic){
 case 'bits128':try{result=parseBits128(v).hex;}catch{fail('bits128');}break;
 case 'uuid':try{result=parseUuid(v).hex;}catch{fail('uuid');}break;
 case 'integer':result=exactCoefficient(v,0).toString();break;
 case 'decimal':if(!Number.isSafeInteger(facets[f.scale])||!Number.isSafeInteger(facets[f.precision]))fail('decimal-domain');result=exactCoefficient(v,facets[f.scale],facets[f.precision]).toString();break;
 case 'unicode':unicodeCount(v);result=JSON.stringify(v);break;
 case 'hex':if(typeof v!=='string'||!/^(?:[0-9a-fA-F]{2})*$(?![\s\S])/.test(v))fail('hex');result=v.toLowerCase();break;
 case 'boolean':if(typeof v!=='boolean')fail('boolean');result=String(v);break;
 default:fail('mechanic');
 }
 return field[f.family]+':'+result;
}
function refinements(doc:any,field:any,value:any,enabled:boolean,p:any,kind:string,family:any,count:number|undefined,phase:string):void {
 const f=p.fields,facets=field[f.facets]??{};
 for(const rule of p.refinements){if(rule.phase!==phase||rule.enabled===false||rule.applies!=='all'&&rule.applies!==kind||rule.mode==='refinements'&&!enabled)continue;const constraint=at(field,rule.selector);if(constraint===undefined)continue;
  switch(rule.mechanic){
  case 'count-bounds':{
   if(rule.unit!==undefined&&constraint[rule.unit]!==family?.lengthUnit)fail(rule.unitError);if(count===undefined)fail(rule.domainError);if(constraint[rule.min]!==undefined&&count!<constraint[rule.min]||constraint[rule.max]!==undefined&&count!>constraint[rule.max])fail(rule.error);break;
  }
  case 'integer-width':{const n=exactCoefficient(value[family.carrier],0),bits=constraint[rule.bits],signed=constraint[rule.signed],magnitude=n<0n?-n:n,width=magnitude===0n?0:magnitude.toString(2).length;const fits=signed?(n<0n?(width<bits||width===bits&&(magnitude&(magnitude-1n))===0n):width<bits):n>=0n&&width<=bits;if(!fits)fail(rule.error);break;}
  case 'coefficient-range':{const scale=family.mechanic==='decimal'?facets[f.scale]:0,n=exactCoefficient(value[family.carrier],scale,facets[f.precision]);for(const [bound,inclusive,lower]of [[rule.min,rule.minInclusive,true],[rule.max,rule.maxInclusive,false]])if(constraint[bound]!==undefined){if(constraint[bound]===null)fail(rule.nullError,'/'+[...rule.selector,bound].join('/'));const endpoint=exactCoefficient(constraint[bound][family.carrier],scale,facets[f.precision]);if(lower?(n<endpoint||n===endpoint&&constraint[inclusive]===false):(n>endpoint||n===endpoint&&constraint[inclusive]===false))fail(rule.error);}break;}
  case 'allowed-membership':if(!constraint.some((candidate:any)=>identity(field,candidate,p)===identity(field,value,p)))fail(rule.error);break;
  default:throw new UmfError('CONSTRAINT_POLICY','Unknown refinement mechanic: '+rule.mechanic);
  }
 }
}
function evaluate(doc:any,field:any,value:any,enabled:boolean,p:any,depth=0,charge?:(doc:any,field:any,value:any)=>void):void {
 charge?.(doc,field,value);const f=p.fields;if(depth>LIMITS.maxDepth)fail('depth');if(field[f.role]!==p.fieldKind)fail('field-role');if(field[f.references]?.some((r:any)=>r[f.referenceRole]===p.recordReferenceRole))fail('record-value');
 if(field[f.item])known(field[f.item],p.itemReferenceKeys,'/'+f.item);const facets=field[f.facets]??{};known(facets,p.facetKeys,'/'+f.facets);for(const [group,keys]of Object.entries(p.facetGroups))if(facets[group])known(facets[group],keys as string[],'/'+f.facets+'/'+group);
 if(value===null){if(field[f.availability]!==p.nullability)fail('null');return;}if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==p.wrapperKeys)fail('wrapper');
 const container=lookup(p.containers,field[f.cardinality]);
 if(container){const items=value[container.carrier];if(container.mechanic==='sequence'?!Array.isArray(items):!items||typeof items!=='object'||Array.isArray(items))fail('container');const ref=field[f.item];if(!ref)fail('item-required');const lookup=p.itemLookup,item=doc[lookup.modules].find((m:any)=>m[lookup.moduleId]===ref[lookup.moduleRef])?.[lookup.elements].find((e:any)=>e[lookup.elementId]===ref[lookup.elementRef]);if(!item)fail('item-missing');const values=container.mechanic==='sequence'?items:Object.values(items);refinements(doc,field,value,enabled,p,'container',undefined,values.length,'before');for(const v of values)evaluate(doc,item,v,enabled,p,depth+1,charge);refinements(doc,field,value,enabled,p,'container',undefined,values.length,'after');
 }else{
  if(field[f.cardinality]!==undefined&&!p.singular.includes(field[f.cardinality]))fail('cardinality');const family=lookup(p.families,field[f.family]);if(!family||!Object.hasOwn(value,family.carrier))fail('family');const v=value[family.carrier];
  if(!family.refinements){if(enabled)fail('refinements');if(typeof v!=='string')fail('text');return;}identity(field,value,p);let count:number|undefined;if(family.mechanic==='unicode')count=unicodeCount(v);if(family.mechanic==='hex')count=v.length/2;refinements(doc,field,value,enabled,p,'scalar',family,count,'before');refinements(doc,field,value,enabled,p,'scalar',family,count,'after');
 }
}
function diagnostic(error:unknown,p:any):Diagnostic{if(!(error instanceof LiteralFault))throw error;const rule=p.errors[error.reason];if(!rule)throw new UmfError('CONSTRAINT_POLICY','Missing literal diagnostic: '+error.reason);return {code:rule.code,message:rule.message.replace('{detail}',error.detail),severity:rule.severity,path:error.path};}
export function literalErrors(doc:Document,field:Element,value:any,enabled:boolean,p:any,charge?:(doc:any,field:any,value:any)=>void):Diagnostic[]{admitPolicy(p);try{evaluate(doc,field,value,enabled,p,0,charge);return [];}catch(error){return [diagnostic(error,p)];}}
export function literalIdentity(field:Element,value:any,p:any):string|undefined{admitPolicy(p);try{return identity(field,value,p);}catch(error){if(error instanceof LiteralFault)return undefined;throw error;}}
export function assertLiteral(doc:Document,field:Element,value:any,enabled:boolean,p:any):void{const error=literalErrors(doc,field,value,enabled,p)[0];if(error)throw new UmfError(error.code,error.message,error.path);}
export function numericInterval(field:any,range:any,p:any):Diagnostic[]{admitPolicy(p);try{
 const f=p.fields,r=p.interval,family=lookup(p.families,field[f.family]),facets=field[f.facets]??{},scale=family.mechanic==='decimal'?facets[f.scale]:0,base={...field,[f.facets]:Object.fromEntries(Object.entries(facets).filter(([k])=>p.numericFacetKeys.includes(k)))};for(const key of p.interval.omit)delete base[key];for(const [group,keys]of Object.entries(r.qualifierKeys) as [string,string[]][])if(base[f.facets][group])base[f.facets][group]=Object.fromEntries(Object.entries(base[f.facets][group]).filter(([key])=>keys.includes(key)));
 for(const end of [r.min,r.max])if(range[end]!==undefined){if(range[end]===null)fail('numeric-null','/'+end);evaluate({[p.itemLookup.modules]:[]},base,range[end],true,p);}
 const min=range[r.min]===undefined?undefined:exactCoefficient(range[r.min][family.carrier],scale,facets[f.precision]),max=range[r.max]===undefined?undefined:exactCoefficient(range[r.max][family.carrier],scale,facets[f.precision]);
 const extreme=(value:bigint,end:string)=>{if(family.mechanic==='decimal'){if(end==='min'?value>=0n:value<=0n)return false;const digits=(value<0n?-value:value).toString();return digits.length===facets[f.precision]&&/^9+$/.test(digits);}const width=at(field,r.width);if(!width)return false;const bits=width[r.bits],signed=width[r.signed];if(end==='min'){if(!signed)return value===0n;const magnitude=-value;return value<0n&&magnitude.toString(2).length===bits&&(magnitude&(magnitude-1n))===0n;}if(value<0n)return false;const magnitude=value===0n?0:value.toString(2).length;return magnitude===bits-(signed?1:0)&&(value&(value+1n))===0n;};
 if(min!==undefined&&max!==undefined&&min+(range[r.minInclusive]===false?1n:0n)>max-(range[r.maxInclusive]===false?1n:0n)||min!==undefined&&range[r.minInclusive]===false&&extreme(min,'max')||max!==undefined&&range[r.maxInclusive]===false&&extreme(max,'min'))fail('interval');return [];
 }catch(error){return [diagnostic(error,p)];}}
export function assertIdentity(field:Element,value:any,p:any):string{admitPolicy(p);try{return identity(field,value,p);}catch(error){const d=diagnostic(error,p);throw new UmfError(d.code,d.message,d.path);}}
export function assertLiteralTracked(doc:Document,field:Element,value:any,p:any,charge:(doc:Document,field:Element,value:any)=>void):void{admitPolicy(p);try{evaluate(doc,field,value,true,p,0,charge);}catch(error){const d=diagnostic(error,p);throw new UmfError(d.code,d.message,d.path);}}
export function coefficient(token:string,scale:number,precision:number|undefined,p:any):bigint{try{return exactCoefficient(token,scale,precision);}catch(error){const d=diagnostic(error,p);throw new UmfError(d.code,d.message,d.path);}}
