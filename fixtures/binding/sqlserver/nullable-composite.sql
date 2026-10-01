IF SCHEMA_ID(N'sales') IS NULL EXEC(N'CREATE SCHEMA [sales]');
CREATE TABLE [sales].[orders] (
  [id] bigint NOT NULL,
  [tenant] nvarchar(80) NOT NULL,
  [customerId] bigint NOT NULL,
  [status] nvarchar(80) NOT NULL,
  [customerCode] bigint NULL,
  [payload] nvarchar(max) NULL,
  CONSTRAINT [CK_orders_payload_json] CHECK ([payload] IS NULL OR ISJSON([payload], OBJECT)=1)
);
CREATE TABLE [sales].[customers] (
  [id] bigint NOT NULL,
  [name] nvarchar(80) NOT NULL,
  [code] bigint NOT NULL
);
CREATE TABLE [sales].[products] (
  [id] bigint NOT NULL,
  [sku] nvarchar(80) NOT NULL,
  [payload] nvarchar(max) NULL,
  CONSTRAINT [CK_products_payload_json] CHECK ([payload] IS NULL OR ISJSON([payload], OBJECT)=1)
);
CREATE TABLE [sales].[order_products] (
  [id] bigint NOT NULL,
  [orderId] bigint NOT NULL,
  [productId] bigint NOT NULL,
  [quantity] decimal(12,2) NOT NULL
);

ALTER TABLE [sales].[orders] ALTER COLUMN [tenant] nvarchar(80) COLLATE Latin1_General_100_BIN2 NOT NULL;
ALTER TABLE [sales].[orders] ALTER COLUMN [status] nvarchar(80) COLLATE Latin1_General_100_BIN2 NOT NULL;
ALTER TABLE [sales].[customers] ALTER COLUMN [name] nvarchar(80) COLLATE Latin1_General_100_BIN2 NOT NULL;
ALTER TABLE [sales].[products] ALTER COLUMN [sku] nvarchar(80) COLLATE Latin1_General_100_BIN2 NOT NULL;
ALTER TABLE [sales].[orders] ADD CONSTRAINT [pk_orders] PRIMARY KEY NONCLUSTERED ([id]);
ALTER TABLE [sales].[customers] ADD CONSTRAINT [pk_customers] PRIMARY KEY NONCLUSTERED ([id]);
ALTER TABLE [sales].[products] ADD CONSTRAINT [pk_products] PRIMARY KEY NONCLUSTERED ([id]);
ALTER TABLE [sales].[order_products] ADD CONSTRAINT [pk_order_products] PRIMARY KEY NONCLUSTERED ([id]);
ALTER TABLE [sales].[customers] ADD CONSTRAINT [uq_customers_composite] UNIQUE NONCLUSTERED ([id], [code]);
ALTER TABLE [sales].[orders] WITH CHECK ADD CONSTRAINT [fk_orders_customer] FOREIGN KEY ([customerId], [customerCode]) REFERENCES [sales].[customers] ([id], [code]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [sales].[order_products] WITH CHECK ADD CONSTRAINT [fk_order_products_product] FOREIGN KEY ([productId]) REFERENCES [sales].[products] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [sales].[order_products] WITH CHECK ADD CONSTRAINT [fk_order_products_order] FOREIGN KEY ([orderId]) REFERENCES [sales].[orders] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE NONCLUSTERED INDEX [IX_Orders_Status] ON [sales].[orders] ([status]) INCLUDE ([id]);
CREATE UNIQUE NONCLUSTERED INDEX [UX_Customers_Name] ON [sales].[customers] ([name]);
CREATE NONCLUSTERED INDEX [IX_Orders_Positive] ON [sales].[orders] ([id]) WHERE [id] > 0;

