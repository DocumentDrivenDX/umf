CREATE SCHEMA cardinality;
CREATE TABLE cardinality.declared (value integer[3]);
CREATE TABLE cardinality.sequence (value integer[] CHECK (
 value IS NULL OR cardinality(value)=0 OR
 (array_ndims(value)=1 AND array_lower(value,1)=1)
));
CREATE DOMAIN cardinality.positive AS integer CHECK (VALUE>0);
CREATE DOMAIN cardinality.vector AS integer[];
CREATE TABLE cardinality.domains (items cardinality.positive[], vector cardinality.vector);
CREATE TABLE cardinality.json_values (value json);
CREATE TABLE cardinality.jsonb_values (value jsonb);
CREATE TABLE cardinality.jsonb_object (value jsonb CHECK (jsonb_typeof(value)='object'));
CREATE TABLE cardinality.vectorish (value int2vector);
