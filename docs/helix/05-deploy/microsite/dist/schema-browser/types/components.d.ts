import { renderRecordMap } from './record-map.js';
export { renderRecordMap };
export type { ComponentModel, ChangeStatus } from './visual-model.js';
import type { ComponentModel, ChangeStatus } from './visual-model.js';
import type { Annotation } from './types.js';
export declare function renderPropertyTable(root: HTMLElement, properties: Record<string, unknown>, options?: {
    annotations?: Record<string, Annotation[]>;
}): {
    destroy(): void;
};
export interface DocumentChange {
    path: string;
    status: Exclude<ChangeStatus, 'unchanged'>;
    before?: unknown;
    after?: unknown;
}
interface DocumentComparisonAdapter {
    compareDocuments(before: unknown, after: unknown): DocumentChange[];
}
/** Install the preinitialized Rust adapter before serving synchronous comparisons. */
export declare function configureDocumentComparisonEngine(engine: DocumentComparisonAdapter): void;
/** Structural comparison requires successful package-level Rust/WASM initialization. */
export declare function compareDocuments(before: unknown, after: unknown): DocumentChange[];
export declare function renderDocumentDiff(root: HTMLElement, before: unknown, after: unknown): {
    changes: DocumentChange[];
    ready: Promise<void>;
    destroy(): void;
};
export declare function comparisonModel(before: any, after: any): ComponentModel;
