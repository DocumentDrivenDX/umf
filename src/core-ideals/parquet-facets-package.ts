// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../model/types';
import manifest from '../../spec/extensions/parquet-facets/package.json';
export const PARQUET_FACETS_EXTENSION='umf.parquet.facets';
export const parquetFacetsPackage=manifest as unknown as ExtensionPackage;
export {default as parquetFacetClassificationSchema} from '../../spec/core/parquet-facet-classification.schema.json';
