// SPDX-License-Identifier: MIT OR Apache-2.0
// Trusted source-pinned resources used only to initialize the Rust codegen engine.
import coreSchema from '../../spec/core/schema.json';
import referenceSchema from '../../spec/core/semantic-type-reference.schema.json';
import packageSchema from '../../spec/core/extension-package.schema.json';
import constraints from '../../spec/metamodel/generated/core-constraints.json';
import domainPolicy from '../../spec/metamodel/generated/domain-policy.json';
import tablesPackage from '../../spec/extensions/tables/package.json';
import actionsPackage from '../../spec/extensions/actions/package.json';
import bindingPackage from '../../spec/extensions/binding/package.json';
import stableBindingPackage from '../../spec/extensions/binding-stable/package.json';

function freezeTree<T>(value:T):T {
 if(value&&typeof value==='object'){
  for(const child of Object.values(value as Record<string,unknown>))freezeTree(child);
  Object.freeze(value);
 }
 return value;
}

/** The nine immutable, repository-owned compiler inputs; caller data never supplies these. */
export const CODEGEN_RESOURCES=freezeTree({
 coreSchema,referenceSchema,packageSchema,constraints,domainPolicy,
 tablesPackage,actionsPackage,bindingPackage,stableBindingPackage,
});
