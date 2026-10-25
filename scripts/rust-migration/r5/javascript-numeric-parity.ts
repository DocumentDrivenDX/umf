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
let setupMeasuredWork = 0;
let factoryOperationWork = 0;
const setupControlledEngine = nativePackage.createJavascriptNumericEngine(resources, {
  setupControls:{meter:(amount:number) => {setupMeasuredWork += amount;}},
  controls:{meter:(amount:number) => {factoryOperationWork += amount;}},
});
if (setupMeasuredWork <= 0 || factoryOperationWork !== 0) throw new Error('Retained resources were not admitted under separate factory setup controls');
setupControlledEngine.exactDecimal('1');
if (factoryOperationWork <= 0) throw new Error('Per-call controls did not begin with the first numeric operation');
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
const contextCopyTrace = (operation: (context: any) => unknown) => {
  const trace: string[] = [];
  const target = {field:fieldContext.field, document:fieldContext.document};
  const context = new Proxy(target, {
    ownKeys() { trace.push('keys'); return ['field', 'document']; },
    getOwnPropertyDescriptor(object, key) { trace.push(String(key)); return Reflect.getOwnPropertyDescriptor(object, key); },
  });
  operation(context);
  return trace;
};
const contextCopyOrder = [
  contextCopyTrace((context) => integerFromBigInt(1n, context)),
  contextCopyTrace((context) => nativeContextEngine.integerFromBigInt(1n, context)),
];
if (canonical(contextCopyOrder[0]) !== canonical(contextCopyOrder[1])) throw new Error(`Whole-context copy/member order differs: ${canonical(contextCopyOrder)}`);
// Freeze predecessor host-touch order. Both implementations must reject bad
// numeric input before optional context inspection, and must not invoke the
// context accessor while doing so.
let orderGetterCalls = 0;
const accessorContext = Object.defineProperty({}, 'document', {
  enumerable:true,
  get() { orderGetterCalls++; return document; },
});
const orderCases: [string, () => unknown, () => unknown, string, string][] = [
  ['invalid exact decimal before context', () => exactDecimal('NaN', accessorContext as any), () => nativeContextEngine.exactDecimal('NaN', accessorContext as any), 'JAVASCRIPT_NUMERIC', 'JAVASCRIPT_NUMERIC'],
  ['unsupported number family before context', () => admitJavascriptNumber(1, 'future' as any, accessorContext as any), () => nativeContextEngine.admitJavascriptNumber(1, 'future' as any, accessorContext as any), 'JAVASCRIPT_NUMERIC', 'JAVASCRIPT_NUMERIC'],
];
const hostOrderChecks = orderCases.map(([label, tsOperation, nativeOperation, tsCode, nativeCode]) => {
  const code = (operation: () => unknown) => {
    try { operation(); return 'ACCEPTED'; }
    catch (error) { return (error as {code?:string}).code ?? 'UNMAPPED'; }
  };
  const outcomes = [code(tsOperation), code(nativeOperation)];
  if (outcomes[0] !== tsCode || outcomes[1] !== nativeCode) {
    throw new Error(`${label} differs from predecessor host-touch order: ${canonical(outcomes)}`);
  }
  return {label, tsCode:outcomes[0], rustOptInCode:outcomes[1], equal:true};
});
if (orderGetterCalls !== 0) throw new Error('Host-order control invoked an accessor');
const crossedLossyContext = {...fieldContext, field:{module:'note_lifecycle', element:'absent'}};
const crossedLossyErrors = [
  () => ts.numericToNumberLossless({decimalToken:'0.1'}, crossedLossyContext),
  () => nativeContextEngine.numericToNumberLossless({decimalToken:'0.1'}, crossedLossyContext),
].map((operation) => {
  try { operation(); return null; }
  catch (error) { const item = error as {code?:string; path?:string; message?:string}; return {code:item.code, path:item.path, message:item.message}; }
});
if (canonical(crossedLossyErrors[0]) !== canonical(crossedLossyErrors[1])) throw new Error(`Invalid context must precede lossy conversion: ${canonical(crossedLossyErrors)}`);
if (crossedLossyErrors[0]?.code !== 'JAVASCRIPT_NUMERIC' || crossedLossyErrors[0]?.message?.includes('Number conversion would change')) throw new Error(`Lossy conversion ran before invalid context: ${canonical(crossedLossyErrors)}`);
const malformedNumericContext = {...fieldContext, field:{module:'note_lifecycle', element:'absent'}};
for (const [label, literal] of [['malformed decimal', {decimalToken:'NaN'}], ['fractional integer carrier', {integerToken:'1.5'}]] as const) {
  const errors = [
    () => ts.numericToNumberLossless(literal as any, malformedNumericContext),
    () => nativeContextEngine.numericToNumberLossless(literal as any, malformedNumericContext),
  ].map((operation) => {
    try { operation(); return null; }
    catch (error) { const item = error as {code?:string; path?:string; message?:string}; return {code:item.code, path:item.path, message:item.message}; }
  });
  if (canonical(errors[0]) !== canonical(errors[1])) throw new Error(`${label} grammar must precede invalid context: ${canonical(errors)}`);
}
let measuredWork = 0;
nativePackage.createJavascriptNumericEngine(undefined, {controls:{meter:(amount:number) => {measuredWork += amount;}}}).exactDecimal('1');
if (measuredWork <= 0) throw new Error('Numeric operation did not report work to its host meter');
const perCallLimited = nativePackage.createJavascriptNumericEngine(undefined, {controls:{maxWork:measuredWork}});
perCallLimited.exactDecimal('1');
perCallLimited.exactDecimal('1');
let contextMeasuredWork = 0;
nativePackage.createJavascriptNumericEngine(resources, {controls:{meter:(amount:number) => {contextMeasuredWork += amount;}}}).integerFromBigInt(1n, fieldContext);
if (contextMeasuredWork <= measuredWork) throw new Error('Context stages were not metered cumulatively beyond the scalar operation');
const contextCumulativeLimited = nativePackage.createJavascriptNumericEngine(resources, {controls:{maxWork:contextMeasuredWork - 1}});
try { contextCumulativeLimited.integerFromBigInt(1n, fieldContext); throw new Error('Context operation exceeded its cumulative maxWork without refusal'); }
catch (error) { if ((error as {code?:string}).code !== 'RESOURCE_LIMIT') throw error; }
const contextPerCallLimited = nativePackage.createJavascriptNumericEngine(resources, {controls:{maxWork:contextMeasuredWork}});
contextPerCallLimited.integerFromBigInt(1n, fieldContext);
contextPerCallLimited.integerFromBigInt(1n, fieldContext);

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
console.log(JSON.stringify({status:'pass', profile:nativePackage.JAVASCRIPT_NUMERIC_PROFILE, vectors:checked, independentOracle:'Python Decimal/Fraction/struct', tsDifferential:true, hostOrderChecks, crossedLossyContext:crossedLossyErrors[0], contextCopyOrder, setupMeasuredWork, factoryOperationWork, perCallWorkReset:true, measuredWork, contextCumulativeWorkReset:true, contextMeasuredWork}));
