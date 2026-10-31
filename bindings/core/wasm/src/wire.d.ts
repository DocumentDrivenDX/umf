// SPDX-License-Identifier: MIT OR Apache-2.0
export declare function fromWire(value: unknown, work?: (units: number) => void): unknown;
export declare function resultError(value: unknown): {code: string; path: string; message: string} | null;
