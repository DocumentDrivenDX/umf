export declare const carriers: {
    readonly boolean: readonly ['bool', 'boolean'];
    readonly smallint: readonly ['int2', 'integer'];
    readonly integer: readonly ['int4', 'integer'];
    readonly bigint: readonly ['int8', 'integer'];
    readonly numeric: readonly ['numeric', 'decimal'];
    readonly real: readonly ['float4', 'float'];
    readonly 'double precision': readonly ['float8', 'float'];
    readonly text: readonly ['text', 'string'];
    readonly bytea: readonly ['bytea', 'binary'];
    readonly date: readonly ['date', 'date'];
    readonly time: readonly ['time', 'time'];
    readonly 'time with time zone': readonly ['timetz', 'time'];
    readonly timestamp: readonly ['timestamp', 'timestamp'];
    readonly 'timestamp with time zone': readonly ['timestamptz', 'timestamp'];
};
export declare function identifier(value: string): string;
export declare function literal(value: string): string;
