import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import {readDddDocument,writeDddDocument,projectDddToJsonSchema,exportJsonSchema,importJsonSchema,inspectDdd,coreSchema,type DddDocumentBindings} from '../../src';
import reportSchema from '../../spec/projections/ddd-json-schema.schema.json';
const checkReport=new Ajv2020({strict:false}).addSchema(coreSchema).compile(reportSchema);
const text=await Bun.file('fixtures/ddd/sales.json').text();
const options:DddDocumentBindings={id:'order-document',schemaId:'https://example.test/order-document',root:{module:'sales',element:'Order'},closedObjects:true,integer:'json-integer',decimal:'decimal-string',dateTime:'string',bytes:'hex-string',collection:'array',lossPolicy:'allow-reported-loss',relations:{'/sales/Order/fields/total':'embed','/sales/Order/fields/lines':'embed','/sales/Order/fields/shipping':'embed','/sales/Order/fields/customer':'identity','/sales/OrderLine/fields/price':'embed'}};
const good={order_id:'o-1',total:{amount:'10.00',currency:'USD'},lines:[{line_id:'l-1',sku:'sku',quantity:1,price:{amount:'10.00',currency:'USD'}}],shipping:{street:'Main',city:'Town',postal_code:'10000'},customer:{customer_id:'c-1'}};
test('US-006-AC1: explicit document binding emits useful nested schema with separate source recovery',async()=>{
 const source=readDddDocument(text,'json');const result=projectDddToJsonSchema(source,options);
 expect(result.status).toBe('projected');expect(checkReport(result)).toBe(true);expect(result.source).toEqual(source);
 expect(result.mappings.find(m=>m.concept.element==='Customer')!.mode).toBe('identity');
 expect(result.mappings.filter(m=>m.concept.element==='Money').length).toBe(1);
 expect(readDddDocument(writeDddDocument(result.source))).toEqual(source);
 const targetOnly=importJsonSchema(exportJsonSchema(result.target!),{id:'target-only',baseUri:options.schemaId});
 expect(targetOnly.vocabularies['umf.ddd']).toBeUndefined();
 for(const code of ['DDD_INVARIANT_OPAQUE','AGGREGATE_UNENFORCED','IDENTITY_UNENFORCED','VALUE_EQUALITY_UNENFORCED','DOMAIN_MODEL_RETAINED','IDENTITY_REFERENCE','DECIMAL_ENCODING'])expect(result.issues.some(i=>i.code===code),code).toBe(true);
 await Bun.write('fixtures/ddd/document-projection.json',JSON.stringify(result,null,2)+'\n');
});
test('US-006-AC2: independent JSON Schema validation enforces shape but not domain consistency',()=>{
 const result=projectDddToJsonSchema(readDddDocument(text,'json'),options);
 const validate=new Ajv2020({strict:false}).compile(JSON.parse(result.nativeSchema!));
 expect(validate(good)).toBe(true);
 expect(validate({...good,order_id:undefined})).toBe(false);
 expect(validate({...good,total:{amount:10,currency:'USD'}})).toBe(false);
 expect(validate({...good,total:{amount:'1e1',currency:'USD'}})).toBe(false);
 expect(validate({...good,customer:{customer_id:'c-1',name:'Not embedded'}})).toBe(false);
 // Native shape validity does not enforce the retained total/lines invariant.
 expect(validate({...good,total:{amount:'-99',currency:'USD'}})).toBe(true);
 expect(result.issues.some(i=>i.code==='DDD_INVARIANT_OPAQUE')).toBe(true);
});
test('US-006-AC3: missing, unused, invalid identity, strict and non-data bindings block explicitly',()=>{
 const source=readDddDocument(text,'json');
 for(const bindings of [{...options,relations:{}},{...options,relations:{...options.relations,'/unused':'embed' as const}},{...options,relations:{...options.relations,'/sales/Order/fields/lines':'identity' as const}},{...options,lossPolicy:'strict' as const},{...options,root:{module:'sales',element:'Orders'}}]){
  const result=projectDddToJsonSchema(source,bindings);expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();
 }
 expect(()=>projectDddToJsonSchema(source,{...options,schemaId:'relative'})).toThrow();
 expect(inspectDdd(source).valid).toBe(true);
});
test('US-006-AC4: changing only embedding policy changes document representation, not domain intent',()=>{
 const source=readDddDocument(text,'json');
 const embedded=projectDddToJsonSchema(source,{...options,relations:{...options.relations,'/sales/Order/fields/customer':'embed'}});
 const validate=new Ajv2020({strict:false}).compile(JSON.parse(embedded.nativeSchema!));
 expect(validate(good)).toBe(false);
 expect(validate({...good,customer:{customer_id:'c-1',name:'Customer'}})).toBe(true);
 expect(embedded.source).toEqual(source);
});
