import type { ParquetWireValue } from './footer';
/** Canonical Compact Protocol encoding; preserves wire values/order, not original varint spelling. */
export declare function encodeParquetWire(value: ParquetWireValue): Uint8Array;
