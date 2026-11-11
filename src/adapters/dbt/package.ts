// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/dbt-manifest/package.json';
import artifactManifest from '../../../spec/extensions/dbt-artifact/package.json';
import semanticManifest from '../../../spec/extensions/dbt-semantic/package.json';
import type {ExtensionPackage} from '../../model/types';

export const DBT_MANIFEST_EXTENSION='umf.dbt.manifest';
export const dbtManifestPackage=manifest as unknown as ExtensionPackage;
export const DBT_ARTIFACT_EXTENSION='umf.dbt.artifact';
export const dbtArtifactPackage=artifactManifest as unknown as ExtensionPackage;
export const DBT_SEMANTIC_MANIFEST_EXTENSION='umf.dbt.semantic';
export const dbtSemanticManifestPackage=semanticManifest as unknown as ExtensionPackage;
