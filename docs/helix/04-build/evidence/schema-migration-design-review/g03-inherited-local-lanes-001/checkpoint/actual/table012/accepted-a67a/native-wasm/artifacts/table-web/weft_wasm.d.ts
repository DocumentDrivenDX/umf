/* tslint:disable */
/* eslint-disable */
/**
 * Original ontology Subject/Record/Key source selection only; no authority.
 */
export function inspect_security_mapping_subject_key_json(request: string, selection: string): string;
/**
 * Pure logical preparation; never native execution admission.
 */
export function prepare_security_mapping_json(request: string): string;
export function compile_json(request: string): string;
export function compile_raw_read_json(request: string): string;
export function compile_native_privilege_probes_json(request: string): string;
export function check_native_privilege_probes_json(program: string): string;
export function compile_native_action_json(request: string): string;
export function compile_native_bulk_json(request: string): string;
export function compile_search_json(request: string): string;
export function compile_engine_read_json(request: string): string;
export function compile_engine_related_read_json(request: string): string;
export function compile_engine_related_page_json(request: string): string;
export function check_engine_read_json(program: string, current_request: string): string;
export function compile_engine_page_json(request: string): string;
export function check_engine_page_json(program: string, current_request: string, after_json: string): string;
export function compile_engine_export_json(program: string, current_request: string): string;
export function compile_unity_search_json(request: string): string;
export function compile_related_read_json(request: string): string;
export function compile_table_operation_json(request: string): string;
export function check_table_operation_json(program: string): string;
export function compile_table_seed_json(request: string): string;
export function check_table_seed_json(program: string): string;
/**
 * Host-installed action preparation. Compiles plans; grants no execution authority.
 */
export class MutationCompiler {
  free(): void;
  [Symbol.dispose](): void;
  constructor(configuration: string);
  lower_selection_json(handle: number, request: string): string;
  compile_json(request: string): string;
}
/**
 * Module-level immutable query source index with lazy operation preparation.
 */
export class TableQueryModulePreparation {
  free(): void;
  [Symbol.dispose](): void;
  constructor(request: string);
  prepare_operation(operation: string): TableQueryPreparation;
}
/**
 * Pure preparation for a source-pinned PostgreSQL table query. The prepared
 * value carries no native connection, cursor, authorization, or result state.
 */
export class TableQueryPreparation {
  free(): void;
  [Symbol.dispose](): void;
  constructor(request: string);
  program_json(): string;
  bind_json(call: string): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly inspect_security_mapping_subject_key_json: (a: any, b: any) => [number, number];
  readonly prepare_security_mapping_json: (a: any) => [number, number];
  readonly compile_json: (a: number, b: number) => [number, number];
  readonly __wbg_mutationcompiler_free: (a: number, b: number) => void;
  readonly mutationcompiler_new: (a: number, b: number) => [number, number, number];
  readonly mutationcompiler_lower_selection_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly mutationcompiler_compile_json: (a: number, b: number, c: number) => [number, number];
  readonly compile_raw_read_json: (a: any) => [number, number, number, number];
  readonly __wbg_tablequerypreparation_free: (a: number, b: number) => void;
  readonly tablequerypreparation_new: (a: any) => [number, number, number];
  readonly tablequerypreparation_program_json: (a: number) => [number, number];
  readonly tablequerypreparation_bind_json: (a: number, b: any) => [number, number, number, number];
  readonly __wbg_tablequerymodulepreparation_free: (a: number, b: number) => void;
  readonly tablequerymodulepreparation_new: (a: any) => [number, number, number];
  readonly tablequerymodulepreparation_prepare_operation: (a: number, b: any) => [number, number, number];
  readonly compile_native_privilege_probes_json: (a: any) => [number, number, number, number];
  readonly check_native_privilege_probes_json: (a: any) => [number, number, number, number];
  readonly compile_native_action_json: (a: any) => [number, number, number, number];
  readonly compile_native_bulk_json: (a: any) => [number, number, number, number];
  readonly compile_search_json: (a: any) => [number, number, number, number];
  readonly compile_engine_read_json: (a: any) => [number, number, number, number];
  readonly compile_engine_related_read_json: (a: any) => [number, number, number, number];
  readonly compile_engine_related_page_json: (a: any) => [number, number, number, number];
  readonly check_engine_read_json: (a: any, b: any) => [number, number, number, number];
  readonly compile_engine_page_json: (a: any) => [number, number, number, number];
  readonly check_engine_page_json: (a: any, b: any, c: any) => [number, number, number, number];
  readonly compile_engine_export_json: (a: any, b: any) => [number, number, number, number];
  readonly compile_unity_search_json: (a: any) => [number, number, number, number];
  readonly compile_related_read_json: (a: any) => [number, number, number, number];
  readonly compile_table_operation_json: (a: any) => [number, number, number, number];
  readonly check_table_operation_json: (a: any) => [number, number, number, number];
  readonly compile_table_seed_json: (a: any) => [number, number, number, number];
  readonly check_table_seed_json: (a: any) => [number, number, number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
