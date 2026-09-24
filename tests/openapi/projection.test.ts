import {test,expect} from 'bun:test';
import {coreSchema,openapiJsonSchemaProjectionSchema,exportJsonSchema,importOpenapiDocument,projectOpenapiToJsonSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const tree={$id:'https://example.test/tree',type:'object',properties:{name:{type:'string',minLength:1},children:{type:'array',items:{$ref:'#'}},status:{$ref:'status#state'},kind:{enum:['leaf','branch']}},required:['name'],allOf:[{if:{properties:{kind:{const:'branch'}},required:['kind']},then:{required:['children']}}],unevaluatedProperties:false,description:'A tree',xml:{name:'tree'},examples:[{$ref:'literal-not-a-reference'}]};
const status={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://example.test/status',$anchor:'state',enum:['open','closed']};
const owner={openapi:'3.1.2',info:{title:'Projection',version:'1'},components:{schemas:{Tree:tree}}};
const policy={id:'projected',schemaId:'https://example.test/projected',pointer:'/components/schemas/Tree',schemaResources:['https://example.test/status'],usage:'schema-only',lossPolicy:'allow-reported-loss'} as const;
const source=()=>importOpenapiDocument(JSON.stringify(owner),{id:'source',format:'json',baseUri:'https://example.test/api.json',resources:[{uri:'https://example.test/status',text:JSON.stringify(status),format:'json'}]});
test('US-012-AC1: static schema projection retains recursive validation, annotations and source',async()=>{
 const doc=source();const result=projectOpenapiToJsonSchema(doc,{...policy,schemaResources:[...policy.schemaResources]});
 const contract=createValidator(false);contract.addSchema(coreSchema);expect(contract.compile(openapiJsonSchemaProjectionSchema)(result)).toBe(true);
 expect(result.status).toBe('projected');expect(result.source).toEqual(doc);expect(result.issues.some(x=>x.code==='OPENAPI_ANNOTATION')).toBe(true);
 const target=JSON.parse(result.nativeSchema!);const check=createValidator(false).compile(target);
 const vectors=[{value:{name:'a'},valid:true},{value:{name:''},valid:false},{value:{},valid:false},{value:{name:'a',children:[{name:'b'}]},valid:true},{value:{name:'a',children:[{}]},valid:false},{value:{name:'a',status:'open'},valid:true},{value:{name:'a',status:'other'},valid:false},{value:{name:'a',extra:true},valid:false},{value:{name:'a',kind:'branch'},valid:false},{value:{name:'a',kind:'branch',children:[]},valid:true}];
 for(const row of vectors)expect(check(row.value)).toBe(row.valid);
 expect(result.nativeSchema).toContain('literal-not-a-reference');expect(result.mappings.length).toBeGreaterThan(5);
 await Bun.write('fixtures/openapi/projection-cases.json',JSON.stringify({tree,status,result,roundTripped:exportJsonSchema(result.target!),vectors},null,2)+'\n');
});
test('US-012-AC2: strict losses and unsupported semantics block projection',()=>{
 expect(projectOpenapiToJsonSchema(source(),{...policy,schemaResources:[...policy.schemaResources],lossPolicy:'strict'}).status).toBe('blocked');
 for(const keyword of ['$dynamicRef','customAssertion']){
  const doc=importOpenapiDocument(JSON.stringify({...owner,components:{schemas:{Tree:{[keyword]:keyword==='$dynamicRef'?'#tree':true}}}}),{id:'unsupported',format:'json',baseUri:'https://example.test/api.json'});
  const result=projectOpenapiToJsonSchema(doc,{...policy,schemaResources:[]});expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();expect(result.issues.some(x=>x.classification==='unsupported')).toBe(true);
 }
});
test('US-012-AC3: all six pinned Tic Tac Toe schema components project',async()=>{
 const text=await Bun.file('fixtures/openapi/upstream/examples/v3.1/tictactoe.json').text();
 const doc=importOpenapiDocument(text,{id:'tictactoe',format:'json',baseUri:'https://example.test/tictactoe.json'});
 const board=[['X','.','.'],['.','O','.'],['.','.','.']];
 const cases:Record<string,{value:any;valid:boolean}[]>={errorMessage:[{value:'error',valid:true},{value:'a'.repeat(257),valid:false}],coordinate:[{value:2,valid:true},{value:4,valid:false}],mark:[{value:'X',valid:true},{value:'Y',valid:false}],board:[{value:board,valid:true},{value:[['Y']],valid:false}],winner:[{value:'.',valid:true},{value:0,valid:false}],status:[{value:{winner:'X',board},valid:true},{value:{board:[]},valid:false}]};
 const rows=[];
 for(const [name,vectors]of Object.entries(cases)){
  const result=projectOpenapiToJsonSchema(doc,{...policy,schemaResources:[],pointer:'/components/schemas/'+name,schemaId:'https://example.test/projected/'+name});
  expect(result.status).toBe('projected');const check=createValidator(false).compile(JSON.parse(result.nativeSchema!));
  for(const row of vectors)expect(check(row.value)).toBe(row.valid);
  rows.push({name,result,vectors});
 }
 await Bun.write('fixtures/openapi/projection-upstream-cases.json',JSON.stringify(rows,null,2)+'\n');
});

test('US-012-AC2: unavailable target compilation blocks a support claim',()=>{
 const doc=importOpenapiDocument(JSON.stringify({...owner,components:{schemas:{Tree:{type:'string',pattern:'['}}}}),{id:'pattern',format:'json',baseUri:'https://example.test/api.json'});
 const result=projectOpenapiToJsonSchema(doc,{...policy,schemaResources:[]});
 expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();expect(result.issues.some(x=>x.code==='JSON_SCHEMA_COMPILE')).toBe(true);
});
