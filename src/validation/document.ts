import {validateRelationshipCandidate} from './relationships';
import {validateKeyCandidate} from './keys';
import { checkCore, checkCoreFields, checkCoreNullability, checkCoreCardinality, checkCoreFacets, checkCoreKeys, checkCoreRelationships } from './schema';
import {validateFacetElement} from './facets';
import { Registry } from '../registry/registry';
import { copyJson } from '../model/json';
import { UmfError, pointer, SCALAR_TYPES, ELEMENT_KINDS, NULLABILITIES, CARDINALITIES, type Element, type Document, type Validation, type Diagnostic, type Json, type Scope } from '../model/types';
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
  const version=(value as {umf?:unknown}|null)?.umf;
  const check=version==='0.7.0'?checkCoreRelationships:version==='0.6.0'?checkCoreKeys:version==='0.5.0'?checkCoreFacets:version==='0.4.0'?checkCoreCardinality:version==='0.3.0'?checkCoreNullability:version==='0.2.0'?checkCoreFields:checkCore;
  if (!check(value)) {
    for (const error of check.errors || []) add('STRUCTURE', error.instancePath, error.message || 'Invalid structure');
    return {valid: false, complete: false, diagnostics};
  }
  const doc = value as Document;
  const relationshipProfile=doc.umf==='0.7.0',keyProfile=doc.umf==='0.6.0'||relationshipProfile,facets=doc.umf==='0.5.0'||keyProfile,containers=doc.umf==='0.4.0'||facets;
  const availability=doc.umf==='0.3.0'||containers;
  if(doc.umf==='0.2.0')add('EXPERIMENTAL_CORE_FIELDS','/umf','Field envelope is experimental; kind labels alone establish neither author provenance nor native equivalence','warning');
  if(availability)add('EXPERIMENTAL_CORE_NULLABILITY','/umf','Nullability envelope is experimental; no native absence encoding or default execution is implied','warning');
  if(containers)add('EXPERIMENTAL_CORE_CARDINALITY','/umf','Cardinality envelope is experimental; native shape and item semantics require explicit bindings','warning');
  if(facets)add('EXPERIMENTAL_CORE_FACETS','/umf','Facet envelope is experimental; bounds do not establish native enforcement or value conversion','warning');
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
  const definitions = new Map<string, Map<string,Element>>();
  doc.modules.forEach((module, mi) => {
    const path = `/modules/${mi}`;
    unknown(module, ['id','namespace','elements','extensions',...(relationshipProfile?['relationships']:[])], path);
    if (modules.has(module.id)) add('DUPLICATE_MODULE', path + '/id', 'Module id is not unique');
    const ids = new Set<string>();
    modules.set(module.id, ids);
    definitions.set(module.id,new Map(module.elements.map(e=>[e.id,e])));
    extensions(module.extensions, 'module', path);
    module.elements.forEach((element, ei) => {
      const location = `${path}/elements/${ei}`;
      unknown(element, ['id','name','description','scalarType','extensions','references',...(doc.umf!=='0.1.0'?['kind']:[]),...(availability?['nullability']:[]),...(containers?['cardinality','itemType']:[]),...(facets?['facets']:[]),...(keyProfile?['keys','members']:[])], location);
      if(doc.umf!=='0.1.0'&&element.kind!==undefined&&!(ELEMENT_KINDS as readonly unknown[]).includes(element.kind))add('UNKNOWN_ELEMENT_KIND',location+'/kind','Kind retained without interpretation','warning');
      if(availability&&element.nullability!==undefined&&!(NULLABILITIES as readonly unknown[]).includes(element.nullability))add('UNKNOWN_NULLABILITY',location+'/nullability','Availability label retained without interpretation','warning');
      if(containers&&element.cardinality!==undefined&&!(CARDINALITIES as readonly unknown[]).includes(element.cardinality))add('UNKNOWN_CARDINALITY',location+'/cardinality','Container label retained without interpretation','warning');
      if(containers&&element.itemType)unknown(element.itemType as object,['module','element'],location+'/itemType');
      if(facets&&Object.hasOwn(element,'facets'))diagnostics.push(...validateFacetElement(element,location).diagnostics);
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
  if(containers)doc.modules.forEach((module,mi)=>module.elements.forEach((element,ei)=>{
    if(!Object.hasOwn(element,'itemType'))return;
    const ref=element.itemType as {module:string;element:string},target=definitions.get(ref.module)?.get(ref.element),path=`/modules/${mi}/elements/${ei}/itemType`;
    if(!target)add('UNRESOLVED_ITEM_TYPE',path,'Item/value Field does not exist in supplied document');
    else if(target.kind!=='field')add('ITEM_TYPE_ROLE',path,'Item/value definition must be an explicit Field');
  }));
  if(relationshipProfile)diagnostics.push(...validateRelationshipCandidate(doc,false).diagnostics);
  else if(keyProfile)diagnostics.push(...validateKeyCandidate(doc,false).diagnostics);
  return {valid: !diagnostics.some(d => d.severity === 'error'), complete: diagnostics.length === 0, diagnostics};
}
