// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/avro/package.json';
import {type ExtensionPackage} from '../../model/types';

export const AVRO_EXTENSION = 'umf.avro';
export const avroPackage = manifest as unknown as ExtensionPackage;
export {default as avroNativeSchema} from '../../../spec/extensions/avro/native-schema.schema.json';
