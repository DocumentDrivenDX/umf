import base from '../../spec/core/cardinality-avro-projection.schema.json';
import {parquetCarriers} from '../../src/core-ideals/parquet-carriers';
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
const native={$ref:'#/$defs/nativeType'},nullable={type:'boolean'},fieldId={type:'integer',minimum:-2147483648,maximum:2147483647};
const primitive={enum:Object.keys(parquetCarriers)},text={type:'string',minLength:1};
const nativeType={oneOf:[
 object({kind:{const:'scalar'},nullable,fieldId,nativeType:primitive},['kind','nullable','nativeType']),
 object({kind:{const:'array'},nullable,fieldId,item:native},['kind','nullable','item']),
 object({kind:{const:'map'},nullable,fieldId,keyType:primitive,value:native},['kind','nullable','keyType','value']),
 object({kind:{const:'record'},nullable,fieldId,fields:{type:'array',minItems:1,maxItems:1000,items:object({name:text,type:native})}},['kind','nullable','fields']),
]};
const schema:any=structuredClone(base),p=schema.properties;
schema.$id='urn:umf:core:cardinality-parquet-projection:1.0.0';schema.title='Authored Cardinality to an explicit Parquet schema';schema.$defs={nativeType};
p.operation.const='project-cardinality-parquet';delete p.nativeBundle;
p.request=object({id:text,recordName:text,fieldName:text,nativeType:native,availability:{enum:['definition-level','unresolved']},requireExactValues:{type:'boolean'},mode:{enum:['strict','report']}});
p.binding.const={id:'umf.core.cardinality.parquet',version:'1.0.0',nativeVersion:'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017',subset:'Explicit nested native carriers for authored shape and item/value Fields; empty schema file, no row conversion, key uniqueness enforcement or implicit record lowering'};
p.mapping.properties.items.items=object({idealPath:text,nativeIndex:{type:'integer',minimum:1}});
delete schema.allOf[0].then.properties.nativeBundle;schema.allOf[0].then.required=['target'];delete schema.allOf[0].else.properties.nativeBundle;
await Bun.write('spec/core/cardinality-parquet-projection.schema.json',JSON.stringify(schema,null,2)+'\n');
export {};
