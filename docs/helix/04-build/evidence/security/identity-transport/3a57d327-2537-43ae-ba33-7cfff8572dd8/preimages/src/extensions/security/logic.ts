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
function object(value:unknown):Record<string,unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new UmfError('SECURITY_SHAPE','Expected security object');
  return value as Record<string,unknown>;
}
function members(value:Record<string,unknown>, allowed:readonly string[]):void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new UmfError('SECURITY_UNKNOWN','Uninterpreted security member');
}
function disposition(value:unknown):SecurityDisposition {
  const d = object(value);
  members(d,d.kind === 'transformed' ? ['kind','type','value'] : ['kind']);
  if (d.kind === 'original' || d.kind === 'withheld') return {kind:d.kind};
  if (d.kind === 'transformed' && d.type === 'string' && typeof d.value === 'string') return {kind:d.kind,type:d.type,value:d.value};
  if (d.kind === 'transformed' && d.type === 'boolean' && typeof d.value === 'boolean') return {kind:d.kind,type:d.type,value:d.value};
  throw new UmfError('SECURITY_DISPOSITION','Unsupported or malformed disposition');
}

/**
 * Compose already scoped, evaluated rules under CONTRACT-062. This does not
 * authenticate a subject, admit a fact cut, resolve types, or authorize a backend.
 * Unknown content remains preservable by core; this interpretation entrypoint refuses it.
 */
export function composeSecurityRules(input:readonly EvaluatedSecurityRule[], protectedFields:readonly string[] = []):SecurityComposition {
  const copied = copyJson({rules:input,protectedFields}) as unknown as {rules:unknown;protectedFields:unknown};
  if (!Array.isArray(copied.rules) || copied.rules.length > 256 || !Array.isArray(copied.protectedFields) ||
      copied.protectedFields.length > 4096 || copied.protectedFields.some(f => typeof f !== 'string' || !f.length) ||
      new Set(copied.protectedFields).size !== copied.protectedFields.length) throw new UmfError('SECURITY_BOUND','Invalid composition bounds or protected fields');
  const rules:EvaluatedSecurityRule[] = copied.rules.map(value => {
    const r = object(value); members(r,['effect','truth','disclosure']);
    if (!['permit','require','forbid'].includes(r.effect as string)) throw new UmfError('SECURITY_EFFECT','Invalid effect');
    const rule:EvaluatedSecurityRule = {effect:r.effect as EvaluatedSecurityRule['effect'],truth:truth(r.truth)};
    if (Object.hasOwn(r,'disclosure')) {
      if (r.effect !== 'permit') throw new UmfError('SECURITY_DISCLOSURE','Only permits carry disclosure');
      const entries = Object.entries(object(r.disclosure));
      if (entries.length > 4096 || entries.some(([field]) => !field.length)) throw new UmfError('SECURITY_BOUND','Invalid disclosure fields');
      rule.disclosure = Object.fromEntries(entries.map(([field,d]) => [field,disposition(d)]));
    }
    return rule;
  });
  const refuse = (decision:SecurityDecision):SecurityComposition => ({decision,disclosure:{}});
  if (rules.some(r => r.truth === 'U')) return refuse('indeterminate');
  if (!rules.some(r => r.effect === 'permit' && r.truth === 'T') ||
      rules.some(r => r.effect === 'require' && r.truth !== 'T') ||
      rules.some(r => r.effect === 'forbid' && r.truth === 'T')) return refuse('deny');
  const obligations = new Map<string,SecurityDisposition[]>();
  for (const r of rules) if (r.effect === 'permit' && r.truth === 'T') {
    for (const [field,d] of Object.entries(r.disclosure ?? {})) {
      const values = obligations.get(field) ?? []; values.push(d); obligations.set(field,values);
    }
  }
  if ((copied.protectedFields as string[]).some(field => !obligations.has(field))) return refuse('indeterminate');
  const disclosure:Record<string,SecurityDisposition> = Object.create(null);
  for (const [field,values] of obligations) {
    if (values.some(d => d.kind === 'withheld')) {disclosure[field] = {kind:'withheld'}; continue;}
    const transforms = values.filter((d):d is Extract<SecurityDisposition,{kind:'transformed'}> => d.kind === 'transformed');
    if (new Set(transforms.map(d => JSON.stringify([d.type,d.value]))).size > 1) return refuse('conflict');
    disclosure[field] = transforms[0] ?? {kind:'original'};
  }
  return {decision:'permit',disclosure};
}
