/** Portable declarations; no file reads, network access or runtime execution. */
export declare function generatePreservationProfileSchema(): {
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
