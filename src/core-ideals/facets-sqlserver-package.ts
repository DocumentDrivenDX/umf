// SPDX-License-Identifier: MIT OR Apache-2.0
/** Static SQL Server facet package metadata, separated from its legacy interpreter. */
import type {ExtensionPackage} from '../model/types';
import manifest from '../../spec/extensions/sqlserver-facets/package.json';
import schema from '../../spec/core/sqlserver-facet-classification.schema.json';
export const SQLSERVER_FACETS_EXTENSION='umf.sqlserver.facets';
export const sqlserverFacetsPackage=manifest as unknown as ExtensionPackage;
export {schema as sqlserverFacetClassificationSchema};
