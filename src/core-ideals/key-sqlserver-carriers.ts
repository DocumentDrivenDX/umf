export const sqlServerKeyCarriers={bit:'boolean',tinyint:'integer',smallint:'integer',int:'integer',bigint:'integer',decimal:'decimal',real:'float',float:'float',nvarchar:'string',varbinary:'binary',date:'date',time:'time',datetime2:'timestamp',datetimeoffset:'timestamp'} as const;
/** Required for creation and subsequent writes involving indexed computed columns. */
export const sqlServerKeySessionOptions={ANSI_NULLS:'ON',QUOTED_IDENTIFIER:'ON',ANSI_PADDING:'ON',ANSI_WARNINGS:'ON',ARITHABORT:'ON',CONCAT_NULL_YIELDS_NULL:'ON',NUMERIC_ROUNDABORT:'OFF'} as const;
