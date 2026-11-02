// SPDX-License-Identifier: MIT OR Apache-2.0
// Static package data for the Rust-owned SQL Server nullability classifier.
import type {ExtensionPackage} from '../model/types';
import manifest from '../../spec/extensions/sqlserver-nullability/package.json';
export const SQLSERVER_NULLABILITY_EXTENSION='umf.sqlserver.nullability';
export const sqlserverNullabilityPackage=manifest as unknown as ExtensionPackage;
export {default as sqlserverNullabilityClassificationSchema} from '../../spec/core/sqlserver-nullability-classification.schema.json';
export {default as sqlserverNullabilityEvidenceSchema} from '../../spec/extensions/sqlserver-nullability/native.schema.json';
