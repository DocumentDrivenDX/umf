import {pointer,type Diagnostic} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
/** Pinned Spark 4.0.1 JVM metadata boundaries; source retention is unaffected. */
export function sparkMetadataDiagnostics(root:NativeJson):Diagnostic[]{
 const diagnostics:Diagnostic[]=[];
 const add=(code:string,path:string,message:string)=>diagnostics.push({code,path,severity:'warning',message});
 const category=(n:NativeJson)=>n.kind==='number'?(/[.eE]/.test(n.value)?'double':'long'):n.kind;
 function metadata(n:NativeJson,path:string){
  if(n.kind==='number'){
   if(!/[.eE]/.test(n.value)){
    const digits=n.value.replace(/^-/, '');
    if(digits.length>19||BigInt(n.value)<-9223372036854775808n||BigInt(n.value)>9223372036854775807n)add('SPARK_METADATA_INT64_OVERFLOW',path,'Spark JVM metadata converts integer tokens to int64 and can wrap this value; UMF retains the exact token');
   }else if(!Number.isFinite(Number(n.value)))add('SPARK_METADATA_NONFINITE',path,'Spark JVM metadata converts this number to a nonfinite double and may emit a string; UMF retains the exact token');
   else add('SPARK_METADATA_DOUBLE',path,'Spark JVM metadata uses binary64 for fractional/exponent tokens; precision and source spelling may change');
  }
  if(n.kind==='object')for(const [key,value] of Object.entries(n.members))metadata(value,path+'/'+pointer(key));
  if(n.kind==='array'){
   if(!n.items.length)add('SPARK_METADATA_EMPTY_ARRAY',path,'Spark JVM infers an empty int64 array; the source JSON does not specify the array element type');
   else{
    const first=category(n.items[0]!);
    if(first==='null'||first==='array')add('SPARK_METADATA_ARRAY_UNSUPPORTED',path,'Spark JVM metadata does not support arrays of nulls or nested arrays');
    if(n.items.some(item=>category(item)!==first))add('SPARK_METADATA_ARRAY_MIXED',path,'Spark JVM metadata requires homogeneous array categories, including separate integer and double categories');
   }
   n.items.forEach((item,i)=>metadata(item,path+'/'+i));
  }
 }
 function type(n:NativeJson,path:string){
  if(n.kind!=='object'||n.members.type?.kind!=='string')return;
  if(n.members.type.value==='struct'&&n.members.fields?.kind==='array')n.members.fields.items.forEach((field,i)=>{
   if(field.kind!=='object')return;const at=path+'/fields/'+i;
   if(field.members.metadata?.kind==='object'){
    if(!field.members.nullable)add('SPARK_FIELD_METADATA_WITHOUT_NULLABLE',at,'Spark JVM 4.0.1 does not accept a field with metadata but no nullable property; Python may insert the default');
    for(const [key,value] of Object.entries(field.members.metadata.members)){
     // Spark extracts this field-local semantic map before constructing ordinary metadata.
     if(key!=='__COLLATIONS')metadata(value,at+'/metadata/'+pointer(key));
    }
   }
   if(field.members.type)type(field.members.type,at+'/type');
  });
  if(n.members.type.value==='array'&&n.members.elementType)type(n.members.elementType,path+'/elementType');
  if(n.members.type.value==='map'){if(n.members.keyType)type(n.members.keyType,path+'/keyType');if(n.members.valueType)type(n.members.valueType,path+'/valueType');}
  // UDT sqlType interpretation depends on its class contract; do not assume native use.
 }
 type(root,'');return diagnostics;
}
