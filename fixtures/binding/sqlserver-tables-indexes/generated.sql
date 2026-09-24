IF SCHEMA_ID(N'sales') IS NULL EXEC(N'CREATE SCHEMA [sales]');
CREATE TABLE [sales].[Items] (
  [id] int NOT NULL,
  [email] nvarchar(80) NULL,
  [payload] nvarchar(max) NULL,
  CONSTRAINT [CK_Items_payload_json] CHECK ([payload] IS NULL OR ISJSON([payload], OBJECT)=1)
);
CREATE TABLE [sales].[Shipments] (
  [id] int NOT NULL,
  [part] int NOT NULL,
  [label] nvarchar(120) NULL
) ON [ps_umf_ship]([part]);
CREATE NONCLUSTERED INDEX [IX_Items_Id] ON [sales].[Items] ([id]);
CREATE UNIQUE NONCLUSTERED INDEX [UX_Items_Email] ON [sales].[Items] ([email]);
CREATE NONCLUSTERED INDEX [IX_Items_Positive] ON [sales].[Items] ([id]) WHERE [id] > 0;
