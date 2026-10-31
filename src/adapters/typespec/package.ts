// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/typespec/package.json';
import type {ExtensionPackage} from '../../model/types';
export const TYPESPEC_EXTENSION='umf.typespec';
export const typespecPackage=manifest as unknown as ExtensionPackage;
export interface TypeSpecPayload {profile:'typespec-1.16.0-sources';entrypoint:string;files:Record<string,string>;libraries?:Record<string,string>;}
