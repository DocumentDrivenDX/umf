export declare function generateDomainPackLoaderSchema(): {
    readonly $schema: 'https://json-schema.org/draft/2020-12/schema';
    readonly $id: 'urn:umf:domain-pack-loader:1.0.0';
    readonly type: 'object';
    readonly required: readonly ['version', 'id', 'implementation_version', 'profile', 'runtime', 'entrypoint', 'configuration_schema', 'qualification', 'artifacts'];
    readonly properties: {
        readonly version: {
            readonly const: '1.0.0';
        };
        readonly id: {
            readonly const: 'umf.document-loader';
        };
        readonly implementation_version: {
            readonly const: '1.0.0';
        };
        readonly profile: {
            readonly enum: readonly ['court-documents', 'sec-filings', 'documents'];
        };
        readonly runtime: {
            readonly const: 'bun';
        };
        readonly entrypoint: {
            readonly const: 'run.ts';
        };
        readonly configuration_schema: {
            readonly const: 'inventory.schema.json';
        };
        readonly qualification: {
            type: string;
            minLength: number;
        };
        readonly artifacts: {
            readonly type: 'array';
            readonly minItems: 2;
            readonly maxItems: 32;
            readonly items: {
                readonly type: 'object';
                readonly required: readonly ['reference', 'sha256'];
                readonly properties: {
                    readonly reference: {
                        type: string;
                        pattern: string;
                    };
                    readonly sha256: {
                        readonly type: 'string';
                        readonly pattern: '^[a-f0-9]{64}$';
                    };
                };
                readonly additionalProperties: true;
            };
        };
    };
    readonly additionalProperties: true;
};
/** Admission only. This function neither invokes nor resolves a companion. */
export declare function inspectDomainPackLoader(input: unknown): {
    valid: boolean;
    complete: boolean;
    diagnostics: string[];
};
