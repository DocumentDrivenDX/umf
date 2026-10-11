import {Registry,readDocument,registerActions,inspectActions} from '../../src/index';
import fixture from '../../fixtures/actions/approve.json';

const registry=registerActions(new Registry());
const document=readDocument(JSON.stringify(fixture),'json');
const inspection=inspectActions(document,registry);

console.log(JSON.stringify({
 action:inspection.actions[0]!.action.id,
 valid:inspection.validation.valid,
 complete:inspection.validation.complete,
 businessWrites:0
},null,2));
