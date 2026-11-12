// SPDX-License-Identifier: MIT OR Apache-2.0
import {Registry as HostedRegistry} from '#umf-source';
import type {RegistryBase} from './base';
import type {ExtensionKindRuntime} from './kind-runtime';
export const Registry: new(kindRuntime?:ExtensionKindRuntime)=>RegistryBase=HostedRegistry;
export type Registry=RegistryBase;
export type {Registration,SemanticValidator} from './base';
