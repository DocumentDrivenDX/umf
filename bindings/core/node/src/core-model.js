/** Opt-in authored core ideals over the existing tagged core request path. */
export function createCoreModelOperations(invoke, {ErrorType = Error} = {}) {
  const identity = (module, element) => ({module, element});
  const preparedCardinalityReceipts = new WeakMap();
  const preparedFacetReceipts = new WeakMap();
  const properties = (op, args) => {
    try { return invoke(op, args); }
    catch (error) {
      if (error?.code === 'CORE_SCHEMA_PROPERTIES' || error?.code === 'CORE_SCHEMA_PROPERTY_UNKNOWN') {
        const converted = new ErrorType(error.code, error.message, error.path ?? '');
        throw converted;
      }
      throw error;
    }
  };
  return Object.freeze({
    selectCoreElements(source, query, extensions = []) { return invoke('model/selectCoreElements', {source, query}, extensions); },
    validateCoreFieldValue(source, field, value) {
      try { return invoke('model/validateCoreFieldValue', {source, field, value}); }
      catch (error) {
        if (error?.code === 'TYPE_ERROR') throw new TypeError(error.message);
        throw error;
      }
    },
    validateCoreRecordValues(source, identity, values) {
      try { return invoke('model/validateCoreRecordValues', {source, identity, values}); }
      catch (error) {
        if (error?.code === 'TYPE_ERROR') throw new TypeError(error.message);
        throw error;
      }
    },
    resolveCoreDefault(source, field, state) {
      try {
        const receipt = invoke('model/resolveCoreDefault', {source, field, state});
        // The TypeScript predecessor returns its copied input state directly
        // as result when no default applies; preserve that observable alias.
        if (!receipt.applied) receipt.result = receipt.input;
        return receipt;
      }
      catch (error) {
        if (error?.code === 'TYPE_ERROR') throw new TypeError(error.message);
        throw error;
      }
    },
    inspectCoreSchemaProperties(source, identity) { return properties('model/inspectCoreSchemaProperties', {source, identity}); },
    inspectCoreScalarType(source, identity) { return invoke('model/inspectCoreScalarType', {source, identity}); },
    inspectCoreRecordMembers(source, identity) { return invoke('model/inspectCoreRecordMembers', {source, identity}); },
    inspectCoreReferenceLinks(source, identity) { return invoke('model/inspectCoreReferenceLinks', {source, identity}); },
    inspectCoreSemanticTypes(source, identity) { return invoke('model/inspectCoreSemanticTypes', {source, identity}); },
    getCoreSemanticTypes(source, identity) {
      const result = invoke('model/getCoreSemanticTypes', {source, identity});
      return result && typeof result === 'object' && !Array.isArray(result) && Reflect.ownKeys(result).length === 1 && result.$umf === 'undefined' ? undefined : result;
    },
    declareCoreSemanticTypes(source, identity, types) {
      const args = {source, identity}; if (types !== undefined) args.types = types;
      return invoke('model/declareCoreSemanticTypes', args);
    },
    verifyCoreSemanticTypeDeclaration(receipt, current) { return invoke('model/verifyCoreSemanticTypeDeclaration', {receipt, current}); },
    getSemanticTypes(document, module, element) { return invoke('extensions/getSemanticTypes', {document, module, element}); },
    setSemanticTypes(document, module, element, annotation) {
      const args = {document, module, element}; if (annotation !== undefined) args.annotation = annotation;
      return invoke('extensions/setSemanticTypes', args);
    },
    inspectCoreFacets(source, identity) { return invoke('model/inspectCoreFacets', {source, identity}); },
    declareCoreFacets(source, identity, request) { return invoke('model/declareCoreFacets', {source, identity, request}); },
    verifyCoreFacetDeclaration(receipt, current) { return invoke('model/verifyCoreFacetDeclaration', {receipt, current}); },
    admitCoreFacetRequest(request) { return invoke('model/admitCoreFacetRequest', {request}); },
    prepareCoreFacetVerification(receipt) {
      const prepared = invoke('model/prepareCoreFacetVerification', {receipt});
      const handle = Object.freeze(Object.create(null));
      preparedFacetReceipts.set(handle, prepared);
      return handle;
    },
    finishCoreFacetVerification(handle, current) {
      if (!handle || typeof handle !== 'object' || !preparedFacetReceipts.has(handle)) {
        throw new TypeError('Invalid private facet verification handle');
      }
      const prepared = preparedFacetReceipts.get(handle);
      preparedFacetReceipts.delete(handle);
      return invoke('model/finishCoreFacetVerification', {prepared, current});
    },
    historicalCoreFacetPatch(input) { return invoke('model/historicalCoreFacetPatch', {input}); },
    declareCoreSchemaProperties(source, identity, patch) { return properties('model/declareCoreSchemaProperties', {source, identity, patch}); },
    inspectCoreCardinality(source, module, element) { return invoke('model/inspectCoreCardinality', {source, identity: identity(module, element)}); },
    inspectCoreCardinalityIdentity(source, identity) { return invoke('model/inspectCoreCardinality', {source, identity}); },
    declareCoreCardinality(source, module, element, request) { return invoke('model/declareCoreCardinality', {source, identity: identity(module, element), request}); },
    declareCoreCardinalityIdentity(source, identity, request) { return invoke('model/declareCoreCardinality', {request, source, identity}); },
    verifyCoreCardinalityDeclaration(receipt, current) { return invoke('model/verifyCoreCardinalityDeclaration', {receipt, current}); },
    admitCoreCardinalityRequest(request) { return invoke('model/admitCoreCardinalityRequest', {request}); },
    prepareCoreCardinalityVerification(receipt) {
      const prepared = invoke('model/prepareCoreCardinalityVerification', {receipt});
      const handle = Object.freeze(Object.create(null));
      preparedCardinalityReceipts.set(handle, prepared);
      return handle;
    },
    finishCoreCardinalityVerification(handle, current) {
      if (!handle || typeof handle !== 'object' || !preparedCardinalityReceipts.has(handle)) {
        throw new TypeError('Invalid private cardinality verification handle');
      }
      const prepared = preparedCardinalityReceipts.get(handle);
      preparedCardinalityReceipts.delete(handle);
      return invoke('model/finishCoreCardinalityVerification', {prepared, current});
    },
    inspectCoreKind(source, module, element) { return invoke('model/inspectCoreKind', {source, identity: identity(module, element)}); },
    declareCoreKind(source, module, element, kind) { return invoke('model/declareCoreKind', {source, identity: identity(module, element), kind}); },
    verifyCoreKindDeclaration(receipt, current) { return invoke('model/verifyCoreKindDeclaration', {receipt, current}); },
    inspectCoreNullability(source, module, element) { return invoke('model/inspectCoreNullability', {source, identity: identity(module, element)}); },
    declareCoreNullability(source, module, element, nullability) { return invoke('model/declareCoreNullability', {source, identity: identity(module, element), nullability}); },
    verifyCoreNullabilityDeclaration(receipt, current) { return invoke('model/verifyCoreNullabilityDeclaration', {receipt, current}); },
  });
}
