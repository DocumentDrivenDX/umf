import { type Document, type Diagnostic } from '../../model/types';
import type { Action, ActionObligation } from './types';
export interface ActionAnalysis {
    obligations: ActionObligation[];
    diagnostics: Diagnostic[];
}
/** Metadata-only graph walk. Every accessed model dependency gets a stable pointer. */
export declare function analyzeAction(document: Document, action: Action, path: string, dddInterpreted?: boolean): ActionAnalysis;
