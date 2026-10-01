CREATE SCHEMA IF NOT EXISTS "sales";
CREATE TABLE "sales"."orders" (
  "id" bigint NOT NULL,
  "tenant" text NOT NULL,
  "customerId" bigint NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb,
  CONSTRAINT "ck_orders_payload_object" CHECK ("payload" IS NULL OR jsonb_typeof("payload") = 'object')
);
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
CREATE TABLE "sales"."buckets" (
  "id" bigint NOT NULL,
  "tenant" bigint NOT NULL
) PARTITION BY LIST ("tenant");
CREATE TABLE "sales"."buckets_default" PARTITION OF "sales"."buckets" DEFAULT;
CREATE SCHEMA IF NOT EXISTS "archive";
CREATE TABLE "archive"."buckets" (
  "id" bigint NOT NULL,
  "tenant" bigint NOT NULL
) PARTITION BY LIST ("tenant");
CREATE TABLE "archive"."buckets_default" PARTITION OF "archive"."buckets" DEFAULT;
ALTER TABLE "sales"."orders" ADD CONSTRAINT "pk_orders" PRIMARY KEY ("id");
ALTER TABLE "sales"."customers" ADD CONSTRAINT "pk_customers" PRIMARY KEY ("id");
ALTER TABLE "sales"."products" ADD CONSTRAINT "pk_products" PRIMARY KEY ("id");
ALTER TABLE "sales"."order_products" ADD CONSTRAINT "pk_order_products" PRIMARY KEY ("id");
ALTER TABLE "sales"."buckets" ADD CONSTRAINT "pk_buckets" PRIMARY KEY ("id", "tenant");
ALTER TABLE "archive"."buckets" ADD CONSTRAINT "pk_buckets2" PRIMARY KEY ("id", "tenant");
ALTER TABLE "sales"."orders" ADD CONSTRAINT "fk_orders_customer" FOREIGN KEY ("customerId") REFERENCES "sales"."customers" ("id");
ALTER TABLE "sales"."order_products" ADD CONSTRAINT "fk_order_products_order" FOREIGN KEY ("orderId") REFERENCES "sales"."orders" ("id");
ALTER TABLE "sales"."order_products" ADD CONSTRAINT "fk_order_products_product" FOREIGN KEY ("productId") REFERENCES "sales"."products" ("id");
CREATE INDEX "orders_btree" ON "sales"."orders" USING btree ("status");
CREATE INDEX "orders_hash" ON "sales"."orders" USING hash ("customerId");
CREATE INDEX "orders_expression" ON "sales"."orders" USING btree (("payload" #>> ARRAY['customer','region']::text[]));
CREATE INDEX "orders_partial" ON "sales"."orders" USING btree ("status") WHERE ("status" = 'paid');
CREATE UNIQUE INDEX "orders_unique" ON "sales"."orders" USING btree ("id");
