/** Source identity/provenance data. Retrieval and credentials belong to consumers. */
export declare function generateDatasetSourceSchema(): {
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
