// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../../model/json';
import {UmfError} from '../../model/types';

export type SecurityTruth = 'T' | 'F' | 'U';
export type SecurityDecision = 'permit' | 'deny' | 'indeterminate' | 'conflict';
/** First interpreted constant-transform subset; additional carriers require qualification. */
export type SecurityDisposition = {kind:'original'} | {kind:'withheld'} |
  {kind:'transformed'; type:'string'; value:string} |
  {kind:'transformed'; type:'boolean'; value:boolean};
export interface EvaluatedSecurityRule {
  effect:'permit' | 'require' | 'forbid';
  truth:SecurityTruth;
  disclosure?:Record<string,SecurityDisposition>;
}
export interface SecurityComposition {
  decision:SecurityDecision;
  disclosure:Record<string,SecurityDisposition>;
}
const truth = (value:unknown):SecurityTruth => {
  if (value !== 'T' && value !== 'F' && value !== 'U') throw new UmfError('SECURITY_TRUTH','Invalid security truth');
  return value;
};
export function securityNot(value:SecurityTruth):SecurityTruth {
  const t = truth(value); return t === 'U' ? 'U' : t === 'T' ? 'F' : 'T';
}
function truthArguments(values:readonly SecurityTruth[]):SecurityTruth[] {
  const copied = copyJson(values);
  if (!Array.isArray(copied) || !copied.length || copied.length > 64) throw new UmfError('SECURITY_BOUND','Expected 1–64 truth operands');
  return copied.map(truth);
}
export function securityAnd(values:readonly SecurityTruth[]):SecurityTruth {
  const args = truthArguments(values); return args.includes('F') ? 'F' : args.includes('U') ? 'U' : 'T';
}
export function securityOr(values:readonly SecurityTruth[]):SecurityTruth {
  const args = truthArguments(values); return args.includes('T') ? 'T' : args.includes('U') ? 'U' : 'F';
}
