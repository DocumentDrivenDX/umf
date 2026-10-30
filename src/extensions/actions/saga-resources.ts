// SPDX-License-Identifier: MIT OR Apache-2.0
/** Exact local resources for the coupled SDK's shared saga runtime. */
import coreSchema from '../../../spec/core/schema.json';
import referenceSchema from '../../../spec/core/semantic-type-reference.schema.json';
import packageSchema from '../../../spec/core/extension-package.schema.json';
import constraints from '../../../spec/metamodel/generated/core-constraints.json';
import domainPolicy from '../../../spec/metamodel/generated/domain-policy.json';
import tablesPackage from '../../../spec/extensions/tables/package.json';
import actionsPackage from '../../../spec/extensions/actions/package.json';
import bindingPackage from '../../../spec/extensions/binding/package.json';
import stableBindingPackage from '../../../spec/extensions/binding-stable/package.json';
import sagaPackage from '../../../spec/extensions/saga/package.json';
import {copyJson} from '../../model/json';
/** The host selects and initializes native/WASM; resource data never loads code. */
export function createSagaResources() {
 return copyJson({coreSchema,referenceSchema,packageSchema,constraints,domainPolicy,tablesPackage,actionsPackage,bindingPackage,stableBindingPackage,sagaPackage}) as unknown as {coreSchema:unknown;referenceSchema:unknown;packageSchema:unknown;constraints:unknown;domainPolicy:unknown;tablesPackage:unknown;actionsPackage:unknown;bindingPackage:unknown;stableBindingPackage:unknown;sagaPackage:unknown};
}
