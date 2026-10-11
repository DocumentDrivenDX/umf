import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import type {Action,ActionRule} from '../../src/extensions/actions/types';
import {compileActionRule} from '../../src/extensions/actions/expression';
import {evaluateActionRule,actionFieldValueKey,type ActionRuleState} from '../../src/extensions/actions/evaluation';
import {compileActionSelector,selectActionIdentity,admitActionInputs} from '../../src/extensions/actions/selector';
function setup(){
 const document=structuredClone(fixture) as unknown as Document;
 document.modules[0]!.elements.push({id:'quantity',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{},facets:{integerWidth:{bits:64,signed:true}}},{id:'flag',kind:'field',scalarType:'boolean',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 const action=(document.modules[0]!.extensions!['umf.actions'] as any).actions[0] as Action;
 action.parameters.push({id:'quantity',kind:'value',field:{module:'sales',element:'quantity'},required:false},{id:'flag',kind:'value',field:{module:'sales',element:'flag'},required:false});
 const read=structuredClone(action.writes[0]!);read.id='order-read';action.reads.push(read);
 const rule=(ast:unknown,references:ActionRule['references']=[{parameter:'quantity'},{parameter:'flag'},{record:{module:'sales',element:'order'}}]):ActionRule=>({language:'umf.actions.rules',version:'1',expression:JSON.stringify(ast),references});
 const state:ActionRuleState={inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}},pre:{frames:{'order-read':{exists:true,values:{[actionFieldValueKey({module:'sales',element:'status'})]:{string:'new'}}}},links:[]}};
 return {document,action,rule,state};
}
const int=(n:string)=>({literal:{integerToken:n}}),bool=(b:boolean)=>({literal:{boolean:b}}),op=(operator:string,...args:unknown[])=>({op:operator,args});
test('EX-01: exact integer equality/arithmetic never use floating-point coercion',()=>{
 const {document,action,rule,state}=setup();
 expect(evaluateActionRule(document,action,rule(op('eq',op('add',int('9007199254740992'),int('1')),int('9007199254740993'))),'pre',state)).toBe(true);
 expect(evaluateActionRule(document,action,rule(op('eq',int('1e3'),int('1000'))),'pre',state)).toBe(true);
 expect(evaluateActionRule(document,action,rule(op('gt',op('sub',int('1'),int('2')),int('-2'))),'pre',state)).toBe(true);
 expect(()=>compileActionRule(document,action,rule(op('eq',int('1'),{literal:{string:'1'}})),'pre')).toThrow();
});
test('EX-01: optional absence differs from null and can be guarded left-to-right',()=>{
 const {document,action,rule,state}=setup();
 const guarded=rule(op('and',op('present',{input:'quantity'}),op('gt',{input:'quantity'},int('0'))));
 expect(evaluateActionRule(document,action,guarded,'pre',state)).toBe(false);
 expect(()=>evaluateActionRule(document,action,rule(op('gt',{input:'quantity'},int('0'))),'pre',state)).toThrow();
 state.inputs.flag=null;expect(evaluateActionRule(document,action,rule(op('present',{input:'flag'})),'pre',state)).toBe(true);
 expect(evaluateActionRule(document,action,rule(op('eq',{input:'flag'},{literal:null})),'pre',state)).toBe(true);
 expect(()=>evaluateActionRule(document,action,rule(op('not',{input:'flag'})),'pre',state)).toThrow();
 expect(()=>compileActionRule(document,action,rule(op('eq',int('1'),{literal:null})),'pre')).toThrow();
});
test('EX-01: every skipped branch is checked for syntax/type/phase/dependency/access',()=>{
 const {document,action,rule}=setup();
 for(const invalid of [{op:'arbitrary',args:[]},{input:'missing'},{state:'post',frame:'order-read',field:{module:'sales',element:'status'}},{state:'pre',frame:'order-write',field:{module:'sales',element:'status'}},{state:'pre',frame:'order-read',field:{module:'sales',element:'id'}}])expect(()=>compileActionRule(document,action,rule(op('and',bool(false),invalid)),'pre')).toThrow();
 expect(()=>compileActionRule(document,action,rule(op('present',{input:'quantity'}),[]),'pre')).toThrow();
 expect(()=>compileActionRule(document,action,rule(op('not',bool(true),bool(false))),'pre')).toThrow();
});
test('EX-01: state existence guards absent identities; writes confer no reads',()=>{
 const {document,action,rule,state}=setup(),field={state:'pre',frame:'order-read',field:{module:'sales',element:'status'}};
 state.pre.frames['order-read']!.exists=false;
 expect(evaluateActionRule(document,action,rule(op('and',{exists:{state:'pre',frame:'order-read'}},op('eq',field,{literal:{string:'new'}}))),'pre',state)).toBe(false);
 expect(()=>evaluateActionRule(document,action,rule(op('eq',field,{literal:{string:'new'}})),'pre',state)).toThrow();
});
test('EX-01: outputs and post-state are explicitly postcondition-only',()=>{
 const {document,action,rule,state}=setup();action.outputs.push({id:'out',kind:'value',field:{module:'sales',element:'status'},required:true});
 const output=rule(op('eq',{output:'out'},{literal:{string:'approved'}}),[{output:'out'}]);
 expect(()=>compileActionRule(document,action,output,'pre')).toThrow();state.outputs={out:{string:'approved'}};
 expect(evaluateActionRule(document,action,output,'post',state)).toBe(true);
 state.outputs={};expect(()=>evaluateActionRule(document,action,output,'post',state)).toThrow();
});
test('EX-01: depth, syntax node, text, numeric expansion and wrapper limits refuse',()=>{
 const {document,action,rule}=setup();let deep:unknown=bool(true);for(let i=0;i<33;i++)deep=op('not',deep);
 expect(()=>compileActionRule(document,action,rule(deep),'pre')).toThrow();
 const tree=(n:number):unknown=>n?op('and',tree(n-1),tree(n-1)):bool(true);expect(()=>compileActionRule(document,action,rule(tree(9)),'pre')).toThrow();
 expect(()=>compileActionRule(document,action,{...rule(bool(true)),expression:' '.repeat(65537)},'pre')).toThrow();
 expect(()=>compileActionRule(document,action,rule(op('eq',int('1e999999999999999999'),int('1'))),'pre')).toThrow();
 expect(()=>compileActionRule(document,action,rule({literal:{boolean:true,string:'ambiguous'}}),'pre')).toThrow();
});
test('EX-01: entity selection preserves original tuples and uses core equality bytes',()=>{
 const {document,action,state}=setup(),frame=action.reads[0]!,selected=selectActionIdentity(document,action,frame,state.inputs);
 expect(selected.entity).toEqual(state.inputs.order as any);expect(selected.tupleHex.startsWith('554d464b31')).toBe(true);
 selected.entity.components[0]={string:'changed'};expect((state.inputs.order as any).components[0]).toEqual({string:'o1'});
 expect(()=>compileActionSelector(document,action,{...frame,maxEntities:2})).toThrow();
 expect(()=>compileActionSelector(document,action,{...frame,selector:{...frame.selector,expression:'{"entity":"quantity"}'}})).toThrow();
});
test('EX-01: ordered explicit key components require exact Fields and declared dependencies',()=>{
 const {document,action,state}=setup(),frame=action.reads[0]!;
 action.parameters.push({id:'id-value',kind:'value',field:{module:'sales',element:'id'},required:true});state.inputs['id-value']={string:'o1'};
 frame.selector={language:'umf.actions.keys',version:'1',expression:'{"key":"pk","components":[{"input":"id-value"}]}',references:[{parameter:'id-value'}]};
 const selected=selectActionIdentity(document,action,frame,state.inputs);expect(selected.entity.components).toEqual([{string:'o1'}]);
 frame.selector.references=[];expect(()=>compileActionSelector(document,action,frame)).toThrow();
 frame.selector.references=[{parameter:'quantity'}];frame.selector.expression='{"key":"pk","components":[{"input":"quantity"}]}';expect(()=>compileActionSelector(document,action,frame)).toThrow();
});
test('EX-01: typed admission rejects missing required, wrong wrappers and undeclared values',()=>{
 const {document,action,state}=setup();expect(()=>admitActionInputs(document,action,{})).toThrow();
 expect(()=>admitActionInputs(document,action,{...state.inputs,unknown:null})).toThrow();
 expect(()=>admitActionInputs(document,action,{...state.inputs,quantity:{string:'1'}})).toThrow();
 expect(()=>admitActionInputs(document,action,{...state.inputs,quantity:{integerToken:'9223372036854775808'}})).toThrow();
});

test('EX-01: present does not fabricate a field value from an absent entity',()=>{
 const {document,action,rule,state}=setup();state.pre.frames['order-read']!.exists=false;
 expect(()=>evaluateActionRule(document,action,rule(op('present',{state:'pre',frame:'order-read',field:{module:'sales',element:'status'}})),'pre',state)).toThrow();
});

test('EX-01: relationship absence requires an explicit snapshot and exact directed read access',async()=>{
 const {default:create}=await import('../../fixtures/actions/create-link.json');const document=structuredClone(create) as unknown as Document;
 const action=(document.modules[0]!.extensions!['umf.actions'] as any).actions[0] as Action;
 for(const frame of action.writes){const read=structuredClone(frame);read.id=frame.id.replace('write','read');read.create=false;read.delete=false;action.reads.push(read);}
 const relationship={module:'sales',relationship:'order-customer'},linked={linked:{state:'pre',relationship,sourceFrame:'order-read',targetFrame:'customer-read'}},rule:ActionRule={language:'umf.actions.rules',version:'1',expression:JSON.stringify(op('not',linked)),references:[{record:{module:'sales',element:'order'}},{record:{module:'sales',element:'customer'}},{relationship}]};
 const state:ActionRuleState={inputs:{'order-id':{string:'o1'},customer:{key:{module:'sales',element:'customer',key:'pk'},components:[{string:'c1'}]},product:{key:{module:'sales',element:'product',key:'pk'},components:[{string:'p1'}]}},pre:{frames:{'order-read':{exists:true,values:{}},'customer-read':{exists:true,values:{}}},links:[]}};
 expect(evaluateActionRule(document,action,rule,'pre',state)).toBe(true);
 state.pre.links=[{relationship,sourceFrame:'order-read',targetFrame:'customer-read'}];expect(evaluateActionRule(document,action,rule,'pre',state)).toBe(false);
 delete (state.pre as any).links;expect(()=>evaluateActionRule(document,action,rule,'pre',state)).toThrow();
 state.pre.links=[{}] as any;expect(()=>evaluateActionRule(document,action,rule,'pre',state)).toThrow();
 state.pre.links=[];action.reads[0]!.relationships=[];expect(()=>compileActionRule(document,action,rule,'pre')).toThrow();
 action.reads[0]!.relationships=[relationship];(document.modules[0]!.relationships as any[])[0].targetLifecycle='future-meaning';expect(()=>compileActionRule(document,action,rule,'pre')).toThrow();
});

test('strict consumers refuse external references and uninterpreted selected Field meaning',()=>{
 {const {document,action,rule}=setup();(action.parameters.find(p=>p.id==='quantity') as any).field.document='foreign';expect(()=>compileActionRule(document,action,rule(op('eq',{input:'quantity'},int('1'))),'pre')).toThrow();}
 {const {document,action}=setup();(action.reads[0]!.record as any).document='foreign';expect(()=>compileActionSelector(document,action,action.reads[0]!)).toThrow();}
 for(const mutate of [(field:any)=>field.nullability='future-null',(field:any)=>field.future={meaning:true}]){const {document,action,rule,state}=setup();mutate(document.modules[0]!.elements.find(e=>e.id==='quantity'));state.inputs.quantity={integerToken:'1'};expect(()=>admitActionInputs(document,action,state.inputs)).toThrow();expect(()=>compileActionRule(document,action,rule(op('eq',{input:'quantity'},int('1'))),'pre')).toThrow();}
});

test('strict reference admission covers exists frames and selected component inputs',()=>{
 {const {document,action,rule}=setup();(action.reads[0]!.record as any).document='foreign';expect(()=>compileActionRule(document,action,rule({exists:{state:'pre',frame:'order-read'}}),'pre')).toThrow();}
 {const {document,action}=setup();action.parameters.push({id:'id-value',kind:'value',field:{module:'sales',element:'id',document:'foreign'} as any,required:true});action.reads[0]!.selector={language:'umf.actions.keys',version:'1',expression:'{"key":"pk","components":[{"input":"id-value"}]}',references:[{parameter:'id-value'}]};expect(()=>compileActionSelector(document,action,action.reads[0]!)).toThrow();}
});

test('strict exists and input selection refuse transitive unknown Record and Key meaning',()=>{
 for(const mutate of [(record:any)=>record.future={meaning:'unknown'},(record:any)=>record.keys[0].future={meaning:'unknown'},(record:any)=>record.extensions={'future.native':{meaning:'unknown'}}]){const {document,action,rule,state}=setup();document.vocabularies['future.native']={version:'1.0.0'};mutate(document.modules[0]!.elements.find(e=>e.id==='order'));expect(()=>compileActionRule(document,action,rule({exists:{state:'pre',frame:'order-read'}}),'pre')).toThrow();expect(()=>admitActionInputs(document,action,state.inputs)).toThrow();expect(()=>evaluateActionRule(document,action,rule({exists:{state:'pre',frame:'order-read'}}),'pre',state)).toThrow();}
});
test('rule literal compilation and native snapshot reads refuse coercible malformed wrappers',()=>{
 const {document,action,rule,state}=setup();expect(()=>compileActionRule(document,action,rule(op('eq',{literal:{string:4}},{literal:{string:4}})),'pre')).toThrow('exact typed literal');
 state.pre.frames['order-read']!.values[actionFieldValueKey({module:'sales',element:'status'})]={string:4} as any;
 const field={state:'pre',frame:'order-read',field:{module:'sales',element:'status'}};expect(()=>evaluateActionRule(document,action,rule(op('eq',field,field)),'pre',state)).toThrow('exact typed field literal');
});
