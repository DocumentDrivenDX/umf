// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../spec/extensions/tablespec-nullability/package.json';
import type {ExtensionPackage} from '../model/types';

export const TABLESPEC_NULLABILITY_EXTENSION='umf.tablespec.nullability';
export const tableSpecNullabilityPackage=manifest as unknown as ExtensionPackage;
