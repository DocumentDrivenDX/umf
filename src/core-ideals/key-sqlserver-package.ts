// SPDX-License-Identifier: MIT OR Apache-2.0
// Static package data for the Rust-owned SQL Server key classifier.
import type {ExtensionPackage} from '../model/types';
import manifest from '../../spec/extensions/sqlserver-keys/package.json';
export const SQLSERVER_KEYS_EXTENSION='umf.sqlserver.keys';
export const sqlserverKeysPackage=manifest as unknown as ExtensionPackage;
export {default as sqlserverKeyClassificationSchema} from '../../spec/core/sqlserver-key-classification.schema.json';
