import {UmfError,type Document} from '../../src/model/types';
import type {Action} from '../../src/extensions/actions/types';
import {admitActionInputs,type ActionInputs} from '../../src/extensions/actions/selector';
/** Protocol stage 2 hides adapter/core admission codes behind PARAMETER. */
export function admitReferenceInputs(source:Document,action:Action,inputs:ActionInputs):ActionInputs{
 try{return admitActionInputs(source,action,inputs);}catch(error){if(error instanceof UmfError)throw new UmfError('PARAMETER',error.message);throw error;}
}
