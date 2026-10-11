export declare const avroCarriers: {
    readonly null: 'null';
    readonly boolean: 'boolean';
    readonly int: 'int';
    readonly long: 'long';
    readonly float: 'float';
    readonly double: 'double';
    readonly bytes: 'bytes';
    readonly string: 'string';
    readonly date: {
        readonly type: 'int';
        readonly logicalType: 'date';
    };
    readonly 'time-millis': {
        readonly type: 'int';
        readonly logicalType: 'time-millis';
    };
    readonly 'time-micros': {
        readonly type: 'long';
        readonly logicalType: 'time-micros';
    };
    readonly 'timestamp-millis': {
        readonly type: 'long';
        readonly logicalType: 'timestamp-millis';
    };
    readonly 'timestamp-micros': {
        readonly type: 'long';
        readonly logicalType: 'timestamp-micros';
    };
    readonly 'local-timestamp-micros': {
        readonly type: 'long';
        readonly logicalType: 'local-timestamp-micros';
    };
    readonly 'decimal(38,9)': {
        readonly type: 'bytes';
        readonly logicalType: 'decimal';
        readonly precision: 38;
        readonly scale: 9;
    };
};
