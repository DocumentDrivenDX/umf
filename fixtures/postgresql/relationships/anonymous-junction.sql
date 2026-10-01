CREATE SCHEMA IF NOT EXISTS "sales";
CREATE TABLE "sales"."orders" (
  "id" bigint NOT NULL,
  "tenant" text COLLATE pg_catalog."C" NOT NULL,
  "customerId" bigint NOT NULL,
  "status" text COLLATE pg_catalog."C" NOT NULL
);
CREATE TABLE "sales"."customers" (
  "id" bigint NOT NULL,
  "name" text COLLATE pg_catalog."C" NOT NULL
);
CREATE TABLE "sales"."products" (
  "id" bigint NOT NULL,
  "sku" text COLLATE pg_catalog."C" NOT NULL
);
CREATE TABLE "sales"."order_products" (
  "id" bigint NOT NULL,
  "orderId" bigint NOT NULL,
  "productId" bigint NOT NULL,
  "quantity" numeric(12,2) NOT NULL
);
CREATE TABLE "sales"."links" (
  "orderId" bigint NOT NULL,
  "productId" bigint NOT NULL
);
ALTER TABLE "sales"."orders" ADD CONSTRAINT "pk_orders" PRIMARY KEY ("id") NOT DEFERRABLE;
ALTER TABLE "sales"."customers" ADD CONSTRAINT "pk_customers" PRIMARY KEY ("id") NOT DEFERRABLE;
ALTER TABLE "sales"."products" ADD CONSTRAINT "pk_products" PRIMARY KEY ("id") NOT DEFERRABLE;
ALTER TABLE "sales"."order_products" ADD CONSTRAINT "pk_order_products" PRIMARY KEY ("id") NOT DEFERRABLE;
ALTER TABLE "sales"."orders" ADD CONSTRAINT "fk_orders_customer" FOREIGN KEY ("customerId") REFERENCES "sales"."customers" ("id") MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION NOT DEFERRABLE;
ALTER TABLE "sales"."links" ADD CONSTRAINT "fk_order_products_order" FOREIGN KEY ("orderId") REFERENCES "sales"."orders" ("id") MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION NOT DEFERRABLE;
ALTER TABLE "sales"."links" ADD CONSTRAINT "fk_order_products_product" FOREIGN KEY ("productId") REFERENCES "sales"."products" ("id") MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION NOT DEFERRABLE;
