import { type Json, type Diagnostic } from '../../model/types';
/** Find Schema Objects by OAS object role; examples/default values are never scanned. */
export declare function openapiSchemaPositions(root: Json): {
    pointer: string;
    schema: Json;
}[];
export declare function inspectEmbeddedSchemas(root: Json): Diagnostic[];
