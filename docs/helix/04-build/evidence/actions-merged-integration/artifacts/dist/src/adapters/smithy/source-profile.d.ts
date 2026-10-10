import { type Json, type Diagnostic } from '../../model/types';
export interface SmithySourcePayload {
    profile: 'smithy-idl-sources';
    files: Record<string, string>;
}
export declare function inspectSmithySourcesPayload(value: Json): Diagnostic[];
