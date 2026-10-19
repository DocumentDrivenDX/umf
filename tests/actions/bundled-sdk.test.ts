// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
import {test,expect} from 'bun:test';
import {createUmfRegistry,Registry,inspectActions,assessAction,readDocument,writeDocument} from '../../src/index';
import fixture from '../../fixtures/actions/approve.json';

test('normal SDK interprets bundled actions without a separate registration or executor',()=>{
 const registry=createUmfRegistry(),source=readDocument(JSON.stringify(fixture),'json');
 expect(registry.get('umf.actions','0.1.0')?.semantics).toBeDefined();
 const inspection=inspectActions(source,registry);
 expect(inspection.actions[0]?.action.id).toBe('approve');
 expect(inspection.validation.valid).toBe(true);
 expect(inspection.validation.complete).toBe(false);
 expect(assessAction(source,{module:'sales',action:'approve'},{id:'sdk-no-executor',version:'1',actionVersion:'0.1.0',coreVersion:CURRENT_CORE_VERSION,source,identity:{module:'sales',action:'approve'},claims:[]},registry).executionVerified).toBe(false);
 expect(JSON.stringify(source)).toBe(JSON.stringify(fixture));
 const invalid=structuredClone(source);invalid.modules[0]!.extensions!['umf.actions']={actions:[{id:42}]};
 expect(()=>inspectActions(invalid,registry)).toThrow();
});
test('SDK registries are independent and unknown action content remains lossless',()=>{
 const a=createUmfRegistry(),b=createUmfRegistry();
 expect(a).not.toBe(b);expect(new Registry().get('umf.actions','0.1.0')).toBeUndefined();
 const source=structuredClone(fixture);(source.modules[0]!.extensions!['umf.actions'] as Record<string,unknown>).future={meaning:['retain',null]};
 const document=readDocument(JSON.stringify(source),'json');
 expect(inspectActions(document,b).validation.complete).toBe(false);
 expect(readDocument(writeDocument(document,'json'),'json')).toEqual(document);
});
