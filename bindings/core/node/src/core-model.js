/** Opt-in authored core ideals over the existing tagged core request path. */
export function createCoreModelOperations(invoke) {
  const identity = (module, element) => ({module, element});
  return Object.freeze({
    selectCoreElements(source, query, extensions = []) { return invoke('model/selectCoreElements', {source, query}, extensions); },
    validateCoreFieldValue(source, field, value) {
      try { return invoke('model/validateCoreFieldValue', {source, field, value}); }
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
    inspectCoreCardinality(source, module, element) { return invoke('model/inspectCoreCardinality', {source, identity: identity(module, element)}); },
    declareCoreCardinality(source, module, element, request) { return invoke('model/declareCoreCardinality', {source, identity: identity(module, element), request}); },
    verifyCoreCardinalityDeclaration(receipt, current) { return invoke('model/verifyCoreCardinalityDeclaration', {receipt, current}); },
    inspectCoreKind(source, module, element) { return invoke('model/inspectCoreKind', {source, identity: identity(module, element)}); },
    declareCoreKind(source, module, element, kind) { return invoke('model/declareCoreKind', {source, identity: identity(module, element), kind}); },
    verifyCoreKindDeclaration(receipt, current) { return invoke('model/verifyCoreKindDeclaration', {receipt, current}); },
    inspectCoreNullability(source, module, element) { return invoke('model/inspectCoreNullability', {source, identity: identity(module, element)}); },
    declareCoreNullability(source, module, element, nullability) { return invoke('model/declareCoreNullability', {source, identity: identity(module, element), nullability}); },
    verifyCoreNullabilityDeclaration(receipt, current) { return invoke('model/verifyCoreNullabilityDeclaration', {receipt, current}); },
  });
}
