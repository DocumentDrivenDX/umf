CREATE SCHEMA sales;
CREATE TABLE sales.edits (
  id bigint GENERATED ALWAYS AS IDENTITY (START WITH 9007199254740993),
  amount numeric(10,3) DEFAULT 1.234,
  label varchar(32),
  qty integer CONSTRAINT qty_floor CHECK (qty >= 10)
);
COMMENT ON COLUMN sales.edits.label IS 'Edited customer''s label — 注文';
CREATE UNIQUE INDEX edits_label_unique ON sales.edits(label) WHERE qty > 10;
