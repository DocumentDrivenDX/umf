import { type Document, type Element } from '../../model/types';
import type { ActionReference, ActionRelationshipReference } from './types';
/** Strict consumer admission is scoped to actual model dependencies, including their closure. */
export declare function knownActionModel(document: Document, reference: ActionReference, kind?: string): Element;
export declare function knownActionRelationship(document: Document, reference: ActionRelationshipReference): any;
