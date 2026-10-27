// SPDX-License-Identifier: MIT OR Apache-2.0
import {readJsonValue} from '../../../src/model/serialization';
import {UmfError} from '../../../src/model/errors';

export const read = (source: string, format: 'json' | 'yaml') => readJsonValue(source, format);
export const isUmfError = (error: unknown) => error instanceof UmfError;
