import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import {readDocument,writeDocument} from '../../src/model/document';
import {registerActions,inspectActions,editAction,declareAction} from '../../src/extensions/actions';
import {admitAction} from '../../src/extensions/actions/structure';
import {Registry} from '../../src/registry/registry';
import {UmfError,type Document} from '../../src/model/types';
const source=()=>structuredClone(fixture) as unknown as Document;
const registry=()=>registerActions(new Registry());
const action=(d:Document)=>(d.modules[0]!.extensions!['umf.actions'] as any).actions[0];
test('@covers US-900-AC6: JSON/YAML recover exact future meaning and rule text with isolated results',()=>{
 const document=source(),a=action(document);a.future={nested:[null,JSON.parse('{"__proto__":"ordinary data"}')]};a.writes[0].selector.future={keep:'annotation'};
 document.vocabularies['future.native']={version:'1.0.0'};document.extensions={'future.native':{competing:['storage','compute']}};
 for(const format of ['json','yaml'] as const){const recovered=readDocument(writeDocument(document,format),format);expect(recovered).toEqual(document);expect(inspectActions(recovered,registry()).validation.valid).toBe(true);expect(()=>editAction(recovered,{module:'sales',action:'approve'},action(recovered),registry())).toThrow();}
 const report=inspectActions(document,registry());(report.actions[0]!.action.future as any).nested.push('changed');expect(a.future.nested).toHaveLength(2);
});
test('@covers US-900-AC6: an unrelated unknown extension survives a safe known-profile action edit',()=>{
 const document=source(),a=action(document);a.authorization.profile={id:'umf.actions.roles',version:'1'};
 document.vocabularies['future.native']={version:'1.0.0'};document.extensions={'future.native':{native:{keep:'exact'}}};
 const updated=editAction(document,{module:'sales',action:'approve'},{...a,description:'Updated safely'},registry());expect(updated.extensions).toEqual(document.extensions);expect(a.description).toBe('Set an order status to approved.');
});
test('@covers US-900-AC8: structural/version/identity failures are atomic and getters stay inert',()=>{
 const document=source(),before=structuredClone(document),r=registry();
 expect(()=>inspectActions({...document,umf:'0.7.0'},r)).toThrow();expect(()=>inspectActions({...document,modules:null} as any,r)).toThrow();
 const version=source();version.vocabularies['umf.actions']!.version='9.0.0';expect(()=>inspectActions(version,r)).toThrow();
 const duplicate=source();(duplicate.modules[0]!.extensions!['umf.actions'] as any).actions.push(structuredClone(action(duplicate)));const errors=inspectActions(duplicate,r).validation.diagnostics;expect(errors.some(d=>d.code==='ACTION_IDENTITY'&&d.path.endsWith('/1/id')&&d.severity==='error')).toBe(true);
 let calls=0;const hostile=Object.defineProperty({},'id',{enumerable:true,get(){calls++;return 'evil'}});expect(()=>declareAction(document,'sales',hostile as any,r)).toThrow();expect(calls).toBe(0);expect(document).toEqual(before);
 const escaped=source();action(escaped)['future/~']={keep:true};expect(inspectActions(escaped,r).validation.diagnostics.some(d=>d.code==='ACTION_UNCHECKED'&&d.path.endsWith('/future~1~0'))).toBe(true);
});
test('@covers US-900-AC8: every array/expression boundary accepts its bound and refuses bound plus one',()=>{
 const template=action(source());const condition={id:'condition',rule:{language:'opaque',version:'1',expression:'x',references:[]},failure:{code:'reason',message:'reason'}};
 const mutations:[string,number,unknown][]=[['parameters',128,template.parameters[0]],['outputs',128,template.parameters[0]],['preconditions',128,condition],['postconditions',128,condition],['reads',128,{...template.writes[0],create:false,delete:false}],['writes',128,template.writes[0]],['failures',128,{code:'reason',message:'reason',retryable:false}]];
 for(const [member,bound,item] of mutations){const candidate=structuredClone(template);candidate[member]=Array.from({length:bound},()=>structuredClone(item));expect(()=>admitAction(candidate)).not.toThrow();candidate[member].push(structuredClone(item));expect(()=>admitAction(candidate)).toThrow(UmfError);}
 for(const [property,bound,item] of [['effects',256,template.binding.effects[0]],['values',256,template.binding.effects[0].values[0]]] as const){const candidate=structuredClone(template),target=property==='effects'?candidate.binding:candidate.binding.effects[0];target[property]=Array.from({length:bound},()=>structuredClone(item));expect(()=>admitAction(candidate)).not.toThrow();target[property].push(structuredClone(item));expect(()=>admitAction(candidate)).toThrow();}
 const roles=structuredClone(template);roles.authorization.roles=Array.from({length:64},(_,i)=>'role-'+i);expect(()=>admitAction(roles)).not.toThrow();roles.authorization.roles.push('extra');expect(()=>admitAction(roles)).toThrow();
 const text=structuredClone(template);text.writes[0].selector.expression='x'.repeat(65536);expect(()=>admitAction(text)).not.toThrow();text.writes[0].selector.expression+='x';expect(()=>admitAction(text)).toThrow();
 const frames=structuredClone(template);frames.writes[0].maxEntities=256;expect(()=>admitAction(frames)).not.toThrow();frames.writes[0].maxEntities=257;expect(()=>admitAction(frames)).toThrow();
 const combined=structuredClone(template);combined.preconditions=Array(128).fill(condition);combined.postconditions=[condition];expect(()=>admitAction(combined)).toThrow();
});
