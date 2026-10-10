/** Finite explicit selection; no URL discovery or execution is implied. */
export declare function generateLoaderInventorySchema(): {
    readonly $schema: 'https://json-schema.org/draft/2020-12/schema';
    readonly $id: 'urn:umf:loader-inventory:1.0.0';
    readonly type: 'object';
    readonly required: readonly ['version', 'id', 'allowed_hosts', 'request_interval_ms', 'max_bytes', 'max_total_bytes', 'max_documents', 'timeout_ms', 'retries', 'entries'];
    readonly properties: {
        readonly version: {
            readonly const: '1.0.0';
        };
        readonly id: {
            type: string;
            minLength: number;
            maxLength: number;
        };
        readonly allowed_hosts: {
            readonly type: 'array';
            readonly minItems: 1;
            readonly maxItems: 32;
            readonly uniqueItems: true;
            readonly items: {
                type: string;
                minLength: number;
                maxLength: number;
            };
        };
        readonly request_interval_ms: {
            type: string;
            minimum: number;
            maximum: number;
        };
        readonly max_bytes: {
            type: string;
            minimum: number;
            maximum: number;
        };
        readonly max_total_bytes: {
            type: string;
            minimum: number;
            maximum: number;
        };
        readonly max_documents: {
            type: string;
            minimum: number;
            maximum: number;
        };
        readonly timeout_ms: {
            type: string;
            minimum: number;
            maximum: number;
        };
        readonly retries: {
            type: string;
            minimum: number;
            maximum: number;
        };
        readonly entries: {
            readonly type: 'array';
            readonly maxItems: 1000;
            readonly items: {
                readonly type: 'object';
                readonly required: readonly ['id', 'url', 'media_type', 'license'];
                readonly properties: {
                    readonly id: {
                        type: string;
                        minLength: number;
                        maxLength: number;
                    };
                    readonly url: {
                        type: string;
                        minLength: number;
                        maxLength: number;
                    };
                    readonly media_type: {
                        readonly enum: readonly ['application/pdf', 'application/json', 'text/html', 'text/plain'];
                    };
                    readonly expected_sha256: {
                        readonly type: 'string';
                        readonly pattern: '^[a-f0-9]{64}$';
                    };
                    readonly license: {
                        readonly type: 'object';
                        readonly required: readonly ['redistribution'];
                        readonly properties: {
                            readonly redistribution: {
                                readonly enum: readonly ['allowed', 'restricted', 'unknown'];
                            };
                        };
                        readonly additionalProperties: true;
                    };
                    readonly metadata: {
                        readonly type: 'object';
                    };
                };
                readonly additionalProperties: true;
            };
        };
    };
    readonly additionalProperties: true;
};
