// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
import type {ActionExecutorProfile} from '../../src/extensions/actions/types';
import type * as sdk from '../../src/index-node-v4';
import fixture from '../../fixtures/actions/approve.json';

type InspectionRuntime=Pick<typeof sdk,'createUmfRegistry'|'readDocument'|'inspectActions'|'assessAction'|'writeDocument'>;

export function runPortableInspection({createUmfRegistry,readDocument,inspectActions,assessAction,writeDocument}:InspectionRuntime) {
 const registry=createUmfRegistry();
 const source=readDocument(JSON.stringify(fixture),'json');
 const before=JSON.stringify(source);
 const inspection=inspectActions(source,registry);
 const identity={module:'sales',action:'approve'};
 const profile:ActionExecutorProfile={id:'tutorial-no-claims',version:'1',actionVersion:'0.1.0',coreVersion:CURRENT_CORE_VERSION,source,identity,claims:[]};
 const assessment=assessAction(source,identity,profile,registry);
 if(!inspection.validation.valid||inspection.validation.complete||assessment.declaredCompatible||assessment.executionVerified)throw Error('Unexpected tutorial interpretation');
 if(JSON.stringify(source)!==before)throw Error('Inspection changed source');
 const unknown=structuredClone(source);
 (unknown.modules[0]!.extensions!['umf.actions'] as Record<string,unknown>).futureNote={meaning:'retain this'};
 const retained=readDocument(writeDocument(unknown,'json'),'json');
 if(JSON.stringify(retained)!==JSON.stringify(unknown))throw Error('Unknown content lost');
 return {module:inspection.actions[0]!.module,action:inspection.actions[0]!.action.id,valid:inspection.validation.valid,complete:inspection.validation.complete,unchecked:inspection.actions[0]!.obligations.filter(o=>o.status==='unchecked').map(o=>o.kind),declaredCompatible:assessment.declaredCompatible,executionVerified:assessment.executionVerified,businessWrites:0};
}
