import {scanJsonFrame} from './internal/scan-json-frame';
import { parseDocument, isMap, isSeq, isScalar, isAlias, stringify } from 'yaml';
import { copyJson, LIMITS, jsonValueLimit } from './json';
import { UmfError, type Json, pointer } from './types';

import {decimal,assertExactJsonNumber} from './internal/json-number';
export {assertExactJsonNumber} from './internal/json-number';
export function readJsonValue(text: string, format: 'json' | 'yaml' = 'yaml'): Json {
  if (text.length > LIMITS.maxTextLength) throw new UmfError('LIMIT', 'Source text exceeds limit');
  // Explicit catalog scope reuses the qualified bounded JSON frame scanner.
  // Ordinary JSON/YAML reads retain their original YAML parser path.
  if(format==='json'&&jsonValueLimit()>LIMITS.maxValues){
    try {scanJsonFrame(text,jsonValueLimit(),LIMITS.maxDepth);return JSON.parse(text) as Json;}
    catch(error){throw error;}
  }
  if (format === 'json') {
    try { JSON.parse(text); } catch { throw new UmfError('SYNTAX', 'Invalid JSON syntax'); }
  }
  const doc = parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true, intAsBigInt: true, strict: true });
  if (doc.errors.length || doc.warnings.length) throw new UmfError('SYNTAX', [...doc.errors, ...doc.warnings].map(x => x.message).join('; '));
  if (doc.directives?.yaml.version !== '1.2') throw new UmfError('SYNTAX', 'Only YAML 1.2 is supported');
  let count = 0;
  function convert(node: unknown, path: string, depth: number): Json {
    if (++count > jsonValueLimit() || depth > LIMITS.maxDepth) throw new UmfError('LIMIT', 'Source structural limit exceeded', path);
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
