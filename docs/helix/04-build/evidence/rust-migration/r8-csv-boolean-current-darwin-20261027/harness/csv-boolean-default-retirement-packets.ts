// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze CONTRACT-053 CSV Boolean acceptance cases from the TypeScript predecessor.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {validateCsvBooleanLexical, verifyCsvBooleanLexical} from '../../../src/model/csv-boolean-lexical';
import {validateCoreRecordValues} from '../../../src/model/record-values';

const dir = 'docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-retirement-replay';
const source = JSON.parse(await readFile('spec/domain-packs/medical/ontology.json', 'utf8'));
const field = {module: 'domain', element: 'patients.active'};
const request = (token: unknown = 'true'): any => ({profile: 'umf.csv-boolean-lexical/1.0.0', field, token, sourceContext: {source: 'original.csv', row: 1, column: 'active', unknown: {retained: ['雪', null]}}});
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const outcome = (run: () => unknown) => {
  try { return stable({status: 'returned', value: run()}); }
  catch (e: any) { return {status: 'threw', name: String(e?.name ?? ''), code: typeof e?.code === 'string' ? e.code : null, path: typeof e?.path === 'string' ? e.path : null, message: String(e?.message ?? '')}; }
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const traceAccessor = (value: any, key: string, trace: string[], label = key) => {
  const copy = structuredClone(value);
  Object.defineProperty(copy, key, {enumerable: true, configurable: true, get() { trace.push(`accessor:${label}`); return undefined; }});
  return copy;
};
const inputPairBytes = (s: unknown, r: unknown) => new TextEncoder().encode(JSON.stringify({source: s, request: r})).length;
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const exactPairFixture = () => {
  const req = request('TRUE');
  req.sourceContext = '';
  const base = inputPairBytes(source, req);
  req.sourceContext = 'x'.repeat(4_000_000 - base);
  const bytes = inputPairBytes(source, req);
  if (bytes !== 4_000_000) throw new Error(`exact input fixture is ${bytes} bytes`);
  return {request: req, bytes};
};
const exactReceiptFixture = () => {
  const build = (padding: number) => { const req = request(); req.sourceContext = 'x'.repeat(padding); return {request: req, receipt: validateCsvBooleanLexical(source as any, req as any)}; };
  const empty = build(0), padding = 4_000_000 - jsonBytes(empty.receipt);
  const fixture = build(padding), bytes = jsonBytes(fixture.receipt);
  if (bytes !== 4_000_000) throw new Error(`exact receipt fixture is ${bytes} bytes`);
  return {...fixture, paddingBytes: padding};
};
const hostArgs = (profile: string, input: any, trace: string[]) => {
  const src = () => structuredClone(input.source), req = () => structuredClone(input.request);
  const accessor = (object: any, key: string, label: string) => Object.defineProperty(object, key, {enumerable: true, configurable: true, get() { trace.push(`accessor:${label}`); return label === 'profile' ? 'umf.csv-boolean-lexical/1.0.0' : label === 'token' ? 'true' : 'hidden'; }});
  if (profile === 'source-accessor-id' || profile === 'invalid-request-source-accessor') { const s = src(); accessor(s, 'id', 'source.id'); const r = req(); if (profile === 'invalid-request-source-accessor') r.profile = 'future'; return [s, r]; }
  if (profile === 'nested-source-accessor') { const s = src(); accessor(s.modules[0].elements[0], 'name', 'nested.name'); return [s, req()]; }
  if (profile.startsWith('request-accessor-')) { const r = req(); accessor(r, profile.slice('request-accessor-'.length), profile.slice('request-accessor-'.length)); return [src(), r]; }
  if (profile === 'hidden-source' || profile === 'competing-source-hidden') { const s = src(); Object.defineProperty(s, 'private', {value: 1, enumerable: false}); if (profile === 'competing-source-hidden') accessor(s, 'id', 'source.id'); return [s, req()]; }
  if (profile === 'hidden-request') { const r = req(); Object.defineProperty(r, 'private', {value: 1, enumerable: false}); return [src(), r]; }
  if (profile === 'source-symbol' || profile === 'request-symbol') { const object = profile === 'source-symbol' ? src() : req(); Object.defineProperty(object, Symbol('hidden'), {value: 1, enumerable: true}); return profile === 'source-symbol' ? [object, req()] : [src(), object]; }
  if (profile === 'competing-request-accessors') { const r = req(); accessor(r, 'futureA', 'futureA'); accessor(r, 'futureB', 'futureB'); return [src(), r]; }
  if (profile === 'source-ownkeys-throw') return [new Proxy({}, {ownKeys() { trace.push('source:ownKeys'); throw new Error('proxy-ownKeys-stop'); }}), req()];
  if (profile === 'source-descriptor-changes') { let descriptors = 0; const s = new Proxy({}, {ownKeys() { trace.push('source:ownKeys'); return ['umf']; }, getOwnPropertyDescriptor() { descriptors++; trace.push(`source:descriptor:${descriptors}`); if (descriptors === 1) return {enumerable: true, configurable: true, get() { trace.push('source:umf-getter'); return '0.10.0'; }}; throw new Error('proxy-descriptor-stop'); }}); return [s, req()]; }
  if (profile === 'source-changing-keys') { let calls = 0; const s = new Proxy({}, {ownKeys() { calls++; trace.push(`source:ownKeys:${calls}`); return calls === 1 ? ['umf'] : ['id']; }, getOwnPropertyDescriptor(_t, key) { trace.push(`source:descriptor:${String(key)}`); return {enumerable: true, configurable: true, get() { trace.push(`source:getter:${String(key)}`); return key === 'umf' ? '0.10.0' : 'hidden'; }}; }}); return [s, req()]; }
  if (profile === 'request-ownkeys-throw') { const r = new Proxy(req(), {ownKeys() { trace.push('request:ownKeys'); throw new Error('request-proxy-ownKeys-stop'); }}); return [src(), r]; }
  if (profile === 'source-trap-order') { const s = new Proxy({}, {ownKeys() { trace.push('source:ownKeys'); return ['umf']; }, getOwnPropertyDescriptor(_t, key) { trace.push(`source:descriptor:${String(key)}`); return {get() { trace.push('source:umf-getter'); return '0.10.0';}, enumerable: true, configurable: true}; }}); return [s, req()]; }
  if (profile === 'malformed-receipt-first') { const s = src(); accessor(s, 'id', 'source.id'); const r = req(); accessor(r, 'token', 'request.token'); return [{}, s, r]; }
  throw new Error(`Unknown host control ${profile}`);
};
const hostProfiles = ['source-accessor-id', 'nested-source-accessor', 'request-accessor-profile', 'request-accessor-token', 'request-accessor-future', 'hidden-source', 'hidden-request', 'source-symbol', 'request-symbol', 'competing-source-hidden', 'competing-request-accessors', 'invalid-request-source-accessor', 'source-ownkeys-throw', 'source-descriptor-changes', 'source-changing-keys', 'request-ownkeys-throw', 'source-trap-order'];
const makeRecordInputs = (state: 'present-null' | 'absent') => {
  const record = source.modules[0].elements.find((element: any) => element.id === 'patients');
  const values = record.members.map((member: any) => member.element === field.element
    ? state === 'present-null' ? {field: member, state: 'present', value: null} : {field: member, state: 'absent'}
    : {field: member, state: 'present', value: {string: member.element === 'patients.resource_key' ? 'native-patient' : 'literal'}});
  return {source, identity: {module: 'domain', element: 'patients'}, values};
};

const validateCases: any[] = [];
for (const profile of hostProfiles) {
  const input = {profile: `host:${profile}`, source, request: request()}; const trace: string[] = [];
  const args = hostArgs(profile, input, trace);
  validateCases.push({id: `validate.host.${profile}`, input, expectedOutcome: outcome(() => validateCsvBooleanLexical(...args as [any, any])), expectedTrace: trace, expectsRust: false});
}
for (const token of ['true', 'false', 'True', 'False']) {
  const input = {source, request: request(token)};
  validateCases.push({id: `validate.token.${token}`, input, expectedOutcome: outcome(() => validateCsvBooleanLexical(input.source, input.request as any)), expectedTrace: [], expectsRust: true});
}
const allowed = structuredClone(source); allowed.modules[0].elements.find((e: any) => e.id === field.element).allowedValues = [{boolean: false}];
const unknown = structuredClone(source); unknown.modules[0].elements.find((e: any) => e.id === field.element).facets = {futureBooleanRule: {meaning: 'unknown'}};
for (const [id, s, r] of [
  ['allowed-value-mismatch', allowed, request('True')],
  ['unknown-selected-semantics', unknown, request('true')],
  ['string-field', source, {...request(), field: {module: 'domain', element: 'patients.gender'}}],
  ['map-cardinality', (() => { const x = structuredClone(source); x.modules[0].elements.find((e: any) => e.id === field.element).cardinality = 'map'; return x; })(), request()],
  ['old-core-version', (() => { const x = structuredClone(source); x.umf = '0.7.0'; return x; })(), request()],
  ...['TRUE', 'FALSE', 'tRuE', ' true', 'true ', '1', '0', '', null, true, '\\N'].map(token => [`unsupported-token.${String(token)}`, source, request(token)] as const),
]) {
  const input = {source: s, request: r};
  validateCases.push({id: `validate.${id}`, input, expectedOutcome: outcome(() => validateCsvBooleanLexical(s as any, r as any)), expectedTrace: [], expectsRust: true});
}
for (const [id, alter] of [['missing-token', (r: any) => { delete r.token; }], ['null-source-context', (r: any) => { r.sourceContext = null; }]] as const) {
  const req: any = request(); alter(req);
  const input = {source, request: req};
  validateCases.push({id: `validate.${id}`, input, expectedOutcome: outcome(() => validateCsvBooleanLexical(source as any, req)), expectedTrace: [], expectsRust: true});
}
{
  const exact = exactPairFixture();
  validateCases.push({id: 'validate.input-byte-limit.exact-4000000', input: {profile: 'exact-pair-byte-limit', source, token: 'TRUE', paddingBytes: exact.request.sourceContext.length}, expectedOutcome: outcome(() => validateCsvBooleanLexical(source as any, exact.request as any)), expectedTrace: [], expectsRust: true});
  const overRequest = request('TRUE'); overRequest.sourceContext = 'x'.repeat(exact.request.sourceContext.length + 1);
  validateCases.push({id: 'validate.input-byte-limit.over-4000000', input: {profile: 'over-pair-byte-limit', source, token: 'TRUE', paddingBytes: exact.request.sourceContext.length + 1}, expectedOutcome: outcome(() => validateCsvBooleanLexical(source as any, overRequest as any)), expectedTrace: [], expectsRust: true});
}
{
  const exact = exactReceiptFixture();
  validateCases.push({id: 'validate.receipt-byte-limit.exact-4000000', input: {profile: 'exact-receipt-byte-limit', source, paddingBytes: exact.paddingBytes}, expectedOutcome: outcome(() => validateCsvBooleanLexical(source as any, exact.request as any)), expectedTrace: [], expectsRust: true});
  const overRequest = request(); overRequest.sourceContext = 'x'.repeat(exact.paddingBytes + 1);
  validateCases.push({id: 'validate.receipt-byte-limit.over-4000000', input: {profile: 'over-receipt-byte-limit', source, paddingBytes: exact.paddingBytes + 1}, expectedOutcome: outcome(() => validateCsvBooleanLexical(source as any, overRequest as any)), expectedTrace: [], expectsRust: true});
}
{
  const input = {source, request: request()}; const trace: string[] = [];
  const expectedOutcome = outcome(() => validateCsvBooleanLexical(traceAccessor(input.source, 'umf', trace) as any, input.request as any));
  validateCases.push({id: 'validate.source-accessor-preflight', input: {profile: 'source-accessor', ...input}, expectedOutcome, expectedTrace: trace, expectsRust: false});
}

const verifyCases: any[] = [];
for (const token of ['true', 'false', 'True', 'False']) {
  const req = request(token); const receipt = validateCsvBooleanLexical(source, req as any); const input = {receipt, source, request: req};
  verifyCases.push({id: `verify.token.${token}`, input, expectedOutcome: outcome(() => verifyCsvBooleanLexical(receipt as any, source as any, req as any)), expectedTrace: [], expectsRust: true});
}
{
  const req = request(); const receipt = validateCsvBooleanLexical(source, req as any);
  const mutations: [string, (r: any, s: any, q: any) => void][] = [
    ['changed-source', (_r, s) => { s.revision = 'changed'; }],
    ['changed-request', (_r, _s, q) => { q.sourceContext.row = 2; }],
    ['forged-typed-value', (r) => { r.value.boolean = false; }],
    ['forged-validation-verdict', (r) => { r.validation.valid = false; }],
    ['forged-validation-diagnostics', (r) => { r.validation.diagnostics = [{code: 'FORGED', path: '', message: 'forged', severity: 'error'}]; }],
    ['forged-original-source', (r) => { r.source.revision = 'forged'; }],
    ['forged-original-request', (r) => { r.request.token = 'False'; }],
    ['extra-receipt-field', (r) => { r.extra = true; }],
  ];
  for (const [id, mutate] of mutations) {
    const changedReceipt = structuredClone(receipt), expectedSource = structuredClone(source), expectedRequest = structuredClone(req);
    mutate(changedReceipt, expectedSource, expectedRequest);
    const input = {receipt: changedReceipt, source: expectedSource, request: expectedRequest};
    verifyCases.push({id: `verify.${id}`, input, expectedOutcome: outcome(() => verifyCsvBooleanLexical(changedReceipt as any, expectedSource as any, expectedRequest as any)), expectedTrace: [], expectsRust: true});
  }
}
{
  const exact = exactReceiptFixture();
  verifyCases.push({id: 'verify.receipt-byte-limit.exact-4000000', input: {profile: 'exact-verify-receipt-byte-limit', source, paddingBytes: exact.paddingBytes}, expectedOutcome: outcome(() => verifyCsvBooleanLexical(exact.receipt as any, source as any, exact.request as any)), expectedTrace: [], expectsRust: true});
  verifyCases.push({id: 'verify.receipt-byte-limit.over-4000000', input: {profile: 'over-verify-receipt-byte-limit', source, paddingBytes: exact.paddingBytes + 1}, expectedOutcome: outcome(() => verifyCsvBooleanLexical({...exact.receipt, request: {...exact.receipt.request, sourceContext: 'x'.repeat(exact.paddingBytes + 1)}} as any, source as any, exact.request as any)), expectedTrace: [], expectsRust: true});
}
{
  const req = request(); const receipt = validateCsvBooleanLexical(source, req as any);
  const input = {profile: 'verify-source-accessor', receipt, source, request: req}; const trace: string[] = [];
  verifyCases.push({id: 'verify.source-accessor-after-receipt-prepare', input, expectedOutcome: outcome(() => verifyCsvBooleanLexical(receipt as any, traceAccessor(source, 'umf', trace) as any, req as any)), expectedTrace: trace, expectsRust: true});
}
{
  const req = request(); const input = {profile: 'receipt-proxy-ownkeys', receipt: {}, source, request: req}; const trace: string[] = [];
  const receipt = new Proxy({}, {getPrototypeOf(target) { trace.push('receipt:getPrototypeOf'); return Reflect.getPrototypeOf(target); }, ownKeys() { trace.push('receipt:ownKeys'); throw new Error('csv-receipt-proxy-stop'); }});
  verifyCases.push({id: 'verify.receipt-proxy-preflight', input, expectedOutcome: outcome(() => verifyCsvBooleanLexical(receipt as any, source as any, req as any)), expectedTrace: trace, expectsRust: false});
}
{
  const input = {profile: 'host:malformed-receipt-first', source, request: request()}; const trace: string[] = [];
  const args = hostArgs('malformed-receipt-first', input, trace);
  verifyCases.push({id: 'verify.host.malformed-receipt-first', input, expectedOutcome: outcome(() => verifyCsvBooleanLexical(...args as [any, any, any])), expectedTrace: trace, expectsRust: true});
}

const recordCases = ['present-null', 'absent'].map(state => {
  const input = makeRecordInputs(state as 'present-null' | 'absent');
  return {id: `record.${state}`, input, expectedOutcome: outcome(() => validateCoreRecordValues(input.source as any, input.identity as any, input.values as any)), expectedTrace: [], expectsRust: false, ownership: 'TypeScript default/reference only; outside the two-operation Rust retirement manifest'};
});

const packets = [
  {exportName: 'validateCsvBooleanLexical', rustOwner: 'umf_core::csv_boolean_lexical::validate_csv_boolean_lexical', cases: validateCases},
  {exportName: 'verifyCsvBooleanLexical', rustOwner: 'umf_core::csv_boolean_lexical::verify_csv_boolean_lexical', cases: verifyCases},
  {exportName: 'validateCoreRecordValues', rustOwner: null, cases: recordCases},
];
for (const op of packets) {
  const packet = {format: op.exportName === 'validateCoreRecordValues' ? 'umf.r8.csv-boolean-record-presence-packet/1' : 'umf.r8.default-route-retirement-packet/1', contractId: 'CONTRACT-053', exportName: op.exportName, rustOwner: op.rustOwner, cases: op.cases};
  const path = `${dir}/${op.exportName}.packet.json`;
  const body = `${JSON.stringify(packet, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const actual = await readFile(path, 'utf8');
    if (actual !== body) throw new Error(`${path} differs from TypeScript predecessor replay; review before refreshing`);
    console.log(JSON.stringify({path, sha256: hash(actual), caseCount: packet.cases.length, mode: 'check'}));
  } else {
    await writeFile(path, body);
    console.log(JSON.stringify({path, sha256: hash(body), caseCount: packet.cases.length, mode: 'write'}));
  }
}
