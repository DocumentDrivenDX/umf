import {createValidator} from '../../src/validation/schema';
import {openapiSchemaIndexSchema,openapiSchemaReferenceSchema} from '../../src';
import {test,expect} from 'bun:test';
import {importOpenapiDocument,indexOpenapiSchemas,resolveOpenapiSchemaReference} from '../../src';
const base='https://example.test/retrieved/api.json';
const standard='https://json-schema.org/draft/2020-12/schema';
const native={openapi:'3.2.1',$self:'https://example.test/semantic/api.json',info:{title:'Scope',version:'1'},components:{schemas:{Root:{$id:'models/root',type:'object',$defs:{Child:{$id:'child',$anchor:'named',type:'string'},Local:{$anchor:'local',type:'integer'}},properties:{value:{$ref:'child#named'}},examples:[{$id:'not-a-schema',$anchor:'ignored'}]}}}};
function doc(value:any=native){return importOpenapiDocument(JSON.stringify(value),{id:'scope',format:'json',baseUri:base,resources:[{uri:'https://example.test/external.json',format:'json',text:JSON.stringify({$schema:standard,$id:'https://example.test/canonical',$anchor:'external',type:'boolean'})}]});}
test('US-011-AC17: nested IDs, anchors, pointer aliases and $self preserve source location',async()=>{
 const source=doc();const index=indexOpenapiSchemas(source,{schemaResources:['https://example.test/external.json']});
 expect(createValidator().compile(openapiSchemaIndexSchema)(index)).toBe(true);
 expect(index.locations.length).toBe(5);expect(index.complete).toBe(false);
 const cases=[['child#named','/components/schemas/Root/$defs/Child'],['#local','/components/schemas/Root/$defs/Local'],['#/$defs/Local','/components/schemas/Root/$defs/Local'],[base+'#/components/schemas/Root/$defs/Child','/components/schemas/Root/$defs/Child'],['https://example.test/semantic/api.json#/components/schemas/Root','/components/schemas/Root'],['https://example.test/external.json#external','']];
 const rows=[];
 for(const [reference,path]of cases){const result=resolveOpenapiSchemaReference(source,{pointer:'/components/schemas/Root',reference:reference!,schemaResources:['https://example.test/external.json']});expect(createValidator().compile(openapiSchemaReferenceSchema)(result)).toBe(true);expect(result.target.pointer).toBe(path!);expect(result.complete).toBe(false);rows.push({reference,result});}
 expect(index.identifiers['https://example.test/semantic/models/not-a-schema']).toBeUndefined();
 await Bun.write('fixtures/openapi/scope-cases.json',JSON.stringify({native,base,rows},null,2)+'\n');
});
test('US-011-AC18: ambiguity, unknown dialect and non-schema targets fail explicitly',()=>{
 const source=doc();
 expect(()=>resolveOpenapiSchemaReference(source,{pointer:'/components/schemas/Root',reference:'#/examples/0'})).toThrow('not an indexed schema');
 expect(()=>resolveOpenapiSchemaReference(source,{pointer:'/components/schemas/Root',reference:'missing'})).toThrow('not indexed');
 const duplicate=structuredClone(native);duplicate.components.schemas.Root.$defs.Local={$id:'child',type:'integer'} as any;
 expect(()=>indexOpenapiSchemas(doc(duplicate))).toThrow('Ambiguous');
 const unknown=structuredClone(native);(unknown.components.schemas.Root as any).$schema='urn:unknown';
 expect(()=>indexOpenapiSchemas(doc(unknown))).toThrow('Cannot infer');
 expect(()=>indexOpenapiSchemas(source,{schemaResources:['https://example.test/missing']})).toThrow('explicitly supplied');
});
