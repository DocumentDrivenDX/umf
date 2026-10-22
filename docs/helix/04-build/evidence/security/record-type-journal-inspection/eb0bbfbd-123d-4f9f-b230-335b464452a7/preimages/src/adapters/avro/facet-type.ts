import {copyJson} from '../../model/json';
import {readJsonValue} from '../../model/serialization';
import type {NativeJson} from '../../model/native-json';
import {UmfError} from '../../model/types';
import {createValidator} from '../../validation/schema';
import nativeSchema from '../../../spec/core/native-json.schema.json';

export type AvroFacetDeclaredType=
 |{family:'integer';bits:32|64;signed:true}
 |{family:'float';bits:32|64}
 |{family:'string'}
 |{family:'binary';exactBytes:number|null}
 |{family:'decimal';precision:number;scale:number;carrier:'bytes'|'fixed';exactBytes:number|null};
export interface AvroFacetTypeInspection {
 native:NativeJson;state:'declared'|'unsupported';meaning?:AvroFacetDeclaredType;
 reason?:string;unclaimedPaths:string[];
 /** Never a codec, input-conversion, schema-validity or core-equivalence guarantee. */
 basis:'isolated-native-declaration';enforcement:'unverified';
}
const check=createValidator().compile(nativeSchema);
const str=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
const escape=(s:string)=>s.replaceAll('~','~0').replaceAll('/','~1');
function integer(n:NativeJson|undefined):number|undefined {
 // Integral floating/exponent spellings differ across native parsers. Retain and
 // refuse those tokens, rather than reclassifying them after Number conversion.
 if(n?.kind!=='number'||!/^(0|[1-9][0-9]*)(?![\s\S])/.test(n.value))return undefined;
 try{const value=readJsonValue(n.value,'json');return typeof value==='number'&&Number.isSafeInteger(value)?value:undefined;}
 catch(e){if(!(e instanceof UmfError))throw e;return undefined;}
}
function knownRepresentation(n:NativeJson):boolean {
 const allowed=n.kind==='null'?['kind']:n.kind==='object'?['kind','members']:n.kind==='array'?['kind','items']:['kind','value'];
 if(Object.keys(n).some(k=>!allowed.includes(k)))return false;
 return n.kind==='object'?Object.values(n.members).every(knownRepresentation):n.kind==='array'?n.items.every(knownRepresentation):true;
}
/** Decode a selected native type fragment after name/union selection. Whole-schema
 * validation and selection are separate. Unknown content is copied, never erased.
 * This internal helper does not assign core facets or certify native enforcement.
 */
export function inspectAvroFacetType(input:NativeJson):AvroFacetTypeInspection {
 const native=copyJson(input) as NativeJson;
 const base={native,basis:'isolated-native-declaration' as const,enforcement:'unverified' as const};
 let unclaimedPaths:string[]=[];
 const unsupported=(reason:string):AvroFacetTypeInspection=>({...base,state:'unsupported',reason,unclaimedPaths});
 const declared=(meaning:AvroFacetDeclaredType):AvroFacetTypeInspection=>({...base,state:'declared',meaning,unclaimedPaths});
 if(!check(native)||!knownRepresentation(native))return unsupported('Invalid or unknown tagged native representation');
 const type=native.kind==='string'?native.value:native.kind==='object'?str(native.members.type):undefined;
 if(!type)return unsupported('Select one scalar type fragment; unions and containers require explicit context');
 const m=native.kind==='object'?native.members:Object.create(null) as Record<string,NativeJson>;
 const interpreted=new Set(['type']);
 if(type==='fixed')interpreted.add('size');
 if(Object.hasOwn(m,'logicalType')){
  interpreted.add('logicalType');
  if(str(m.logicalType)==='decimal'){interpreted.add('precision');interpreted.add('scale');}
 }
 unclaimedPaths=Object.keys(m).filter(k=>!interpreted.has(k)).map(k=>'/'+escape(k)).sort();
 let size:number|null=null;
 if(type==='fixed'){
  const name=str(m.name);
  if(!name||!/^[_A-Za-z][_A-Za-z0-9]*(?:\.[_A-Za-z][_A-Za-z0-9]*)*(?![\s\S])/.test(name))return unsupported('Fixed identity must be a supported Avro name');
  size=integer(m.size)??null;
  if(size===null)return unsupported('Fixed size must have an exact nonnegative supported JSON integer token');
 }
 if(Object.hasOwn(m,'logicalType')){
  if(str(m.logicalType)!=='decimal'||!['bytes','fixed'].includes(type))return unsupported('Logical meaning is outside this facet declaration profile; native fallback remains separate');
  const precision=integer(m.precision),scale=m.scale===undefined?0:integer(m.scale);
  if(precision===undefined||precision<1||scale===undefined||scale>precision)return unsupported('Decimal precision/scale must form a valid exact supported pair');
  if(type==='fixed'){
   if(size===0)return unsupported('Zero-byte fixed cannot carry positive decimal precision');
   if(size!>4096)return unsupported('Fixed decimal capacity calculation exceeds the 4096-byte interpretation bound');
   const maxDigits=((1n<<BigInt(8*size!-1))-1n).toString().length-1;
   if(precision>maxDigits)return unsupported('Declared decimal precision exceeds signed fixed-byte capacity');
  }
  return declared({family:'decimal',precision,scale,carrier:type as 'bytes'|'fixed',exactBytes:size});
 }
 if(type==='int'||type==='long')return declared({family:'integer',bits:type==='int'?32:64,signed:true});
 if(type==='float'||type==='double')return declared({family:'float',bits:type==='float'?32:64});
 if(type==='string')return declared({family:'string'});
 if(type==='bytes'||type==='fixed')return declared({family:'binary',exactBytes:size});
 return unsupported('Named references, containers, null, records, enums and other non-facet carriers require separate interpretation');
}
