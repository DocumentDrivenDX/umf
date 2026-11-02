// SPDX-License-Identifier: MIT OR Apache-2.0
/** Static saga vocabulary data; importing it never loads the legacy facade. */
import generatedPackage from '../../../spec/extensions/saga/package.json';
import type {ExtensionPackage} from '../../model/types';
export const sagaPackage=generatedPackage as unknown as ExtensionPackage;
