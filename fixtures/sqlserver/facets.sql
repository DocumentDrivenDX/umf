CREATE SCHEMA facet;
GO
CREATE TYPE facet.Amount FROM decimal(5,2) NULL;
GO
CREATE FUNCTION facet.always_true(@value int) RETURNS bit AS BEGIN RETURN 1; END;
GO
CREATE TABLE facet.integers(tiny tinyint, small smallint, ordinary int, wide bigint);
CREATE TABLE facet.signed8(value smallint CHECK(value >= -128 AND value <= 127));
CREATE TABLE facet.unsigned16(value int CHECK(value >= 0 AND value <= 65535));
CREATE TABLE facet.decimal52(value decimal(5,2));
CREATE TABLE facet.decimal33(value decimal(3,3));
CREATE TABLE facet.decimal380(value decimal(38,0));
CREATE TABLE facet.decimal3838(value decimal(38,38));
CREATE TABLE facet.decimal_checked(value decimal(5,2) CHECK(value = ROUND(value,2,1)));
CREATE TABLE facet.alias_value(value facet.Amount);
CREATE TABLE facet.floats(single_value real, low_precision float(1), high_precision float(25), double_value float(53));
CREATE TABLE facet.nvarchar1(value nvarchar(1) COLLATE Latin1_General_100_CI_AS_SC);
CREATE TABLE facet.nvarchar2(value nvarchar(2) COLLATE Latin1_General_100_CI_AS_SC);
CREATE TABLE facet.nvarchar_legacy(value nvarchar(2) COLLATE Latin1_General_100_CI_AS);
CREATE TABLE facet.varchar_utf8(value varchar(4) COLLATE Latin1_General_100_CI_AS_SC_UTF8);
CREATE TABLE facet.varchar_legacy(value varchar(2) COLLATE Latin1_General_100_CI_AS);
CREATE TABLE facet.nchar2(value nchar(2) COLLATE Latin1_General_100_CI_AS_SC);
CREATE TABLE facet.char2(value char(2) COLLATE Latin1_General_100_CI_AS);
CREATE TABLE facet.binary2(value binary(2));
CREATE TABLE facet.varbinary2(value varbinary(2));
CREATE TABLE facet.length_len(value nvarchar(max) COLLATE Latin1_General_100_CI_AS_SC CHECK(LEN(value)<=2));
CREATE TABLE facet.length_sentinel(value nvarchar(max) COLLATE Latin1_General_100_CI_AS_SC CHECK(LEN(value+N'x')-1<=2));
CREATE TABLE facet.length_zero(value nvarchar(max) COLLATE Latin1_General_100_CI_AS_SC CHECK(DATALENGTH(value)=0));
CREATE TABLE facet.bytes_bound(value varbinary(max) CHECK(DATALENGTH(value)<=2));
CREATE TABLE facet.untrusted(value int);
INSERT INTO facet.untrusted VALUES(256);
ALTER TABLE facet.untrusted WITH NOCHECK ADD CONSTRAINT unsigned8_untrusted CHECK(value >= 0 AND value <= 255);
CREATE TABLE facet.disabled(value int CONSTRAINT unsigned8_disabled CHECK(value >= 0 AND value <= 255));
ALTER TABLE facet.disabled NOCHECK CONSTRAINT unsigned8_disabled;
CREATE TABLE facet.replica_value(value int CONSTRAINT unsigned8_replication CHECK NOT FOR REPLICATION(value >= 0 AND value <= 255));
CREATE TABLE facet.custom(value int CHECK(facet.always_true(value)=1));
CREATE TABLE facet.temporal(value datetime2(7));
GO
CREATE TABLE facet.filtered_unique(value int,active bit);
CREATE UNIQUE INDEX filtered_unique ON facet.filtered_unique(value) WHERE active=1;
CREATE TABLE facet.disabled_unique(value int);
CREATE UNIQUE INDEX disabled_unique ON facet.disabled_unique(value);
ALTER INDEX disabled_unique ON facet.disabled_unique DISABLE;
GO
