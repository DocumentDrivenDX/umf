export declare const sqlServerKeyCarriers: {
    readonly bit: 'boolean';
    readonly tinyint: 'integer';
    readonly smallint: 'integer';
    readonly int: 'integer';
    readonly bigint: 'integer';
    readonly decimal: 'decimal';
    readonly real: 'float';
    readonly float: 'float';
    readonly nvarchar: 'string';
    readonly varbinary: 'binary';
    readonly date: 'date';
    readonly time: 'time';
    readonly datetime2: 'timestamp';
    readonly datetimeoffset: 'timestamp';
};
/** Required for creation and subsequent writes involving indexed computed columns. */
export declare const sqlServerKeySessionOptions: {
    readonly ANSI_NULLS: 'ON';
    readonly QUOTED_IDENTIFIER: 'ON';
    readonly ANSI_PADDING: 'ON';
    readonly ANSI_WARNINGS: 'ON';
    readonly ARITHABORT: 'ON';
    readonly CONCAT_NULL_YIELDS_NULL: 'ON';
    readonly NUMERIC_ROUNDABORT: 'OFF';
};
