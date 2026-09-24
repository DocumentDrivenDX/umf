SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
IF SCHEMA_ID(N'sales') IS NULL EXEC(N'CREATE SCHEMA [sales]');
CREATE TABLE [sales].[LegacyTimestamp] (
  [id] int NULL,
  [version_stamp] timestamp NOT NULL
);
CREATE TABLE [sales].[Types] (
  [id] bigint IDENTITY(9007199254740993,1) NOT NULL,
  [flag] bit NOT NULL DEFAULT ((1)),
  [tiny] tinyint NULL,
  [small] smallint NULL,
  [ordinary] int NULL,
  [exact] decimal(38,9) NULL,
  [numeric_value] numeric(20,3) NULL,
  [cash] money NULL,
  [small_cash] smallmoney NULL,
  [approximate] float(53) NULL,
  [single] real NULL,
  [words] varchar(40) COLLATE Latin1_General_100_BIN2 NULL,
  [unicode_words] nvarchar(40) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [unlimited] nvarchar(max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [fixed_text] char(4) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [unicode_fixed] nchar(4) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [bytes] varbinary(max) NULL,
  [fixed_bytes] binary(8) NULL,
  [version_stamp] timestamp NOT NULL,
  [day] date NULL,
  [clock] time(7) NULL,
  [local_stamp] datetime2(7) NULL,
  [instant] datetimeoffset(7) NULL,
  [legacy_stamp] datetime NULL,
  [small_stamp] smalldatetime NULL,
  [amount] decimal(18,4) NOT NULL,
  [identifier] uniqueidentifier NULL,
  [document] xml NULL,
  [variant] sql_variant NULL,
  [computed] AS ([ordinary]+(1))
);
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Exact decimal amount', @level0type=N'SCHEMA', @level0name=N'sales', @level1type=N'TABLE', @level1name=N'Types', @level2type=N'COLUMN', @level2name=N'exact';
ALTER TABLE [sales].[Types] ADD CONSTRAINT [PK__Types__3213E83FF3BFB29D] PRIMARY KEY CLUSTERED ([id] ASC) WITH (IGNORE_DUP_KEY=OFF);
