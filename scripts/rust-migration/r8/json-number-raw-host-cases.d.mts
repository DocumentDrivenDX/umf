export interface RawHostCase {
  id: string;
  token: unknown;
  events: string[];
  thrown: unknown;
}

export function makeRawHostCases(): RawHostCase[];
export function captureOutcome(operation: (value: unknown) => unknown, item: RawHostCase): Record<string, unknown>;
