import {copyJson, LIMITS} from './json';
import {UmfError, type Document, type Element, type Json} from './types';

export type CoreLiteral = null | {boolean:boolean} | {integerToken:string} | {decimalToken:string} |
 {string:string} | {binaryHex:string} | {floatToken:string} | {date:string} | {time:string} |
 {timestamp:string} | {array:CoreLiteral[]} | {map:Record<string,CoreLiteral>};
export const schemaPropertyNames=['title','aliases','examples','allowedValues','default'] as const;
export const newFacetNames=['collectionSize','range'] as const;
export const canonicalSchemaJson=(value:unknown):string=>Array.isArray(value)?'['+value.map(canonicalSchemaJson).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalSchemaJson((value as Record<string,unknown>)[k])).join(',')+'}':JSON.stringify(value);
export function schemaError(message:string,path=''):never {throw new UmfError('CORE_SCHEMA_PROPERTIES',message,path);}
const object=(v:unknown):Record<string,any>=>v as Record<string,any>;
export function knownSchemaMembers(value:unknown,keys:string[],path:string):void {
 if(value===null||typeof value!=='object'||Array.isArray(value))schemaError('Expected object',path);
 for(const key of Object.keys(value))if(!keys.includes(key))throw new UmfError('CORE_SCHEMA_PROPERTY_UNKNOWN','Unknown relevant qualifier: '+key,path+'/'+key);
}
/** Exact coefficient, bounded before expansion. No host floating-point arithmetic. */
export function schemaCoefficient(token:string,scale:number,precision?:number):bigint {
 const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
 if(!m||m[0]!==token)schemaError('Expected exact JSON numeric token');
 const digits=(m[2]!+(m[3]??'')).replace(/^0+/,'');if(!digits)return 0n;
 const exponent=m[4]??'0';if(exponent.length>32)schemaError('Numeric exponent exceeds bounded domain');
 const shift=BigInt(exponent)-BigInt((m[3]??'').length)+BigInt(scale);
 let result=digits;
 if(shift<0n){const cut=-shift;if(cut>BigInt(digits.length))schemaError('Numeric value would require rounding');const at=digits.length-Number(cut);if(/[^0]/.test(digits.slice(at)))schemaError('Numeric value would require rounding');result=digits.slice(0,at);}
 else {if(BigInt(digits.length)+shift>BigInt(Math.min(precision??LIMITS.maxTextLength,LIMITS.maxTextLength)))schemaError('Numeric value exceeds precision/resource limit');result+='0'.repeat(Number(shift));}
 if(precision!==undefined&&result.length>precision)schemaError('Numeric value exceeds precision');
 return BigInt((m[1]??'')+(result||'0'));
}
function stringLength(value:string):number {
 let count=0;
 for(let i=0;i<value.length;i++,count++){const c=value.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=value.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))schemaError('Unpaired Unicode surrogate');}else if(c>=0xdc00&&c<=0xdfff)schemaError('Unpaired Unicode surrogate');}
 return count;
}
export function literalIdentity(field:Element,value:CoreLiteral):string {
 if(value===null)schemaError('Null has no allowed-value equality');
 const v=object(value),keys=Object.keys(v),kind=field.scalarType;
 const wrapper=({boolean:'boolean',integer:'integerToken',decimal:'decimalToken',string:'string',binary:'binaryHex'} as Record<string,string>)[kind as string];
 if(!wrapper||keys.length!==1||keys[0]!==wrapper)schemaError('No exact equality for this literal/domain');
 const facets=object(field.facets??{});
 if(kind==='integer')return 'integer:'+schemaCoefficient(v[wrapper],0);
 if(kind==='decimal'){if(!Number.isSafeInteger(facets.scale)||!Number.isSafeInteger(facets.precision))schemaError('Decimal requires explicit precision/scale');return 'decimal:'+schemaCoefficient(v[wrapper],facets.scale,facets.precision);}
 if(kind==='string'){stringLength(v.string);return 'string:'+JSON.stringify(v.string);}
 if(kind==='binary'){if(typeof v.binaryHex!=='string'||!/^(?:[0-9a-fA-F]{2})*$(?![\s\S])/.test(v.binaryHex))schemaError('Expected hexadecimal bytes');return 'binary:'+v.binaryHex.toLowerCase();}
 if(typeof v.boolean!=='boolean')schemaError('Expected boolean literal');return 'boolean:'+v.boolean;
}
export function checkSchemaLiteral(doc:Document,field:Element,value:CoreLiteral,refinements=true,depth=0):void {
 if(depth>LIMITS.maxDepth)schemaError('Literal recursion exceeds limit');
 if(field.kind!=='field')schemaError('Literal target must be a Field');
 if(field.references?.some(r=>r.role==='record-type'))schemaError('Record-valued literals require a separate contract');
 if(field.itemType)knownSchemaMembers(field.itemType,['module','element'],'/itemType');
 const facets=object(field.facets??{});knownSchemaMembers(facets,['length','precision','scale','integerWidth','range','collectionSize'],'/facets');
 for(const [group,keys] of Object.entries({length:['min','max','unit'],integerWidth:['bits','signed'],range:['min','max','minInclusive','maxInclusive'],collectionSize:['min','max']}))if(facets[group])knownSchemaMembers(facets[group],keys,'/facets/'+group);
 if(value===null){if(field.nullability!=='absent-allowed')schemaError('Null requires explicit absent-allowed');return;}
 const v=object(value);if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==1)schemaError('Expected one typed literal wrapper');
 if(field.cardinality==='array'||field.cardinality==='map'){
  const kind=field.cardinality,items=v[kind];if(kind==='array'?!Array.isArray(items):!items||typeof items!=='object'||Array.isArray(items))schemaError('Container literal does not match Field');
  const ref=object(field.itemType);if(!ref)schemaError('Container literal requires explicit itemType');
  const item=doc.modules.find(m=>m.id===ref.module)?.elements.find(e=>e.id===ref.element);if(!item)schemaError('Unresolved itemType');
  const values=kind==='array'?items:Object.values(items),size=facets.collectionSize;
  if(size){knownSchemaMembers(size,['min','max'],'/facets/collectionSize');if(size.min!==undefined&&values.length<size.min||size.max!==undefined&&values.length>size.max)schemaError('Collection size outside bounds');}
  for(const entry of values)checkSchemaLiteral(doc,item,entry,refinements,depth+1);
 }else{
  if(field.cardinality!==undefined&&!['one','unspecified'].includes(field.cardinality as string))schemaError('Unknown cardinality');
  const kind=field.scalarType,wrapper=({boolean:'boolean',integer:'integerToken',decimal:'decimalToken',string:'string',binary:'binaryHex',float:'floatToken',date:'date',time:'time',timestamp:'timestamp'} as Record<string,string>)[kind as string];
  if(!wrapper||!Object.hasOwn(v,wrapper))schemaError('Literal does not match scalar family');
  if(['float','date','time','timestamp'].includes(kind!)){if(refinements)schemaError('Value/default semantics for float/temporal domain are not defined');if(typeof v[wrapper]!=='string')schemaError('Expected literal text');return;}
  literalIdentity(field,value);
  let count:number|undefined;
  if(kind==='string')count=stringLength(v.string);
  if(kind==='binary')count=v.binaryHex.length/2;
  if(facets.length){knownSchemaMembers(facets.length,['min','max','unit'],'/facets/length');if(facets.length.unit!==(kind==='string'?'unicode-scalar':'byte'))schemaError('Unknown/incompatible length unit');if(count===undefined)schemaError('Length requires string/binary');if(facets.length.min!==undefined&&count<facets.length.min||facets.length.max!==undefined&&count>facets.length.max)schemaError('Literal length outside bounds');}
  if(facets.integerWidth){knownSchemaMembers(facets.integerWidth,['bits','signed'],'/facets/integerWidth');const w=facets.integerWidth,n=schemaCoefficient(v.integerToken,0),magnitude=n<0n?-n:n,bits=magnitude===0n?0:magnitude.toString(2).length;const fits=w.signed?(n<0n?(bits<w.bits||(bits===w.bits&&(magnitude&(magnitude-1n))===0n)):bits<w.bits):n>=0n&&bits<=w.bits;if(!fits)schemaError('Integer outside width/signedness');}
  if(refinements&&facets.range){knownSchemaMembers(facets.range,['min','max','minInclusive','maxInclusive'],'/facets/range');const r=facets.range,scale=kind==='decimal'?facets.scale:0,n=schemaCoefficient(v[wrapper],scale,facets.precision);for(const end of ['min','max'])if(r[end]!==undefined){const bound=schemaCoefficient(object(r[end])[wrapper],scale,facets.precision);if(end==='min'?(n<bound||n===bound&&r.minInclusive===false):(n>bound||n===bound&&r.maxInclusive===false))schemaError('Literal outside numeric range');}}
 }
 if(refinements&&field.allowedValues){if(!(field.allowedValues as CoreLiteral[]).some(candidate=>literalIdentity(field,candidate)===literalIdentity(field,value)))schemaError('Literal is not an allowed value');}
}
