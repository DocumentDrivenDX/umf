// SPDX-License-Identifier: MIT OR Apache-2.0
/** Public row shapes shared by the Rust-backed Node and browser domain-pack APIs. */
export type MedicalRow = Record<string, string | boolean | null>;
export type MedicalTables = Record<string, MedicalRow[]>;
export interface MedicalTerminologyRecord {
  system: string; release: string; code: string; display?: string; [key: string]: unknown;
}
