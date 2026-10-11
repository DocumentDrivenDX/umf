import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage, type Diagnostic } from '../../model/types';
export declare const DELTA_LOG_EXTENSION = "umf.delta.log";
export declare const deltaLogPackage: ExtensionPackage;
export declare function deltaLogRegistry(): Registry;
export declare function captureDeltaLog(text: string, options: {
    id: string;
}): Document;
export declare function exportDeltaLog(doc: Document): string;
export interface DeltaLogLine {
    line: number;
    start: number;
    end: number;
    terminator: '' | '\n' | '\r\n';
    status: 'parsed' | 'blank' | 'invalid';
    action?: string;
    node?: NativeJson;
}
/** Offsets are UTF-16 positions in source text; end excludes the line terminator. */
export declare function inspectDeltaLog(doc: Document): {
    source: Document;
    complete: false;
    parsedAll: boolean;
    lines: DeltaLogLine[];
    diagnostics: Diagnostic[];
};
