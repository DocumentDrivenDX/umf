import {test,expect} from 'bun:test';
import {inspectProtectionCatalog,requireProtectionInterpretation,protectionPackage} from '../../../src/index';
import {readProtectionSource,writeProtectionSource} from '../../../src/index';
const catalog=()=>({vocabulary:'umf.security.protection',version:'0.1.0',id:'catalog',revision:'r1',transforms:[{id:'mask',version:'1',kind:'mask',function:'constant',inputDomain:{documentId:'d',moduleId:'m',elementId:'in'},outputDomain:{documentId:'d',moduleId:'m',elementId:'out'},determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[],future:{value:'retained'}}],native:{sql:'opaque'}});
test('envelope inspection preserves uninterpreted payload and never grants interpretation',()=>{
 // @covers US-079-AC11
 // @covers US-079-AC9
 const input=catalog(),before=JSON.stringify(input),result=inspectProtectionCatalog(input);
 expect(result.valid).toBe(true);expect(result.complete).toBe(false);
 expect(result.diagnostics.some(d=>d.code==='PROTECTION_UNIMPLEMENTED')).toBe(true);
 expect(result.source).toEqual(input);expect(JSON.stringify(input)).toBe(before);
 expect(()=>requireProtectionInterpretation(input)).toThrow();
 for(const format of ['json','yaml'] as const)expect(readProtectionSource(writeProtectionSource(result.source,format),format)).toEqual(input);
 (result.source as any).transforms[0].future.value='changed';expect(input.transforms[0]!.future.value).toBe('retained');
});
test('exact pair identities reject duplicates without separator collisions or normalization',()=>{
 const source=catalog();source.transforms=[{...source.transforms[0]!,id:'a/b',version:'c'},{...source.transforms[0]!,id:'a',version:'b/c'},{...source.transforms[0]!,id:'é',version:'1'},{...source.transforms[0]!,id:'e\u0301',version:'1'}];
 expect(inspectProtectionCatalog(source).valid).toBe(true);
 source.transforms.push({...source.transforms[0]!});const result=inspectProtectionCatalog(source);
 expect(result.valid).toBe(false);expect(result.diagnostics.some(d=>d.code==='PROTECTION_DUPLICATE')).toBe(true);
});
test('malformed envelopes and structural bounds refuse without truncation',()=>{
 for(const source of [null,{}, {...catalog(),version:'2.0.0'}, {...catalog(),transforms:[{id:'x'}]}, {...catalog(),transforms:Array.from({length:257},(_,i)=>({...catalog().transforms[0]!,id:String(i),version:'1'}))}]){
  const result=inspectProtectionCatalog(source);expect(result.valid).toBe(false);expect(result.complete).toBe(false);expect(result.source).toEqual(source);expect(()=>requireProtectionInterpretation(source)).toThrow();
 }
 expect(inspectProtectionCatalog({...catalog(),transforms:Array.from({length:256},(_,i)=>({...catalog().transforms[0]!,id:String(i),version:'1'}))}).valid).toBe(true);
});
test('snapshot does not invoke getters; public metadata cannot redefine built-in schema',()=>{
 let calls=0;const source={get vocabulary(){calls++;return 'umf.security.protection';}};
 expect(inspectProtectionCatalog(source).valid).toBe(false);expect(calls).toBe(0);
 const metadata=protectionPackage.schema as any;const prior=metadata.properties.vocabulary.const;
 try{metadata.properties.vocabulary.const='future';expect(inspectProtectionCatalog(catalog()).valid).toBe(true);expect(inspectProtectionCatalog({...catalog(),vocabulary:'future'}).valid).toBe(false);}finally{metadata.properties.vocabulary.const=prior;}
});
