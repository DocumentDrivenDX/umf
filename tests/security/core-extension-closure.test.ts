// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createCandidateCoreExtensionClosure,requireCandidateCoreExtensionRegistry} from '../../src/extensions/security/core-extension-closure-candidate';
import {captureCandidateCoreSource,readCandidateCoreSource} from '../../src/extensions/security/core-source-candidate';
import {compileCandidateCatalogProgram,readCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {currentProductsSourceFixture} from './core-extension-closure-fixture';
import {actionsPackage} from '../../src/extensions/actions';
const issue=()=>createCandidateCoreExtensionClosure([{id:'umf.actions',version:'0.1.0'}]);
test('current products action extension survives explicit source custody and real policy compilation',()=>{
 const f=currentProductsSourceFixture(),extensions=issue(),source=readCandidateCoreSource(captureCandidateCoreSource(f.model,extensions));
 expect(source).toEqual(f.model);expect(()=>captureCandidateCoreSource(JSON.parse(f.original.request.model.utf8),extensions)).toThrow('SECURITY_CANDIDATE_CORE_SOURCE_UNRESOLVED');expect(source.modules[0].extensions['umf.actions'].actions[0].authorization.roles).toEqual(['bulk-editor']);
 const handle=compileCandidateCatalogProgram(f.policy,null,f.closure,f.ontology,[],extensions),program=readCandidateCatalogProgram(handle);
 expect(program.extensionClosure).toBe(extensions);expect(program.conditions).toHaveLength(2);expect(program.conditions.map((c:any)=>c.condition.expression)).toEqual([{op:'literal',value:true},{op:'literal',value:true}]);
 expect(program.closure.documents[0].document).toEqual(source);expect((handle as any).authority).toBe(false);expect((handle as any).complete).toBe(false);
 f.model.modules[0].extensions['umf.actions'].actions[0].id='changed';expect(program.closure.documents[0].document.modules[0].extensions['umf.actions'].actions[0].id).toBe('set-name');
});
test('absent or forged closure cannot grant extension interpretation',()=>{
 const f=currentProductsSourceFixture();expect(()=>captureCandidateCoreSource(f.model)).toThrow();expect(()=>compileCandidateCatalogProgram(f.policy,null,f.closure,f.ontology)).toThrow();
 expect(()=>captureCandidateCoreSource(f.model,structuredClone(issue()))).toThrow('UNISSUED');expect(()=>captureCandidateCoreSource(f.model,{kind:'candidate-core-extension-closure/0.1'})).toThrow('UNISSUED');
});
test('only exact original selected extension version is admitted, not callback or hash claims',()=>{
 for(const selections of [[],[{id:'umf.actions',version:'9'}],[{id:'other',version:'0.1.0'}],[{id:'umf.actions',version:'0.1.0',sha256:'trusted'}],[{id:'umf.actions',version:'0.1.0'},{id:'umf.actions',version:'0.1.0'}]])expect(()=>createCandidateCoreExtensionClosure(selections as any)).toThrow('UNSUPPORTED');
});
test('unregistered vocabulary and malformed actions retain fail-closed behavior',()=>{
 const f=currentProductsSourceFixture(),extensions=issue(),unknown=structuredClone(f.model);unknown.vocabularies['other']={version:'1'};expect(()=>captureCandidateCoreSource(unknown,extensions)).toThrow();
 const malformed=structuredClone(f.model);malformed.modules[0].extensions['umf.actions'].actions[0].parameters[0].target.key='missing';expect(()=>captureCandidateCoreSource(malformed,extensions)).toThrow();
 const stale=structuredClone(f.closure);stale.documents[0]!.revision='stale';expect(()=>compileCandidateCatalogProgram(f.policy,null,stale,f.ontology,[],extensions)).toThrow();
});
test('registry access cannot mutate subsequent captures or original source snapshots',()=>{
 const f=currentProductsSourceFixture(),extensions=issue(),a=requireCandidateCoreExtensionRegistry(extensions),b=requireCandidateCoreExtensionRegistry(extensions);expect(a).not.toBe(b);
 expect(Object.isFrozen((extensions as any).packages[0])).toBe(true);const source=readCandidateCoreSource(captureCandidateCoreSource(f.model,extensions));expect(Object.isFrozen(source.modules[0].extensions['umf.actions'])).toBe(true);
});
test('selection accessors never execute and mutable public package cannot drift from retained closure',()=>{
 let calls=0;const selection=[{get id(){calls++;return 'umf.actions';},version:'0.1.0'}];expect(()=>createCandidateCoreExtensionClosure(selection)).toThrow();expect(calls).toBe(0);
 const extensions=issue();expect(()=>{actionsPackage.description='changed after original issuance';}).toThrow();expect(()=>{actionsPackage.scopes.push('document');}).toThrow();
 expect(()=>requireCandidateCoreExtensionRegistry(extensions)).not.toThrow();
});
test('actions metadata cannot be widened before the closure module loads in a fresh process',()=>{
 const actionUrl=new URL('../../src/extensions/actions/index.ts',import.meta.url).href,closureUrl=new URL('../../src/extensions/security/core-extension-closure-candidate.ts',import.meta.url).href,sourceUrl=new URL('../../src/extensions/security/core-source-candidate.ts',import.meta.url).href,fixturePath=new URL('./fixtures/current-products-model.json',import.meta.url).pathname;
 const code=`const {actionsPackage}=await import(${JSON.stringify(actionUrl)});let blocked=false;try{actionsPackage.scopes.push('document');}catch{blocked=true;}const {createCandidateCoreExtensionClosure}=await import(${JSON.stringify(closureUrl)});const {captureCandidateCoreSource}=await import(${JSON.stringify(sourceUrl)});const m=await Bun.file(${JSON.stringify(fixturePath)}).json();m.extensions={'umf.actions':m.modules[0].extensions['umf.actions']};delete m.modules[0].extensions['umf.actions'];let refused=false;try{captureCandidateCoreSource(m,createCandidateCoreExtensionClosure([{id:'umf.actions',version:'0.1.0'}]));}catch{refused=true;}if(!blocked||!refused)throw Error('Pre-import scope bypass');console.log('original-scope-preserved');`;
 const result=Bun.spawnSync([process.execPath,'-e',code]);expect(result.exitCode).toBe(0);expect(result.stdout.toString().trim()).toBe('original-scope-preserved');
});
