import type { ParquetTypedValue } from '../parquet/values';
import type { NativeJson } from '../../model/native-json';
/** Exact JSON view for annotated checkpoint statistics; no INT96/timezone inference. */
export declare function deltaStatScalar(v: ParquetTypedValue): NativeJson | undefined;
