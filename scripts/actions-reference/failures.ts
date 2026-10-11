import {UmfError} from '../../src/model/types';
export type ReferenceFailure={status:'denied'|'unsupported'|'failed';code:string};
/** Classify only known callback errors after transaction rollback; unknown SQL/commit errors stay unknown. */
export function referenceFailure(error:unknown,stage:'admission'|'execution'):ReferenceFailure|undefined{
 if(error instanceof Error&&['AUTHORIZATION','UNSUPPORTED_AUTHORIZATION','AUTHENTICATION'].includes(error.message))return {status:'denied',code:'AUTHORIZATION'};
 if(error instanceof Error&&error.message==='Retained revision does not resolve')return {status:'unsupported',code:'REVISION'};
 if(error instanceof UmfError){const code=error.code.startsWith('ACTION_RULE_')?error.code.slice(7):error.code;if(code==='AUTHORIZATION')return {status:'denied',code};if(code.startsWith('ACTION_'))return {status:'unsupported',code:'PARAMETER'};return {status:stage==='admission'?'unsupported':'failed',code};}
 return undefined;
}
