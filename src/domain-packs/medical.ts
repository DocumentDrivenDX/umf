import {parseNativeJson, renderTree, type NativeJson} from '../model/native-json';
import {copyJson} from '../model/json';

export type MedicalRow = Record<string, string | boolean | null>;
export type MedicalTables = Record<string, MedicalRow[]>;
type Node = NativeJson | undefined;
const get = (n: Node, k: string): Node => n?.kind === 'object' ? n.members[k] : undefined;
function array(n: Node): NativeJson[] {
  if (n === undefined) return [];
  if (n.kind !== 'array') throw Error('Expected native array');
  return n.items;
}
function text(n: Node): string | null {
  if (n === undefined || n.kind === 'null') return null;
  if (n.kind !== 'string' && n.kind !== 'number') throw Error('Expected native string or numeric token');
  return n.value;
}
const json = (n: Node): string | null => n === undefined ? null : renderTree(n);
function required(n: Node): string {
  if (n?.kind !== 'string' || !n.value) throw Error('Expected nonempty native string');
  return n.value;
}
const escaped = (s: string): string => s.replaceAll('~', '~0').replaceAll('/', '~1');
const key = (namespace: string, type: string, id: string): string => `${namespace}::${type}/${id}`;
const money = (n: Node) => ({amount: text(get(n, 'value')), currency: text(get(n, 'currency'))});

/** Selected R4 views only. Originals, exact fragments and unresolved edges remain explicit. */
export function projectMedicalFhir(inputs: {source_id: string; text: string}[], namespace: string): MedicalTables {
  if (typeof namespace !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(namespace)) throw Error('Invalid source namespace');
  const sources = copyJson(inputs) as unknown as typeof inputs;
  if (!Array.isArray(sources) || sources.some(s => !s || typeof s !== 'object' ||
    typeof s.source_id !== 'string' || !s.source_id || typeof s.text !== 'string' ||
    Object.keys(s).some(k => k !== 'source_id' && k !== 'text'))) throw Error('Invalid resource inputs');
  const t: MedicalTables = Object.fromEntries(['resources', 'coverage', 'eligibility', 'claims', 'claim_lines',
    'adjudications', 'payments', 'plans', 'enrollments', 'resource_references', 'coded_values'].map(n => [n, []]));
  const parsed = sources.map(input => {
    const node = parseNativeJson(input.text);
    const type = required(get(node, 'resourceType')), id = required(get(node, 'id'));
    if (!/^[A-Z][A-Za-z0-9]*$/.test(type) || !/^[A-Za-z0-9.-]{1,64}$/.test(id) || !input.source_id)
      throw Error('Invalid R4 resource or source identity');
    return {...input, node, type, id, resource_key: key(namespace, type, id)};
  });
  const identities = new Set(parsed.map(p => p.resource_key));
  if (identities.size !== parsed.length || new Set(sources.map(i => i.source_id)).size !== sources.length)
    throw Error('Duplicate native resource or source identity');
  for (const p of parsed) {
    const n = p.node, k = p.resource_key;
    t.resources!.push({resource_key: k, source_id: p.source_id, resource_type: p.type, native_id: p.id, resource_json: p.text});
    const common = {resource_key: k, status: text(get(n, 'status')), patient_reference: text(get(get(n, 'patient'), 'reference'))};
    if (p.type === 'Coverage') t.coverage!.push({resource_key: k, status: common.status,
      beneficiary_json: json(get(n, 'beneficiary')), subscriber_json: json(get(n, 'subscriber')),
      payors_json: json(get(n, 'payor')), classes_json: json(get(n, 'class')),
      period_start: text(get(get(n, 'period'), 'start')), period_end: text(get(get(n, 'period'), 'end')),
      benefits_json: json(get(n, 'costToBeneficiary'))});
    if (p.type === 'CoverageEligibilityRequest' || p.type === 'CoverageEligibilityResponse') t.eligibility!.push({...common,
      direction: p.type === 'CoverageEligibilityRequest' ? 'request' : 'response',
      purpose_json: json(get(n, 'purpose')), created: text(get(n, 'created')),
      serviced_json: json(get(n, 'servicedDate') ?? get(n, 'servicedPeriod')),
      request_json: json(get(n, 'request')), outcome: text(get(n, 'outcome')),
      insurance_json: json(get(n, 'insurance')), items_json: json(get(n, 'item'))});
    if (['Claim', 'ClaimResponse', 'ExplanationOfBenefit'].includes(p.type)) {
      t.claims!.push({...common, resource_type: p.type, use: text(get(n, 'use')), type_json: json(get(n, 'type')),
        created: text(get(n, 'created')), outcome: text(get(n, 'outcome')), request_json: json(get(n, 'request')),
        insurance_json: json(get(n, 'insurance')), diagnoses_json: json(get(n, 'diagnosis')),
        procedures_json: json(get(n, 'procedure')), related_json: json(get(n, 'related')), totals_json: json(get(n, 'total'))});
      const lines = (parent: Node, path: string, parentKey: string | null, member: string) => {
        const used = new Set<string>();
        array(get(parent, member)).forEach((line, index) => {
          const responseSequence = member === 'item' ? 'itemSequence' : member === 'detail' ? 'detailSequence' : 'subDetailSequence';
          const sequence = text(get(line, p.type === 'ClaimResponse' ? responseSequence : 'sequence'));
          if (!sequence || !/^[1-9][0-9]*$/.test(sequence) || used.has(sequence)) throw Error('Invalid or duplicate line sequence');
          used.add(sequence);
          const pointer = `${path}/${member}/${index}`, lineKey = `${k}${pointer}`;
          t.claim_lines!.push({line_key: lineKey, resource_key: k, parent_line_key: parentKey, native_path: pointer,
            sequence, product_json: json(get(line, 'productOrService')), modifiers_json: json(get(line, 'modifier')),
            service_json: json(get(line, 'servicedDate') ?? get(line, 'servicedPeriod')),
            quantity: text(get(get(line, 'quantity'), 'value')), unit_price: text(get(get(line, 'unitPrice'), 'value')),
            net_amount: text(get(get(line, 'net'), 'value')), net_currency: text(get(get(line, 'net'), 'currency')),
            line_json: renderTree(line)});
          array(get(line, 'adjudication')).forEach((a, i) => t.adjudications!.push({
            adjudication_key: `${lineKey}/adjudication/${i}`, resource_key: k, line_key: lineKey,
            category_json: json(get(a, 'category')), reason_json: json(get(a, 'reason')),
            ...money(get(a, 'amount')), value: text(get(a, 'value')), native_json: renderTree(a)}));
          if (member === 'item') lines(line, pointer, lineKey, 'detail');
          if (member === 'detail') lines(line, pointer, lineKey, 'subDetail');
        });
      };
      lines(n, '', null, 'item');
      if (get(n, 'payment')) t.payments!.push({payment_key: `${k}/payment`, resource_key: k,
        date: text(get(get(n, 'payment'), 'date')), ...money(get(get(n, 'payment'), 'amount')),
        allocations_json: null, native_json: renderTree(get(n, 'payment')!)});
    }
    if (p.type === 'PaymentReconciliation') t.payments!.push({payment_key: k, resource_key: k,
      date: text(get(n, 'paymentDate')), ...money(get(n, 'paymentAmount')),
      allocations_json: json(get(n, 'detail')), native_json: renderTree(n)});
    if (p.type === 'InsurancePlan') t.plans!.push({resource_key: k, status: common.status,
      name: text(get(n, 'name')), period_json: json(get(n, 'period')), owner_json: json(get(n, 'ownedBy')),
      coverage_json: json(get(n, 'coverage')), plans_json: json(get(n, 'plan'))});
    if (p.type === 'EnrollmentRequest' || p.type === 'EnrollmentResponse') t.enrollments!.push({resource_key: k,
      direction: p.type === 'EnrollmentRequest' ? 'request' : 'response', status: common.status,
      created: text(get(n, 'created')), candidate_json: json(get(n, 'candidate')),
      coverage_json: json(get(n, 'coverage')), request_json: json(get(n, 'request')), outcome: text(get(n, 'outcome'))});
    const visit = (v: NativeJson, path: string) => {
      if (v.kind === 'array') v.items.forEach((child, i) => visit(child, `${path}/${i}`));
      if (v.kind !== 'object') return;
      const reference = text(get(v, 'reference'));
      if (reference !== null) {
        const local = /^[A-Za-z][A-Za-z0-9]*\/[A-Za-z0-9.-]+$/.test(reference) ? `${namespace}::${reference}` : null;
        t.resource_references!.push({reference_key: `${k}${path}/reference`, resource_key: k,
          native_path: `${path}/reference`, native_reference: reference,
          target_key: local && identities.has(local) ? local : null});
      }
      array(get(v, 'coding')).forEach((coding, i) => t.coded_values!.push({coding_key: `${k}${path}/coding/${i}`,
        resource_key: k, native_path: `${path}/coding/${i}`, system: text(get(coding, 'system')),
        release: text(get(coding, 'version')), code: text(get(coding, 'code')), display: text(get(coding, 'display')),
        native_json: renderTree(coding)}));
      Object.entries(v.members).forEach(([name, child]) => visit(child, `${path}/${escaped(name)}`));
    };
    visit(n, '');
  }
  return t;
}

/** The specific CDC leading-causes dataset has adjusted rates and no row denominators. */
export function projectCdcMortality(textSource: string, sourceId: string): MedicalRow[] {
  if (typeof textSource !== 'string' || typeof sourceId !== 'string' || !sourceId) throw Error('Missing source text or identity');
  return array(parseNativeJson(textSource)).map((n, i) => ({measure_key: `${sourceId}/${i}`, source_id: sourceId,
    year: required(get(n, 'year')), geography: required(get(n, 'state')), geography_vintage: null,
    cause: required(get(n, 'cause_name')), case_definition: required(get(n, '_113_cause_name')),
    measure: 'underlying-cause mortality', count: required(get(n, 'deaths')), count_status: 'reported',
    adjusted_rate: required(get(n, 'aadr')), rate_status: 'reported', rate_unit: 'per 100000 population',
    adjustment: 'age-adjusted to 2000 US standard population', population_denominator: null,
    denominator_status: 'not supplied in source rows', uncertainty_json: null, native_json: renderTree(n)}));
}

/** DICOM JSON metadata only. Does not read binaries, dereference BulkDataURI or decode pixels. */
export function projectDicomMetadata(textSource: string, sourceId: string): MedicalTables {
  if (typeof textSource !== 'string' || typeof sourceId !== 'string' || !sourceId) throw Error('Missing source text or identity');
  const root = parseNativeJson(textSource);
  if (root.kind !== 'object' || !sourceId) throw Error('Expected DICOM JSON object and source ID');
  const attributes: MedicalRow[] = [];
  const visit = (dataset: NativeJson, path: string) => {
    if (dataset.kind !== 'object') throw Error('Expected DICOM dataset');
    for (const [tag, value] of Object.entries(dataset.members)) {
      if (!/^[0-9A-F]{8}$/.test(tag) || value.kind !== 'object') throw Error('Invalid DICOM JSON attribute');
      const vr = required(get(value, 'vr'));
      if (!/^[A-Z]{2}$/.test(vr)) throw Error('Invalid DICOM VR spelling');
      const nativePath = `${path}/${tag}`;
      attributes.push({attribute_key: `${sourceId}${nativePath}`, source_id: sourceId, native_path: nativePath,
        tag, vr, value_json: json(get(value, 'Value')), bulk_data_uri: text(get(value, 'BulkDataURI')),
        inline_binary: text(get(value, 'InlineBinary')), native_json: renderTree(value)});
      if (vr === 'SQ') array(get(value, 'Value')).forEach((item, i) => visit(item, `${nativePath}/Value/${i}`));
    }
  };
  visit(root, '');
  const uid = (tag: string) => {
    const values = array(get(get(root, tag), 'Value'));
    if (values.length !== 1 || text(get(get(root, tag), 'vr')) !== 'UI') throw Error('Missing single DICOM UID');
    return required(values[0]);
  };
  return {instances: [{instance_key: sourceId, source_id: sourceId,
    study_uid: uid('0020000D'), series_uid: uid('0020000E'), sop_instance_uid: uid('00080018'),
    sop_class_uid: uid('00080016'), modality: text(array(get(get(root, '00080060'), 'Value'))[0]),
    metadata_json: textSource}], attributes};
}

export interface MedicalTerminologyRecord {
  system: string; release: string; code: string; display?: string; [key: string]: unknown;
}
/** Exact local lookup; an unavailable dictionary is not evidence that a code is invalid. */
export function lookupMedicalTerminology(query: {system: string; release: string; code: string},
  records?: MedicalTerminologyRecord[]): {status: 'matched' | 'not-in-subset' | 'source-unavailable'; matches: MedicalTerminologyRecord[]} {
  const q = copyJson(query) as unknown as typeof query;
  if (Object.keys(q).some(k => !['system', 'release', 'code'].includes(k)) ||
    ![q.system, q.release, q.code].every(v => typeof v === 'string' && v.length > 0)) throw Error('Exact terminology identity required');
  if (records === undefined) return {status: 'source-unavailable', matches: []};
  const rows = copyJson(records) as unknown as MedicalTerminologyRecord[];
  if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== 'object' ||
    ![r.system, r.release, r.code].every(v => typeof v === 'string' && v.length > 0))) throw Error('Malformed terminology records');
  const matches = rows.filter(r => r.system === q.system && r.release === q.release && r.code === q.code);
  return {status: matches.length ? 'matched' : 'not-in-subset', matches};
}
