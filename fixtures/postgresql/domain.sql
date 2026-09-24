-- Authored schema: exact numeric defaults, names, relationships and generated values.
CREATE SCHEMA sales;
CREATE TYPE sales.order_state AS ENUM ('new', 'paid', 'cancelled');
CREATE DOMAIN sales.money_amount AS numeric(38,9) CHECK (VALUE >= 0);
CREATE TABLE sales.orders (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 external_id uuid UNIQUE NOT NULL,
 state sales.order_state NOT NULL DEFAULT 'new',
 total sales.money_amount DEFAULT 9007199254740993.123456789,
 details jsonb,
 tags text[] DEFAULT ARRAY[]::text[],
 created_at timestamptz DEFAULT now(),
 subtotal numeric GENERATED ALWAYS AS (total / 1.2) STORED,
 CONSTRAINT positive_total CHECK (total >= 0)
);
CREATE TABLE sales.order_lines (
 order_id bigint REFERENCES sales.orders(id) ON DELETE CASCADE,
 line_no integer NOT NULL,
 quantity integer CHECK (quantity > 0),
 PRIMARY KEY (order_id, line_no)
);
CREATE INDEX paid_orders ON sales.orders (created_at DESC) WHERE state = 'paid';
COMMENT ON COLUMN sales.orders.total IS 'Exact amount — café';
