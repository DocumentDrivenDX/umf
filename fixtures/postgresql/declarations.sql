CREATE SCHEMA sales;
CREATE DOMAIN sales.text AS integer CHECK (VALUE >= 0);
SET search_path = sales, pg_catalog;
CREATE TABLE sales.base (inherited integer);
CREATE TABLE sales.orders (
 id bigint PRIMARY KEY,
 amount numeric(20,4),
 label text,
 catalog_text pg_catalog.text,
 items int[],
 custom sales.text,
 flag boolean DEFAULT true,
 created timestamp with time zone,
 LIKE sales.base INCLUDING ALL
);
CREATE SCHEMA support CREATE TABLE tickets (id integer, subject pg_catalog.text);
ALTER TABLE sales.orders ADD COLUMN extra integer;
ALTER TABLE sales.orders ALTER COLUMN label TYPE pg_catalog.text USING label::pg_catalog.text;
