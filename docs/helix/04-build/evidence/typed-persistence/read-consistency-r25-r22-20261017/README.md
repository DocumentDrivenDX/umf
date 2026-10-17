# R25/R22 read-consistency regression

These are ordinary owned local PostgreSQL18.6 regression tests. The unchanged original compiler request and SQL are retained. SDK R25 / Weft R22 are predecessor packages, not a corrected qualification.

The direct mechanism case uses the fresh fixture bootstrap role and does not qualify SDK actor admission. Its original pre/post reader admissions are both true, the value-preserving rewrite changes relfilenode, and the original RR query loses both rows. Taking original AccessShare locks before ROLE keeps backend_xmin null, blocks the rewrite, and returns both rows.

The separate public stream case uses the actual installed PostgresTarget.stream, ReviewedSQL.build with an authored keyset request, and a SELECT-only NOSUPER/NOBYPASS fixture actor. It reproduces empty SDK output while an independent connection retains both rows. The transport hook performs the fixture rewrite immediately before the unchanged original relation lock. No runtime or compiled artifact was edited.

R1 public import failure and R2 invalid harness assertion failed before server start; R3 is the actual native red. Both native runs restored their fixture and stopped the owned server. No database data directory, binary, wheel, credential, or private engine implementation is included. The exact executed harnesses retain their recorded original /tmp input paths.
