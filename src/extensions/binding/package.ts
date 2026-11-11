// SPDX-License-Identifier: MIT OR Apache-2.0
import stableManifest from '../../../spec/extensions/binding-stable/package.json';
import manifest from '../../../spec/extensions/binding/package.json';
import bit128Manifest from '../../../spec/extensions/binding-128/package.json';
import type {ExtensionPackage} from '../../model/types';

export const BINDING_EXTENSION='umf.binding';
export const stableBindingPackage=stableManifest as unknown as ExtensionPackage;
export const bindingPackage=manifest as unknown as ExtensionPackage;
export const bit128BindingPackage=bit128Manifest as unknown as ExtensionPackage;
