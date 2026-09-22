CREATE SCHEMA availability;
GO
CREATE TYPE availability.required_alias FROM int NOT NULL;
GO
CREATE TABLE availability.plain(value int NULL);
CREATE TABLE availability.required(value int NOT NULL DEFAULT 7);
CREATE TABLE availability.positive(value int NULL CHECK(value > 0));
CREATE TABLE availability.checked_required(value int NULL CHECK(value IS NOT NULL));
CREATE TABLE availability.untrusted(value int NULL);
INSERT INTO availability.untrusted VALUES(NULL);
ALTER TABLE availability.untrusted WITH NOCHECK ADD CONSTRAINT required_later CHECK(value IS NOT NULL);
CREATE TABLE availability.disabled(value int NULL CONSTRAINT disabled_required CHECK(value IS NOT NULL));
ALTER TABLE availability.disabled NOCHECK CONSTRAINT disabled_required;
CREATE TABLE availability.computed(input int NULL, via_isnull AS ISNULL(input,7), via_coalesce AS COALESCE(input,7));
CREATE TABLE availability.identity_value(value int IDENTITY(1,1) NOT NULL, other int NULL);
CREATE TABLE availability.sparse_value(value int SPARSE NULL, other int NULL);
CREATE TABLE availability.version_value(other int NULL, value rowversion);
CREATE TABLE availability.alias_required(value availability.required_alias);
CREATE TABLE availability.alias_override(value availability.required_alias NULL);
CREATE TABLE availability.unique_value(value int NULL UNIQUE);
GO
CREATE VIEW availability.outer_null AS SELECT r.value FROM (VALUES(1)) AS l(id) LEFT JOIN availability.required r ON 1=0;
GO
