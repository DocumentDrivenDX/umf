import {test,expect} from 'bun:test';
import {importOpenapiDocument,exportOpenapiDocument,exportOpenapiBundle,getOpenapiNode,proposeOpenapiEdit,inspectOpenapi,readDocument,writeDocument,parseNativeYaml} from '../../src';
import {renderTree,parseNativeJson} from '../../src/model/native-json';
const yaml=await Bun.file('fixtures/openapi/orders.yaml').text();
test('US-011-AC1: OpenAPI JSON/YAML preserves native operations, schemas, extension content and source',async()=>{
 const doc=importOpenapiDocument(yaml,{id:'orders',format:'yaml'});expect(inspectOpenapi(doc).valid).toBe(true);expect(inspectOpenapi(doc).complete).toBe(false);
 for(const format of ['json','yaml'] as const)expect(exportOpenapiDocument(readDocument(writeDocument(doc,format),format))).toBe(yaml);
 const json=exportOpenapiDocument(doc,'json');expect(JSON.parse(json).components.schemas.Order['x-domain'].aggregate).toBe('Order');
 expect(getOpenapiNode(doc,'/paths/~1orders~1{id}/get/operationId')).toEqual({kind:'string',value:'getOrder'});
 const copy=getOpenapiNode(doc,'/info/title') as any;copy.value='Changed';expect(exportOpenapiDocument(doc)).toBe(yaml);
 await Bun.write('fixtures/openapi/orders-round-trip.json',json);
 const current=proposeOpenapiEdit(doc,'/openapi','"3.2.1"');expect(current.validation.valid).toBe(true);
 await Bun.write('fixtures/openapi/orders-3.2.json',exportOpenapiDocument(current.document,'json'));
});
test('US-011-AC2: candidate edits validate object structure and retain original archive',()=>{
 const doc=importOpenapiDocument(yaml,{id:'orders',format:'yaml'});
 const candidate=proposeOpenapiEdit(doc,'/info/title','"Updated Orders"');
 expect(candidate.validation.valid).toBe(true);expect(candidate.validation.complete).toBe(false);
 expect(JSON.parse(exportOpenapiDocument(candidate.document)).info.title).toBe('Updated Orders');expect(exportOpenapiDocument(doc)).toBe(yaml);
 expect(exportOpenapiBundle(candidate.document).diagnostics.some(d=>d.code==='OPENAPI_SOURCE_LAYOUT')).toBe(true);
 expect(()=>proposeOpenapiEdit(doc,'/info','{}')).toThrow();
 expect(()=>proposeOpenapiEdit(doc,'/missing','0')).toThrow();
 const future=structuredClone(doc);(future.modules[0]!.elements[0]!.extensions['umf.openapi'] as any).root.future=true;
 expect(inspectOpenapi(future).complete).toBe(false);expect(()=>exportOpenapiDocument(future)).toThrow('discard');
});
test('US-011-AC3: exact native YAML numbers and unsupported versions stay preserved without false interpretation',()=>{
 const text='openapi: 3.1.2\ninfo: {title: Exact, version: "1"}\npaths: {}\nx-number: 9007199254740993\nx-fraction: 1.0000000000000001\n';
 const doc=importOpenapiDocument(text,{id:'exact',format:'yaml'});
 expect(exportOpenapiDocument(doc)).toBe(text);expect(exportOpenapiDocument(doc,'json')).toContain('9007199254740993');expect(exportOpenapiDocument(doc,'json')).toContain('1.0000000000000001');
 expect(inspectOpenapi(doc).diagnostics.some(d=>d.code==='OPENAPI_NUMERIC')).toBe(true);
 const old=importOpenapiDocument('{"swagger":"1.2","info":{"title":"Old","version":"1"},"paths":{}}',{id:'old',format:'json'});
 expect(inspectOpenapi(old).diagnostics.some(d=>d.code==='OPENAPI_VERSION_UNSUPPORTED')).toBe(true);
 for(const text of ['a: 1\na: 2','a: &x [1]\nb: *x','a: !!str 1','a: .nan','1: value'])expect(()=>parseNativeYaml(text)).toThrow();
 expect(renderTree(parseNativeYaml('a: +.5\nb: 1.\nc: 1e999\nd: 0x10\n'))).toBe('{"a":0.5,"b":1.0,"c":1e999,"d":16}');
 expect(parseNativeJson('{"x":9007199254740993}')).toEqual(parseNativeYaml('x: 9007199254740993'));
});
test('US-011-AC4: object validation profile rejects structural errors but discloses embedded-schema limits',async()=>{
 const original=JSON.parse(exportOpenapiDocument(importOpenapiDocument(yaml,{id:'source',format:'yaml'}),'json'));
 const cases=[];
 for(const version of ['3.1.2','3.2.1']){
  const mutations:[string,boolean,(value:any)=>void][]=[['valid',true,()=>{}],['missing-info',false,v=>delete v.info],['missing-security-scheme',false,v=>delete v.components.securitySchemes.bearer.scheme],['wrong-schema-kind',false,v=>v.components.schemas.Order=7],['embedded-schema-invalid',false,v=>v.components.schemas.Order={type:'not-a-json-schema-type'}],['extension-retained',true,v=>v['x-opaque']={newMeaning:[1,true]}]];
  for(const [name,expected,mutate]of mutations){const native=structuredClone(original);native.openapi=version;mutate(native);let accepted=false;try{importOpenapiDocument(JSON.stringify(native),{id:name,format:'json'});accepted=true;}catch{}expect(accepted,version+' '+name).toBe(expected);cases.push({version,name,expected,objectExpected:name==='embedded-schema-invalid'?true:expected,native});}
 }
 await Bun.write('fixtures/openapi/object-validation-cases.json',JSON.stringify(cases,null,2)+'\n');
});
