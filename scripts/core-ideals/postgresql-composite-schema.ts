import {enforceProjectionPolicy} from './projection-policy-schema';
export {};
const schema=await Bun.file('spec/core/postgresql-record-classification.schema.json').json();
schema.$id='urn:umf:core:postgresql-composite-classification:1.0.0';schema.title='Captured PostgreSQL standalone composite record/member roles';schema.properties.operation.const='classify-postgresql-composite';
delete schema.properties.request.properties.authors;
schema.properties.binding.const={id:'umf.postgresql.catalog.composite',version:'1.0.0',nativeVersion:'17.4',subset:'Captured standalone composite member roles only; formatted attribute type names do not resolve scalar families or nested identities'};
schema.properties.mappings.items.properties.basis.enum=['checked-catalog-composite','checked-catalog-composite-attribute'];
enforceProjectionPolicy(schema,'classified');
await Bun.write('spec/core/postgresql-composite-classification.schema.json',JSON.stringify(schema,null,2)+'\n');
