CREATE SCHEMA sales;
CREATE TABLE sales.edits (
  id bigint GENERATED ALWAYS AS IDENTITY (START WITH 9007199254740993),
  amount numeric(8,2) DEFAULT 1.25,
  label varchar(8) NOT NULL,
  qty integer CONSTRAINT qty_floor CHECK (qty >= 1)
);
COMMENT ON COLUMN sales.edits.label IS 'Original label';
CREATE UNIQUE INDEX edits_label_unique ON sales.edits(label) WHERE qty > 0;
