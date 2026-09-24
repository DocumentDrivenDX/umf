CREATE INDEX "orders_btree" ON "orders" USING btree ("id") INCLUDE ("code");
CREATE INDEX "orders_hash" ON "orders" USING hash ("code");
CREATE INDEX "orders_gin" ON "orders" USING gin ("payload");
CREATE INDEX "orders_gist" ON "orders" USING gist ("loc");
CREATE INDEX "orders_expr" ON "orders" USING btree (("payload" #>> ARRAY['customer','region']::text[]));
CREATE INDEX "orders_partial" ON "orders" USING btree ("status") WHERE ("status" = 'paid');
CREATE UNIQUE INDEX "orders_unique" ON "orders" USING btree ("id");
