// SPDX-License-Identifier: MIT OR Apache-2.0
import type {DescMessage} from '@bufbuild/protobuf';
import {FileDescriptorSetSchema} from '@bufbuild/protobuf/wkt';

/** Pinned descriptor graph used by the generated Protobuf extension schema. */
export const descriptorRoot:DescMessage=FileDescriptorSetSchema;
