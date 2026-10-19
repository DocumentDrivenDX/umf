// SPDX-License-Identifier: MIT OR Apache-2.0
import {createUmfRegistry,readDocument,inspectActions,declareAction,UmfError} from '../../src/index';
import fixture from '../../fixtures/actions/approve.json';
const registry=createUmfRegistry();
const source=readDocument(JSON.stringify(fixture),'json');
const before=JSON.stringify(source);
const action=inspectActions(source,registry).actions[0]!.action;
try{
 declareAction(source,'sales',action,registry);
 throw Error('Duplicate action was accepted');
}catch(error){
 if(!(error instanceof UmfError)||error.code!=='ACTION_IDENTITY')throw error;
 if(JSON.stringify(source)!==before)throw Error('Refusal changed source');
 console.log(JSON.stringify({code:error.code,sourceUnchanged:true,businessWrites:0},null,2));
}
