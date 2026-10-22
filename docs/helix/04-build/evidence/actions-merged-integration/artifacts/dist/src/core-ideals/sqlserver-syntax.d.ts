export declare const sqlServerCarriers: {
    readonly bit: 'boolean';
    readonly tinyint: 'integer';
    readonly smallint: 'integer';
    readonly int: 'integer';
    readonly bigint: 'integer';
    readonly 'decimal(38,9)': 'decimal';
    readonly real: 'float';
    readonly 'float(53)': 'float';
    readonly 'nvarchar(max)': 'string';
    readonly 'varbinary(max)': 'binary';
    readonly date: 'date';
    readonly 'time(7)': 'time';
    readonly 'datetime2(7)': 'timestamp';
    readonly 'datetimeoffset(7)': 'timestamp';
};
export declare function sqlServerIdentifier(value: unknown): string;
export declare function sqlServerLiteral(value: unknown): string;
