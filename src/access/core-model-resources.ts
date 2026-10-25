// SPDX-License-Identifier: MIT OR Apache-2.0
// Trusted, repository-owned resources for synchronous Rust core-model routes.
import coreSchema from '../../spec/core/schema.json';
import referenceSchema from '../../spec/core/semantic-type-reference.schema.json';
import packageSchema from '../../spec/core/extension-package.schema.json';
import constraints from '../../spec/metamodel/generated/core-constraints.json';
import domainPolicy from '../../spec/metamodel/generated/domain-policy.json';

function freezeTree<T>(value:T):T {
 if(value&&typeof value==='object'){
  for(const child of Object.values(value as Record<string,unknown>))freezeTree(child);
  Object.freeze(value);
 }
 return value;
}

/** Five trusted schema/policy resources admitted by the core-model engine. */
export const CORE_MODEL_RESOURCES=freezeTree(structuredClone({
 coreSchema,referenceSchema,packageSchema,constraints,domainPolicy,
}));
