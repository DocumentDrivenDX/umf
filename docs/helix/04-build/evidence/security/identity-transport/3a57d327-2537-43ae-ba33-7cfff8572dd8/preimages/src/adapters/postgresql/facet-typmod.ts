import {copyJson} from '../../model/json';
import {readJsonValue} from '../../model/serialization';
import {type NativeJson} from '../../model/native-json';
import {UmfError} from '../../model/types';
export type PostgresqlFacetNativeType=
 |{family:'integer';signedBits:16|32|64}
 |{family:'decimal';precision:number|null;scale:number|null;specials:'nan'|'nan-and-infinities';coercesScale:boolean}
 |{family:'string';declaredMaxCharacters:number|null;padding:'none'|'blank-padded'|'blank-trimmed';permitsNul:false}
 |{family:'binary';declaredMaxBytes:null}
 |{family:'float';bits:32|64};
export interface PostgresqlFacetTypeInspection {native:NativeJson;state:'observed'|'unsupported';meaning?:PostgresqlFacetNativeType;reason?:string}
const string=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
function integer(n:NativeJson|undefined):number|undefined{
 if(n?.kind!=='number')return undefined;
 try{const value=readJsonValue(n.value,'json');return typeof value==='number'&&Number.isSafeInteger(value)?value:undefined;}catch(e){if(!(e instanceof UmfError))throw e;return undefined;}
}
/** Internal native interpretation for PostgreSQL 17.4. Not a core-facet or constraint classification.
 * Numeric layout follows REL_17_4 numeric.c: 4-byte offset, 16-bit precision,
 * signed 11-bit scale. Preserve unknown/reserved layouts rather than masking them.
 */
export function inspectPostgresqlFacetType(input:NativeJson):PostgresqlFacetTypeInspection {
 const native=copyJson(input) as NativeJson;
 const unsupported=(reason:string):PostgresqlFacetTypeInspection=>({native,state:'unsupported',reason});
 const observed=(meaning:PostgresqlFacetNativeType):PostgresqlFacetTypeInspection=>({native,state:'observed',meaning});
 if(native.kind!=='object')return unsupported('Expected a native type metadata object');
 const m=native.members,name=string(m.name),category=string(m.category),modifier=integer(m.modifier),dimensions=integer(m.dimensions);
 if(string(m.schema)!=='pg_catalog'||string(m.kind)!=='b'||dimensions!==0)return unsupported('Only direct pg_catalog scalar base types with zero dimensions are interpreted; domains, arrays and custom types retain native meaning');
 if(modifier===undefined||modifier< -1||modifier>2147483647)return unsupported('Native modifier must be an exact supported signed-32-bit catalog integer');
 if(['int2','int4','int8'].includes(name??'')&&category==='N'&&modifier===-1)return observed({family:'integer',signedBits:name==='int2'?16:name==='int4'?32:64});
 if(['float4','float8'].includes(name??'')&&category==='N'&&modifier===-1)return observed({family:'float',bits:name==='float4'?32:64});
 if(name==='numeric'&&category==='N'){
  if(modifier===-1)return observed({family:'decimal',precision:null,scale:null,specials:'nan-and-infinities',coercesScale:false});
  if(modifier<4)return unsupported('Numeric modifier does not contain a valid offset');
  const packed=modifier-4,precision=Math.floor(packed/65536),encodedScale=packed%2048,scale=encodedScale>=1024?encodedScale-2048:encodedScale,reserved=Math.floor(packed/2048)%32;
  if(reserved!==0||precision<1||precision>1000||scale< -1000||scale>1000)return unsupported('Numeric modifier has unsupported precision, signed scale or reserved bits');
  return observed({family:'decimal',precision,scale,specials:'nan',coercesScale:true});
 }
 if(['varchar','bpchar'].includes(name??'')&&category==='S'){
  if(modifier!==-1&&(modifier<5||modifier>10485764))return unsupported('Character modifier is outside the PostgreSQL 17.4 declared length range');
  return observed({family:'string',declaredMaxCharacters:modifier===-1?null:modifier-4,padding:name==='varchar'?'none':modifier===-1?'blank-trimmed':'blank-padded',permitsNul:false});
 }
 if(name==='text'&&category==='S'&&modifier===-1)return observed({family:'string',declaredMaxCharacters:null,padding:'none',permitsNul:false});
 if(name==='bytea'&&category==='U'&&modifier===-1)return observed({family:'binary',declaredMaxBytes:null});
 return unsupported('Native type/category/modifier combination is outside the qualified decoding subset');
}
