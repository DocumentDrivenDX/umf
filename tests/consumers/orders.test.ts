import {test,expect} from 'bun:test';
import {ordersModel,generateOrdersConsumers,compileOrdersTransform} from '../../scripts/examples/orders-consumers';
import {readDocument,writeDocument,editTableSpecColumn,exportTableSpec,exportOpenapiDocument,getDddDefinition} from '../../src';
import {createValidator} from '../../src/validation/schema';

test('CONTRACT-036 seven authored consumers retain mixed native context across both UMF formats',async()=>{
 const ajv=createValidator(false);
 for(const path of ['core/schema','core/element-selection.schema','extensions/ddd/schema','projections/tablespec-avro.schema','projections/avro-json-schema.schema','examples/orders-consumers.schema'])ajv.addSchema(await Bun.file('spec/'+path+'.json').json());
 const check=ajv.getSchema('urn:umf:example:orders-consumers:1')!;
 const cases=[];
 for(const unknown of [false,true]){
  const source=ordersModel(unknown),bundle=generateOrdersConsumers(source);
  expect(check(bundle)).toBe(true);expect(bundle.context.source).toEqual(source);expect(bundle.context.selection.length).toBe(6);expect(bundle.context.sourceValidation.complete).toBe(false);
  expect(bundle.form.fields.map(f=>f.scalarType)).toEqual(['string','integer','boolean']);
  expect(bundle.visualization.edges.length).toBe(4);expect(bundle.pipeline.steps.at(-1)!.id).toBe('deliver-proposal');
  for(const format of ['json','yaml'] as const){
   const decoded=readDocument(writeDocument(source,format),format),regenerated=generateOrdersConsumers(decoded);
   expect(regenerated).toEqual(bundle);expect(exportTableSpec(regenerated.context.source)).toBe(exportTableSpec(source));expect(exportOpenapiDocument(regenerated.context.source)).toBe(exportOpenapiDocument(source));expect(getDddDefinition(regenerated.context.source,'sales','Order')).toEqual(getDddDefinition(source,'sales','Order'));
  }
  if(unknown)expect(bundle.context.source.extensions!['example.future']).toEqual(source.extensions!['example.future']);
  const {run}=compileOrdersTransform(source),rows=[{order_id:'A-雪',quantity:0,active:false},{order_id:'B',quantity:2147483647,active:true},{order_id:'C',quantity:-2147483648,active:false}].map(run);
  expect(rows.every(r=>r.status==='accepted')).toBe(true);cases.push({unknown,source,bundle,rows});
 }
 await Bun.write('fixtures/validation/orders-consumers.json',JSON.stringify({scope:'Authored mixed-model demonstrator; no general merge, domain enforcement, or delivery',cases},null,2)+'\n');
});

test('CONTRACT-036 executable row transform rejects loss, coercion and overflow; snapshots remain isolated',()=>{
 const source=ordersModel(true),{bundle,run}=compileOrdersTransform(source),good={order_id:'A-01',quantity:3,active:true};
 expect(run(good)).toEqual({status:'accepted',source:good,output:{orderId:'A-01',quantity:3,isActive:true}});
 for(const row of [{...good,extra:1},{quantity:3,active:true},{...good,quantity:2147483648},{...good,quantity:-2147483649},{...good,quantity:1.2},{...good,active:'true'},{...good,order_id:null},null,[]])expect(run(row).status).toBe('rejected');
 for(const quantity of [-2147483648,2147483647])expect(run({...good,quantity}).status).toBe('accepted');
 // Native length and domain positivity are deliberately not asserted by the DTO validator.
 expect(run({...good,order_id:'x'.repeat(41),quantity:-1}).status).toBe('accepted');
 expect(bundle.validator.avro.issues.some(i=>i.code==='TEXT_REFINEMENTS')).toBe(true);
 bundle.transform.fields[0]!.source='mutated';source.modules[0]!.elements[0]!.name='mutated';expect(run(good).status).toBe('accepted');
 let invoked=false;expect(()=>run({get order_id(){invoked=true;return 'A';}})).toThrow();expect(invoked).toBe(false);
 expect(()=>run({...good,quantity:NaN})).toThrow();
});

test('CONTRACT-036 safe native metadata edits propagate while inconsistent sources fail',()=>{
 const source=ordersModel(true),edited=editTableSpecColumn(source,0,{description:{kind:'string',value:'Updated <label> & context'}}),bundle=generateOrdersConsumers(edited);
 expect(bundle.form.fields[0]!.description).toBe('Updated <label> & context');expect(bundle.humanDocumentation).toContain('Updated <label> & context');expect(bundle.validator.avro.nativeSchema).toContain('Updated <label> & context');
 expect(bundle.context.source.extensions!['example.future']).toEqual(source.extensions!['example.future']);
 expect(generateOrdersConsumers(source).form.fields[0]!.description).toBe('External order identifier');
 edited.modules[0]!.elements[0]!.scalarType='boolean';expect(()=>generateOrdersConsumers(edited)).toThrow();
 const labelSource=ordersModel();labelSource.modules.find(m=>m.id==='sales')!.elements.find(e=>e.id==='Order')!.name='<script>alert(1)</script>';
 const svg=generateOrdersConsumers(labelSource).visualization.svg;expect(svg).toContain('&lt;script&gt;');expect(svg).not.toContain('<script>');
});
