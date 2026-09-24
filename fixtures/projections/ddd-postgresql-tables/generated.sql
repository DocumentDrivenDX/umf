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
  "sku" text NOT NULL,
  "payload" jsonb,
  CONSTRAINT "ck_products_payload_object" CHECK ("payload" IS NULL OR jsonb_typeof("payload") = 'object')
);
CREATE TABLE "sales"."order_products" (
  "id" bigint NOT NULL,
  "orderId" bigint NOT NULL,
  "productId" bigint NOT NULL,
  "quantity" numeric(12,2) NOT NULL
);
