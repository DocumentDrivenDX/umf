import {Registry,readDocument,registerActions,inspectActions,assessAction,writeDocument} from '../../src/index';
import type {ActionExecutorProfile} from '../../src/index';
import fixture from '../../fixtures/actions/approve.json';

export function runPortableExample() {
 const registry=registerActions(new Registry());
 const source=readDocument(JSON.stringify(fixture),'json');
 const before=JSON.stringify(source);
 const inspection=inspectActions(source,registry);
 const identity={module:'sales',action:'approve'};
 const profile:ActionExecutorProfile={id:'tutorial-no-claims',version:'1',actionVersion:'0.1.0',coreVersion:'0.8.0',source,identity,claims:[]};
 const assessment=assessAction(source,identity,profile,registry);
 if(!inspection.validation.valid||inspection.validation.complete||assessment.declaredCompatible||assessment.executionVerified)throw Error('Unexpected tutorial interpretation');
 if(JSON.stringify(source)!==before)throw Error('Inspection changed source');
 const unknown=structuredClone(source);
 (unknown.modules[0]!.extensions!['umf.actions'] as Record<string,unknown>).futureNote={meaning:'retain this'};
 const retained=readDocument(writeDocument(unknown,'json'),'json');
 if(JSON.stringify(retained)!==JSON.stringify(unknown))throw Error('Unknown content lost');
 return {module:inspection.actions[0]!.module,action:inspection.actions[0]!.action.id,valid:inspection.validation.valid,complete:inspection.validation.complete,unchecked:inspection.actions[0]!.obligations.filter(o=>o.status==='unchecked').map(o=>o.kind),declaredCompatible:assessment.declaredCompatible,executionVerified:assessment.executionVerified,businessWrites:0};
}
if(import.meta.main)console.log(JSON.stringify(runPortableExample(),null,2));
