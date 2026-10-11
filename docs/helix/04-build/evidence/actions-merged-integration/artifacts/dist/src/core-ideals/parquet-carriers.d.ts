export declare const parquetCarriers: {
    readonly boolean: {
        readonly type: 0;
    };
    readonly int32: {
        readonly type: 1;
    };
    readonly int64: {
        readonly type: 2;
    };
    readonly float32: {
        readonly type: 4;
    };
    readonly float64: {
        readonly type: 5;
    };
    readonly binary: {
        readonly type: 6;
    };
    readonly string: {
        readonly type: 6;
        readonly converted: 0;
    };
    readonly date: {
        readonly type: 1;
        readonly converted: 6;
    };
    readonly 'time-millis': {
        readonly type: 1;
        readonly converted: 7;
    };
    readonly 'time-micros': {
        readonly type: 2;
        readonly converted: 8;
    };
    readonly 'timestamp-millis-utc': {
        readonly type: 2;
        readonly converted: 9;
    };
    readonly 'timestamp-micros-utc': {
        readonly type: 2;
        readonly converted: 10;
    };
};
/** An empty data file carrying an explicit native schema; no row writer or ideal presence inference. */
export declare function parquetRecordFile(recordName: string, columns: {
    fieldName: string;
    nativeType: keyof typeof parquetCarriers;
    repetition: 'required' | 'optional' | 'repeated';
}[]): Uint8Array;
export declare function parquetFieldFile(recordName: string, fieldName: string, nativeType: keyof typeof parquetCarriers, repetition: 'required' | 'optional' | 'repeated'): Uint8Array;
