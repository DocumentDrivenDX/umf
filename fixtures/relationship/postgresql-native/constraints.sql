CREATE SCHEMA rel;
CREATE TABLE rel.parent (
  id integer PRIMARY KEY,
  alt text NOT NULL UNIQUE,
  part_a integer NOT NULL,
  part_b integer NOT NULL,
  CONSTRAINT uq_parent_pair UNIQUE (part_a, part_b)
);
CREATE TABLE rel.child (
  id integer PRIMARY KEY,
  parent_alt text,
  parent_a integer,
  parent_b integer
);
ALTER TABLE rel.child ADD CONSTRAINT fk_alt FOREIGN KEY (parent_alt)
  REFERENCES rel.parent (alt) NOT VALID;
ALTER TABLE rel.child ADD CONSTRAINT fk_pair FOREIGN KEY (parent_a, parent_b)
  REFERENCES rel.parent (part_a, part_b) MATCH SIMPLE;
