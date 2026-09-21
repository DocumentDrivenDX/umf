import {enforceProjectionPolicy} from './projection-policy-schema';
const schema=await Bun.file('spec/core/avro-record-classification.schema.json').json();
schema.$id='urn:umf:core:parquet-record-classification:1.0.0';schema.title='Parquet interpreted record classification';schema.properties.operation.const='classify-parquet-record';
for(const p of ['path','nativeSource','dependencyId','dependencies'])delete schema.properties.request.properties[p];
schema.properties.request.required=['recordModule','recordId','index','mode'];schema.properties.request.properties.index={type:'integer',minimum:0};
schema.properties.binding.const={id:'umf.parquet.record',version:'1.0.0',nativeVersion:'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017',subset:'Unannotated root/struct definitions after LIST/MAP interpretation; direct members only, no cardinality or value-domain equivalence'};
delete schema.properties.mappings.items.properties.dependencyId;schema.properties.mappings.items.properties.basis.enum=['checked-record-field-membership','checked-record-declaration'];enforceProjectionPolicy(schema,'classified');
await Bun.write('spec/core/parquet-record-classification.schema.json',JSON.stringify(schema,null,2)+'\n');
