import {createCandidateCoreExtensionClosure} from '../../src/extensions/security/core-extension-closure-candidate';
import {captureCandidateCoreSource,readCandidateCoreSource} from '../../src/extensions/security/core-source-candidate';
import {compileCandidateCatalogProgram,readCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {originalProductsSourceFixture} from '../../tests/security/core-extension-closure-fixture';
import {actionsPackage} from '../../src/extensions/actions';
export function run(){
 const rows:{id:string;pass:boolean}[]=[],add=(id:string,pass:boolean)=>rows.push({id,pass}),refuses=(fn:()=>unknown)=>{try{fn();return false;}catch{return true;}},f=originalProductsSourceFixture(),extensions=createCandidateCoreExtensionClosure([{id:'umf.actions',version:'0.1.0'}]);
 add('original-model-preserved',JSON.stringify(readCandidateCoreSource(captureCandidateCoreSource(f.model,extensions)))===f.original.request.model.utf8);
 const h=compileCandidateCatalogProgram(f.policy,null,f.closure,f.ontology,[],extensions),p=readCandidateCatalogProgram(h);
 add('two-real-source-conditions',p.conditions.length===2&&p.conditions.every((c:any)=>c.condition.expression.op==='literal'&&c.condition.expression.value===true));
 add('original-actions-retained',p.closure.documents[0].document.modules[0].extensions['umf.actions'].actions[0].authorization.roles[0]==='bulk-editor');
 add('not-native-authority',(h as any).authority===false&&(h as any).complete===false);
 add('absent-refuses',refuses(()=>captureCandidateCoreSource(f.model)));
 add('forged-refuses',refuses(()=>captureCandidateCoreSource(f.model,structuredClone(extensions))));
 add('wrong-version-refuses',refuses(()=>createCandidateCoreExtensionClosure([{id:'umf.actions',version:'9'}])));
 let getters=0;add('selection-getter-refuses-without-execution',refuses(()=>createCandidateCoreExtensionClosure([{get id(){getters++;return 'umf.actions';},version:'0.1.0'}]))&&getters===0);
 add('package-deeply-frozen',Object.isFrozen(actionsPackage)&&Object.isFrozen(actionsPackage.scopes)&&Object.isFrozen(actionsPackage.schema));
 add('package-cannot-widen-scope',refuses(()=>actionsPackage.scopes.push('document')));
 add('package-cannot-change-description',refuses(()=>{actionsPackage.description='changed';}));
 const unknown=structuredClone(f.model);unknown.vocabularies.other={version:'1'};add('unknown-refuses',refuses(()=>captureCandidateCoreSource(unknown,extensions)));
 const invalid=structuredClone(f.model);invalid.modules[0].extensions['umf.actions'].actions[0].parameters[0].target.key='missing';add('malformed-original-action-refuses',refuses(()=>captureCandidateCoreSource(invalid,extensions)));
 add('browser-has-no-host-globals',['Bun','process','Buffer','Deno'].every(k=>!(k in globalThis)));
 if(rows.some(r=>!r.pass))throw Error(JSON.stringify(rows));return rows;
}
