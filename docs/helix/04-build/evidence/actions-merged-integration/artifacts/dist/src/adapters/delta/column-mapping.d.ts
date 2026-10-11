import { type NativeJson } from '../../model/native-json';
import { type Diagnostic } from '../../model/types';
/** Snapshot-local checks only: historical uniqueness and data-file field IDs require evidence outside this pair. */
export declare function deltaColumnMappingDiagnostics(context: NativeJson): Diagnostic[];
