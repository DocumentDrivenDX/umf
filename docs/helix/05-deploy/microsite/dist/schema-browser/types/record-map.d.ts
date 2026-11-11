import { type ComponentModel } from './visual-model.js';
import type { Annotation } from './types.js';
export interface RecordMapOptions {
    focus?: string;
    annotations?: Record<string, Annotation[]>;
    runtimeBaseUrl?: string;
    onNavigate?: (id: string, kind?: 'record' | 'relationship') => void;
    onFocusChange?: (id: string) => void;
}
export declare function renderRecordMap(root: HTMLElement, initial: ComponentModel, options?: RecordMapOptions): {
    readonly ready: Promise<void>;
    update(next: ComponentModel): Promise<void>;
    destroy(): void;
};
