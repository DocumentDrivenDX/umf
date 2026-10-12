import {copyJson} from '../../model/json';
import {readJsonValue} from '../../model/serialization';
import type {NativeJson} from '../../model/native-json';
import {UmfError} from '../../model/types';
export type SqlServerFacetNativeType=
 |{family:'integer';bits:8|16|32|64;signed:boolean}
 |{family:'decimal';precision:number;scale:number;inputRounding:'session-dependent'}
 |{family:'float';bits:32|64;mantissaBits:24|53}
 |{family:'string';size:'bounded'|'max';maxBytes:number|null;maxUtf16Units:number|null;representation:'utf16-code-units'|'collation-dependent';padding:'fixed'|'variable';collation:string}
 |{family:'binary';size:'bounded'|'max';maxBytes:number|null;padding:'fixed'|'variable'};
export interface SqlServerFacetTypeInspection {native:NativeJson;state:'observed'|'unsupported';meaning?:SqlServerFacetNativeType;reason?:string}
const str=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
const no=(n:NativeJson|undefined)=>n?.kind==='boolean'&&n.value===false;
function integer(n:NativeJson|undefined):number|undefined{
 if(n?.kind!=='number')return undefined;
 try{const value=readJsonValue(n.value,'json');return typeof value==='number'&&Number.isSafeInteger(value)&&!Object.is(value,-0)?value:undefined;}catch(e){if(!(e instanceof UmfError))throw e;return undefined;}
}
/** Internal native type facts for SQL Server 16.0.4295.3. Neither core facets nor
 * CHECK enforcement, Unicode validity, input exactness or source authenticity. */
export function inspectSqlServerFacetType(input:NativeJson):SqlServerFacetTypeInspection {
 const native=copyJson(input) as NativeJson;
 const unsupported=(reason:string):SqlServerFacetTypeInspection=>({native,state:'unsupported',reason});
 const observed=(meaning:SqlServerFacetNativeType):SqlServerFacetTypeInspection=>({native,state:'observed',meaning});
 if(native.kind!=='object')return unsupported('Expected catalog column metadata');
 const m=native.members,name=str(m.type_name),system=integer(m.system_type_id),user=integer(m.user_type_id),length=integer(m.max_length),precision=integer(m.precision),scale=integer(m.scale);
 if(str(m.type_schema)!=='sys'||!no(m.is_user_defined)||!no(m.is_assembly_type)||system===undefined||user!==system||str(m.base_type_name)!==name)return unsupported('Only direct, coherent sys scalar base types are decoded; alias and CLR meaning stays native');
 if(length===undefined||precision===undefined||scale===undefined)return unsupported('Native sizes must be exact supported catalog integers');
 if(!['varchar','char','nvarchar','nchar'].includes(name??'')&&m.collation_name?.kind!=='null')return unsupported('Non-character scalar metadata must have null collation');
 const ints:Record<string,readonly [number,number,number,8|16|32|64,boolean]>={tinyint:[48,1,3,8,false],smallint:[52,2,5,16,true],int:[56,4,10,32,true],bigint:[127,8,19,64,true]};
 const i=name&&Object.hasOwn(ints,name)?ints[name]:undefined;
 if(i&&system===i[0]&&length===i[1]&&precision===i[2]&&scale===0)return observed({family:'integer',bits:i[3],signed:i[4]});
 if((name==='decimal'&&system===106||name==='numeric'&&system===108)&&precision>=1&&precision<=38&&scale>=0&&scale<=precision&&length===(precision<=9?5:precision<=19?9:precision<=28?13:17))return observed({family:'decimal',precision,scale,inputRounding:'session-dependent'});
 if(scale===0&&(name==='real'&&system===59&&precision===24&&length===4||name==='float'&&system===62&&precision===53&&length===8))return observed({family:'float',bits:name==='real'?32:64,mantissaBits:name==='real'?24:53});
 const character:Record<string,number>={varchar:167,char:175,nvarchar:231,nchar:239};
 if(name&&Object.hasOwn(character,name)&&system===character[name]&&precision===0&&scale===0){
  const unicode=name.startsWith('n'),fixed=name==='char'||name==='nchar',collation=str(m.collation_name);
  if(!collation||length===-1&&fixed||length!==-1&&(length<1||length>8000||unicode&&length%2!==0))return unsupported('Unsupported character size or missing collation');
  return observed({family:'string',size:length===-1?'max':'bounded',maxBytes:length===-1?null:length,maxUtf16Units:unicode&&length!==-1?length/2:null,representation:unicode?'utf16-code-units':'collation-dependent',padding:fixed?'fixed':'variable',collation});
 }
 if((name==='binary'&&system===173||name==='varbinary'&&system===165)&&precision===0&&scale===0){
  if(length===-1&&name==='binary'||length!==-1&&(length<1||length>8000))return unsupported('Unsupported binary size');
  return observed({family:'binary',size:length===-1?'max':'bounded',maxBytes:length===-1?null:length,padding:name==='binary'?'fixed':'variable'});
 }
 return unsupported('Native type identity, precision, scale or storage size is outside the qualified decoding subset');
}
