// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/ddd/package.json';
import type {ExtensionPackage} from '../../model/types';

export const DDD_EXTENSION='umf.ddd';
export const dddPackage=manifest as unknown as ExtensionPackage;
