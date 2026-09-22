-- Scalar shape is independent of value range, identity and SQL NULL.
CREATE TABLE cardinality.scalars (
 flag boolean, i16 smallint, i32 integer, i64 bigint, amount numeric,
 f32 real, f64 double precision, label text, bounded varchar(8), fixed char(3),
 bytes bytea, day date, clock time, zoned_clock timetz,
 moment timestamp, instant timestamptz, identifier uuid,
 positive cardinality.positive
);
