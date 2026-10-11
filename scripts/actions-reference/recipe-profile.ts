import {UmfError,type Document} from '../../src/model/types';
import {knownActionModel} from '../../src/extensions/actions/known-model';
import type {Action} from '../../src/extensions/actions/types';
/** Installed runtime subset admission is shared by preview and invoke, never inferred from metadata compatibility. */
export function qualifyReferenceCandidateRecipe(source:Document,action:Action):asserts action is Action&{binding:Extract<Action['binding'],{kind:'recipe'}>}{
 if(action.binding.kind!=='recipe'||action.outputs.length)throw new UmfError('ACTION_NATIVE_RECIPE','Recipe outputs/handler execution not yet qualified');
 for(const effect of action.binding.effects){if(effect.kind==='create'){const record=knownActionModel(source,effect.record as {module:string;element:string},'record'),primary=((record.keys??[]) as {id:string;primary:boolean}[]).find(key=>key.primary);if(!primary||effect.key!==primary.id)throw new UmfError('ACTION_NATIVE_KEY','Create requires qualified primary Key');}if(!['create','set','delete','link','unlink'].includes(effect.kind))throw new UmfError('ACTION_NATIVE_RECIPE','Recipe primitive is not yet installed');}
}

/** Native recipe installation shares the checked candidate primitive inventory. */
export function qualifyReferenceRecipe(source:Document,action:Action):asserts action is Action&{binding:Extract<Action['binding'],{kind:'recipe'}>}{
 qualifyReferenceCandidateRecipe(source,action);
}
