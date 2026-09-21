import { checkCore, checkCoreFields } from './schema';
import { Registry } from '../registry/registry';
import { copyJson } from '../model/json';
import { UmfError, pointer, SCALAR_TYPES, ELEMENT_KINDS, type Document, type Validation, type Diagnostic, type Json, type Scope } from '../model/types';
export function validateDocument(input: unknown, registry = new Registry()): Validation {
  const diagnostics: Diagnostic[] = [];
  const add = (code: string, path: string, message: string, severity: 'error' | 'warning' = 'error') => diagnostics.push({code, path, message, severity});
  let value: unknown;
  try { value = copyJson(input); }
  catch (error) {
    if (!(error instanceof UmfError)) throw error;
    add(error.code, error.path, error.message);
    return {valid: false, complete: false, diagnostics};
  }
  const check=(value as {umf?:unknown}|null)?.umf==='0.2.0'?checkCoreFields:checkCore;
  if (!check(value)) {
    for (const error of check.errors || []) add('STRUCTURE', error.instancePath, error.message || 'Invalid structure');
    return {valid: false, complete: false, diagnostics};
  }
  const doc = value as Document;
  if(doc.umf==='0.2.0')add('EXPERIMENTAL_CORE_FIELDS','/umf','Field envelope is experimental; provenance and native admission evidence remain incomplete','warning');
  const unknown = (obj: object, known: string[], path: string) => {
    for (const key of Object.keys(obj)) if (!known.includes(key)) add('UNKNOWN_CORE_FIELD', `${path}/${pointer(key)}`, 'Field retained without interpretation', 'warning');
  };
  unknown(doc, ['umf','id','vocabularies','modules','extensions'], '');
  for (const [id, declaration] of Object.entries(doc.vocabularies)) {
    unknown(declaration, ['version'], `/vocabularies/${pointer(id)}`);
    if (!registry.get(id, declaration.version)) add('UNKNOWN_EXTENSION', `/vocabularies/${pointer(id)}`, 'Exact extension version unavailable; content retained', 'warning');
  }
  const extensions = (payloads: Record<string, Json> | undefined, scope: Scope, path: string) => {
    for (const [id, payload] of Object.entries(payloads || {})) {
      const location = `${path}/extensions/${pointer(id)}`;
      if (!Object.hasOwn(doc.vocabularies, id)) { add('UNDECLARED_EXTENSION', location, 'Extension has no version declaration'); continue; }
      const declaration = doc.vocabularies[id]!;
      const entry = registry.get(id, declaration.version);
      if (!entry) continue;
      if (!entry.manifest.scopes.includes(scope)) { add('EXTENSION_SCOPE', location, 'Extension not permitted at this scope'); continue; }
      if (!entry.structure(payload)) {
        for (const error of entry.structure.errors || []) add('EXTENSION_STRUCTURE', location + error.instancePath, error.message || 'Invalid payload');
        continue;
      }
      if (entry.manifest.capabilities.validation !== 'semantic' || !entry.semantics) {
        add('SEMANTICS_UNCHECKED', location, 'Structure checked; semantics not validated', 'warning');
      } else {
        try { diagnostics.push(...entry.semantics(copyJson(payload), { document: copyJson(doc) as unknown as Document, path: location, scope })); }
        catch (error) { add('VALIDATOR_FAILURE', location, String(error)); }
      }
    }
  };
  extensions(doc.extensions, 'document', '');
  const modules = new Map<string, Set<string>>();
  doc.modules.forEach((module, mi) => {
    const path = `/modules/${mi}`;
    unknown(module, ['id','namespace','elements','extensions'], path);
    if (modules.has(module.id)) add('DUPLICATE_MODULE', path + '/id', 'Module id is not unique');
    const ids = new Set<string>();
    modules.set(module.id, ids);
    extensions(module.extensions, 'module', path);
    module.elements.forEach((element, ei) => {
      const location = `${path}/elements/${ei}`;
      unknown(element, ['id','name','description','scalarType','extensions','references',...(doc.umf==='0.2.0'?['kind']:[])], location);
      if(doc.umf==='0.2.0'&&element.kind!==undefined&&!(ELEMENT_KINDS as readonly unknown[]).includes(element.kind))add('UNKNOWN_ELEMENT_KIND',location+'/kind','Kind retained without interpretation','warning');
      if(element.scalarType!==undefined&&!(SCALAR_TYPES as readonly string[]).includes(element.scalarType))add('UNKNOWN_SCALAR_TYPE',location+'/scalarType','Scalar family retained without interpretation','warning');
      if (ids.has(element.id)) add('DUPLICATE_ELEMENT', location + '/id', 'Element id is not unique within module');
      ids.add(element.id);
      extensions(element.extensions, 'element', location);
      element.references?.forEach((ref, ri) => unknown(ref, ['role','module','element'], `${location}/references/${ri}`));
    });
  });
  doc.modules.forEach((module, mi) => module.elements.forEach((element, ei) => element.references?.forEach((ref, ri) => {
    if (!modules.get(ref.module)?.has(ref.element)) add('UNRESOLVED_REFERENCE', `/modules/${mi}/elements/${ei}/references/${ri}`, 'Target element does not exist in supplied document');
  })));
  return {valid: !diagnostics.some(d => d.severity === 'error'), complete: diagnostics.length === 0, diagnostics};
}
