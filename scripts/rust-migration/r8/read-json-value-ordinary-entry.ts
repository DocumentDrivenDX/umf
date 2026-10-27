// SPDX-License-Identifier: MIT OR Apache-2.0
/** Explicit test entry for the gated primitive-string N-API seam. */
import {createRequire} from 'node:module';
import {readJsonValueOrdinary as readWithBinding} from '../../../src/access/read-json-value-ordinary';

const require = createRequire(import.meta.url);
const addon = require('./umf_core_node.node') as {
  readJsonValueOrdinaryText(source: string, formatIsJson: boolean): string;
};

export const readJsonValueOrdinary = (source: string, format?: unknown) =>
  readWithBinding(addon, source, format);
