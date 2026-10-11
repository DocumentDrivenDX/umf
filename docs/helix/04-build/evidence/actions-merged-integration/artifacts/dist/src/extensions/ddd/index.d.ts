import { Registry } from '../../registry/registry';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const DDD_EXTENSION = "umf.ddd";
export declare const dddPackage: ExtensionPackage;
export interface DddReference {
    module: string;
    element: string;
}
export interface DddField {
    type: {
        kind: 'scalar';
        name: 'string' | 'boolean' | 'integer' | 'decimal' | 'date-time' | 'bytes';
    } | {
        kind: 'concept';
        target: DddReference;
    };
    cardinality: 'one' | 'optional' | 'many';
    description?: string;
}
export interface DddInvariant {
    id: string;
    scope: 'definition' | 'aggregate';
    language: string;
    version: string;
    expression: string;
    references: DddReference[];
}
interface DddBase {
    description?: string;
    [key: string]: unknown;
}
export interface DddEntity extends DddBase {
    kind: 'entity';
    fields: Record<string, DddField>;
    identity: {
        fields: string[];
        scope: 'context' | 'aggregate';
    };
    aggregate?: {
        members: DddReference[];
    };
    invariants?: DddInvariant[];
}
export interface DddValue extends DddBase {
    kind: 'value';
    fields: Record<string, DddField>;
    equality: {
        fields: string[];
    };
    invariants?: DddInvariant[];
}
export interface DddEvent extends DddBase {
    kind: 'domain-event';
    fields: Record<string, DddField>;
    emittedBy: DddReference;
    immutable: true;
    invariants?: DddInvariant[];
}
export interface DddOperation {
    name: string;
    input?: DddReference;
    output?: DddReference;
    emits?: DddReference[];
}
export interface DddService extends DddBase {
    kind: 'domain-service';
    operations: DddOperation[];
}
export interface DddRepository extends DddBase {
    kind: 'repository';
    aggregate: DddReference;
    operations: string[];
}
export interface DddTerm {
    term: string;
    definition: string;
    aliases?: string[];
    concept?: DddReference;
}
export interface DddContext extends DddBase {
    kind: 'bounded-context';
    terms: DddTerm[];
}
export interface DddMapping {
    id: string;
    source: DddReference;
    target: DddReference;
    direction: 'source-to-target' | 'target-to-source' | 'bidirectional';
    equivalence: 'partial' | 'asserted-equivalent' | 'distinct';
    description: string;
    limitations: string[];
    antiCorruptionLayer?: {
        ownerModule: string;
        description: string;
    };
}
export interface DddContextMap extends DddBase {
    kind: 'context-map';
    mappings: DddMapping[];
}
export type DddDefinition = DddEntity | DddValue | DddEvent | DddService | DddRepository;
export declare function dddRegistry(): Registry;
export declare function inspectDdd(document: Document): import("../..").Validation;
export declare function readDddDocument(text: string, format?: 'json' | 'yaml'): Document;
export declare function writeDddDocument(doc: Document, format?: 'json' | 'yaml'): string;
export declare function getDddDefinition(doc: Document, module: string, element: string): DddDefinition;
export declare function editDddDefinition(doc: Document, module: string, element: string, update: (definition: DddDefinition) => DddDefinition): Document;
export {};
