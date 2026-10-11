import { Registry } from '../registry/registry';
import { type Document, type Json } from './types';
export declare function readDocument(text: string, format?: 'json' | 'yaml'): Document;
export declare function writeDocument(value: Document, format?: 'json' | 'yaml'): string;
/** Atomic update; unknown dependencies conservatively block edits until interpreted. */
export declare function editExtension(input: Document, registry: Registry, moduleId: string, elementId: string, extensionId: string, update: (payload: Json) => Json): Document;
