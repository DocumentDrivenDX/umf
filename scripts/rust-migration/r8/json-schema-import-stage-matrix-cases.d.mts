// SPDX-License-Identifier: MIT OR Apache-2.0
export function matrixCases(): Array<{
  id: string;
  source: string;
  makeOptions(events: string[], sentinel: Error): Record<string, unknown>;
}>;
