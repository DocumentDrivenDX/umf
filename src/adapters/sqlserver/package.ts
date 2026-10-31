// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/sqlserver/package.json';
import type {ExtensionPackage} from '../../model/types';

export const SQLSERVER_EXTENSION='umf.sqlserver';
export const sqlserverPackage=manifest as unknown as ExtensionPackage;
