import {encodeRequestWire, fromWire, resultError} from './wire.js';

export const SECURITY_FUNCTIONS_PROFILE = 'umf.security-functions/1';

/** Create an opt-in engine for the CONTRACT-062 pure protection reference subset. */
export function createSecurityFunctionsEngine(execute, ErrorType = Error) {
  if (typeof execute !== 'function') throw new Error('RUST_BINDING_MISSING');
  function invoke(op, body) {
    const wire = encodeRequestWire({profile: SECURITY_FUNCTIONS_PROFILE, op, ...body});
    const response = JSON.parse(execute(wire));
    const failure = resultError(response);
    if (failure) throw new ErrorType(failure.code, failure.message, failure.path);
    return fromWire(JSON.parse(response.wire));
  }
  return Object.freeze({
    inspectProtectionFunction(policy, catalog, closure, selection) {
      return invoke('inspectProtectionFunction', {policy, catalog, closure, selection});
    },
    evaluateProtectionValue(policy, catalog, closure, selection) {
      return invoke('evaluateProtectionValue', {policy, catalog, closure, selection});
    },
    catalogRecipe(input) { return invoke('catalogRecipe', {input}); },
    inspectCandidateLiteral(source, field, value, limits) {
      return invoke('inspectCandidateLiteral', {source, field, value, ...limits});
    },
    inspectCoreCandidateLiteral(source, field, value, limits) {
      return invoke('inspectCoreCandidateLiteral', {source, field, value, ...limits});
    },
    compareCatalogWrite(input) {
      return invoke('compareCatalogWrite', {input});
    },
    foldCatalogWriteDecisions(decisions) {
      return invoke('foldCatalogWriteDecisions', {decisions});
    },
    planCatalogWriteIncidence(input) {
      return invoke('planCatalogWriteIncidence', {input});
    },
    admitCatalogWriteProfiles(input) {
      return invoke('admitCatalogWriteProfiles', {input});
    },
    catalogWriteReadNeeds(decisions) { return invoke('catalogWriteReadNeeds', {decisions}); },
    resolveCatalogWriteRead(input) { return invoke('resolveCatalogWriteRead', {input}); },
    planCatalogWriteActions(input) { return invoke('planCatalogWriteActions', {input}); },
    validateCatalogWriteDependencies(input) { return invoke('validateCatalogWriteDependencies', {input}); },
    admitCatalogWriteAssociations(input) { return invoke('admitCatalogWriteAssociations', {input}); },
    validateCatalogWriteCoverage(input) { return invoke('validateCatalogWriteCoverage', {input}); },
  });
}
