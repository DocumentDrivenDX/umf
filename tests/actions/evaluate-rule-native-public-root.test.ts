// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import source from '../../fixtures/actions/approve.json';
import {evaluateActionRule,UmfError} from '../../src/index-node-v4';
import type {Document,Action,ActionRule} from '../../src/index-node-v4';
const document=source as unknown as Document;
const action=(source.modules[0]!.extensions['umf.actions'] as unknown as {actions:Action[]}).actions[0]!;
const state={inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}},pre:{frames:{},links:[]}};
const rule=(expression:unknown):ActionRule=>({language:'umf.actions.rules',version:'1',expression:JSON.stringify(expression),references:[]});
test('public Rust rule evaluator executes typed integer equality',()=>{
 expect(evaluateActionRule(document,action,rule({op:'eq',args:[{literal:{integerToken:'1e2'}},{literal:{integerToken:'100'}}]}),'pre',state)).toBe(true);
});
test('public Rust rule evaluator refuses an unknown expression operator',()=>{
 try{evaluateActionRule(document,action,rule({op:'future',args:[]}),'pre',state);throw new Error('expected refusal');}
 catch(error){expect(error).toBeInstanceOf(UmfError);expect(error).toMatchObject({code:'ACTION_RULE_SYNTAX'});}
});
