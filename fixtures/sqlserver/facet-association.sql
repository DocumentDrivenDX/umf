CREATE SCHEMA facet_association;
GO
CREATE TABLE facet_association.ranged(value int, other int, CONSTRAINT range_value CHECK(value>=0 AND value<=255));
CREATE TABLE facet_association.escaped([a]] AND b] int, other int, CONSTRAINT range_escaped CHECK([a]] AND b]>=0 AND [a]] AND b]<=255));
CREATE TABLE facet_association.cross_column(value int, other int, CONSTRAINT cross_sum CHECK(value+other<=255));
CREATE TABLE facet_association.compound(value int, other int, CONSTRAINT cross_terms CHECK(value>=0 AND other<=255));
CREATE TABLE facet_association.disabled(value int, other int, CONSTRAINT disabled_range CHECK(value>=0 AND value<=255));
ALTER TABLE facet_association.disabled NOCHECK CONSTRAINT disabled_range;
CREATE TABLE facet_association.untrusted(value int, other int);
INSERT INTO facet_association.untrusted VALUES(256,0);
ALTER TABLE facet_association.untrusted WITH NOCHECK ADD CONSTRAINT untrusted_range CHECK(value>=0 AND value<=255);
GO
