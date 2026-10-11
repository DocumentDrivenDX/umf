/** Original resource collections; semantic kind, media type and browser view are independent. */
export declare function generateArtifactCollectionSchema(): {
    readonly type: 'object';
    readonly required: readonly ['version', 'id', 'title', 'view', 'semantic_kinds', 'source_ids'];
    readonly properties: {
        readonly version: {
            readonly const: '1.0.0';
        };
        readonly id: {
            readonly type: 'string';
            readonly pattern: '^[A-Za-z][A-Za-z0-9_-]*$';
        };
        readonly title: {
            type: string;
            minLength: number;
        };
        readonly description: {
            readonly type: 'string';
        };
        readonly view: {
            readonly enum: readonly ['documents', 'imaging', 'other'];
        };
        readonly semantic_kinds: {
            readonly type: string;
            readonly maxItems: number;
            readonly uniqueItems: boolean;
            readonly items: {
                type: string;
                minLength: number;
            };
            readonly minItems: 1;
        };
        readonly source_ids: {
            type: string;
            maxItems: number;
            uniqueItems: boolean;
            items: {
                type: string;
                minLength: number;
            };
        };
        readonly media_types: {
            type: string;
            maxItems: number;
            uniqueItems: boolean;
            items: {
                type: string;
                minLength: number;
            };
        };
        readonly metadata_schema_ids: {
            type: string;
            maxItems: number;
            uniqueItems: boolean;
            items: {
                type: string;
                minLength: number;
            };
        };
        readonly derived_schema_ids: {
            type: string;
            maxItems: number;
            uniqueItems: boolean;
            items: {
                type: string;
                minLength: number;
            };
        };
        readonly ontology_schema_ids: {
            type: string;
            maxItems: number;
            uniqueItems: boolean;
            items: {
                type: string;
                minLength: number;
            };
        };
        readonly loader_inventory_source_id: {
            type: string;
            minLength: number;
        };
        readonly identity: {
            type: string;
            required: string[];
            properties: {
                description: {
                    type: string;
                    minLength: number;
                };
                fields: {
                    type: string;
                    maxItems: number;
                    uniqueItems: boolean;
                    items: {
                        type: string;
                        minLength: number;
                    };
                };
            };
            additionalProperties: boolean;
        };
        readonly grouping: {
            type: string;
            required: string[];
            properties: {
                description: {
                    type: string;
                    minLength: number;
                };
                fields: {
                    type: string;
                    maxItems: number;
                    uniqueItems: boolean;
                    items: {
                        type: string;
                        minLength: number;
                    };
                };
            };
            additionalProperties: boolean;
        };
    };
    readonly anyOf: readonly [{
        readonly properties: {
            readonly source_ids: {
                readonly type: 'array';
                readonly minItems: 1;
            };
        };
    }, {
        readonly required: readonly ['loader_inventory_source_id'];
        readonly properties: {
            readonly loader_inventory_source_id: {
                type: string;
                minLength: number;
            };
        };
    }];
    readonly additionalProperties: true;
};
/** Call only after structural pack validation; references never authorize retrieval. */
export declare function inspectArtifactReferences(pack: any): string[];
