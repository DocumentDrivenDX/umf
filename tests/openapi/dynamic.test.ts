import {createValidator} from '../../src/validation/schema';
import {openapiDynamicReferenceSchema} from '../../src';
import {test,expect} from 'bun:test';
import {importOpenapiDocument,resolveOpenapiDynamicReference} from '../../src';
const uri=(name:string)=>'https://example.test/'+name;
const schemas={Tree:{$id:uri('tree'),$dynamicAnchor:'node',type:'object',properties:{children:{type:'array',items:{$dynamicRef:'#node'}}},$defs:{Fixed:{$anchor:'fixed',type:'string'}}},Strict:{$id:uri('strict'),$dynamicAnchor:'node',$ref:uri('tree'),unevaluatedProperties:false,$defs:{Fixed:{$dynamicAnchor:'fixed',type:'integer'}}},Outer:{$id:uri('outer'),$dynamicAnchor:'node',$ref:uri('strict')},Ordinary:{$id:uri('ordinary'),$anchor:'node',$ref:uri('tree')}};
function doc(reference='#node'){
 const value=structuredClone(schemas);value.Tree.properties.children.items.$dynamicRef=reference;
 return importOpenapiDocument(JSON.stringify({openapi:'3.1.2',info:{title:'Dynamic',version:'1'},components:{schemas:value}}),{id:'dynamic',format:'json',baseUri:uri('api.json')});
}
const pointer='/components/schemas/Tree/properties/children/items';
test('US-011-AC19: dynamic anchors choose outermost resource; ordinary targets remain static',async()=>{
 const cases:{scope:string[];reference:string;target:string;kind:"static"|"dynamic"}[]=[{scope:['tree'],reference:'#node',target:'Tree',kind:'dynamic'},{scope:['strict','tree'],reference:'#node',target:'Strict',kind:'dynamic'},{scope:['outer','strict','tree'],reference:'#node',target:'Outer',kind:'dynamic'},{scope:['ordinary','tree'],reference:'#node',target:'Tree',kind:'dynamic'},{scope:['strict','tree'],reference:'#fixed',target:'Tree/$defs/Fixed',kind:'static'},{scope:['strict','tree'],reference:'#/$defs/Fixed',target:'Tree/$defs/Fixed',kind:'static'}];
 const rows=[];
 for(const row of cases){const result=resolveOpenapiDynamicReference(doc(row.reference),{pointer,evaluationScope:row.scope.map(uri)});expect(createValidator().compile(openapiDynamicReferenceSchema)(result)).toBe(true);expect(result.target.pointer).toBe('/components/schemas/'+row.target);expect(result.resolution).toBe(row.kind);expect(result.complete).toBe(false);rows.push({...row,result});}
 await Bun.write('fixtures/openapi/dynamic-cases.json',JSON.stringify({schemas,rows},null,2)+'\n');
});
test('US-011-AC20: missing, invalid and mismatched evaluation contexts are rejected',()=>{
 expect(()=>resolveOpenapiDynamicReference(doc(),{pointer,evaluationScope:[]})).toThrow('1–128');
 expect(()=>resolveOpenapiDynamicReference(doc(),{pointer,evaluationScope:[uri('missing'),uri('tree')]})).toThrow('not indexed');
 expect(()=>resolveOpenapiDynamicReference(doc(),{pointer,evaluationScope:[uri('tree'),uri('strict')]})).toThrow('Innermost');
 expect(()=>resolveOpenapiDynamicReference(doc(),{pointer,evaluationScope:[uri('tree')+'#node']})).toThrow('fragment-free');
 expect(()=>resolveOpenapiDynamicReference(doc(),{pointer:'/components/schemas/Tree',evaluationScope:[uri('tree')]})).toThrow('must contain');
 expect(()=>resolveOpenapiDynamicReference(doc('#absent'),{pointer,evaluationScope:[uri('tree')]})).toThrow('not indexed');
});
