// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../../model/types';
import manifest from '../../../spec/extensions/shacl/package.json';
export const SHACL_EXTENSION='umf.shacl';
export const shaclPackage=manifest as unknown as ExtensionPackage;
