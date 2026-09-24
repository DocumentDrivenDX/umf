CREATE DOMAIN sales.text AS integer CHECK (VALUE >= 0);
CREATE TABLE sales.scalar_types (
 flag boolean, small smallint, ordinary integer, large bigint,
 exact numeric(20,4), single real, wide double precision,
 words text, bounded varchar(20), padded char(4), data bytea,
 day date, clock time(3), zoned_clock time with time zone,
 local_stamp timestamp(6), instant timestamp with time zone,
 items integer[], domain_value sales.text, document jsonb, identifier uuid
);
COMMENT ON COLUMN sales.scalar_types.exact IS 'Exact amount with native precision and scale';
