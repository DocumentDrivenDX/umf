CREATE SCHEMA sales;
GO
CREATE TYPE sales.Amount FROM decimal(18,4) NOT NULL;
GO
CREATE TABLE sales.Types (
 id bigint IDENTITY(9007199254740993,1) PRIMARY KEY,
 flag bit NOT NULL DEFAULT 1, tiny tinyint, small smallint, ordinary int,
 exact decimal(38,9), numeric_value numeric(20,3), cash money, small_cash smallmoney,
 approximate float(53), single real,
 words varchar(40) COLLATE Latin1_General_100_BIN2, unicode_words nvarchar(40),
 unlimited nvarchar(max), fixed_text char(4), unicode_fixed nchar(4),
 bytes varbinary(max), fixed_bytes binary(8), version_stamp rowversion,
 day date, clock time(7), local_stamp datetime2(7), instant datetimeoffset(7),
 legacy_stamp datetime, small_stamp smalldatetime, amount sales.Amount,
 identifier uniqueidentifier, document xml, variant sql_variant,
 computed AS (ordinary + 1) PERSISTED
);
GO
CREATE TABLE sales.LegacyTimestamp (id int, version_stamp timestamp);
EXEC sys.sp_addextendedproperty @name=N'MS_Description',@value=N'Exact decimal amount',
 @level0type=N'SCHEMA',@level0name=N'sales',@level1type=N'TABLE',@level1name=N'Types',@level2type=N'COLUMN',@level2name=N'exact';
