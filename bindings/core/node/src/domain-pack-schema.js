// SPDX-License-Identifier: MIT OR Apache-2.0
/** Opt-in CONTRACT-052 operation over the embedded Rust canonical resource. */
export function createDomainPackSchemaOperation(domainPackSchemaJson) {
  if (typeof domainPackSchemaJson !== 'function') throw new TypeError('A Rust domain-pack schema provider is required');
  return function domainPackSchema(version) {
    if (typeof version !== 'string') throw new TypeError('Domain-pack schema version must be a string');
    const resource = domainPackSchemaJson(version);
    if (resource instanceof Error) throw resource;
    if (typeof resource !== 'string') throw new TypeError('Rust domain-pack schema provider returned a non-string resource');
    return JSON.parse(resource);
  };
}
