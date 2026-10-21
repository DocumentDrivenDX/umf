// SPDX-License-Identifier: MIT OR Apache-2.0
import {readDocument} from '../../src/model/document';
import {validateDocument} from '../../src/validation/document';
import {generatePythonClient} from '../../src/access';

export function utf16Units(text: string): number[] {
  const units: number[] = [];
  for (let index = 0; index < text.length; index++) units.push(text.charCodeAt(index));
  return units;
}

export const modelText = JSON.stringify({
  umf: '0.10.0', id: 'rust-spike-r1', vocabularies: {'vendor.future': {version: '1.0.0'}, 'vendor.record.future': {version: '1.0.0'}},
  extensions: {'vendor.future': {opaque: [null, {meaning: 'not interpreted'}]}},
  modules: [{
    id: 'm', namespace: '',
    elements: [
      {id: 'id', name: 'id', kind: 'field', scalarType: 'string', cardinality: 'one', nullability: 'required', extensions: {}},
      {id: 'Item', name: 'Item', kind: 'record', members: [{module: 'm', element: 'id'}],
        keys: [{id: 'primary', name: 'primary', primary: true, fields: [{module: 'm', element: 'id'}]}],
        extensions: {'vendor.record.future': {opaque: [1, false, 'kept']} }},
    ],
    extensions: {},
  }],
});

export const recordInput = {
  identity: {module: 'm', element: 'Item'},
  values: [{field: {module: 'm', element: 'id'}, state: 'present', value: {string: 'item-1'}}],
};

/** Keep generator parity scoped to a known supported Record (no unknown Record extension). */
export function generationModel(): {text: string; model: any} {
  const model = JSON.parse(modelText);
  delete model.modules[0].elements.find((element: any) => element.id === 'Item').extensions['vendor.record.future'];
  const text = JSON.stringify(model);
  return {text, model};
}

export const sourceCorpus = [
  '{"integer":9007199254740993,"negativeZero":-0,"decimal":1.2300e+04}',
  '{"astral":"\u{1f9ed}","lone":"\\ud800"}',
  '{"duplicate":1,"duplicate":2,"tail":true}',
];

export function requests() {
  const unsupportedModel = JSON.parse(modelText);
  unsupportedModel.umf = '0.9.0';
  const unsupportedText = JSON.stringify(unsupportedModel);
  const duplicateKeySource = modelText.replace('{"umf":', '{"umf":"0.10.0","umf":');
  return [
    ...sourceCorpus.map(source => ({op: 'source-roundtrip', sourceUnits: utf16Units(source)})),
    {op: 'source-roundtrip', sourceUnits: [0xd800, 0x0041, 0xdc00]},
    {op: 'validate-record', model: JSON.parse(modelText), sourceUnits: utf16Units(modelText), record: recordInput},
    {op: 'validate-record', model: JSON.parse(modelText), sourceUnits: [0xd800, 0x0041, 0xdc00], record: recordInput, expectedCode: 'INVALID_SOURCE'},
    {op: 'validate-record', model: unsupportedModel, sourceUnits: utf16Units(unsupportedText), record: recordInput},
    {op: 'validate-record', model: JSON.parse(modelText), sourceUnits: utf16Units(duplicateKeySource), record: recordInput},
    ...generationCases().map(({model, text, recordKey}) => ({op: 'generate-keyed-record', model, sourceUnits: utf16Units(text), recordKey})),
  ];
}

function itemKeyBlock(source: string): string {
  const lines = source.split('\n');
  const classStart = lines.findIndex(line => /^class [A-Za-z_][A-Za-z0-9_]*Key:$/.test(line));
  if (classStart < 0) throw new Error('The current TypeScript generator did not emit a Key class');
  const start = lines[classStart - 1] === '@dataclass(frozen=True)' ? classStart - 1 : classStart;
  const end = lines.indexOf('', start);
  return lines.slice(start, end < 0 ? lines.length : end).join('\n');
}

export function generationCases() {
  const supported = generationModel();
  const variantModel = structuredClone(supported.model);
  variantModel.id = 'rust-spike-r1-generation-variant';
  variantModel.modules[0].elements.find((element: any) => element.id === 'id').scalarType = 'integer';
  variantModel.modules[0].elements.find((element: any) => element.id === 'Item').name = 'URLValue';
  const missingId = JSON.parse(supported.text);
  delete missingId.id;
  const malformedFieldExtensions = JSON.parse(supported.text);
  malformedFieldExtensions.modules[0].elements.find((element: any) => element.id === 'id').extensions = false;
  const invalidKeyFieldNames = ['a/b', 'a:b', 'héllo'].map(name => {
    const model = JSON.parse(supported.text);
    model.modules[0].elements.find((element: any) => element.id === 'id').name = name;
    return {caseName: `key-field-name-${name}`, model, text: JSON.stringify(model), recordKey: 'm.Item'};
  });
  const boundaryFieldNames = ['_id', 'id_', ' a ', 'a__b', 'a--b'].map(name => {
    const model = JSON.parse(supported.text);
    model.modules[0].elements.find((element: any) => element.id === 'id').name = name;
    return {caseName: `conservative-field-name-${name}`, model, text: JSON.stringify(model), recordKey: 'm.Item'};
  });
  const reservedRecordNames = ['ClassVar', 'Actions', 'Unsupported', 'SchemaMismatch', 'PreconditionFailed', 'WriteOutcomeUnknown'].map(name => {
    const model = JSON.parse(supported.text);
    model.modules[0].elements.find((element: any) => element.id === 'Item').name = name;
    return {caseName: `reserved-record-name-${name}`, model, text: JSON.stringify(model), recordKey: 'm.Item'};
  });
  const boundaryRecordNames = ['_Item', 'Item_', ' Item ', 'Item--Value'].map(name => {
    const model = JSON.parse(supported.text);
    model.modules[0].elements.find((element: any) => element.id === 'Item').name = name;
    return {caseName: `conservative-record-name-${name}`, model, text: JSON.stringify(model), recordKey: 'm.Item'};
  });
  return [
    {caseName: 'supported-item-key', ...supported, recordKey: 'm.Item'},
    {caseName: 'variation-urlvalue-integer-key', model: variantModel, text: JSON.stringify(variantModel), recordKey: 'm.Item'},
    {caseName: 'unknown-record-extension', model: JSON.parse(modelText), text: modelText, recordKey: 'm.Item'},
    {caseName: 'missing-document-id', model: missingId, text: JSON.stringify(missingId), recordKey: 'm.Item'},
    {caseName: 'non-object-field-extensions', model: malformedFieldExtensions, text: JSON.stringify(malformedFieldExtensions), recordKey: 'm.Item'},
    ...invalidKeyFieldNames,
    ...boundaryFieldNames,
    ...reservedRecordNames,
    ...boundaryRecordNames,
  ];
}

/** Expected values are computed from current UMF source; no golden output is replayed. */
export function currentTypeScriptOutcomes() {
  const model = readDocument(modelText, 'json');
  const validation = validateDocument(model);
  const unsupportedModel = JSON.parse(modelText);
  unsupportedModel.umf = '0.9.0';
  const unsupportedValidation = validateDocument(unsupportedModel);
  const generatedCases = generationCases().map(candidate => {
    try {
      const generated = generatePythonClient({text: candidate.text, package: 'r1_reference'});
      const module = generated.files.find(file => file.path === 'r1_reference/models.py');
      if (!module) throw new Error('The current TypeScript generator omitted models.py');
      return {caseName: candidate.caseName, accepted: true, pythonSource: itemKeyBlock(module.text), sourceDigest: generated.sourceDigest};
    } catch (error: any) {
      return {caseName: candidate.caseName, accepted: false, errorCode: error?.code ?? error?.name ?? 'UNKNOWN'};
    }
  });
  return {
    validation: {
      valid: validation.valid,
      complete: validation.complete,
      diagnostics: validation.diagnostics,
    },
    unsupportedValidation: {
      valid: unsupportedValidation.valid,
      complete: unsupportedValidation.complete,
      diagnostics: unsupportedValidation.diagnostics,
    },
    generationCases: generatedCases,
  };
}
