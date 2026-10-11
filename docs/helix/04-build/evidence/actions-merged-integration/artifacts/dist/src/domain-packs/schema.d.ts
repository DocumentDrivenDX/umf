/** Portable pack metadata only; implementation references never authorize execution. */
export declare function generateDomainPackSchema(): {
    readonly $schema: 'https://json-schema.org/draft/2020-12/schema';
    readonly $id: 'urn:umf:domain-pack:1.0.0';
    readonly type: 'object';
    readonly required: readonly ['id', 'version', 'domain_types'];
    readonly anyOf: readonly [{
        readonly properties: {
            readonly generator: {};
        };
        readonly required: readonly ['generator'];
    }, {
        readonly properties: {
            readonly sources: {};
        };
        readonly required: readonly ['sources'];
    }];
    readonly properties: {
        readonly artifact_collections: {
            readonly type: 'array';
            readonly maxItems: 64;
            readonly items: {
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
        };
        readonly preservation: {
            readonly type: 'object';
            readonly required: readonly ['version', 'handoff', 'fixity', 'events', 'provenance', 'originals', 'primary_runtime'];
            readonly properties: {
                readonly version: {
                    readonly const: '1.0.0';
                };
                readonly handoff: {
                    readonly const: 'BagIt-1.0';
                };
                readonly fixity: {
                    readonly const: 'sha256';
                };
                readonly events: {
                    readonly const: 'PREMIS-3.0-semantic-mapping';
                };
                readonly provenance: {
                    readonly const: 'PROV-O-JSON-LD';
                };
                readonly originals: {
                    readonly const: 'authoritative-immutable-bytes';
                };
                readonly primary_runtime: {
                    readonly const: 'tablespec-python';
                };
                readonly qualification: {
                    readonly type: 'string';
                    readonly minLength: 1;
                };
                readonly derivations: {
                    readonly type: 'array';
                    readonly items: {
                        readonly type: 'object';
                        readonly required: readonly ['schema_id', 'source_identity'];
                        readonly properties: {
                            readonly schema_id: {
                                readonly type: 'string';
                                readonly minLength: 1;
                            };
                            readonly source_identity: {
                                readonly type: 'string';
                                readonly minLength: 1;
                            };
                            readonly qualification: {
                                readonly type: 'string';
                                readonly minLength: 1;
                            };
                        };
                        readonly additionalProperties: true;
                    };
                };
            };
            readonly additionalProperties: true;
        };
        readonly id: {
            type: string;
            minLength: number;
        };
        readonly version: {
            type: string;
            pattern: string;
        };
        readonly description: {
            readonly type: 'string';
        };
        readonly family: {
            readonly type: 'object';
            readonly required: readonly ['id', 'version', 'label'];
            readonly properties: {
                readonly id: {
                    type: string;
                    minLength: number;
                };
                readonly version: {
                    type: string;
                    pattern: string;
                };
                readonly label: {
                    type: string;
                    minLength: number;
                };
            };
            readonly additionalProperties: true;
        };
        readonly composition: {
            readonly type: 'object';
            readonly required: readonly ['version', 'components'];
            readonly properties: {
                readonly version: {
                    readonly const: '1.0.0';
                };
                readonly components: {
                    readonly type: 'array';
                    readonly minItems: 1;
                    readonly maxItems: 32;
                    readonly items: {
                        readonly type: 'object';
                        readonly required: readonly ['id', 'version', 'label', 'checksum'];
                        readonly properties: {
                            readonly id: {
                                readonly type: 'string';
                                readonly pattern: '^[a-z][a-z0-9-]*$';
                            };
                            readonly version: {
                                type: string;
                                pattern: string;
                            };
                            readonly label: {
                                type: string;
                                minLength: number;
                            };
                            readonly checksum: {
                                readonly type: 'object';
                                readonly required: readonly ['algorithm', 'value'];
                                readonly properties: {
                                    readonly algorithm: {
                                        readonly const: 'sha256';
                                    };
                                    readonly value: {
                                        readonly type: 'string';
                                        readonly pattern: '^[a-f0-9]{64}$';
                                    };
                                };
                                readonly additionalProperties: true;
                            };
                        };
                        readonly additionalProperties: true;
                    };
                };
            };
            readonly additionalProperties: true;
        };
        readonly generator: {
            readonly type: 'object';
            readonly required: readonly ['id', 'version'];
            readonly properties: {
                readonly id: {
                    type: string;
                    minLength: number;
                };
                readonly version: {
                    type: string;
                    pattern: string;
                };
            };
            readonly additionalProperties: true;
        };
        readonly domain_types: {
            readonly type: 'object';
            readonly minProperties: 1;
            readonly propertyNames: {
                readonly type: 'string';
                readonly pattern: '^[A-Za-z_][A-Za-z0-9_]*$';
            };
            readonly additionalProperties: {
                readonly type: 'object';
                readonly properties: {
                    readonly description: {
                        readonly type: 'string';
                    };
                    readonly sample_generation: {
                        readonly type: 'object';
                        readonly required: readonly ['method'];
                        readonly properties: {
                            readonly method: {
                                readonly type: 'string';
                                readonly pattern: '^generate_[A-Za-z0-9_]+$';
                            };
                        };
                        readonly additionalProperties: true;
                    };
                    readonly detection: {
                        readonly type: 'object';
                    };
                };
                readonly additionalProperties: true;
            };
        };
        readonly scale_presets: {
            readonly type: 'object';
            readonly additionalProperties: {
                readonly type: 'object';
                readonly required: readonly ['roots', 'children'];
                readonly properties: {
                    readonly roots: {
                        readonly type: 'object';
                        readonly additionalProperties: {
                            readonly type: 'integer';
                            readonly minimum: 0;
                        };
                    };
                    readonly children: {
                        readonly type: 'object';
                        readonly additionalProperties: {
                            readonly type: 'object';
                            readonly required: readonly ['parent', 'per_parent'];
                            readonly properties: {
                                readonly parent: {
                                    type: string;
                                    minLength: number;
                                };
                                readonly per_parent: {
                                    readonly type: 'number';
                                    readonly minimum: 0;
                                };
                                readonly distribution: {
                                    readonly enum: readonly ['uniform', 'skewed'];
                                };
                            };
                            readonly additionalProperties: true;
                        };
                    };
                };
                readonly additionalProperties: true;
            };
        };
        readonly sources: {
            readonly type: 'object';
            readonly minProperties: 1;
            readonly additionalProperties: {
                readonly $schema: 'https://json-schema.org/draft/2020-12/schema';
                readonly $id: 'urn:umf:dataset-source:1.0.0';
                readonly type: 'object';
                readonly required: readonly ['kind', 'data_kind'];
                readonly properties: {
                    readonly kind: {
                        readonly enum: readonly ['synthetic', 'external'];
                    };
                    readonly data_kind: {
                        readonly enum: readonly ['fabricated', 'observed', 'deidentified', 'unknown'];
                    };
                    readonly description: {
                        readonly type: 'string';
                    };
                    readonly generator: {
                        type: string;
                        required: string[];
                        properties: {
                            id: {
                                type: string;
                                minLength: number;
                            };
                            version: {
                                type: string;
                                pattern: string;
                            };
                        };
                        additionalProperties: boolean;
                    };
                    readonly reference: {
                        type: string;
                        minLength: number;
                    };
                    readonly format: {
                        type: string;
                        minLength: number;
                    };
                    readonly revision: {
                        type: string;
                        minLength: number;
                    };
                    readonly checksum: {
                        readonly type: 'object';
                        readonly required: readonly ['algorithm', 'value'];
                        readonly properties: {
                            readonly algorithm: {
                                readonly const: 'sha256';
                            };
                            readonly value: {
                                readonly type: 'string';
                                readonly pattern: '^[a-f0-9]{64}$';
                            };
                        };
                        readonly additionalProperties: true;
                    };
                    readonly license: {
                        readonly type: 'object';
                        readonly properties: {
                            readonly id: {
                                type: string;
                                minLength: number;
                            };
                            readonly reference: {
                                type: string;
                                minLength: number;
                            };
                            readonly redistribution: {
                                readonly enum: readonly ['allowed', 'restricted', 'unknown'];
                            };
                            readonly attribution: {
                                readonly type: 'string';
                            };
                            readonly notices: {
                                readonly type: 'array';
                                readonly items: {
                                    readonly type: 'string';
                                };
                            };
                        };
                        readonly additionalProperties: true;
                    };
                    readonly provenance: {
                        readonly type: 'object';
                        readonly properties: {
                            readonly publisher: {
                                type: string;
                                minLength: number;
                            };
                            readonly retrieved_at: {
                                type: string;
                                minLength: number;
                            };
                            readonly source_ids: {
                                readonly type: 'array';
                                readonly items: {
                                    type: string;
                                    minLength: number;
                                };
                            };
                            readonly transformations: {
                                readonly type: 'array';
                                readonly items: {
                                    type: string;
                                    minLength: number;
                                };
                            };
                        };
                        readonly additionalProperties: true;
                    };
                };
                readonly allOf: readonly [{
                    readonly if: {
                        readonly properties: {
                            readonly kind: {
                                readonly const: 'external';
                            };
                        };
                    };
                    readonly then: {
                        readonly properties: {
                            readonly reference: {};
                            readonly format: {};
                        };
                        readonly required: readonly ['reference', 'format'];
                    };
                }, {
                    readonly if: {
                        readonly properties: {
                            readonly kind: {
                                readonly const: 'synthetic';
                            };
                        };
                    };
                    readonly then: {
                        readonly properties: {
                            readonly generator: {};
                        };
                        readonly required: readonly ['generator'];
                    };
                }];
                readonly additionalProperties: true;
            };
        };
        readonly source_bindings: {
            readonly type: 'array';
            readonly items: {
                readonly type: 'object';
                readonly required: readonly ['schema_id', 'source_id', 'role'];
                readonly properties: {
                    readonly schema_id: {
                        type: string;
                        minLength: number;
                    };
                    readonly source_id: {
                        type: string;
                        minLength: number;
                    };
                    readonly role: {
                        readonly enum: readonly ['rows', 'reference', 'terminology'];
                    };
                };
                readonly additionalProperties: true;
            };
        };
        readonly schemas: {
            readonly type: 'array';
            readonly items: {
                readonly type: 'object';
                readonly required: readonly ['id', 'format', 'reference'];
                readonly properties: {
                    readonly id: {
                        type: string;
                        minLength: number;
                    };
                    readonly format: {
                        type: string;
                        minLength: number;
                    };
                    readonly reference: {
                        type: string;
                        minLength: number;
                    };
                };
                readonly additionalProperties: true;
            };
        };
    };
    readonly additionalProperties: true;
};
