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
CREATE TABLE "sales"."edges" (
  "relationship" text COLLATE pg_catalog."C" NOT NULL,
  "orderId" bigint NOT NULL,
  "productId" bigint NOT NULL,
  CONSTRAINT "ck_edges_relationship_values" CHECK ("relationship" IN (E'products', E'secondary'))
);
ALTER TABLE "sales"."orders" ADD CONSTRAINT "pk_orders" PRIMARY KEY ("id");
ALTER TABLE "sales"."customers" ADD CONSTRAINT "pk_customers" PRIMARY KEY ("id");
ALTER TABLE "sales"."products" ADD CONSTRAINT "pk_products" PRIMARY KEY ("id");
ALTER TABLE "sales"."order_products" ADD CONSTRAINT "pk_order_products" PRIMARY KEY ("id");
ALTER TABLE "sales"."orders" ADD CONSTRAINT "fk_orders_customer" FOREIGN KEY ("customerId") REFERENCES "sales"."customers" ("id");
ALTER TABLE "sales"."edges" ADD CONSTRAINT "fk_order_products_order" FOREIGN KEY ("orderId") REFERENCES "sales"."orders" ("id");
ALTER TABLE "sales"."edges" ADD CONSTRAINT "fk_order_products_product" FOREIGN KEY ("productId") REFERENCES "sales"."products" ("id");
ALTER TABLE "sales"."edges" ADD CONSTRAINT "fk_order_products_order2" FOREIGN KEY ("orderId") REFERENCES "sales"."orders" ("id");
ALTER TABLE "sales"."edges" ADD CONSTRAINT "fk_order_products_product2" FOREIGN KEY ("productId") REFERENCES "sales"."products" ("id");
CREATE INDEX "orders_btree" ON "sales"."orders" USING btree ("status");
CREATE INDEX "orders_hash" ON "sales"."orders" USING hash ("customerId");
CREATE INDEX "orders_expression" ON "sales"."orders" USING btree (("payload" #>> ARRAY['customer','region']::text[]));
CREATE INDEX "orders_partial" ON "sales"."orders" USING btree ("status") WHERE ("status" = 'paid');
CREATE UNIQUE INDEX "orders_unique" ON "sales"."orders" USING btree ("id");
