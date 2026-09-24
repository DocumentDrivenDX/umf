CREATE NONCLUSTERED INDEX [umf_email_btree] ON [sales].[Items] ([email]) INCLUDE ([payload]);
CREATE UNIQUE NONCLUSTERED INDEX [umf_id_unique] ON [sales].[Items] ([id]);
CREATE NONCLUSTERED INDEX [umf_active_filtered] ON [sales].[Items] ([active]) WHERE [active] = 1;
