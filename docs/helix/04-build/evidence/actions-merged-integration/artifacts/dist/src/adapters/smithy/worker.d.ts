import type { SmithySelectionBackend } from './selection';
/** One dedicated module worker per native operation; timeout/abort terminates the runtime. */
export declare function createSmithyWorkerBackend(options: {
    workerUrl: string | URL;
    timeoutMs?: number;
}): SmithySelectionBackend;
