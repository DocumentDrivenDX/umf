import {pointer,type Diagnostic} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
/** Field-local annotation checks. Provider catalogs and engine validity remain unverified. */
export function sparkCollationDiagnostics(root:NativeJson):Diagnostic[]{
 const ds:Diagnostic[]=[];
 const add=(code:string,path:string,message:string)=>ds.push({code,path,message,severity:'warning'});
 function field(f:NativeJson,path:string){
  if(f.kind!=='object'||f.members.name?.kind!=='string'||!f.members.type)return;
  const metadata=f.members.metadata,map=metadata?.kind==='object'?metadata.members.__COLLATIONS:undefined;
  if(map){const at=path+'/metadata/__COLLATIONS';
   if(map.kind!=='object')add('SPARK_COLLATION_MAP',at,'Native collation metadata must be a path-to-string map; JVM may ignore this value while Python rejects it');
   else{
    const locations=new Map<string,NativeJson>();
    function visit(n:NativeJson,name:string){locations.set(name,n);if(n.kind!=='object'||n.members.type?.kind!=='string')return;const append=(suffix:string)=>name?name+'.'+suffix:suffix;
     if(n.members.type.value==='array'&&n.members.elementType)visit(n.members.elementType,append('element'));
     if(n.members.type.value==='map'){if(n.members.keyType)visit(n.members.keyType,append('key'));if(n.members.valueType)visit(n.members.valueType,append('value'));}
    }
    visit(f.members.type,f.members.name.value);
    for(const [key,value] of Object.entries(map.members)){
     const where=at+'/'+pointer(key),target=locations.get(key);
     if(value.kind!=='string')add('SPARK_COLLATION_VALUE',where,'Native collation annotation is not a string; JVM may ignore it while Python rejects it');
     else if(!/^(spark|icu)\..+$/.test(value.value))add('SPARK_COLLATION_PROVIDER',where,'Expected a Spark 4.0.1 provider-qualified collation name; provider/name validity requires native verification');
     if(!target)add('SPARK_COLLATION_UNRESOLVED',where,'Path does not resolve within this field through known array/map types; native parsing may discard the annotation');
     else if(target.kind!=='string'||target.value!=='string')add('SPARK_COLLATION_TARGET',where,'Collation path targets a non-string schema node; native parsers may reject it');
    }
   }
  }
  type(f.members.type,path+'/type');
 }
 function type(n:NativeJson,path:string){if(n.kind!=='object'||n.members.type?.kind!=='string')return;
  if(n.members.type.value==='struct'&&n.members.fields?.kind==='array')n.members.fields.items.forEach((f,i)=>field(f,path+'/fields/'+i));
  if(n.members.type.value==='array'&&n.members.elementType)type(n.members.elementType,path+'/elementType');
  if(n.members.type.value==='map'){if(n.members.keyType)type(n.members.keyType,path+'/keyType');if(n.members.valueType)type(n.members.valueType,path+'/valueType');}
 }
 type(root,'');return ds;
}
