// Browser-safe, authored FR-41 demonstrator. This is not a generic model merger or encoder.
import sales from '../../fixtures/ddd/sales.json';
import {copyJson} from '../../src/model/json';
import type {Document} from '../../src/model/types';
import {selectCoreElements} from '../../src/model/selection';
import {importTableSpec,exportTableSpec,getTableSpecColumn} from '../../src/adapters/tablespec';
import {importOpenapiDocument,exportOpenapiDocument,getOpenapiNode} from '../../src/adapters/openapi';
import {getDddDefinition,inspectDdd} from '../../src/extensions/ddd';
import {renderTree} from '../../src/model/native-json';
import {readJsonValue} from '../../src/model/serialization';
import {projectTableSpecToAvro} from '../../src/projections/tablespec-avro';
import {projectAvroToJsonSchema} from '../../src/projections/avro-json-schema';
import {createValidator} from '../../src/validation/schema';

export function ordersModel(unknownVocabulary=false):Document {
 const table=importTableSpec(JSON.stringify({version:'1.0',table_name:'orders',columns:[
  {name:'order_id',data_type:'VARCHAR',length:40,nullable:false,description:'External order identifier'},
  {name:'quantity',data_type:'INTEGER',nullable:false,description:'Requested quantity'},
  {name:'active',data_type:'BOOLEAN',nullable:false,description:'Whether the request is active'},
 ]}),{id:'example:orders-table',format:'json'});
 const service=importOpenapiDocument(JSON.stringify({openapi:'3.1.1',info:{title:'Orders',version:'1'},paths:{'/orders':{post:{operationId:'requestOrder',requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{orderId:{type:'string'},quantity:{type:'integer',minimum:-2147483648,maximum:2147483647},isActive:{type:'boolean'}},required:['orderId','quantity','isActive'],additionalProperties:false}}}},responses:{'202':{description:'Request accepted'}}}}}}),{id:'example:orders-service',format:'json'});
 const domain=copyJson(sales) as unknown as Document;
 const source:Document={umf:'0.1.0',id:'example:orders-consumers',vocabularies:{...table.vocabularies,...service.vocabularies,...domain.vocabularies},modules:[...table.modules,...service.modules,...domain.modules],extensions:{...table.extensions,...service.extensions,...domain.extensions}};
 for(const column of source.modules[0]!.elements)column.references=[{role:'authored-request-association',module:'sales',element:'Order'}];
 source.modules[1]!.elements[0]!.references=[{role:'authored-service-association',module:'sales',element:'Ordering'}];
 if(unknownVocabulary){source.vocabularies['example.future']={version:'9.0.0'};source.extensions!['example.future']={uninterpreted:{routing:['cold','future'],strength:7}};}
 return source;
}

const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function generateOrdersConsumers(input:Document){
 const source=copyJson(input) as Document;
 // Each adapter checks its own native contract; core validation alone cannot do that.
 exportTableSpec(source);exportOpenapiDocument(source);
 if(!inspectDdd(source).valid)throw Error('Invalid domain model');
 const selection=selectCoreElements(source,{references:'transitive',modules:['table','schema']});
 const avro=projectTableSpecToAvro(source,{id:'example:orders-avro',recordName:'OrderRequest',namespace:'example.sales',fields:{order_id:{name:'orderId',representation:'string',nullable:'source'},quantity:{name:'quantity',representation:'int32',nullable:'source'},active:{name:'isActive',representation:'boolean',nullable:'source'}},lossPolicy:'allow-reported-loss'});
 if(avro.status!=='projected'||!avro.target)throw Error('Unsupported table shape');
 if(source.modules.find(m=>m.id==='table')!.elements.length!==avro.mappings.length)throw Error('Demo refuses unmapped columns');
 const document=projectAvroToJsonSchema(avro.target,{id:'example:orders-json',schemaId:'urn:example:orders-dto',long:'decimal-string',bytes:'hex-string',union:'untagged',lossPolicy:'allow-reported-loss'});
 if(document.status!=='projected'||!document.nativeSchema)throw Error('Unsupported DTO projection');
 const operationPath='/paths/~1orders/post';
 const operation=readJsonValue(renderTree(getOpenapiNode(source,operationPath)),'json') as Record<string,any>;
 const serviceSchema=operation.requestBody.content['application/json'].schema;
 // Keep this authored endpoint contract narrow. Arbitrary OpenAPI references/keywords need
 // the OpenAPI projection/resolution API, not an unchecked JSON Schema extraction.
 const expected=JSON.parse(renderTree(getOpenapiNode(ordersModel(),operationPath))).requestBody.content['application/json'].schema;
 if(JSON.stringify(serviceSchema)!==JSON.stringify(expected)||operation.operationId!=='requestOrder')throw Error('Demo service binding changed');
 const fields=avro.mappings.map(m=>{
  const column=readJsonValue(renderTree(getTableSpecColumn(source,m.index)),'json') as Record<string,any>;
  const entry=selection.selection.find(e=>e.module==='table'&&e.element.id==='column:'+m.index)!;
  return {source:m.column,target:m.field,path:entry.path,nativePath:'/columns/'+m.index,description:typeof column.description==='string'?column.description:'',scalarType:entry.element.scalarType??'unknown',control:m.representation==='boolean'?'checkbox':m.representation==='int32'?'number':'text',requiredPresence:true,nullable:m.nullable};
 });
 const limits=[
  'Authored request association only: this row/DTO is not the complete DDD Order aggregate.',
  'Only explicit core references are traversed; native DDD references remain in the complete source.',
  'Validation checks the generated DTO shape and the authored OpenAPI request shape; it does not enforce TableSpec length/coercion or DDD invariants.',
  'Pipeline delivery is a proposal. No service, storage engine, or domain operation is executed.',
  'Unknown vocabularies and all native payloads remain in context; they have no inferred enforcement.',
 ];
 const nodes=selection.selection.map((e,i)=>({module:e.module,element:e.element.id,path:e.path,label:e.module+'.'+(e.element.name??e.element.id),x:20,y:30+i*48}));
 const edges=selection.selection.flatMap((e,i)=>(e.element.references??[]).map(r=>({from:i,to:nodes.findIndex(n=>n.module===r.module&&n.element===r.element),role:r.role})));
 if(edges.some(e=>e.to<0))throw Error('Missing visualization dependency');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="760" height="'+(nodes.length*48+30)+'" role="img" aria-label="Explicit core associations">'+edges.map(e=>'<path d="M 420 '+nodes[e.from]!.y+' Q 700 '+nodes[e.from]!.y+' 420 '+nodes[e.to]!.y+'" fill="none" stroke="gray"><title>'+xml(e.role)+'</title></path>').join('')+nodes.map(n=>'<text x="'+n.x+'" y="'+n.y+'">'+xml(n.label)+'</text>').join('')+'</svg>';
 return {
  profile:'orders-consumer-demo-1' as const,context:selection,limits,
  transform:{kind:'exact-key-rename' as const,fields},
  visualization:{nodes,edges,svg},
  pipeline:{execution:'local-transform-and-validation-only' as const,steps:[{id:'select',dependsOn:[]},{id:'rename',dependsOn:['select']},{id:'validate',dependsOn:['rename']},{id:'deliver-proposal',dependsOn:['validate']}],operationPath},
  validator:{schema:JSON.parse(document.nativeSchema),serviceSchema,avro,document},
  form:{fields},
  agentContext:{operationPath,operation,aggregate:getDddDefinition(source,'sales','Order'),service:getDddDefinition(source,'sales','Ordering'),contextPointer:'/context',limitsPointer:'/limits'},
  humanDocumentation:['Orders request metadata',...fields.map(f=>f.source+' -> '+f.target+' ('+f.scalarType+', '+f.control+'): '+f.description+'; source '+f.path+'; native '+f.nativePath),...limits].join('\n'),
 };
}

/** Compile once per source. No coercion, missing defaults, discarded input keys, or network. */
export function compileOrdersTransform(source:Document){
 const bundle=generateOrdersConsumers(source),ajv=createValidator(false),target=ajv.compile(bundle.validator.schema),service=ajv.compile(bundle.validator.serviceSchema);
 const fields=bundle.transform.fields.map(f=>({source:f.source,target:f.target}));
 return {bundle,run(input:unknown){
  const row=copyJson(input);
  if(!row||typeof row!=='object'||Array.isArray(row))return {status:'rejected' as const,source:row,errors:['Expected a row object']};
  if(Object.keys(row).length!==fields.length||fields.some(f=>!Object.hasOwn(row,f.source)))return {status:'rejected' as const,source:row,errors:['Exact source column set required']};
  const output=Object.fromEntries(fields.map(f=>[f.target,row[f.source]]));
  const errors:string[]=[];if(!target(output))errors.push(JSON.stringify(target.errors));if(!service(output))errors.push(JSON.stringify(service.errors));
  return errors.length?{status:'rejected' as const,source:row,errors}:{status:'accepted' as const,source:row,output};
 }};
}
