// SPDX-License-Identifier: MIT OR Apache-2.0
import {Registry as HostedRegistry} from '#umf-source';
import type {RegistryBase} from './base';
export const Registry: new(kindRuntime?: ConstructorParameters<typeof RegistryBase>[0])=>RegistryBase=HostedRegistry;
export type Registry=RegistryBase;
export type {Registration,SemanticValidator} from './base';
