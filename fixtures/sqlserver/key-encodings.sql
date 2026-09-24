SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
EXEC(N'CREATE SCHEMA umf_key_encoding');
-- Length prevents native comparison padding from collapsing different byte strings.
CREATE TABLE umf_key_encoding.binary_primary (
 value varbinary(32) NOT NULL,
 key_bytes AS CONVERT(varbinary(32),value) PERSISTED NOT NULL,
 key_length AS DATALENGTH(value) PERSISTED NOT NULL,
 CONSTRAINT PK_binary_encoding PRIMARY KEY NONCLUSTERED(key_bytes,key_length)
);
CREATE TABLE umf_key_encoding.text_primary (
 value nvarchar(32) COLLATE Latin1_General_100_CI_AI NOT NULL,
 key_bytes AS CONVERT(varbinary(64),value) PERSISTED NOT NULL,
 key_length AS DATALENGTH(value) PERSISTED NOT NULL,
 CONSTRAINT PK_text_encoding PRIMARY KEY NONCLUSTERED(key_bytes,key_length)
);
CREATE TABLE umf_key_encoding.compound (
 tenant int NOT NULL,
 value nvarchar(32) COLLATE Latin1_General_100_CI_AI NOT NULL,
 external_id varbinary(32) NOT NULL,
 key_text_bytes AS CONVERT(varbinary(64),value) PERSISTED NOT NULL,
 key_text_length AS DATALENGTH(value) PERSISTED NOT NULL,
 key_external_bytes AS CONVERT(varbinary(32),external_id) PERSISTED NOT NULL,
 key_external_length AS DATALENGTH(external_id) PERSISTED NOT NULL,
 CONSTRAINT PK_compound_encoding PRIMARY KEY NONCLUSTERED(tenant,key_text_bytes,key_text_length),
 CONSTRAINT UQ_external_encoding UNIQUE NONCLUSTERED(key_external_bytes,key_external_length)
);
