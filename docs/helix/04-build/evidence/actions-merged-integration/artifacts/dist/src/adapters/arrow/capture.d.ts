import { Registry } from '../../registry/registry';
import { type Document, type Json, type ExtensionPackage } from '../../model/types';
export declare const ARROW_IPC_EXTENSION = "umf.arrow.ipc";
export declare const ARROW_IPC_MAX_BYTES = 1000000;
export declare const arrowIpcPackage: ExtensionPackage;
export declare function arrowIpcRegistry(): Registry;
/** Validates the capture envelope only. It cannot establish native Arrow validity. */
export declare function inspectArrowIpcCapture(document: Document): {
    valid: boolean;
    complete: boolean;
    diagnostics: import("../..").Diagnostic[];
};
/** Accepts even empty or invalid native input so decode failure cannot lose source. */
export declare function captureArrowIpc(bytes: Uint8Array, options: {
    id: string;
}): Document;
/** Exports captured bytes, never a regenerated interpretation or an edited schema. */
export declare function exportArrowIpcCapture(document: Document): Uint8Array;
export interface ArrowIpcObservationBackend {
    identity: 'apache-arrow@21.2.0';
    observe(bytes: Uint8Array): unknown;
}
/** A pinned native schema observation; does not assert complete byte consumption. */
export declare function observeArrowIpcCapture(document: Document, backend: ArrowIpcObservationBackend): {
    source: Document;
    backend: string;
    complete: false;
    status: 'observed' | 'uninterpreted';
    schema?: Json;
    message?: string;
};
