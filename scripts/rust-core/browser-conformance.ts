// SPDX-License-Identifier: MIT OR Apache-2.0
/** Run the production Rust/WASM engine over the frozen corpus in real Chromium. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = 'docs/helix/04-build/evidence/rust-migration/r2/baseline-current-conformance.json';
const chromiumPath = process.env.UMF_CHROMIUM_PATH;
const wasmPkgPath = process.env.UMF_WASM_PKG_PATH ?? 'target/rust-core/wasm/pkg/umf_core_wasm.js';
const regexConformance = process.env.UMF_WASM_REGEX_CONFORMANCE === '1';
const schemaDepthConformance = process.env.UMF_WASM_SCHEMA_DEPTH_CONFORMANCE === '1';
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    const target = resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(root + sep)) throw new Error('outside test root');
    const body = await readFile(target);
    const type = extname(target) === '.wasm' ? 'application/wasm'
      : extname(target) === '.js' ? 'text/javascript'
      : extname(target) === '.json' ? 'application/json'
      : 'application/octet-stream';
    response.writeHead(200, {'content-type': type, 'cache-control': 'no-store'});
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Test server did not bind TCP');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({headless: true, ...(chromiumPath ? {executablePath: chromiumPath} : {})});
try {
  const page = await browser.newPage();
  const requests: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/`);
  const result = await page.evaluate(async ({origin, fixturePath, wasmPkgPath, regexConformance, schemaDepthConformance}) => {
    const get = async (path: string) => {
      const response = await fetch(`${origin}/${path}`);
      if (!response.ok) throw new Error(`Could not load qualification resource ${path}`);
      return response.json();
    };
    const [corpus, coreSchema, referenceSchema, packageSchema, constraints, domainPolicy] = await Promise.all([
      get(fixturePath),
      get('spec/core/schema.json'),
      get('spec/core/semantic-type-reference.schema.json'),
      get('spec/core/extension-package.schema.json'),
      get('spec/metamodel/generated/core-constraints.json'),
      get('spec/metamodel/generated/domain-policy.json'),
    ]);
    let regexFixture: any = null;
    let regexOutcomeLines: string[] = [];
    let infoFixture: any = null;
    let infoOutcomeLines: string[] = [];
    let hexFixture: any = null;
    let hexOutcomeLines: string[] = [];
    let python314OutcomeLines: string[] = [];
    let schemaDepthProbe: string | null = null;
    if (regexConformance) {
      regexFixture = await get('crates/umf-core/tests/fixtures/cpython-re/independent-boundaries.json');
      const regexOutcomesResponse = await fetch(`${origin}/crates/umf-core/tests/fixtures/cpython-re/independent-outcomes.tsv`);
      if (!regexOutcomesResponse.ok) throw new Error('Could not load independent CPython regex outcomes');
      regexOutcomeLines = (await regexOutcomesResponse.text()).trimEnd().split('\n');
      infoFixture = await get('crates/umf-core/tests/fixtures/cpython-re/independent-info-boundaries.json');
      const infoOutcomesResponse = await fetch(`${origin}/crates/umf-core/tests/fixtures/cpython-re/independent-info-outcomes.tsv`);
      if (!infoOutcomesResponse.ok) throw new Error('Could not load independent CPython INFO outcomes');
      infoOutcomeLines = (await infoOutcomesResponse.text()).trimEnd().split('\n');
      hexFixture = await get('crates/umf-core/tests/fixtures/cpython-re/independent-hex-boundaries.json');
      const hexOutcomesResponse = await fetch(`${origin}/crates/umf-core/tests/fixtures/cpython-re/independent-hex-outcomes.tsv`);
      if (!hexOutcomesResponse.ok) throw new Error('Could not load independent CPython hex outcomes');
      hexOutcomeLines = (await hexOutcomesResponse.text()).trimEnd().split('\n');
      const python314OutcomesResponse = await fetch(`${origin}/crates/umf-core/tests/fixtures/cpython-re/outcomes-3.14.tsv`);
      if (!python314OutcomesResponse.ok) throw new Error('Could not load CPython 3.14 profile outcomes');
      python314OutcomeLines = (await python314OutcomesResponse.text()).trimEnd().split('\n');
    }
    if (corpus.profile !== 'umf.current-conformance/1' || corpus.cases.length !== 139) throw new Error('Wrong frozen core corpus');
    const glue = await import(`${origin}/bindings/core/wasm/index.js`);
    const generated = `${origin}/${wasmPkgPath}`;
    const wasmModule = await import(generated);
    await wasmModule.default();
    let regexChecked = 0;
    let infoChecked = 0;
    let hexChecked = 0;
    let python314Checked = 0;
    if (regexConformance && (typeof wasmModule.pythonRegexProbe !== 'function'
      || regexFixture.profile !== 'umf.independent-python-re-boundaries/1' || regexFixture.cases.length !== 6372 || regexOutcomeLines.length !== 6372 * 4)) {
      throw new Error('Wrong independent CPython regex corpus/profile');
    }
    if (schemaDepthConformance) {
      if (typeof wasmModule.schemaDepthProbe !== 'function') throw new Error('Missing actual wasm32 schema-depth probe');
      schemaDepthProbe = wasmModule.schemaDepthProbe();
      if (schemaDepthProbe !== 'pass') throw new Error(`Actual wasm32 schema depth 128/129 control failed: ${schemaDepthProbe}`);
    }
    if (regexConformance) {
    if (typeof wasmModule.wideWorkProbe !== 'function') throw new Error('Missing actual wasm32 work-counter probe');
    const wideWork = JSON.parse(wasmModule.wideWorkProbe());
    if (wideWork.charged !== '8589934609' || JSON.stringify(wideWork.chunks) !== '[4294967295,4294967295,19]'
      || wideWork.refused !== true || wideWork.refusalCalls !== 1) {
      throw new Error(`Actual wasm32 wide work accounting failed: ${JSON.stringify(wideWork)}`);
    }
    // The immutable native rows carry seven fields, including '-' for no span.
    // Bind every row to its frozen input instead of accepting a partial record.
    const parseRegexOutcome = (line: string, cases: Map<string, any>, seen: Set<string>) => {
      const fields = line.split('\t');
      if (fields.length !== 7) throw new Error('Malformed seven-field CPython regex outcome');
      const [minorText, id, operation, expected, span, textCsv, patternCsv] = fields as [string, string, string, string, string, string, string];
      const item = cases.get(id);
      if (!['11', '12', '13', '14'].includes(minorText) || !item
        || !['compile', 'search'].includes(operation) || operation !== item.operation
        || textCsv !== (item.textCodepoints ?? []).join(',') || patternCsv !== item.patternCodepoints.join(',')) {
        throw new Error(`CPython regex outcome/input binding mismatch for ${id}`);
      }
      let expectedWire = expected;
      if (expected === 'M') {
        if (operation !== 'search' || !/^(?:0|[1-9]\d*),(?:0|[1-9]\d*)$/.test(span)) {
          throw new Error(`Malformed CPython regex match for ${id}`);
        }
        const [start, end] = span.split(',').map(Number) as [number, number];
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end > (item.textCodepoints ?? []).length) {
          throw new Error(`Out-of-range CPython regex match for ${id}`);
        }
        expectedWire = `M\t${start}\t${end}`;
      } else if (!['E', 'N'].includes(expected) || span !== '-') {
        throw new Error(`Malformed CPython regex refusal/no-match for ${id}`);
      }
      const identity = `${minorText}\t${id}`;
      if (seen.has(identity)) throw new Error(`Duplicate CPython regex outcome ${identity}`);
      seen.add(identity);
      return {minor: Number(minorText), id, operation, item, expectedWire};
    };
    // Normal small records check the adapter before any production observation.
    const controlCases = new Map([['control', {id: 'control', operation: 'search', patternCodepoints: [97], textCodepoints: [97]}]]);
    const matchedControl = '11\tcontrol\tsearch\tM\t0,1\t97\t97';
    if (parseRegexOutcome(matchedControl, controlCases, new Set()).expectedWire !== 'M\t0\t1'
      || parseRegexOutcome('12\tcontrol\tsearch\tN\t-\t97\t97', controlCases, new Set()).expectedWire !== 'N'
      || parseRegexOutcome('13\tcontrol\tsearch\tE\t-\t97\t97', controlCases, new Set()).expectedWire !== 'E'
      || parseRegexOutcome('14\tcontrol\tsearch\tM\t0,1\t97\t97', controlCases, new Set()).expectedWire !== 'M\t0\t1') {
      throw new Error('CPython regex outcome parser positive control failed');
    }
    const malformedControls = [
      '11\tcontrol\tsearch\tN',
      '15\tcontrol\tsearch\tN\t-\t97\t97',
      '11\tunknown\tsearch\tN\t-\t97\t97',
      '11\tcontrol\tcompile\tN\t-\t97\t97',
      '11\tcontrol\tsearch\tX\t-\t97\t97',
      '11\tcontrol\tsearch\tN\t0,1\t97\t97',
      '11\tcontrol\tsearch\tM\t-\t97\t97',
      '11\tcontrol\tsearch\tM\t0,2\t97\t97',
      '11\tcontrol\tsearch\tM\t1,0\t97\t97',
      '11\tcontrol\tsearch\tN\t-\t98\t97',
      '11\tcontrol\tsearch\tN\t-\t97\t98',
    ];
    for (const line of malformedControls) {
      let refused = false;
      try { parseRegexOutcome(line, controlCases, new Set()); } catch { refused = true; }
      if (!refused) throw new Error('CPython regex outcome parser negative control accepted');
    }
    const duplicateControl = new Set<string>();
    parseRegexOutcome(matchedControl, controlCases, duplicateControl);
    let duplicateRefused = false;
    try { parseRegexOutcome(matchedControl, controlCases, duplicateControl); } catch { duplicateRefused = true; }
    if (!duplicateRefused) throw new Error('Duplicate CPython regex outcome control accepted');
    if (wasmModule.pythonRegexProbe(15, 'search', [97], [97]) !== 'X') {
      throw new Error('CPython regex future-profile refusal control failed');
    }
    const python314FamilyCounts = new Map<string, number>([
      ['cpython-re_tests', 403],
      ['python314-boundary-and-end-empty', 1],
      ['python314-negative-boundary-empty', 1],
      ['python314-negative-boundary-word', 1],
      ['python314-z-absolute-end', 1],
      ['python314-z-strict-end', 1],
      ['unicode16-new-case-pair', 1],
      ['unicode16-new-decimal-digit', 1],
      ['unicode16-new-letter-word', 1],
      ['unicode16-new-name', 1],
    ]);
    const parsePython314Outcome = (line: string) => {
      const fields = line.split('\t');
      if (fields.length !== 6) throw new Error('Malformed six-field CPython 3.14 outcome');
      const [status, startText, endText, patternText, textText, family] = fields;
      if (status === undefined || startText === undefined || endText === undefined
        || patternText === undefined || textText === undefined || family === undefined) {
        throw new Error('Malformed six-field CPython 3.14 outcome');
      }
      if (!['E', 'M', 'N'].includes(status) || !python314FamilyCounts.has(family)) {
        throw new Error('Malformed CPython 3.14 status or family');
      }
      const parseCanonicalInteger = (value: string) => {
        if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new Error('Malformed CPython 3.14 integer');
        const parsed = Number(value);
        if (!Number.isSafeInteger(parsed)) throw new Error('Out-of-range CPython 3.14 integer');
        return parsed;
      };
      const parseCodepoints = (value: string) => value === '' ? [] : value.split(',').map((part) => {
        const codepoint = parseCanonicalInteger(part);
        if (codepoint > 0x10ffff) throw new Error('Out-of-range CPython 3.14 codepoint');
        return codepoint;
      });
      const start = parseCanonicalInteger(startText);
      const end = parseCanonicalInteger(endText);
      const patternCodepoints = parseCodepoints(patternText);
      const textCodepoints = parseCodepoints(textText);
      if (status === 'M') {
        if (start > end || end > textCodepoints.length) throw new Error('Out-of-range CPython 3.14 match span');
      } else if (start !== 0 || end !== 0) {
        throw new Error('Malformed CPython 3.14 non-match span');
      }
      return {
        family,
        patternCodepoints,
        textCodepoints,
        expectedWire: status === 'M' ? `M\t${start}\t${end}` : status,
      };
    };
    const appendixControl = parsePython314Outcome('M\t0\t1\t97\t97\tcpython-re_tests');
    if (appendixControl.expectedWire !== 'M\t0\t1'
      || appendixControl.patternCodepoints.join(',') !== '97'
      || appendixControl.textCodepoints.join(',') !== '97') {
      throw new Error('CPython 3.14 appendix parser positive control failed');
    }
    const malformedPython314Controls = [
      'M\t0\t1\t97\t97',
      'X\t0\t0\t97\t97\tcpython-re_tests',
      'M\t0\t1\t097\t97\tcpython-re_tests',
      'M\t1\t0\t97\t97\tcpython-re_tests',
      'M\t0\t1\t97\t97\tunknown-family',
    ];
    for (const line of malformedPython314Controls) {
      let refused = false;
      try { parsePython314Outcome(line); } catch { refused = true; }
      if (!refused) throw new Error('CPython 3.14 appendix parser negative control accepted');
    }
    const python314Differences = [];
    const observedPython314Families = new Map<string, number>();
    for (const [ordinal, line] of python314OutcomeLines.entries()) {
      const outcome = parsePython314Outcome(line);
      observedPython314Families.set(outcome.family, (observedPython314Families.get(outcome.family) ?? 0) + 1);
      const actual = wasmModule.pythonRegexProbe(14, 'search', outcome.patternCodepoints, outcome.textCodepoints);
      python314Checked++;
      if (actual !== outcome.expectedWire) {
        python314Differences.push({ordinal, family: outcome.family, expected: outcome.expectedWire, actual});
      }
    }
    if (python314OutcomeLines.length !== 412 || python314Checked !== 412
      || observedPython314Families.size !== python314FamilyCounts.size
      || [...python314FamilyCounts].some(([family, count]) => observedPython314Families.get(family) !== count)
      || python314Differences.length) {
      throw new Error(`Production WASM CPython 3.14 appendix mismatch (${python314Differences.length}/${python314Checked}): ${JSON.stringify(python314Differences.slice(0, 5))}`);
    }
    const regexCases = new Map<string, any>(regexFixture.cases.map((item: any): [string, any] => [item.id, item]));
    if (regexCases.size !== regexFixture.cases.length) throw new Error('Duplicate independent CPython regex case ID');
    const regexDifferences = [];
    const regexSeen = new Set<string>();
    for (const line of regexOutcomeLines) {
      const {minor, id, operation, item, expectedWire} = parseRegexOutcome(line, regexCases, regexSeen);
      const actual = wasmModule.pythonRegexProbe(minor, operation, item.patternCodepoints, item.textCodepoints ?? []);
      regexChecked++;
      if (actual !== expectedWire) regexDifferences.push({minor, id, operation, expected: expectedWire, actual});
    }
    const regexMinorCoverage = [11, 12, 13, 14].map((minor) =>
      [...regexCases.keys()].filter((id) => regexSeen.has(`${minor}\t${id}`)).length);
    if (regexChecked !== 6372 * 4 || regexDifferences.length || regexMinorCoverage.some((count) => count !== regexCases.size)) {
      throw new Error(`Production WASM Python regex corpus mismatch (${regexDifferences.length}/${regexChecked}): ${JSON.stringify(regexDifferences.slice(0, 5))}`);
    }
    const infoCases = new Map<string, any>(infoFixture.cases.map((item: any): [string, any] => [item.id, item]));
    if (infoCases.size !== infoFixture.cases.length) throw new Error('Duplicate independent CPython INFO case ID');
    if (infoFixture.profile !== 'umf.independent-python-re-info/1' || infoFixture.cases.length !== 15120 || infoOutcomeLines.length !== 15120 * 4) {
      throw new Error('Wrong independent CPython INFO corpus/profile');
    }
    const infoDifferences = [];
    const infoSeen = new Set<string>();
    for (const line of infoOutcomeLines) {
      const {minor, id, operation, item, expectedWire} = parseRegexOutcome(line, infoCases, infoSeen);
      const actual = wasmModule.pythonRegexProbe(minor, operation, item.patternCodepoints, item.textCodepoints ?? []);
      infoChecked++;
      if (actual !== expectedWire) infoDifferences.push({minor, id, operation, expected: expectedWire, actual});
    }
    const infoMinorCoverage = [11, 12, 13, 14].map((minor) =>
      [...infoCases.keys()].filter((id) => infoSeen.has(`${minor}\t${id}`)).length);
    if (infoChecked !== 15120 * 4 || infoDifferences.length || infoMinorCoverage.some((count) => count !== infoCases.size)) {
      throw new Error(`Production WASM Python INFO corpus mismatch (${infoDifferences.length}/${infoChecked}): ${JSON.stringify(infoDifferences.slice(0, 5))}`);
    }
    const hexCases = new Map<string, any>(hexFixture.cases.map((item: any): [string, any] => [item.id, item]));
    if (hexCases.size !== hexFixture.cases.length) throw new Error('Duplicate independent CPython hex case ID');
    if (hexFixture.profile !== 'umf.independent-python-re-hex/1' || hexFixture.cases.length !== 2022 || hexOutcomeLines.length !== 2022 * 4) {
      throw new Error('Wrong independent CPython hex corpus/profile');
    }
    const hexDifferences = [];
    const hexSeen = new Set<string>();
    for (const line of hexOutcomeLines) {
      const {minor, id, operation, item, expectedWire} = parseRegexOutcome(line, hexCases, hexSeen);
      const actual = wasmModule.pythonRegexProbe(minor, operation, item.patternCodepoints, item.textCodepoints ?? []);
      hexChecked++;
      if (actual !== expectedWire) hexDifferences.push({minor, id, operation, expected: expectedWire, actual});
    }
    const hexMinorCoverage = [11, 12, 13, 14].map((minor) =>
      [...hexCases.keys()].filter((id) => hexSeen.has(`${minor}\t${id}`)).length);
    if (hexChecked !== 2022 * 4 || hexDifferences.length || hexMinorCoverage.some((count) => count !== hexCases.size)) {
      throw new Error(`Production WASM Python hex corpus mismatch (${hexDifferences.length}/${hexChecked}): ${JSON.stringify(hexDifferences.slice(0, 5))}`);
    }
    }
    const engine = await glue.initializeWasm(
      () => Promise.resolve(wasmModule),
      globalThis,
      {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy},
    );
    const withExamples = (schema: any) => ({...schema, examples: Array(450_000).fill(null)});
    const combinedCatalog = glue.createEngine(wasmModule, {
      coreSchema: withExamples(coreSchema),
      referenceSchema: withExamples(referenceSchema),
      packageSchema: withExamples(packageSchema),
      constraints,
      domainPolicy,
    });
    const resourceProbe = combinedCatalog.validateDocument(corpus.cases.find((item: any) => item.valid).document);
    if (!resourceProbe || typeof resourceProbe.valid !== 'boolean') {
      throw new Error('WASM transport narrowed independently admitted 450k-value catalog resources');
    }
    const canonical = (value: any): string => Array.isArray(value)
      ? `[${value.map(canonical).join(',')}]`
      : value && typeof value === 'object'
        ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
        : JSON.stringify(value);
    const differences = [];
    for (const item of corpus.cases) {
      const registry = item.registry ? [{
        id: item.registry.id,
        version: item.registry.version,
        scopes: [item.registry.scope],
        schema: true,
        semantics(payload: any, context: any) {
          return [{
            code: 'BASELINE_CALLBACK',
            path: context.path,
            message: `${context.document.id}:${context.scope}:${payload.kind}`,
            severity: 'warning',
          }];
        },
      }] : [];
      const actual = engine.validateDocument!(item.document, registry);
      const expected = {valid: item.valid, complete: item.complete, diagnostics: item.diagnostics};
      if (canonical(actual) !== canonical(expected)) differences.push({id: item.id, actual, expected});
    }
    if (differences.length) return {status: 'fail', cases: corpus.cases.length, differences: differences.slice(0, 5), mismatchCount: differences.length};

    const callbackCase = corpus.cases.find((item: any) => item.registry);
    const surrogate = String.fromCharCode(0xd800);
    const callback = engine.validateDocument!(callbackCase.document, [{
      id: callbackCase.registry.id,
      version: callbackCase.registry.version,
      scopes: [callbackCase.registry.scope],
      schema: true,
      semantics() { return [
        {code: `HOST_SURROGATE${surrogate}`, path: `/callback${surrogate}`, message: `message${surrogate}`, severity: 'warning'},
        {code: 'HOST-É', path: '/unicode', message: 'unicode code', severity: 'warning'},
      ]; },
    }]);
    const raw = callback.diagnostics.find((item: {code: string; path: string; message: string}) => item.code.startsWith('HOST_SURROGATE'));
    if (!raw || raw.code.charCodeAt(raw.code.length - 1) !== 0xd800 || raw.path.charCodeAt(raw.path.length - 1) !== 0xd800 || raw.message.charCodeAt(raw.message.length - 1) !== 0xd800
      || !callback.diagnostics.some((item: {code: string}) => item.code === 'HOST-É')) {
      throw new Error('Raw UTF-16 callback diagnostic did not round-trip');
    }
    for (const [thrown, expected] of [
      [new Error('bad'), 'Error: bad'],
      [new TypeError('bad'), 'TypeError: bad'],
      [new RangeError('bad'), 'RangeError: bad'],
      ['bad', 'bad'],
      [new Error(`bad${surrogate}`), `Error: bad${surrogate}`],
    ] as const) {
      const failure = engine.validateDocument!(callbackCase.document, [{
        id: callbackCase.registry.id, version: callbackCase.registry.version,
        scopes: [callbackCase.registry.scope], schema: true,
        semantics() { throw thrown; },
      }]).diagnostics.find((item: {code: string}) => item.code === 'VALIDATOR_FAILURE');
      if (failure?.message !== expected) throw new Error(`WASM callback exception text changed: ${String(failure?.message)}`);
    }
    let hostileGetterCalls = 0;
    const hostile = Object.defineProperty({}, 'message', {get() { hostileGetterCalls++; throw new Error('getter invoked'); }});
    const hostileFailure = engine.validateDocument!(callbackCase.document, [{
      id: callbackCase.registry.id, version: callbackCase.registry.version,
      scopes: [callbackCase.registry.scope], schema: true,
      semantics() { throw hostile; },
    }]).diagnostics.find((item: {code: string}) => item.code === 'VALIDATOR_FAILURE');
    if (hostileFailure?.message !== 'Host callback failed' || hostileGetterCalls !== 0) {
      throw new Error('WASM callback error formatting invoked a hostile getter');
    }
    const sample = corpus.cases[0].document;
    const json = engine.writeDocument!(sample, 'json');
    const yaml = engine.writeDocument!(sample, 'yaml');
    if (canonical(engine.readDocument!(json, 'json')) !== canonical(sample)
      || canonical(engine.readDocument!(yaml, 'yaml')) !== canonical(sample)) {
      throw new Error('WASM document read/write round-trip failed');
    }
    const copied = engine.copyJson({left: 'a'.repeat(3_000_000), right: 'b'.repeat(3_000_000)}) as any;
    if (copied.left.length + copied.right.length !== 6_000_000) throw new Error('WASM copyJson imposed an aggregate 4M text limit');
    const validDocument = corpus.cases.find((item: any) => item.valid).document;
    const compact = JSON.stringify(validDocument);
    const source = compact + ' '.repeat(4_000_000 - compact.length);
    if (source.length !== 4_000_000 || canonical(engine.readDocument!(source, 'json')) !== canonical(validDocument)) {
      throw new Error('WASM four-million-unit JSON source did not round-trip');
    }
    const yamlMap = (count: number) => Array.from({length: count}, (_, index) => `k${String(index).padStart(5, '0')}: null\n`).join('');
    const acceptedYamlMap = engine.readValue(yamlMap(99_999), 'yaml') as Record<string, unknown>;
    if (Object.keys(acceptedYamlMap).length !== 99_999) throw new Error('WASM 99,999-key YAML map plus root was not accepted');
    try { engine.readValue(yamlMap(100_000), 'yaml'); throw new Error('WASM oversized YAML map was not refused'); }
    catch (error: any) { if (error.code !== 'LIMIT') throw error; }
    let meterCalls = 0;
    glue.createEngine(wasmModule, {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy}, {
      controls: {meter(amount: number) { if (amount <= 0) throw new Error('meter received no work'); meterCalls++; }},
    }).validateDocument!(validDocument);
    if (meterCalls <= 1) throw new Error('WASM host meter was not polled during Rust work');
    try {
      glue.createEngine(wasmModule, {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy}, {controls: {maxWork: 0}}).validateDocument!(validDocument);
      throw new Error('WASM work budget was ignored');
    } catch (error: any) { if (error.code !== 'RESOURCE_LIMIT') throw error; }
    let cancellationPolls = 0;
    const cancelled = glue.createEngine(wasmModule, {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy}, {
      controls: {isCancelled: () => ++cancellationPolls >= Math.max(4, Math.floor(meterCalls / 2))},
    });
    try { cancelled.validateDocument!(validDocument); throw new Error('WASM cancellation was ignored'); }
    catch (error: any) { if (error.code !== 'CANCELLED') throw error; }
    if (cancellationPolls <= 3) throw new Error('WASM cancellation did not occur after Rust work progressed');
    let clockPolls = 0;
    const deadline = glue.createEngine(wasmModule, {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy}, {
      controls: {now: () => ++clockPolls > Math.max(4, Math.floor(meterCalls / 2)) ? 101 : 99, deadlineMs: 100},
    });
    try { deadline.validateDocument!(validDocument); throw new Error('WASM injected deadline was ignored'); }
    catch (error: any) { if (error.code !== 'DEADLINE') throw error; }
    if (clockPolls <= 3) throw new Error('WASM deadline did not elapse after Rust work progressed');
    const meterFailure = glue.createEngine(wasmModule, {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy}, {
      controls: {meter() { throw new Error('meter failed'); }},
    });
    try { meterFailure.validateDocument!(validDocument); throw new Error('WASM meter exception was ignored'); }
    catch (error: any) { if (error.code !== 'METER_FAILURE' || error.message !== 'Error: meter failed') throw error; }
    let reentered = false;
    const nestedEngine = glue.createEngine(wasmModule, {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy});
    const outerEngine = glue.createEngine(wasmModule, {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy}, {
      controls: {meter() { if (!reentered) { reentered = true; nestedEngine.validateDocument!(validDocument); } }},
    });
    outerEngine.validateDocument!(validDocument);
    if (!reentered) throw new Error('WASM host-control reentry was not exercised');
    const nested = (count: number) => {
      let value: any = 'leaf';
      for (let index = 0; index < count; index++) value = {x: value};
      return value;
    };
    engine.copyJson(nested(128));
    try {
      engine.copyJson(nested(129), {maxDepth: 256});
      throw new Error('WASM depth-129 value was not refused');
    } catch (error: any) {
      if (error.code !== 'LIMIT') throw error;
    }
    const inventoryDepth128 = structuredClone(validDocument);
    inventoryDepth128.modules[0].elements[0].extensions.r2Boundary = nested(122);
    engine.validateDocument!(inventoryDepth128);
    const inventoryDepth129 = structuredClone(validDocument);
    inventoryDepth129.modules[0].elements[0].extensions.r2Boundary = nested(123);
    try {
      engine.validateDocument!(inventoryDepth129);
      throw new Error('WASM depth-129 module extension was not refused');
    } catch (error: any) {
      if (error.code !== 'LIMIT') throw error;
    }
    try {
      await glue.initializeWasm(() => { throw new Error('loader must not run'); }, globalThis, undefined, {profile: 'hard-isolated'});
      throw new Error('HardIsolated profile unexpectedly initialized');
    } catch (error: any) {
      if (error.code !== 'RESOURCE_PROFILE_UNAVAILABLE') throw error;
    }
    return {status: 'pass', engineVersion: engine.engineVersion, wasmQualification: regexConformance ? 'python-regex-feature' : 'default-production', cases: corpus.cases.length,
      ...(regexConformance ? {regexOutcomeParserControls: 16, python314AppendixParserControls: 6, python314AppendixComparisons: python314Checked,
        wideWorkCounter: 'u64-portable-chunks-and-refusal', pythonRegexCasesPerProfile: regexFixture.cases.length, pythonRegexComparisons: regexChecked,
        pythonRegexInfoCasesPerProfile: infoFixture.cases.length, pythonRegexInfoComparisons: infoChecked,
        pythonRegexHexCasesPerProfile: hexFixture.cases.length, pythonRegexHexComparisons: hexChecked,
        pythonRegexProfiles: [11, 12, 13, 14]} : {}),
      ...(schemaDepthConformance ? {schemaDepth128Accepted129Refused: schemaDepthProbe === 'pass', annotatedVisitorDepth128Accepted129Refused: schemaDepthProbe === 'pass'} : {}),
      rawSurrogateCallback: true, jsonYamlRoundTrip: true, copiedTextUnits: 6_000_000, sourceTextUnits: 4_000_000, maxDocumentDepth: 128,
      inventoryExtensionDepth: {accepted: 122, refused: 123}, hostControls: ['meter', 'cancel', 'deadline', 'reentry']};
  }, {origin, fixturePath, wasmPkgPath, regexConformance, schemaDepthConformance});
  if (requests.some((url) => !url.startsWith(origin + '/'))) throw new Error('Browser qualification attempted an external request');
  if (pageErrors.length) throw new Error(`Chromium page error: ${pageErrors.join('; ')}`);
  if ((result as any).status !== 'pass') throw new Error(`WASM corpus mismatches: ${JSON.stringify(result)}`);
  console.log(JSON.stringify({...(result as object), chromium: browser.version(), externalRequests: 0}));
} finally {
  await browser.close();
  await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
}
