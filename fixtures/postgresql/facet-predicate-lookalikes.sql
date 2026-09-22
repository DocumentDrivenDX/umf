CREATE SCHEMA facet_shadow;
CREATE FUNCTION facet_shadow.char_length(text) RETURNS integer
 LANGUAGE sql IMMUTABLE STRICT AS 'SELECT 0';
CREATE FUNCTION facet_shadow.trunc(numeric,integer) RETURNS numeric
 LANGUAGE sql IMMUTABLE STRICT AS 'SELECT $1';
CREATE FUNCTION facet_shadow.numeric_le(numeric,numeric) RETURNS boolean
 LANGUAGE sql IMMUTABLE STRICT AS 'SELECT true';
CREATE OPERATOR facet_shadow.<= (LEFTARG=numeric,RIGHTARG=numeric,FUNCTION=facet_shadow.numeric_le);
CREATE TABLE facet_shadow.length_check(value text CHECK (facet_shadow.char_length(value)<=2));
CREATE TABLE facet_shadow.scale_check(value numeric CHECK (value=facet_shadow.trunc(value,2)));
CREATE TABLE facet_shadow.bound_check(value numeric CHECK (value OPERATOR(facet_shadow.<=) 999.99));
CREATE TABLE facet_shadow.multi_column(value integer, other integer, CHECK (value<=other));
