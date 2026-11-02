// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../model/types';
import manifest from '../../spec/extensions/sqlserver-relationships/package.json';

export const SQLSERVER_RELATIONSHIPS_EXTENSION = 'umf.sqlserver.relationships';
export const sqlserverRelationshipsPackage = manifest as unknown as ExtensionPackage;
export {default as sqlserverRelationshipClassificationSchema} from '../../spec/core/sqlserver-relationship-classification.schema.json';
