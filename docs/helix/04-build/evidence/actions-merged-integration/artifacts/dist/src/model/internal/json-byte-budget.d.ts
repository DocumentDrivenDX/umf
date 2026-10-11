import { type Json } from '../types';
/** Exact JSON.stringify UTF-8 byte length for safely copied JSON, with early refusal.
 * String accounting matches the reviewed compact-dataset preflight, including
 * JSON escapes and lone-surrogate spelling, without serializing whole values.
 */
export declare function boundedJsonBytes(value: Json, maximum?: number): number;
