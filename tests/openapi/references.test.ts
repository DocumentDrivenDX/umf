import {createValidator} from '../../src/validation/schema';
import referenceSchema from '../../spec/extensions/openapi/reference-result.schema.json';
import {test,expect} from 'bun:test';
import {importOpenapiDocument,resolveOpenapiObjectReference,getOpenapiNode} from '../../src';
const root={openapi:'3.1.2',info:{title:'References',version:'1'},paths:{'/x':{get:{responses:{'200':{$ref:'middle.json#/answer',description:'Outer override','x-native':'retain'}}}}}};
function fixture(target:any={description:'Actual response',content:{'application/json':{schema:{type:'string'}}}},middle:any={answer:{$ref:'nested/target.json#/answer',description:'Inner override'}}){return importOpenapiDocument(JSON.stringify(root),{id:'references',format:'json',baseUri:'https://example.test/api.json',resources:[{uri:'https://example.test/middle.json',text:JSON.stringify(middle),format:'json'},{uri:'https://example.test/nested/target.json',text:JSON.stringify({answer:target}),format:'json'}]});}
const request={pointer:'/paths/~1x/get/responses/200',kind:'response'} as const;
test('US-011-AC12: typed reference chains retain source siblings and target origin',async()=>{
 const doc=fixture();const result=resolveOpenapiObjectReference(doc,request);
 expect(createValidator().compile(referenceSchema)(result)).toBe(true);expect(result.chain.length).toBe(2);expect(result.target.uri).toBe('https://example.test/nested/target.json');expect(result.target.pointer).toBe('/answer');
 expect(result.effectiveAnnotations.description).toBe('Outer override');expect(result.complete).toBe(false);
 expect((result.chain[0]!.reference as any).members['x-native'].value).toBe('retain');
 (result.target.node as any).members.description.value='Changed';
 expect(getOpenapiNode(doc,'/answer/description','https://example.test/nested/target.json')).toEqual({kind:'string',value:'Actual response'});
 const examples=importOpenapiDocument(JSON.stringify({openapi:'3.2.1',info:{title:'Example',version:'1'},components:{examples:{A:{$ref:'#/components/examples/B',summary:'Override'},B:{summary:'Original',value:7}}}}),{id:'example',format:'json',baseUri:'https://example.test/example.json'});
 expect(resolveOpenapiObjectReference(examples,{pointer:'/components/examples/A',kind:'example'}).effectiveAnnotations.summary).toBe('Override');
 await Bun.write('fixtures/openapi/reference-resolution.json',JSON.stringify({source:doc,result:resolveOpenapiObjectReference(doc,request)},null,2)+'\n');
});
test('US-011-AC13: target mismatches, cycles and unsupported scope never masquerade as resolved references',()=>{
 expect(()=>resolveOpenapiObjectReference(fixture({name:'id',in:'query'}),{...request,kind:'header'})).toThrow('must have required property');
 expect(()=>resolveOpenapiObjectReference(fixture({}, {answer:{$ref:'api.json#/paths/~1x/get/responses/200'}}),request)).toThrow('chain has no concrete target');
 expect(()=>resolveOpenapiObjectReference(fixture({}, {answer:{$ref:'missing.json'}}),request)).toThrow('not supplied');
 expect(()=>resolveOpenapiObjectReference(fixture({}, {answer:{$ref:'nested/target.json#anchor'}}),request)).toThrow('schema-aware');
 expect(()=>resolveOpenapiObjectReference(fixture(),{...request,kind:'schema'} as any)).toThrow('supported explicit');
 expect(()=>resolveOpenapiObjectReference(fixture(),{pointer:'/info',kind:'example'})).toThrow('not a Reference Object');
 const self=importOpenapiDocument(JSON.stringify({...root,openapi:'3.2.1',$self:'https://example.test/identity'}),{id:'self',format:'json',baseUri:'https://example.test/api.json'});
 expect(()=>resolveOpenapiObjectReference(self,request)).toThrow('$self');
});
test('US-011-AC14: each supported Reference Object target role validates its own shape',async()=>{
 const cases=[['parameter','parameters',{name:'id',in:'query',schema:{type:'string'}}],['header','headers',{schema:{type:'string'}}],['response','responses',{description:'OK'}],['request-body','requestBodies',{content:{'application/json':{schema:{type:'string'}}}}],['example','examples',{value:7}],['link','links',{operationId:'targetOperation'}],['security-scheme','securitySchemes',{type:'http',scheme:'bearer'}]] as const;
 const rows=[];
 for(const [kind,section,target]of cases){
  const owner={openapi:'3.1.2',info:{title:'Role',version:'1'},components:{[section]:{Start:{$ref:'target.json'}}}};
  const doc=importOpenapiDocument(JSON.stringify(owner),{id:kind,format:'json',baseUri:'https://example.test/root.json',resources:[{uri:'https://example.test/target.json',text:JSON.stringify(target),format:'json'}]});
  const result=resolveOpenapiObjectReference(doc,{kind,pointer:'/components/'+section+'/Start'});
  expect(result.kind).toBe(kind);expect(result.target.uri).toBe('https://example.test/target.json');rows.push({kind,target,result});
 }
 await Bun.write('fixtures/openapi/reference-kind-cases.json',JSON.stringify(rows,null,2)+'\n');
});
