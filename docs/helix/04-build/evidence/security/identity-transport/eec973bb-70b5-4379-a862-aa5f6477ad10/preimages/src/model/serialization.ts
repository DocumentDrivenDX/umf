import { parseDocument, isMap, isSeq, isScalar, isAlias, stringify } from 'yaml';
import { copyJson, LIMITS } from './json';
import { UmfError, type Json, pointer } from './types';

// Compare decimal values without rounding, without expanding an exponent.
function decimal(text: string): string {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw new UmfError('NUMBER', 'Unsupported numeric spelling');
  const digits = ((match[2] || '') + (match[3] || '')).replace(/^0+/, '');
  if (!digits) return '0';
  const trimmed = digits.replace(/0+$/, '');
  const exponent = BigInt(match[4] || '0') - BigInt((match[3] || '').length) + BigInt(digits.length - trimmed.length);
  return `${match[1] === '-' ? '-' : ''}${trimmed}e${exponent}`;
}
export function readJsonValue(text: string, format: 'json' | 'yaml' = 'yaml'): Json {
  if (text.length > LIMITS.maxTextLength) throw new UmfError('LIMIT', 'Source text exceeds limit');
  if (format === 'json') {
    try { JSON.parse(text); } catch { throw new UmfError('SYNTAX', 'Invalid JSON syntax'); }
  }
  const doc = parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true, intAsBigInt: true, strict: true });
  if (doc.errors.length || doc.warnings.length) throw new UmfError('SYNTAX', [...doc.errors, ...doc.warnings].map(x => x.message).join('; '));
  if (doc.directives?.yaml.version !== '1.2') throw new UmfError('SYNTAX', 'Only YAML 1.2 is supported');
  let count = 0;
  function convert(node: unknown, path: string, depth: number): Json {
    if (++count > LIMITS.maxValues || depth > LIMITS.maxDepth) throw new UmfError('LIMIT', 'Source structural limit exceeded', path);
    if (node === null) return null;
    if (isAlias(node)) throw new UmfError('ALIAS', 'YAML aliases are outside the JSON-compatible profile', path);
    if ((isScalar(node) || isMap(node) || isSeq(node)) && node.tag) throw new UmfError('TAG', 'Explicit YAML tags are outside the profile', path);
    if (isScalar(node)) {
      let value: unknown = node.value;
      if (typeof value === 'bigint') {
        const number = Number(value);
        if (!Number.isSafeInteger(number)) throw new UmfError('NUMBER', 'Integer exceeds exact JavaScript range', path);
        value = number;
      }
      if (typeof value === 'number' && node.source) {
        if (Number.isFinite(value) && !/^[-+]?0[xo]/i.test(node.source) && decimal(node.source) !== decimal(String(value))) throw new UmfError('NUMBER', 'Parsing would change the decimal value', path);
        if (/^-0(?:\.0*)?(?:[eE][+-]?\d+)?$/.test(node.source)) throw new UmfError('NUMBER', 'Negative zero is outside the numeric profile', path);
      }
      return copyJson(value);
    }
    if (isSeq(node)) return node.items.map((item, i) => convert(item, `${path}/${i}`, depth + 1));
    if (isMap(node)) {
      const result: Record<string, Json> = Object.create(null);
      for (const pair of node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || pair.key.tag) throw new UmfError('KEY', 'Mappings require untagged string keys', path);
        const key = pair.key.value;
        if (Object.hasOwn(result, key)) throw new UmfError('DUPLICATE_KEY', 'Duplicate mapping key', path);
        result[key] = convert(pair.value, `${path}/${pointer(key)}`, depth + 1);
      }
      return result;
    }
    throw new UmfError('NON_JSON', 'Unsupported YAML node', path);
  }
  return convert(doc.contents, '', 0);
}
export function writeJsonValue(value: unknown, format: 'json' | 'yaml' = 'yaml'): string {
  const json = copyJson(value);
  const output = format === 'json' ? JSON.stringify(json, null, 2) + '\n' : stringify(json, { version: '1.2', aliasDuplicateObjects: false, lineWidth: 0 });
  if (output.length > LIMITS.maxTextLength) throw new UmfError('LIMIT', 'Serialized text exceeds limit');
  return output;
}
