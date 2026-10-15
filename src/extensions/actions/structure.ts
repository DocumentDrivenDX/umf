import schema from '../../../spec/extensions/actions/schema.json';
import manifest from '../../../spec/extensions/actions/package.json';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {UmfError,type ExtensionPackage} from '../../model/types';
import type {Action} from './types';
function freezePackage(value:any):any{if(value&&typeof value==='object'){Object.values(value).forEach(freezePackage);Object.freeze(value);}return value;}
/** Original metadata cannot be widened before a later registry consumer loads. */
export const actionsPackage=freezePackage(copyJson(manifest)) as unknown as ExtensionPackage;
const compiler=createValidator();
export const checkActionsStructure=compiler.compile(schema);
export const checkActionLiteral=compiler.compile({$defs:{literal:schema.$defs.literal},$ref:'#/$defs/literal'});
const actionCheck=compiler.compile({$defs:schema.$defs,$ref:'#/$defs/action'});
/** JSON admission precedes compiled validation; hostile accessors are never invoked. */
export function admitAction(input:unknown):Action {
 const value=copyJson(input);
 if(!actionCheck(value))throw new UmfError(actionCheck.errors?.some(e=>['maxItems','maxLength','maximum'].includes(e.keyword))?'LIMIT':'ACTION_STRUCTURE',JSON.stringify(actionCheck.errors));
 if((value as unknown as Action).preconditions.length+(value as unknown as Action).postconditions.length>128)throw new UmfError('LIMIT','At most 128 combined pre/postconditions');
 const action=value as unknown as Action;
 for(const expression of [...action.preconditions.map(condition=>condition.rule.expression),...action.postconditions.map(condition=>condition.rule.expression),...action.reads.map(frame=>frame.selector.expression),...action.writes.map(frame=>frame.selector.expression)])if(expression.length>65536)throw new UmfError('LIMIT','Rule and selector text is bounded to 65536 UTF-16 units');
 return action;
}
