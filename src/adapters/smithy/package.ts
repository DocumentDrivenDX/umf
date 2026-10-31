// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/smithy/package.json';
import type {ExtensionPackage} from '../../model/types';
export const SMITHY_EXTENSION='umf.smithy';
export const smithyPackage=manifest as unknown as ExtensionPackage;
