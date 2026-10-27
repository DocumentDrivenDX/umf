// SPDX-License-Identifier: MIT OR Apache-2.0
import {readJsonValue} from '../../../src/index-v4-default';
import {UmfError} from '../../../src/model/errors';

export const readOrdinaryJson = (source: string) => readJsonValue(source, 'json');
export const isUmfError = (error: unknown) => error instanceof UmfError;
