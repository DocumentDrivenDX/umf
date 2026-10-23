import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {admitJavascriptNumber, exactDecimal, integerFromBigInt, integerToBigInt, numericToNumberLossless} from '../../../src/adapters/javascript-numeric';

const packageEntry = process.env.UMF_R5_NODE_PACKAGE;
const oracleFile = process.env.UMF_R5_NUMERIC_ORACLE;
if (!packageEntry || !oracleFile) throw new Error('Set UMF_R5_NODE_PACKAGE and UMF_R5_NUMERIC_ORACLE');
type Row = {op: string; token?: string; bits?: string; shortest?: string; scalarType?: 'integer'|'decimal'; integer?: boolean; oracle: {ok: boolean; value: unknown}};
const [nativePackage, rows] = await Promise.all([
  import(resolve(packageEntry)),
  readFile(oracleFile, 'utf8').then((text) => JSON.parse(text) as Row[]),
]);
const native = nativePackage.createJavascriptNumericEngine();
const ts = {admitJavascriptNumber, exactDecimal, integerFromBigInt, integerToBigInt, numericToNumberLossless};
function call(engine: typeof native, row: Row): unknown {
  switch (row.op) {
    case 'exactDecimal': return engine.exactDecimal(row.token!);
    case 'integerFromBigInt': return engine.integerFromBigInt(BigInt(row.token!));
    case 'integerToBigInt': return engine.integerToBigInt({integerToken: row.token!}).toString();
    case 'admitJavascriptNumber': {
      const bytes = Uint8Array.from(row.bits!.match(/../g)!, (part) => Number.parseInt(part, 16));
      const value = new DataView(bytes.buffer).getFloat64(0, false);
      return engine.admitJavascriptNumber(value, row.scalarType!);
    }
    case 'numericToNumberLossless': return engine.numericToNumberLossless(row.integer ? {integerToken: row.token!} : {decimalToken: row.token!});
    default: throw new Error(`Unsupported vector op: ${row.op}`);
  }
}
function canonical(value: unknown): string { return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item); }
let checked = 0;
for (const row of rows) {
  const outcomes = [native, ts].map((engine) => {
    try { return {ok: true, value: call(engine, row)}; }
    catch { return {ok: false, value: null}; }
  });
  for (const outcome of outcomes) {
    if (outcome.ok !== row.oracle.ok || (outcome.ok && canonical(outcome.value) !== canonical(row.oracle.value))) {
      throw new Error(`${row.op} disagrees with independent oracle: ${JSON.stringify({row, outcome})}`);
    }
  }
  const nativeOutcome = outcomes[0]!;
  const tsOutcome = outcomes[1]!;
  if (nativeOutcome.ok !== tsOutcome.ok || (nativeOutcome.ok && canonical(nativeOutcome.value) !== canonical(tsOutcome.value))) {
    throw new Error(`${row.op} native/TS mismatch: ${JSON.stringify({row, outcomes})}`);
  }
  checked++;
}

const failExpected = (operation: () => unknown, code: string) => {
  try { operation(); throw new Error(`Expected ${code} refusal`); }
  catch (error) { if ((error as {code?: string}).code !== code) throw error; }
};
failExpected(() => native.exactDecimal('NaN'), 'JAVASCRIPT_NUMERIC');
failExpected(() => native.admitJavascriptNumber(0.1, 'decimal'), 'JAVASCRIPT_NUMERIC');
if (native.integerToBigInt({integerToken: '9007199254740992'}) !== 9_007_199_254_740_992n) throw new Error('BigInt range was incorrectly restricted to safe Number range');
const refusalCases: [string, () => unknown, () => unknown][] = [
  ['infinity', () => ts.admitJavascriptNumber(Infinity, 'decimal'), () => native.admitJavascriptNumber(Infinity, 'decimal')],
  ['nan', () => ts.admitJavascriptNumber(NaN, 'decimal'), () => native.admitJavascriptNumber(NaN, 'decimal')],
  ['negative zero', () => ts.admitJavascriptNumber(-0, 'decimal'), () => native.admitJavascriptNumber(-0, 'decimal')],
  ['extra carrier member', () => ts.numericToNumberLossless({decimalToken:'1', future:true} as any), () => native.numericToNumberLossless({decimalToken:'1', future:true} as any)],
  ['symbol carrier member', () => ts.numericToNumberLossless(Object.assign({decimalToken:'1'}, {[Symbol('future')]:true})), () => native.numericToNumberLossless(Object.assign({decimalToken:'1'}, {[Symbol('future')]:true}))],
  ['accessor carrier', () => ts.numericToNumberLossless({get decimalToken(){throw new Error('must not run')}} as any), () => native.numericToNumberLossless({get decimalToken(){throw new Error('must not run')}} as any)],
];
for (const [label, ...operations] of refusalCases) {
  const errors = operations.map((operation) => {
    try { operation(); return 'ACCEPTED'; }
    catch (error) { const item = error as {code?:string; path?:string; message?:string}; return {code:item.code, path:item.path, message:item.message}; }
  });
  if (canonical(errors[0]) !== canonical(errors[1])) throw new Error(`${label} refusal differs between TS and Rust binding: ${canonical(errors)}`);
}
const readJson = async (path: string) => JSON.parse(await readFile(resolve(path), 'utf8'));
const [coreSchema, referenceSchema, packageSchema, constraints, domainPolicy, document] = await Promise.all([
  readJson('spec/core/schema.json'), readJson('spec/core/semantic-type-reference.schema.json'),
  readJson('spec/core/extension-package.schema.json'), readJson('spec/metamodel/generated/core-constraints.json'),
  readJson('spec/metamodel/generated/domain-policy.json'), readJson('tests/lifecycle/fixtures/legacy-note.json'),
]);
const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const nativeContextEngine = nativePackage.createJavascriptNumericEngine(resources);
const fieldContext = {document, field:{module:'note_lifecycle', element:'notes__note_id'}};
const actualCurrent = nativeContextEngine.integerFromBigInt(1n, fieldContext);
const expectedCurrent = integerFromBigInt(1n, fieldContext);
if (canonical(actualCurrent) !== canonical(expectedCurrent)) throw new Error('Current document/Field context admission differs');
const unknownDocument = {
  ...document,
  modules: document.modules.map((module: any) => ({
    ...module,
    elements: module.elements.map((element: any) => element.id === 'notes__note_id' ? {...element, facets:{future:7}} : element),
  })),
};
const withField = (patch: Record<string, unknown>) => ({
  ...document,
  modules: document.modules.map((module: any) => ({
    ...module,
    elements: module.elements.map((element: any) => element.id === 'notes__note_id' ? {...element, ...patch} : element),
  })),
});
const contextRefusals = [
  ['old document', {...fieldContext, document:{...document, umf:'0.7.0'}}],
  ['invalid document', {...fieldContext, document:{...document, modules:[]}}],
  ['missing Field', {...fieldContext, field:{module:'note_lifecycle', element:'absent'}}],
  ['wrong role', {...fieldContext, field:{module:'note_lifecycle', element:'notes'}}],
  ['range', {...fieldContext, document:withField({facets:{integerWidth:{bits:32,signed:true},range:{min:{integerToken:'0'},max:{integerToken:'10'}}}})}, 11n],
  ['allowedValues', {...fieldContext, document:withField({allowedValues:[{integerToken:'1'}]})}, 2n],
  ['unknown relevant facet', {...fieldContext, document:unknownDocument}],
  ['extra Field context member', {...fieldContext, field:{...fieldContext.field, future:'extra'}}],
];
for (const [label, context, value = 1n] of contextRefusals) {
  const errors = [
    () => integerFromBigInt(value as bigint, context as any),
    () => nativeContextEngine.integerFromBigInt(value as bigint, context as any),
  ].map((operation) => {
    try { operation(); return null; }
    catch (error) { const item = error as {code?:string; path?:string; message?:string}; return {code:item.code, path:item.path, message:item.message}; }
  });
  if (canonical(errors[0]) !== canonical(errors[1])) throw new Error(`${label} context refusal differs: ${canonical(errors)}`);
}
const extraOuterContext = {...fieldContext, future:'accepted by existing TS context contract'};
if (canonical(nativeContextEngine.integerFromBigInt(1n, extraOuterContext)) !== canonical(integerFromBigInt(1n, extraOuterContext))) throw new Error('Extra outer context compatibility differs');
let getterCalls = 0;
const nestedGetterContext = {...fieldContext, future:{get value(){getterCalls++; return 1;}}};
const nonJsonContexts: [string, unknown][] = [
  ['outer BigInt', {...fieldContext, future:1n}],
  ['outer function', {...fieldContext, future:()=>1}],
  ['nested getter', nestedGetterContext],
];
for (const [label, context] of nonJsonContexts) {
  const errors = [
    () => integerFromBigInt(1n, context as any),
    () => nativeContextEngine.integerFromBigInt(1n, context as any),
  ].map((operation) => {
    try { operation(); return null; }
    catch (error) { const item = error as {code?:string; path?:string; message?:string}; return {code:item.code, path:item.path, message:item.message}; }
  });
  if (canonical(errors[0]) !== canonical(errors[1]) || errors[0]?.code !== 'NON_JSON') throw new Error(`${label} context admission differs: ${canonical(errors)}`);
}
if (getterCalls !== 0) throw new Error('Context admission invoked a nested getter');
const controlled = nativePackage.createJavascriptNumericEngine(undefined, {controls:{maxWork:32}});
try { controlled.integerFromBigInt(10n ** 100_000n); throw new Error('Large bigint bypassed host work budget'); }
catch (error) { if ((error as {code?:string}).code !== 'RESOURCE_LIMIT') throw error; }
const formatLimited = nativePackage.createJavascriptNumericEngine(undefined, {controls:{maxWork:20_000_000}});
try { formatLimited.integerToBigInt({integerToken:'1e99999'}); throw new Error('Expanded BigInt formatting bypassed host work budget'); }
catch (error) { if ((error as {code?:string}).code !== 'RESOURCE_LIMIT') throw error; }
console.log(JSON.stringify({status:'pass', profile:nativePackage.JAVASCRIPT_NUMERIC_PROFILE, vectors:checked, independentOracle:'Python Decimal/Fraction/struct', tsDifferential:true}));
