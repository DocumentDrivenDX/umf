SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
CREATE SCHEMA sales;
GO
CREATE TABLE sales.Items(id int NOT NULL, email nvarchar(80) NULL, active bit NOT NULL,
 payload nvarchar(80) NULL, CONSTRAINT PK_Items PRIMARY KEY CLUSTERED(id));
CREATE UNIQUE NONCLUSTERED INDEX UX_Items_active_email ON sales.Items(email DESC)
 INCLUDE(payload) WHERE active=1 AND email IS NOT NULL WITH(FILLFACTOR=80,PAD_INDEX=ON);
CREATE INDEX IX_Items_disabled ON sales.Items(payload) INCLUDE(active);
ALTER INDEX IX_Items_disabled ON sales.Items DISABLE;
CREATE TABLE sales.Disabled(id int NOT NULL,code int NULL);
CREATE UNIQUE INDEX UX_Disabled_code ON sales.Disabled(code);
ALTER INDEX UX_Disabled_code ON sales.Disabled DISABLE;
CREATE TABLE sales.Heap(id int NOT NULL, note varchar(20) NULL);
CREATE INDEX IX_Heap_cover ON sales.Heap(id DESC) INCLUDE(note) WITH(IGNORE_DUP_KEY=OFF);
CREATE TABLE sales.Analytics(region int NOT NULL,amount int NOT NULL,note varchar(20) NULL);
CREATE CLUSTERED COLUMNSTORE INDEX CCI_Analytics ON sales.Analytics ORDER(region,amount);
CREATE PARTITION FUNCTION pf_events(int) AS RANGE RIGHT FOR VALUES(10,20);
CREATE PARTITION SCHEME ps_events AS PARTITION pf_events ALL TO ([PRIMARY]);
CREATE TABLE sales.Events(id int NOT NULL,day_id int NOT NULL,note varchar(20) NULL) ON ps_events(day_id);
CREATE CLUSTERED INDEX CX_Events ON sales.Events(id,day_id DESC) ON ps_events(day_id);
