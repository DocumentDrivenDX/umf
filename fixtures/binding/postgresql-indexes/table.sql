CREATE TABLE orders (
  id text NOT NULL,
  code text NOT NULL,
  status text NOT NULL,
  payload jsonb,
  loc point
);
