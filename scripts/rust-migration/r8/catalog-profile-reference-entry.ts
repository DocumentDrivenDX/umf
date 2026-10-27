// SPDX-License-Identifier: MIT OR Apache-2.0
import {readJsonValue} from '../../../src/model/serialization';
import {withCatalogResourceProfile} from '../../../src/model/json';

export const readCatalogJson = (source: unknown) =>
  withCatalogResourceProfile(() => readJsonValue(source as string, 'json'));
