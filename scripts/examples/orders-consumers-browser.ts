// SPDX-License-Identifier: MIT OR Apache-2.0
import {projectAvroToJsonSchema,projectTableSpecToAvro} from '../../src/index-browser-v4';
import {ordersModel,generateOrdersConsumers as generate,compileOrdersTransform as compile} from './orders-consumers';
const projectors={projectAvroToJsonSchema,projectTableSpecToAvro};
export {ordersModel};
export const generateOrdersConsumers=(source:Parameters<typeof generate>[0])=>generate(source,projectors);
export const compileOrdersTransform=(source:Parameters<typeof compile>[0])=>compile(source,projectors);
