import { type Element } from '../../model/types';
import { type NativeJson } from '../../model/native-json';
import type { AvroPayload } from './index';
export interface AvroFieldMetadata {
    dependencyId?: string;
    path: string;
    record: string;
    element: Element;
    nativeField: NativeJson;
}
/** Derives field metadata only; source retention and semantic validation are separate. */
export declare function deriveAvroFields(payload: AvroPayload): AvroFieldMetadata[];
