/** Experimental normalized-IR row predicate lowering. No credentials, installation,
 * fact/issuer trust, disclosure publication or complete host admission. */
import {requireCandidateGraphSource,type CandidateGraphSource} from './security-graph-source';
export interface SecurityPhysicalType {
  type: { documentId: string; moduleId: string; elementId: string };
  keyId: string;
  keyFields: { ref: SecurityPhysicalType['type']; column: string }[];
  fields: { ref: SecurityPhysicalType['type']; column: string }[];
  home: { schema: string; table: string };
  /** Qualified native row-type selection; model-to-native identity is host-owned. */
  discriminator?: { column: string; carrier: 'text' | 'int4' | 'int8'; value: string };
  endpoints?: { role: string; target: SecurityPhysicalType['type']; fields: SecurityPhysicalType['type'][] }[];
}
export type SecurityPredicateType = Omit<SecurityPhysicalType,'home'> & { home: SecurityPhysicalType['home'] | { source: CandidateGraphSource } };
const refuse = (): never => { throw new Error('TRUSS_SECURITY_PREDICATE_UNSUPPORTED'); };
function object(v: unknown, keys: string[]): Record<string, any> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) return refuse();
  return v as Record<string, any>;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.includes('\0') || [...v].some(c => c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff)) return refuse();
  return v;
}
function ref(v: unknown): string {
  const r = object(v, ['documentId', 'moduleId', 'elementId']);
  return JSON.stringify([text(r.documentId), text(r.moduleId), text(r.elementId)]);
}
function identifier(v: unknown): string {
  const value = text(v); if (new TextEncoder().encode(value).length > 63) return refuse();
  return '"' + value.replaceAll('"', '""') + '"';
}
/** Source must come from the admitted compiler boundary; JSON shape is not authority.
 * Resource keys are native function parameters in their original declared order. */
export function lowerSecurityRowPredicate(input: {
  logicalPlan: unknown; action: string; target: SecurityPhysicalType['type'];
  subject: SecurityPhysicalType['type']; subjectLoginColumn: string;
  types: readonly SecurityPredicateType[];
  /** Shared resource homes also require the original row discriminator parameter. */
  resourceDiscriminatorParameter?: number;
}): string {
  const plan = object(input.logicalPlan, ['version', 'rules']);
  if (plan.version !== 'weft.security.logical-ir/0.1.0' || !Array.isArray(plan.rules)) return refuse();
  const types = new Map(input.types.map(t => [ref(t.type), t]));
  if (types.size !== input.types.length || types.size > 64) return refuse();
  const literal = (value: unknown) => "E'" + text(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
  const discriminator = (t: SecurityPredicateType) => {
    if (!t.discriminator) return undefined;
    const d = object(t.discriminator, ['column', 'carrier', 'value']); identifier(d.column); text(d.value);
    if (!['text', 'int4', 'int8'].includes(d.carrier) || d.value.length > 65536) return refuse();
    if (d.carrier !== 'text') {
      if (!/^(0|-?[1-9][0-9]*)$/.test(d.value) || d.value.length > 20) return refuse();
      const n = BigInt(d.value), bits = d.carrier === 'int4' ? 31n : 63n;
      if (n < -(1n << bits) || n >= (1n << bits)) return refuse();
    }
    return { column: d.column as string, carrier: d.carrier as string, value: d.value as string };
  };
  const selections = new Map(input.types.map(t => [ref(t.type), discriminator(t)]));
  const candidateSources=new Map<string,CandidateGraphSource>();
  const relation=(t:SecurityPredicateType):string=>{
    if(Object.hasOwn(t.home,'source')){
      const descriptors=Object.getOwnPropertyDescriptors(t.home);
      if(Reflect.ownKeys(descriptors).length!==1||!Object.hasOwn(descriptors.source!,'value'))return refuse();
      const source=descriptors.source!.value as CandidateGraphSource;
      requireCandidateGraphSource(source);candidateSources.set(ref(t.type),source);
      return '('+source.sql+')';
    }
    const home=t.home as {schema:string;table:string};
    return identifier(home.schema)+'.'+identifier(home.table);
  };
  const homes = new Map<string, SecurityPredicateType[]>();
  for (const t of input.types) {
    const home = relation(t);
    homes.set(home, [...(homes.get(home) ?? []), t]);
  }
  for (const group of homes.values()) if (group.length > 1) {
    const selected = group.map(t => selections.get(ref(t.type)) ?? refuse()), first = selected[0]!;
    if (selected.some(d => d.column !== first.column || d.carrier !== first.carrier) || new Set(selected.map(d => d.value)).size !== group.length) return refuse();
  }
  const resource = types.get(ref(input.target)) ?? refuse(), subject = types.get(ref(input.subject)) ?? refuse();
  const usedSources=new Set<CandidateGraphSource>();
  const table = (t: SecurityPredicateType) => {const sql=relation(t),source=candidateSources.get(ref(t.type));if(source)usedSources.add(source);return sql;};
  const selectedRow = (t: SecurityPredicateType, alias: string): string => {
    const d = selections.get(ref(t.type));
    return d ? identifier(alias) + '.' + identifier(d.column) + ' OPERATOR(pg_catalog.=) ' + literal(d.value) + '::pg_catalog.' + d.carrier : 'TRUE';
  };
  const resourceSelection = selections.get(ref(resource.type));
  if (resourceSelection ? input.resourceDiscriminatorParameter !== resource.keyFields.length + 1 : input.resourceDiscriminatorParameter !== undefined) return refuse();
  const column = (t: SecurityPredicateType, r: unknown) => identifier(t.fields.find(f => ref(f.ref) === ref(r))?.column ?? refuse());
  type Bound = { type: SecurityPredicateType; alias?: string; resource?: boolean; subject?: boolean };
  type Value = { sql: string[]; identity?: string; domain?: string };
  let work = 4096;
  const bounded = (s: string) => { if (s.length > 250000 || new TextEncoder().encode(s).length > 1000000) return refuse(); return s; };
  const binding = (v: unknown, vars: Map<number, Bound>): Bound => {
    if (v === 'resource') return { type: resource, resource: true };
    if (v === 'subject') return { type: subject, subject: true };
    const b = object(v, ['variable']); if (!Number.isSafeInteger(b.variable)) return refuse();
    return vars.get(b.variable) ?? refuse();
  };
  const scalar = (b: Bound, r: unknown): string => {
    if (b.resource) {
      const at = b.type.keyFields.findIndex(f => ref(f.ref) === ref(r));
      if (at < 0) return refuse(); return '$' + (at + 1);
    }
    if (b.subject) return '(SELECT "subject_row".' + column(b.type, r) + ' FROM ' + table(b.type) + ' AS "subject_row" WHERE "subject_row".' + identifier(input.subjectLoginColumn) + ' OPERATOR(pg_catalog.=) SESSION_USER::pg_catalog.text' + (b.type.discriminator ? ' AND (' + selectedRow(b.type, 'subject_row') + ')' : '') + ')';
    return identifier(b.alias!) + '.' + column(b.type, r);
  };
  const domain = (v: unknown): string => {
    const d = object(v, ['scalarType', 'nullability', 'cardinality', 'facets', 'allowedValues']);
    if (d.allowedValues !== null || d.cardinality !== 'one' || d.nullability !== 'required' || Object.keys(d.facets ?? {}).length || !['string', 'boolean'].includes(d.scalarType)) return refuse();
    return d.scalarType;
  };
  const term = (v: unknown, vars: Map<number, Bound>): Value => {
    const t = object(v, ['identity', 'endpoint', 'field', 'constant']); if (Object.keys(t).length !== 1) return refuse();
    if (t.identity) {
      const i = object(t.identity, ['binding', 'target', 'keyId']), b = binding(i.binding, vars);
      if (ref(i.target) !== ref(b.type.type) || i.keyId !== b.type.keyId || !b.type.keyFields.length) return refuse();
      return { sql: b.type.keyFields.map(f => scalar(b, f.ref)), identity: ref(i.target) + ':' + JSON.stringify(i.keyId) };
    }
    if (t.endpoint) {
      const e = object(t.endpoint, ['binding', 'association', 'role', 'target', 'keyId']), b = binding(e.binding, vars);
      const endpoint = b.type.endpoints?.find(x => x.role === e.role), target = types.get(ref(e.target));
      if (ref(e.association) !== ref(b.type.type) || !endpoint || !target || ref(endpoint.target) !== ref(e.target) || target.keyId !== e.keyId || endpoint.fields.length !== target.keyFields.length) return refuse();
      return { sql: endpoint.fields.map(f => scalar(b, f)), identity: ref(e.target) + ':' + JSON.stringify(e.keyId) };
    }
    if (t.field) {
      const f = object(t.field, ['binding', 'field', 'domain']); return { sql: [scalar(binding(f.binding, vars), f.field)], domain: domain(f.domain) };
    }
    const c = object(t.constant, ['field', 'domain', 'literal']); ref(c.field); const d = domain(c.domain);
    const literal = object(c.literal, [d]); if (Object.keys(literal).length !== 1) return refuse();
    if (d === 'boolean') { if (typeof literal.boolean !== 'boolean') return refuse(); return { sql: [literal.boolean ? 'TRUE' : 'FALSE'], domain: d }; }
    const value = text(literal.string); if (value.length > 65536) return refuse();
    return { sql: ["E'" + value.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'::pg_catalog.text"], domain: d };
  };
  const expression = (v: unknown, vars: Map<number, Bound>, depth: number): string => {
    if (--work < 0 || depth > 32) return refuse();
    const e = object(v, ['literal', 'equal', 'and', 'or', 'not', 'exists']); if (Object.keys(e).length !== 1) return refuse();
    if ('literal' in e) { if (typeof e.literal !== 'boolean') return refuse(); return e.literal ? 'TRUE' : 'FALSE'; }
    if (e.equal) {
      if (!Array.isArray(e.equal) || e.equal.length !== 2) return refuse(); const a = term(e.equal[0], vars), b = term(e.equal[1], vars);
      if (a.identity !== b.identity || a.domain !== b.domain || a.sql.length !== b.sql.length) return refuse();
      return bounded('(' + a.sql.map((value, i) => '(' + value + ' OPERATOR(pg_catalog.=) ' + b.sql[i] + ')').join(' AND ') + ')');
    }
    if (e.and || e.or) {
      const args = e.and ?? e.or; if (!Array.isArray(args) || !args.length) return refuse();
      const parts = args.map(a => expression(a, vars, depth + 1)); if (parts.reduce((n, p) => n + p.length, 0) > 250000) return refuse();
      return bounded('(' + parts.join(e.and ? ' AND ' : ' OR ') + ')');
    }
    if (e.not) return bounded('(NOT ' + expression(e.not, vars, depth + 1) + ')');
    const x = object(e.exists, ['slot', 'association', 'condition']); if (!Number.isSafeInteger(x.slot) || x.slot < 0 || vars.has(x.slot)) return refuse();
    const type = types.get(ref(x.association)) ?? refuse(), alias = 'association_' + x.slot;
    const nested = new Map(vars); nested.set(x.slot, { type, alias });
    const child = expression(x.condition, nested, depth + 1); if (child.length > 80000) return refuse();
    const scan = ' FROM ' + table(type) + ' AS ' + identifier(alias) + ' WHERE ' + (type.discriminator ? '(' + selectedRow(type, alias) + ') AND ' : '') + '(' + child + ')';
    // EXISTS must preserve U when no true row exists but an unknown row does.
    return bounded('(CASE WHEN EXISTS(SELECT 1' + scan + ' IS TRUE) THEN TRUE WHEN EXISTS(SELECT 1' + scan + ' IS NULL) THEN NULL::pg_catalog.bool ELSE FALSE END)');
  };
  const effects = { permit: [] as string[], require: [] as string[], forbid: [] as string[] };
  for (const raw of plan.rules) {
    const r = object(raw, ['id', 'effect', 'actions', 'target', 'condition', 'disclosure']);
    if (!Array.isArray(r.actions) || !Array.isArray(r.disclosure) || !Object.hasOwn(effects, r.effect)) return refuse();
    if (ref(r.target) !== ref(input.target) || !r.actions.includes(input.action)) continue;
    effects[r.effect as keyof typeof effects].push(expression(r.condition, new Map(), 0));
  }
  if (!effects.permit.length) return 'FALSE';
  const result = '(' + effects.permit.map(p => '(' + p + ') IS TRUE').join(' OR ') + ')' +
    (effects.permit.length > 1 ? effects.permit.map(p => ' AND (' + p + ') IS NOT NULL').join('') : '') +
    effects.require.map(p => ' AND (' + p + ') IS TRUE').join('') + effects.forbid.map(p => ' AND (' + p + ') IS FALSE').join('');
  const root = resourceSelection ? '($' + input.resourceDiscriminatorParameter + ' OPERATOR(pg_catalog.=) ' + literal(resourceSelection.value) + '::pg_catalog.' + resourceSelection.carrier + ') IS TRUE AND ' : '';
  // Construction issuance is not authority. These checks establish only the
  // candidate's local validity; host source/cut/issuer admission remains required.
  // SQL AND is not an evaluation-order barrier. The host must separately preflight
  // sources, including the outer resource and any subject not scanned here.
  const validity=[...usedSources].map(source=>'((SELECT valid FROM ('+source.validitySql+') candidate_validity)::pg_catalog.bool) IS TRUE AND ').join('');
  return bounded('(' + validity + root + result + ')');
}
