// SPDX-License-Identifier: MIT OR Apache-2.0
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
