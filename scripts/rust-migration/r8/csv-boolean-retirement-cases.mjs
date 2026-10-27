// Contract-derived extension cases for the two CSV Boolean operations.
// This module is deliberately independent of the frozen R5 outcome packet.
export function runCsvBooleanRetirementCases(route, source) {
  const request = (token, sourceContext = {source: 'retirement-oracle.csv', row: 7, column: 'active'}) => ({
    profile: 'umf.csv-boolean-lexical/1.0.0',
    field: {module: 'domain', element: 'patients.active'},
    ...(token === Symbol.for('missing') ? {} : {token}),
    sourceContext,
  });
  const outcome = run => {
    try { return {status: 'accepted', value: run()}; }
    catch (error) {
      return {status: 'refused', name: error?.name ?? typeof error, code: error?.code ?? null,
        path: error?.path ?? '', message: error?.message ?? String(error)};
    }
  };
  const cases = {};

  // Independent finite truth table specified by CONTRACT-053.
  for (const [token, expected] of [['true', true], ['True', true], ['false', false], ['False', false]]) {
    const result = outcome(() => route.validateCsvBooleanLexical(source, request(token)));
    if (result.status !== 'accepted' || result.value.value?.boolean !== expected ||
        result.value.request?.token !== token || result.value.provenance !== 'unverified') {
      throw new Error(`CONTRACT-053 truth table failed for ${JSON.stringify(token)}`);
    }
    cases[`oracle.token.${token}`] = {status: result.status, expectedBoolean: expected,
      actualBoolean: result.value.value.boolean, originalToken: result.value.request.token,
      provenance: result.value.provenance};
  }

  // No coercion: unsupported case, whitespace, numeric spellings and absent/null values refuse.
  const unsupported = ['TRUE', 'tRuE', ' true', 'false ', '0', '1', 'Ｔｒｕｅ'];
  for (const token of unsupported) {
    const result = outcome(() => route.validateCsvBooleanLexical(source, request(token)));
    if (result.status !== 'refused') throw new Error(`Unsupported CSV token accepted: ${JSON.stringify(token)}`);
    cases[`oracle.reject.${JSON.stringify(token)}`] = result;
  }
  for (const [label, req] of [['missing', request(Symbol.for('missing'))], ['null', request(null)]]) {
    const result = outcome(() => route.validateCsvBooleanLexical(source, req));
    if (result.status !== 'refused') throw new Error(`CSV ${label} token was converted instead of refused`);
    cases[`oracle.${label}Token`] = result;
  }

  // Public Core Field admission is the validator authority. The expected false
  // verdict is also independently dictated by this fixture's allowedValues.
  const constrained = structuredClone(source);
  const field = constrained.modules[0].elements.find(item => item.id === 'patients.active');
  if (!field) throw new Error('fixture lacks patients.active');
  field.allowedValues = [{boolean: false}];
  const constrainedRequest = request('true');
  const constrainedReceipt = route.validateCsvBooleanLexical(constrained, constrainedRequest);
  const independentFieldVerdict = route.validateCoreFieldValue(constrained, constrainedRequest.field, {boolean: true});
  if (constrainedReceipt.validation?.valid !== false || independentFieldVerdict.valid !== false ||
      JSON.stringify(constrainedReceipt.validation) !== JSON.stringify(independentFieldVerdict)) {
    throw new Error('CSV receipt did not retain the public Core Field validity verdict');
  }
  cases.coreFieldValidity = {receipt: constrainedReceipt.validation, publicFieldVerdict: independentFieldVerdict};

  // Each receipt-owned component is tampered independently. The contract
  // requires recomputation against the original expected source/request.
  const originalRequest = request('true');
  const good = route.validateCsvBooleanLexical(source, originalRequest);
  const tamper = (label, edit, expectedSource = source, expectedRequest = originalRequest) => {
    const altered = structuredClone(good); edit(altered);
    const result = outcome(() => route.verifyCsvBooleanLexical(altered, expectedSource, expectedRequest));
    if (result.status !== 'refused') throw new Error(`Tampered receipt accepted: ${label}`);
    cases[`receiptTamper.${label}`] = result;
  };
  const changedSource = structuredClone(source);
  if (typeof changedSource.title !== 'string') throw new Error('fixture title is not a string');
  changedSource.title = `${source.title} changed`;
  const changedRequest = request('false');
  tamper('expectedSource', () => {}, changedSource, originalRequest);
  tamper('expectedRequest', () => {}, source, changedRequest);
  tamper('receiptSource', value => { value.source.title = `${source.title} forged`; });
  tamper('receiptRequest', value => { value.request.token = 'false'; });
  tamper('typedBoolean', value => { value.value.boolean = false; });
  tamper('validation', value => { value.validation.valid = !value.validation.valid; });
  tamper('missingOperationField', value => { delete value.provenance; });
  tamper('extraOperationField', value => { value.unexpected = true; });

  // Verification continuation: receipt admission succeeds, then expected
  // source reflection throws on a later ownKeys pass. Request must stay cold.
  const callbackError = new Error('source-proxy-continuation-stop');
  let ownKeysCalls = 0, requestOwnKeysCalls = 0;
  const proxiedSource = new Proxy(source, {
    ownKeys(target) {
      ownKeysCalls++;
      if (ownKeysCalls >= 2) throw callbackError;
      return Reflect.ownKeys(target);
    },
  });
  const proxiedRequest = new Proxy(originalRequest, {
    ownKeys(target) { requestOwnKeysCalls++; return Reflect.ownKeys(target); },
  });
  let sameThrownObject = false;
  try { route.verifyCsvBooleanLexical(good, proxiedSource, proxiedRequest); }
  catch (error) { sameThrownObject = error === callbackError; }
  if (!sameThrownObject || ownKeysCalls < 2 || requestOwnKeysCalls !== 0) {
    throw new Error(`Verification callback continuation mismatch: ${ownKeysCalls}/${requestOwnKeysCalls}/${sameThrownObject}`);
  }
  cases.sourceProxyContinuation = {sameThrownObject, ownKeysCalls, requestOwnKeysCalls};

  // A too-large receipt must be refused before expected-input reflection.
  const oversized = {...good, request: {...good.request, sourceContext: 'x'.repeat(4_000_000)}};
  let sourceReflection = 0, requestReflection = 0;
  const guardedSource = new Proxy(source, {ownKeys(target) { sourceReflection++; return Reflect.ownKeys(target); }});
  const guardedRequest = new Proxy(originalRequest, {ownKeys(target) { requestReflection++; return Reflect.ownKeys(target); }});
  const budgetResult = outcome(() => route.verifyCsvBooleanLexical(oversized, guardedSource, guardedRequest));
  if (budgetResult.status !== 'refused' || budgetResult.code !== 'LIMIT' ||
      budgetResult.message !== 'Boolean lexical serialized JSON exceeds byte limit' ||
      sourceReflection !== 0 || requestReflection !== 0) {
    throw new Error(`Oversized receipt reached expected inputs: ${sourceReflection}/${requestReflection}`);
  }
  cases.oversizedReceiptBeforeExpectedInputs = {result: budgetResult, sourceReflection, requestReflection};

  return cases;
}
