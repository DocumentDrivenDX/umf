import {copyJson} from '../../model/json';
import {pointer, type Json} from '../../model/types';

export type ParquetFacetDeclaredType =
 | {family:'integer'; bits:8|16|32|64; signed:boolean}
 | {family:'float'; bits:32|64}
 | {family:'string'}
 | {family:'binary'; exactBytes:number|null}
 | {family:'decimal'; precision:number; scale:number; carrier:'int32'|'int64'|'bytes'|'fixed'; exactBytes:number|null};
export interface ParquetFacetTypeInspection {
 native:Json; state:'declared'|'unsupported'; meaning?:ParquetFacetDeclaredType;
 reason?:string; unclaimedPaths:string[];
 basis:'isolated-native-declaration'; enforcement:'unverified';
}
const object=(v:Json|undefined):v is Record<string,Json>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function integer(v:Json|undefined):number|undefined {
 if(typeof v!=='string'||!/^(0|[1-9][0-9]*)(?![\s\S])/.test(v))return;
 const n=Number(v);return Number.isSafeInteger(n)?n:undefined;
}
/** Internal interpretation of one decoded Thrift SchemaElement. Does not select
 * a container item, validate a file, assign core facets or promise enforcement.
 * All original metadata is retained; unknown semantic annotations refuse.
 */
export function inspectParquetFacetType(input:Json):ParquetFacetTypeInspection {
 const native=copyJson(input),base={native,basis:'isolated-native-declaration' as const,enforcement:'unverified' as const};
 const claimed=new Set<string>();
 const unclaimed=()=>object(native)?Object.keys(native).filter(k=>!claimed.has(k)).map(k=>'/'+pointer(k)).sort():[''];
 const fail=(reason:string):ParquetFacetTypeInspection=>({...base,state:'unsupported',reason,unclaimedPaths:unclaimed()});
 const ok=(meaning:ParquetFacetDeclaredType):ParquetFacetTypeInspection=>({...base,state:'declared',meaning,unclaimedPaths:unclaimed()});
 if(!object(native))return fail('Expected a decoded native SchemaElement');
 const n=native;
 if(Object.hasOwn(n,'num_children'))return fail('Groups and child counts require separate shape interpretation');
 if(Object.hasOwn(n,'$unknown'))return fail('Unknown Thrift members may refine the declaration');
 const type=n.type;claimed.add('type');
 if(typeof type!=='string'||!['1','2','4','5','6','7'].includes(type))return fail('Physical type is outside this scalar facet profile');
 let exactBytes:number|null=null;
 if(type==='7'){
  claimed.add('type_length');exactBytes=integer(n.type_length)??null;
  if(exactBytes===null||exactBytes<1)return fail('Fixed byte length must be an exact positive supported integer token');
 }else if(Object.hasOwn(n,'type_length'))return fail('Type length on a non-fixed carrier is not interpreted');
 let name:string|undefined,params:Record<string,Json>={};
 if(Object.hasOwn(n,'logicalType')){
  if(!object(n.logicalType)||Object.keys(n.logicalType).length!==1)return fail('Logical annotation must select exactly one known alternative');
  name=Object.keys(n.logicalType)[0]!;
  if(!['INTEGER','DECIMAL','STRING'].includes(name)||!object(n.logicalType[name]))return fail('Unknown or unsupported logical meaning; physical fallback is not implied');
  params=n.logicalType[name] as Record<string,Json>;
  const keys=name==='INTEGER'?['bitWidth','isSigned']:name==='DECIMAL'?['precision','scale']:[];
  if(Object.keys(params).some(k=>!keys.includes(k)))return fail('Unknown logical parameters must remain uninterpreted');
  claimed.add('logicalType');
 }
 const converted=n.converted_type;
 if(converted!==undefined){
  if(typeof converted!=='string'||!['0','5','11','12','13','14','15','16','17','18'].includes(converted))return fail('Unsupported converted type; physical fallback is not implied');
  const legacyName=converted==='0'?'STRING':converted==='5'?'DECIMAL':'INTEGER';
  if(name&&name!==legacyName)return fail('Logical and converted annotations disagree');
  if(!name){
   name=legacyName;
   params=name==='INTEGER'?{bitWidth:String([8,16,32,64][(Number(converted)-11)%4]),isSigned:Number(converted)>=15}:name==='DECIMAL'?{precision:n.precision!,scale:n.scale??'0'}:{};
  }
  claimed.add('converted_type');
 }
 if(name!=='DECIMAL'&&(Object.hasOwn(n,'precision')||Object.hasOwn(n,'scale')))return fail('Decimal parameters without decimal meaning are not interpreted');
 if(name==='INTEGER'){
  const bits=integer(params.bitWidth),signed=params.isSigned;
  if(![8,16,32,64].includes(bits??0)||typeof signed!=='boolean')return fail('Integer annotation requires supported exact width and boolean signedness');
  if(type!==(bits===64?'2':'1'))return fail('Integer annotation exceeds or disagrees with physical carrier');
  if(converted!==undefined&&converted!==String((signed?15:11)+[8,16,32,64].indexOf(bits!)))return fail('Logical and converted integer parameters disagree');
  return ok({family:'integer',bits:bits as 8|16|32|64,signed});
 }
 if(name==='DECIMAL'){
  const precision=integer(params.precision),scale=integer(params.scale);
  if(precision===undefined||precision<1||scale===undefined||scale>precision)return fail('Decimal requires exact positive precision and nonnegative scale no greater than precision');
  if(!['1','2','6','7'].includes(type))return fail('Decimal requires an integer or binary physical carrier');
  for(const k of ['precision','scale']){
   if(Object.hasOwn(n,k)){
    if(n[k]!==String(k==='precision'?precision:scale))return fail('Logical and legacy decimal parameters disagree or have unsupported tokens');
    claimed.add(k);
   }
  }
  if(type==='1'&&precision>9||type==='2'&&precision>18)return fail('Decimal precision exceeds integer carrier capacity');
  if(type==='7'){
   if(exactBytes!>4096)return fail('Fixed decimal capacity exceeds the 4096-byte exact arithmetic profile');
   const digits=((1n<<BigInt(8*exactBytes!-1))-1n).toString().length-1;
   if(precision>digits)return fail('Decimal precision exceeds signed fixed-byte capacity');
  }
  return ok({family:'decimal',precision,scale,carrier:({'1':'int32','2':'int64','6':'bytes','7':'fixed'} as const)[type as '1'|'2'|'6'|'7'],exactBytes});
 }
 if(name==='STRING')return type==='6'?ok({family:'string'}):fail('STRING requires BYTE_ARRAY');
 if(type==='1'||type==='2')return ok({family:'integer',bits:type==='1'?32:64,signed:true});
 if(type==='4'||type==='5')return ok({family:'float',bits:type==='4'?32:64});
 return ok({family:'binary',exactBytes});
}
