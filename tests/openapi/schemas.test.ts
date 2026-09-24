import {test,expect} from 'bun:test';
import {importOpenapiDocument,inspectOpenapi} from '../../src';
function native(schema:any,extra:any={}){return {openapi:'3.1.2',info:{title:'Schemas',version:'1'},components:{schemas:{Value:schema}},...extra};}
test('US-011-AC10: embedded dialect boundaries and literal examples remain distinct',async()=>{
 const cases=[
  ['type',native({type:'wrong'}),false],['bound',native({minimum:'wrong'}),false],
  ['nested',native({properties:{value:{type:'wrong'}}}),false],
  ['discriminator',native({discriminator:{propertyName:7}}),false],
  ['xml',native({xml:{wrapped:'wrong'}}),false],
  ['examples',native({type:'object',examples:[{type:'wrong',schema:{type:'wrong'}}],default:{type:'wrong'}}),true],
  ['nested-custom',native({properties:{value:{$schema:'https://unknown.test/dialect',type:'wrong'}}}),true],
  ['custom-default',native({type:'wrong'},{jsonSchemaDialect:'https://unknown.test/dialect'}),true],
  ['explicit-standard',native({$schema:'https://json-schema.org/draft/2020-12/schema',type:'wrong'},{jsonSchemaDialect:'https://unknown.test/dialect'}),false],
  ['dependency-custom',native({dependencies:{value:{$schema:'https://unknown.test/dialect',type:'wrong'}}}),true],
  ['oneof',native({oneOf:[{type:'string'},{type:'integer'}]}),true],
  ['boolean',native(false),true],
  ['data-extensions',{openapi:'3.1.2',info:{title:'Literal',version:'1'},paths:{'x-metadata':{get:{requestBody:{content:{'a/b':{schema:{type:'wrong'}}}}}}}},true],
 ] as const;
 const rows=[];
 for(const [name,value,expected]of cases){let accepted=false;let diagnostics:any[]=[];try{const doc=importOpenapiDocument(JSON.stringify(value),{id:name,format:'json'});accepted=true;diagnostics=inspectOpenapi(doc).diagnostics;}catch{}expect(accepted,name).toBe(expected);if(name.includes('custom'))expect(diagnostics.some(d=>d.code==='OPENAPI_SCHEMA_DIALECT')).toBe(true);rows.push({name,native:value,accepted,diagnostics});}
 await Bun.write('fixtures/openapi/embedded-schema-cases.json',JSON.stringify(rows,null,2)+'\n');
});
test('US-011-AC11: schema positions cover 3.2 media item schemas and nested encoding headers',()=>{
 const root={openapi:'3.2.1',info:{title:'Positions',version:'1'},components:{mediaTypes:{stream:{itemSchema:{type:'wrong'}}}}};
 const xml={openapi:'3.2.1',info:{title:'XML',version:'1'},components:{schemas:{Text:{type:'string',xml:{nodeType:'text'}}}}};
 expect(inspectOpenapi(importOpenapiDocument(JSON.stringify(xml),{id:'xml',format:'json'})).valid).toBe(true);
 (xml.components.schemas.Text.xml as any).nodeType=7;expect(()=>importOpenapiDocument(JSON.stringify(xml),{id:'bad-xml',format:'json'})).toThrow('OPENAPI_SCHEMA_META');
 expect(()=>importOpenapiDocument(JSON.stringify(root),{id:'bad-item',format:'json'})).toThrow('OPENAPI_SCHEMA_META');
 const media={schema:{type:'object'},encoding:{file:{headers:{'X-Value':{schema:{minimum:'wrong'}}}}}};
 const operation={requestBody:{content:{'multipart/form-data':media}},responses:{'200':{description:'OK'}}};
 const request={openapi:'3.2.1',info:{title:'Positions',version:'1'},paths:{'/x':{additionalOperations:{CUSTOM:operation}}}};
 expect(()=>importOpenapiDocument(JSON.stringify(request),{id:'bad-header',format:'json'})).toThrow('OPENAPI_SCHEMA_META');
});
