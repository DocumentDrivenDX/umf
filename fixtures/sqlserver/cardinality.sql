CREATE SCHEMA cardinality;
GO
CREATE TABLE cardinality.plain(value nvarchar(max) NULL);
CREATE TABLE cardinality.json_value(value nvarchar(max) NULL CHECK(ISJSON(value)=1));
CREATE TABLE cardinality.array_value(value nvarchar(max) NULL CHECK(ISJSON(value,ARRAY)=1));
CREATE TABLE cardinality.object_value(value nvarchar(max) NULL CHECK(ISJSON(value,OBJECT)=1));
CREATE TABLE cardinality.untrusted(value nvarchar(max) NULL);
INSERT INTO cardinality.untrusted VALUES(N'7');
ALTER TABLE cardinality.untrusted WITH NOCHECK ADD CONSTRAINT untrusted_array CHECK(ISJSON(value,ARRAY)=1);
CREATE TABLE cardinality.disabled(value nvarchar(max) NULL CONSTRAINT disabled_array CHECK(ISJSON(value,ARRAY)=1));
ALTER TABLE cardinality.disabled NOCHECK CONSTRAINT disabled_array;
CREATE TABLE cardinality.scalar_value(value bigint NULL);
