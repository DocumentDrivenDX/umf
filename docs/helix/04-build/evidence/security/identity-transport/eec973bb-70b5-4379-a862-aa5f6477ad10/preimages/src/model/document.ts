import { readJsonValue, writeJsonValue } from './serialization';
import { copyJson } from './json';
import { validateDocument } from '../validation/document';
import { Registry } from '../registry/registry';
import { UmfError, type Document, type Json } from './types';
export function readDocument(text: string, format: 'json' | 'yaml' = 'yaml'): Document {
  const value = readJsonValue(text, format);
  const result = validateDocument(value);
  if (!result.valid) throw new UmfError('INVALID_DOCUMENT', JSON.stringify(result.diagnostics));
  return value as unknown as Document;
}
export function writeDocument(value: Document, format: 'json' | 'yaml' = 'yaml'): string {
  const result = validateDocument(value);
  if (!result.valid) throw new UmfError('INVALID_DOCUMENT', JSON.stringify(result.diagnostics));
  return writeJsonValue(value, format);
}
/** Atomic update; unknown dependencies conservatively block edits until interpreted. */
export function editExtension(input: Document, registry: Registry, moduleId: string, elementId: string, extensionId: string, update: (payload: Json) => Json): Document {
  const initial = validateDocument(input, registry);
  if (!initial.valid || !initial.complete) throw new UmfError('UNSAFE_EDIT', 'All present semantics must be validated before editing');
  const result = copyJson(input) as unknown as Document;
  const element = result.modules.find(m => m.id === moduleId)?.elements.find(e => e.id === elementId);
  if (!element || !Object.hasOwn(element.extensions, extensionId)) throw new UmfError('MISSING_ELEMENT', 'Extension instance not found');
  element.extensions[extensionId] = copyJson(update(copyJson(element.extensions[extensionId]!)));
  const checked = validateDocument(result, registry);
  if (!checked.valid || !checked.complete) throw new UmfError('INVALID_EDIT', JSON.stringify(checked.diagnostics));
  return result;
}
