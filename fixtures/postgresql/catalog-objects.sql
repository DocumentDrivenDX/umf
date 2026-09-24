-- Additional catalog families; all objects remain in the disposable test database.
CREATE TYPE sales.address AS (street text, postcode text);
CREATE TYPE sales.price_span AS RANGE (subtype = numeric, multirange_type_name = sales.price_spans);
CREATE COLLATION sales.code_order (provider = libc, locale = 'C');
CREATE SEQUENCE sales.ticket_numbers AS bigint START WITH 9007199254740993 INCREMENT BY 3 CACHE 2;
CREATE TABLE sales.inventory (
 code text COLLATE sales.code_order PRIMARY KEY,
 address sales.address,
 prices sales.price_span,
 history sales.price_spans,
 normalized text
);
CREATE FUNCTION sales.normalize_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.normalized := upper(NEW.code);
 RETURN NEW;
END
$$;
CREATE TRIGGER normalize_inventory BEFORE INSERT OR UPDATE OF code ON sales.inventory
 FOR EACH ROW EXECUTE FUNCTION sales.normalize_inventory();
COMMENT ON TRIGGER normalize_inventory ON sales.inventory IS 'Normalize display code — retain trigger intent';
CREATE MATERIALIZED VIEW sales.inventory_totals AS SELECT count(*) AS total FROM sales.inventory WITH NO DATA;
CREATE UNIQUE INDEX inventory_totals_unique ON sales.inventory_totals (total);
CREATE TABLE sales.row_encodings (
 id integer PRIMARY KEY,
 active boolean NOT NULL,
 optional_flag boolean,
 nullable_json jsonb,
 required_json jsonb NOT NULL,
 label text,
 small_value smallint NOT NULL
);
