import { type ArrowIpcLayout } from './ipc-layout';
import type { Document, Diagnostic } from '../../model/types';
export interface ArrowIpcConsistency {
    layout: ArrowIpcLayout;
    complete: false;
    footerChecks: 'not-applicable' | 'matched' | 'mismatch' | 'unverified';
    diagnostics: Diagnostic[];
}
/** Compares file footer declarations to observed embedded-stream metadata and extents. */
export declare function inspectArrowIpcConsistency(document: Document): ArrowIpcConsistency;
