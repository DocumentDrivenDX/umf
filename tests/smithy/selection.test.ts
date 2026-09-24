import {test,expect} from 'bun:test';
import {selectSmithyShapes,importSmithySources,createSmithyJavaScriptSelectionBackend,smithySelectionResultSchema,smithyAssemblyResultSchema,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const source=()=>importSmithySources({files:{'model.smithy':'$version: "2"\nnamespace test\nstring X'}},{id:'source'});
const assembly=()=>JSON.stringify({valid:true,events:[],modelJson:'{"smithy":"2.0","shapes":{"test#X":{"type":"string"}}}'});
test('US-014-AC14: shape-set query preserves source and validates complete result schema',async()=>{
 const result=await selectSmithyShapes(source(),createSmithyJavaScriptSelectionBackend({assemble:assembly,select:()=>'{"shapeIds":["test#X"]}'}),'string',{id:'model'});
 expect(result.status).toBe('selected');expect(result.shapeIds).toEqual(['test#X']);expect(result.assembly.source).toEqual(source());expect(result.complete).toBe(false);
 const check=createValidator(false);check.addSchema(coreSchema);check.addSchema(smithyAssemblyResultSchema);expect(check.compile(smithySelectionResultSchema)(result)).toBe(true);
});
test('US-014-AC14: invalid responses, failed assembly and selector exceptions expose no shape set',async()=>{
 for(const select of [()=>'{"shapeIds":["x","x"]}',()=>'{"shapeIds":[],"unknown":true}',()=>'{',()=>{throw new Error('selector invalid');}]){
  const result=await selectSmithyShapes(source(),createSmithyJavaScriptSelectionBackend({assemble:assembly,select}),'[',{id:'model'});expect(result.status).toBe('blocked');expect(result.shapeIds).toBeUndefined();expect(result.issues.length).toBeGreaterThan(0);
 }
 let called=false;const result=await selectSmithyShapes(source(),createSmithyJavaScriptSelectionBackend({assemble:()=>'{"valid":false,"events":[]}',select:()=>{called=true;return '{}';}}),'string',{id:'model'});expect(called).toBe(false);expect(result.status).toBe('blocked');
});
test('US-014-AC15: cancellation between assembly and selection prevents query results',async()=>{
 const controller=new AbortController();let selected=false;
 const result=await selectSmithyShapes(source(),{identity:'test',assemble:assembly,select:()=>{selected=true;controller.abort();return '{"shapeIds":["test#X"]}';}},'string',{id:'model',signal:controller.signal});
 expect(selected).toBe(true);expect(result.status).toBe('blocked');expect(result.shapeIds).toBeUndefined();expect(result.issues[0]!.code).toBe('SMITHY_SELECTION_CANCELLED');expect(result.assembly.source).toEqual(source());
 const already=new AbortController();already.abort();selected=false;
 const pre=await selectSmithyShapes(source(),{identity:'test',assemble:assembly,select:()=>{selected=true;return '{}';}},'string',{id:'model',signal:already.signal});expect(selected).toBe(false);expect(pre.status).toBe('blocked');expect(pre.assembly.issues[0]!.code).toBe('SMITHY_ASSEMBLY_CANCELLED');
});
