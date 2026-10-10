import {parseNativeJson, renderTree, type NativeJson} from '../model/native-json';

export type PublicCompanyRow = Record<string, string | null>;
type Node = NativeJson | undefined;
const get = (n: Node, k: string): Node => n?.kind === 'object' ? n.members[k] : undefined;
function object(n: Node): Record<string, NativeJson> {
  if (n?.kind !== 'object') throw Error('Expected SEC object');
  return n.members;
}
function array(n: Node): NativeJson[] {
  if (n?.kind !== 'array') throw Error('Expected SEC array');
  return n.items;
}
function text(n: Node, required = false): string | null {
  if (!required && (n === undefined || n.kind === 'null')) return null;
  if (n?.kind !== 'string' || (required && !n.value)) throw Error('Expected SEC string');
  return n.value;
}
function token(n: Node): string | null {
  if (n === undefined || n.kind === 'null') return null;
  if (n.kind !== 'number') throw Error('Expected SEC numeric token');
  return n.value;
}
function identity(root: NativeJson, sourceId: string): string {
  object(root);
  if (typeof sourceId !== 'string' || !sourceId || sourceId.length > 1024) throw Error('Invalid SEC source identity');
  const native = get(root, 'cik');
  const cik = native?.kind === 'string' ? native.value : token(native);
  if (!cik || !/^[0-9]{1,10}$/.test(cik) || BigInt(cik) === 0n) throw Error('Invalid SEC CIK');
  return cik.padStart(10, '0');
}
const key = (...parts: string[]) => JSON.stringify(parts);
const pointer = (s: string) => s.replaceAll('~', '~0').replaceAll('/', '~1');

/** Local supplied recent arrays only; original JSON remains the source authority. */
export function projectSecSubmissions(input: string, sourceId: string): {
  companies: PublicCompanyRow[]; identifiers: PublicCompanyRow[]; filings: PublicCompanyRow[];
} {
  const root = parseNativeJson(input), cik = identity(root, sourceId);
  const name = text(get(root, 'name'), true)!;
  const identifiers: PublicCompanyRow[] = [{id: key(sourceId, 'cik'), company_id: cik, scheme: 'SEC-CIK', native_value: cik, source_id: sourceId}];
  for (const field of ['tickers', 'exchanges']) {
    const values = get(root, field);
    if (values !== undefined) array(values).forEach((n, i) => identifiers.push({
      id: key(sourceId, field, String(i)), company_id: cik, scheme: field, native_value: text(n, true)!, source_id: sourceId,
    }));
  }
  const recent = object(get(get(root, 'filings'), 'recent'));
  const required = ['accessionNumber', 'filingDate', 'reportDate', 'form', 'primaryDocument', 'items'];
  for (const name of required) if (!Object.hasOwn(recent, name)) throw Error('Missing SEC recent column: ' + name);
  const columns = Object.entries(recent).map(([name, n]) => [name, array(n)] as const);
  const count = array(recent.accessionNumber).length;
  if (columns.some(([, values]) => values.length !== count)) throw Error('Unequal SEC recent arrays');
  const used = new Set<string>();
  const filings: PublicCompanyRow[] = [];
  for (let i = 0; i < count; i++) {
    const native: NativeJson = {kind: 'object', members: Object.fromEntries(columns.map(([name, values]) => [name, values[i]!]))};
    const accession = text(get(native, 'accessionNumber'), true)!;
    if (!/^\d{10}-\d{2}-\d{6}$/.test(accession) || used.has(accession)) throw Error('Invalid or duplicate SEC accession');
    used.add(accession);
    const primary = text(get(native, 'primaryDocument'));
    if (primary && (primary.startsWith('/') || /[\\?#:]/.test(primary) || primary.split('/').some(s => !s || s === '.' || s === '..'))) throw Error('Unsafe SEC primary document');
    const filingDate = text(get(native, 'filingDate'), true)!;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) throw Error('Invalid SEC filing date');
    filings.push({id: key(cik, accession), company_id: cik, snapshot_id: sourceId, accession,
      filing_date: filingDate, report_date: text(get(native, 'reportDate')), form: text(get(native, 'form'), true)!,
      items: text(get(native, 'items')), primary_document: primary,
      primary_url: primary ? `https://www.sec.gov/Archives/edgar/data/${BigInt(cik)}/${accession.replaceAll('-', '')}/${primary}` : null,
      native_path: '/filings/recent/' + i, native_json: renderTree(native)});
  }
  return {companies: [{id: cik, name, source_id: sourceId}], identifiers, filings};
}

/** Every standard entity-wide Company Facts observation; no deduplication or Number conversion. */
export function projectSecCompanyFacts(input: string, sourceId: string): PublicCompanyRow[] {
  const root = parseNativeJson(input), cik = identity(root, sourceId), result: PublicCompanyRow[] = [];
  for (const [taxonomy, concepts] of Object.entries(object(get(root, 'facts')))) {
    for (const [concept, definition] of Object.entries(object(concepts))) {
      const conceptJson = renderTree({kind: 'object', members: Object.fromEntries(Object.entries(object(definition)).filter(([name]) => name !== 'units'))});
      for (const [unit, observations] of Object.entries(object(get(definition, 'units')))) {
        array(observations).forEach((observation, ordinal) => {
          object(observation);
          const value = get(observation, 'val');
          const path = `/facts/${pointer(taxonomy)}/${pointer(concept)}/units/${pointer(unit)}/${ordinal}`;
          result.push({id: key(sourceId, taxonomy, concept, unit, String(ordinal)), company_id: cik, snapshot_id: sourceId,
            taxonomy, concept, unit, ordinal: String(ordinal), value: token(value),
            value_state: value === undefined ? 'absent' : value.kind === 'null' ? 'null' : 'present',
            start_date: text(get(observation, 'start')), end_date: text(get(observation, 'end')),
            accession: text(get(observation, 'accn')), filed_date: text(get(observation, 'filed')),
            form: text(get(observation, 'form')), fiscal_year: token(get(observation, 'fy')),
            fiscal_period: text(get(observation, 'fp')), frame: text(get(observation, 'frame')),
            native_path: path, native_json: renderTree(observation), concept_json: conceptJson});
        });
      }
    }
  }
  return result;
}
