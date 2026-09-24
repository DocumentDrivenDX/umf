CREATE SCHEMA IF NOT EXISTS "sales";
CREATE TABLE "sales"."orders" (
  "id" bigint NOT NULL,
  "tenant" text NOT NULL,
  "customerId" bigint NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb,
  CONSTRAINT "ck_orders_payload_object" CHECK ("payload" IS NULL OR jsonb_typeof("payload") = 'object')
) PARTITION BY LIST ("tenant");
CREATE TABLE "sales"."orders_default" PARTITION OF "sales"."orders" DEFAULT;
CREATE TABLE "sales"."customers" (
  "id" bigint NOT NULL,
  "name" text NOT NULL
);
CREATE TABLE "sales"."products" (
  "id" bigint NOT NULL,
  "sku" text NOT NULL
);
CREATE TABLE "sales"."order_products" (
  "id" bigint NOT NULL,
  "orderId" bigint NOT NULL,
  "productId" bigint NOT NULL,
  "quantity" numeric(12,2) NOT NULL
);
CREATE INDEX "orders_btree" ON "sales"."orders" USING btree ("status");
CREATE INDEX "orders_hash" ON "sales"."orders" USING hash ("customerId");
CREATE INDEX "orders_expression" ON "sales"."orders" USING btree (("payload" #>> ARRAY['customer','region']::text[]));
CREATE INDEX "orders_partial" ON "sales"."orders" USING btree ("status") WHERE ("status" = 'paid');
