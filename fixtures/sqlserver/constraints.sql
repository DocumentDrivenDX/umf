CREATE SCHEMA sales;
GO
CREATE TABLE sales.Parent (
 a int NOT NULL,b int NOT NULL,code nvarchar(20) NULL,
 CONSTRAINT PK_Parent PRIMARY KEY(a ASC,b DESC),
 CONSTRAINT UQ_Parent_reverse UNIQUE(b,a),
 CONSTRAINT UQ_Parent_code UNIQUE(code)
);
CREATE TABLE sales.Child (
 id int NOT NULL,parent_b int NULL,parent_a int NULL,qty int NULL,other int NULL,
 CONSTRAINT PK_Child PRIMARY KEY(id),
 CONSTRAINT FK_Child_Parent FOREIGN KEY(parent_b,parent_a) REFERENCES sales.Parent(b,a)
 ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT CK_Child_qty CHECK NOT FOR REPLICATION(qty>=0)
);
ALTER TABLE sales.Child WITH NOCHECK ADD CONSTRAINT CK_Child_other CHECK(other>0);
ALTER TABLE sales.Child ADD CONSTRAINT CK_Child_disabled CHECK(id>0);
ALTER TABLE sales.Child NOCHECK CONSTRAINT CK_Child_disabled;
CREATE TABLE sales.Untrusted (
 id int NOT NULL CONSTRAINT PK_Untrusted PRIMARY KEY,
 parent_code nvarchar(20) NULL,
 CONSTRAINT FK_Untrusted_Parent FOREIGN KEY(parent_code) REFERENCES sales.Parent(code)
);
ALTER TABLE sales.Untrusted NOCHECK CONSTRAINT FK_Untrusted_Parent;
ALTER TABLE sales.Untrusted CHECK CONSTRAINT FK_Untrusted_Parent;
