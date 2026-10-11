import {SQL} from 'bun';
/** Bun 1.4.2 retains native SQLSTATE in errno; code is its driver error category. */
function sqlstate(error:SQL.PostgresError):string|undefined{for(const value of [error.errno,error.code])if(typeof value==='string'&&/^[0-9A-Z]{5}$/.test(value))return value;return undefined;}
/** Only actual server abort diagnostics qualify for automatic retry. */
export function referenceKnownAbort(error:unknown):boolean{return error instanceof SQL.PostgresError&&['40001','40P01'].includes(sqlstate(error)??'');}
/** Host transport failure carries no assertion that COMMIT did or did not occur. */
export class ReferenceCommitUncertain extends Error {constructor(){super('Reference transaction acknowledgement is uncertain');}}
export function referenceConnectionFailure(error:unknown):boolean{
 if(!(error instanceof SQL.SQLError))return false;if(!(error instanceof SQL.PostgresError))return true;
 const state=sqlstate(error);return !state||state.startsWith('08')||['40003','57P01','57P02','57P03'].includes(state);
}
