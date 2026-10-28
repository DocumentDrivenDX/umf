import {parseNativeYaml} from '../../../../../../src/model/native-json.ts';

const cases = [
  ['yaml11-boolean-lexicon', 'a: yes\nb: ON\nc: no\nd: OFF', {version: '1.1'}],
  ['yaml11-date-unsupported', 'value: 2024-02-29', {version: '1.1'}],
  ['yaml11-date-as-string', 'value: 2024-02-29', {version: '1.1', dateOnly: 'string'}],
  ['yaml11-time-as-string', 'value: 2024-02-29T12:30:00Z', {version: '1.1', dateOnly: 'string'}],
  ['yaml11-pyyaml-boolean-lexicon', 'a: y\nb: n\nc: yes\nd: on', {version: '1.1', booleanLexicon: 'pyyaml'}],
  ['invalid-version-precedes-syntax', 'x: [', {version: '1.0'}],
  ['null-version-precedes-syntax', 'x: [', {version: null}],
  ['numeric-version-precedes-syntax', 'x: [', {version: 11}],
];

const results = cases.map(([id, source, options]) => {
  try { return {id, source, options, outcome: 'return', tree: parseNativeYaml(source, options)}; }
  catch (error) { return {id, source, options, outcome: 'throw', code: error.code, message: error.message}; }
});
const packet = {profile: 'umf-r8-native-yaml-options-predecessor/0.1.0', source: 'direct TypeScript parseNativeYaml predecessor', cases: results};
console.log(JSON.stringify(packet, null, 2));
