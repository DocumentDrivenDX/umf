import {inspectActions,registerActions} from '../../src/extensions/actions';
import {Registry} from '../../src/registry/registry';
import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {verifyReferenceCreationMinima} from '../../scripts/actions-reference/creation-relationships';
const order={module:'sales',element:'order'},other={module:'sales',element:'other'};
function source(sourceMin:number,targetMin:number):Document{
 const document=structuredClone(fixture) as unknown as Document;
 for(const id of ['id','status'])document.modules[0]!.elements.push({...structuredClone(document.modules[0]!.elements.find(element=>element.id===id)!),id:'other-'+id});
 document.modules[0]!.elements.push({...structuredClone(document.modules[0]!.elements.find(element=>element.id==='order')!),id:'other',members:['id','status'].map(id=>({module:'sales',element:'other-'+id})),keys:[{id:'pk',name:'primary',primary:true,fields:[{module:'sales',element:'other-id'}]}]});
 document.modules[0]!.relationships=[{id:'asymmetric',name:'asymmetric',source:[order],target:[{...other,key:'pk'}],sourceMultiplicity:{min:sourceMin,max:'*'},targetMultiplicity:{min:targetMin,max:'*'},targetLifecycle:'independent',directed:true}];
 expect(inspectActions(document,registerActions(new Registry())).validation.valid).toBe(true);
 return document;
}
test('CREATE lower bounds use targets per source and sources per target independently',()=>{
 expect(()=>verifyReferenceCreationMinima(source(0,1),[order])).toThrow('required relationship multiplicity');
 expect(()=>verifyReferenceCreationMinima(source(1,0),[other])).toThrow('required relationship multiplicity');
 expect(()=>verifyReferenceCreationMinima(source(1,0),[order])).not.toThrow();
 expect(()=>verifyReferenceCreationMinima(source(0,1),[other])).not.toThrow();
});
