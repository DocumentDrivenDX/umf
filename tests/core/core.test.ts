// @covers US-001-AC1 US-001-AC2 US-001-AC3 US-001-AC4
import { test, expect } from 'bun:test';
import { Registry, copyJson, readJsonValue, writeJsonValue, validateDocument, readDocument, writeDocument, editExtension, type Document, type ExtensionPackage } from '../../src';
const sample = (): Document => ({umf:'0.1.0', id:'fixture:domain', vocabularies:{'fixture.note':{version:'1.0.0'}}, modules:[{id:'sales',namespace:'sales', elements:[{id:'Customer',name:'Customer', extensions:{'fixture.note':{label:'Buyer'}}}]},{id:'support',namespace:'support',elements:[{id:'Customer',extensions:{'fixture.note':{label:'Contact'}}}]}]});
const pkg: ExtensionPackage = {id:'fixture.note',version:'1.0.0',coreVersion:'0.1.0',description:'Synthetic test vocabulary; not a native system',schema:{type:'object',required:['label'],properties:{label:{type:'string'}},additionalProperties:false}, semantics:'label is a literal descriptive string, with no other invariants.',scopes:['element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
const registry = () => new Registry().register(pkg, () => []);

test('US-001-AC1: JSON and YAML retain unknown extension and core fields without claiming understanding', () => {
 const document=sample(); document['future']={x:[null,false,0,'']};
 document.modules[0]!.elements[0]!.extensions['fixture.note']={label:'Buyer',future:['keep',3]};
 for (const format of ['json','yaml'] as const) {
  const result=readDocument(writeDocument(document,format),format);
  expect(result).toEqual(document);
  const evidence=validateDocument(result);
  expect(evidence.valid).toBe(true); expect(evidence.complete).toBe(false);
  expect(evidence.diagnostics.map(d=>d.code)).toContain('UNKNOWN_CORE_FIELD');
  expect(evidence.diagnostics.map(d=>d.code)).toContain('UNKNOWN_EXTENSION');
 }
});
test('US-001-AC2: names in independent contexts coexist; identity and references are checked', () => {
 const document=sample(); expect(validateDocument(document,registry()).complete).toBe(true);
 document.modules[0]!.elements[0]!.references=[{role:'correspondence',module:'support',element:'Customer'}];
 expect(validateDocument(document,registry()).valid).toBe(true);
 document.modules[0]!.elements[0]!.references[0]!.element='Missing';
 expect(validateDocument(document,registry()).diagnostics.map(d=>d.code)).toContain('UNRESOLVED_REFERENCE');
 document.modules[0]!.elements.push(document.modules[0]!.elements[0]!);
 expect(validateDocument(document,registry()).diagnostics.map(d=>d.code)).toContain('DUPLICATE_ELEMENT');
 document.modules.push(document.modules[0]!);
 expect(validateDocument(document,registry()).diagnostics.map(d=>d.code)).toContain('DUPLICATE_MODULE');
});
test('US-001-AC2: native semantics are not inferred by extension structural validation', () => {
 const document=sample(); const r=new Registry().register(pkg);
 const checked=validateDocument(document,r); expect(checked.valid).toBe(true); expect(checked.complete).toBe(false);
 expect(checked.diagnostics.map(d=>d.code)).toContain('SEMANTICS_UNCHECKED');
 document.modules[0]!.elements[0]!.extensions['fixture.note']={label:12};
 expect(validateDocument(document,registry()).diagnostics.map(d=>d.code)).toContain('EXTENSION_STRUCTURE');
});
test('US-001-AC2: undeclared versions, duplicate registration, invalid schema and scope fail explicitly', () => {
 expect(()=>registry().register(pkg)).toThrow('already registered');
 expect(()=>new Registry().register({...pkg,schema:{type:'invalid'}})).toThrow();
 const document=sample(); document.extensions={'fixture.note':{label:'wrong scope'}};
 expect(validateDocument(document,registry()).diagnostics.map(d=>d.code)).toContain('EXTENSION_SCOPE');
 delete document.vocabularies['fixture.note'];
 expect(validateDocument(document).valid).toBe(false);
});
test('US-001-AC3: safe edits are atomic, checked and reflected in both serializations', () => {
 const original=sample(); const result=editExtension(original,registry(),'sales','Customer','fixture.note',()=>({label:'Purchaser'}));
 expect(original.modules[0]!.elements[0]!.extensions['fixture.note']).toEqual({label:'Buyer'});
 for (const format of ['json','yaml'] as const) expect(readDocument(writeDocument(result,format),format).modules[0]!.elements[0]!.extensions['fixture.note']).toEqual({label:'Purchaser'});
 expect(()=>editExtension(original,registry(),'sales','Customer','fixture.note',()=>({label:0}))).toThrow();
 expect(original).toEqual(sample());
});
test('US-001-AC3: unknown dependencies block edits even if the edited extension is known', () => {
 const original=sample(); original.vocabularies['future.derived']={version:'2.0.0'};
 original.extensions={'future.derived':{dependsOn:'sales.Customer'}};
 expect(()=>editExtension(original,registry(),'sales','Customer','fixture.note',()=>({label:'Changed'}))).toThrow('validated');
 expect(readDocument(writeDocument(original))).toEqual(original);
});
test('US-001-AC2: validator exceptions never become successful validation', () => {
 const result=validateDocument(sample(), new Registry().register(pkg,()=>{throw new Error('broken validator');}));
 expect(result.valid).toBe(false); expect(result.complete).toBe(false);
 expect(result.diagnostics[0]!.code).toBe('VALIDATOR_FAILURE');
});
test('US-001-AC4: duplicate keys and non-JSON YAML are rejected', () => {
 for (const text of ['a: 1\na: 2', '{"a":1,"a":2}', 'a: &a {x: 1}\nb: *a', 'a: !!str 2', '? [a, b]\n: value', 'a: .inf', '%YAML 1.1\n---\na: yes', 'a: 1\n---\na: 2']) expect(()=>readJsonValue(text)).toThrow();
 expect(()=>readJsonValue('{a: 2}', 'json')).toThrow('JSON syntax');
});
test('US-001-AC4: numeric boundaries fail instead of rounding and interoperable decimals survive', () => {
 for (const text of ['9007199254740993','9007199254740991.1','1.0000000000000001','1e400','1e-400','-0','-0.0']) expect(()=>readJsonValue(text)).toThrow();
 for (const text of ['0.1','1e3','-1.25','9007199254740991','1.2300','0xFF','0o77']) expect(readJsonValue(writeJsonValue(readJsonValue(text)))).toEqual(readJsonValue(text));
});
test('US-001-AC4: non-JSON programmatic values cannot disappear during serialization', () => {
 let getterInvoked=false;
 const accessor=Object.defineProperty({},'secret',{get(){getterInvoked=true; return 2;},enumerable:true});
 const cycle: any={}; cycle.self=cycle;
 for (const value of [undefined,NaN,Infinity,-0,1n,new Date(), {a:undefined}, [ ,1], accessor,cycle, {a:()=>0}, {[Symbol('x')]:1}]) expect(()=>copyJson(value)).toThrow();
 expect(getterInvoked).toBe(false);
});
test('US-001-AC4: dangerous property names are retained as data, never inherited behavior', () => {
 const value=readJsonValue('{"__proto__":{"polluted":true},"constructor":"x"}','json');
 expect(Object.hasOwn(value as object,'__proto__')).toBe(true);
 expect(({} as any).polluted).toBeUndefined();
 expect(readJsonValue(writeJsonValue(value,'json'),'json')).toEqual(value);
});
test('US-001-AC4: document depth and size limits fail explicitly', () => {
 expect(()=>readJsonValue(' '.repeat(4_000_001))).toThrow('limit');
 let deep: any={}; for(let i=0;i<130;i++) deep={nested:deep};
 expect(()=>copyJson(deep)).toThrow('limit');
});
test('US-001-AC1: generated unknown content survives repeated portable serialization', () => {
 for(let i=0;i<100;i++) {
  const doc=sample(); doc.extensions={unknown:{i, text:`value ${i}: # true`, values:[false,null, i/10, {unicode:'雪', empty:''}]}}; doc.vocabularies.unknown={version:'1.0.0'};
  expect(readDocument(writeDocument(readDocument(writeDocument(doc,'json'),'json'),'yaml'),'yaml')).toEqual(doc);
 }
});
test('registry captures a frozen copy, independent of subsequent package edits', () => {
 const input=structuredClone(pkg); const r=new Registry().register(input,()=>[]);
 input.scopes.length=0; expect(r.get(pkg.id,pkg.version)!.manifest.scopes).toEqual(['element']);
 expect(Object.isFrozen(r.get(pkg.id,pkg.version)!.manifest.schema)).toBe(true);
});

test('published minimal document fixture validates with independent namespaces and references', async () => {
 const doc=readDocument(await Bun.file('fixtures/core/minimal.json').text(),'json');
 expect(validateDocument(doc).complete).toBe(true);
 expect(doc.modules[0]!.elements[0]!.id).toBe(doc.modules[1]!.elements[0]!.id);
});

test('US-001-AC1: YAML preserves long leading-indented multiline native comments',()=>{
 const value={comment:' '+ 'native source metadata '.repeat(12)+'\n  second line\n '};
 expect(readJsonValue(writeJsonValue(value,'yaml'),'yaml')).toEqual(value);
});

test('US-001-AC2: JSON equality handles reference objects and method-like data keys safely',()=>{
 const equalityPackage:ExtensionPackage={...pkg,schema:{type:'object',required:['chosen','fixed','refs'],properties:{chosen:{enum:[{constructor:'literal',valueOf:'text'}]},fixed:{const:{a:1,b:2}},refs:{type:'array',uniqueItems:true,items:{type:'object'}}}}};
 const installed=new Registry().register(equalityPackage,()=>[]);
 const doc=sample();const payload={chosen:{valueOf:'text',constructor:'literal'},fixed:{b:2,a:1},refs:[{module:'sales',element:'A'},{element:'A',module:'support'}]};
 for(const module of doc.modules)module.elements[0]!.extensions['fixture.note']=payload;
 expect(validateDocument(doc,installed).complete).toBe(true);
 payload.refs.push({element:'A',module:'sales'});
 expect(validateDocument(doc,installed).valid).toBe(false);
 payload.refs.pop();payload.fixed.a=2;expect(validateDocument(doc,installed).valid).toBe(false);
 payload.fixed.a=1;payload.chosen.valueOf='different';expect(validateDocument(doc,installed).valid).toBe(false);
});
