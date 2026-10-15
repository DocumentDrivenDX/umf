# External delegated reads survive namespace lockdown — 2026-10-15

A root-owned PostgreSQL fixture copied the in-progress Truss activation source
before execution. Its original positive guarded-query workflow passed. Immediately
before the actual activation call, a test-only pre-existing outside-schema SQL
SECURITY DEFINER function was created, owned by the original runtime owner and
PUBLIC executable. Its body reads truss.object via owner authority. No DDL was
performed after activation.

Activation returned Ok and committed. The original guarded query still returned
only the permitted masked salary, with exact signed64 predicate/refusal checks.
Ordinary raw-table SELECT privilege was false. The same ordinary caller could
nevertheless invoke public.preexisting_raw_resource() and receive all six native
objects, including denied r2 rawsalary9007199254740993/token and hidden Assignment
facts. Runtime stopped, lease released, test directory absent.

This violates the intended CONTRACT-063 NativeInventory callable-wrapper
exclusion and is an unmet US-056-AC5/AC8 requirement. Revoking truss-schema
function grants alone cannot close database-wide delegated authority. Truss
acknowledged the reproduction and is adding conservative privileged external
routine checks and dependency-derived external view checks before committing
activation. These prospective fixes are not verified by this discovery packet.

Source is a copied uncommitted owner working snapshot, not a released/main
protected profile. snapshot-pins.json records copied source files; original ZIP
also includes the separately copied acceptance fixture, which was not in the
pre-run pin list. This probe invoked the positive/exact-neighbor/ORDER/byte-limit
method only, not separate FALSE or empty-result methods. Probe and original log
are retained. No newly recorded executable/binary/module-loading custody is
claimed by this discovery run, nor a general all-path exploit beyond this exact
pre-existing delegation. Probe uses the prior private ABI2 Weft extraction and
original UMF bundle; no new binary qualification is inferred from those paths.

No backend case promoted:45/158 accepted,113 unimplemented remain. Discovery
strengthens the existing B04/B05/B10/B14 procedural obligations without inventing
new case IDs or retiring original requirements.

Independent Astra review confirms the concrete gap in this retained uncommitted
snapshot:1,142 copied source pins and9 evidence checks pass. No database rerun
was performed by the reviewer. Source/evidence limitations above remain.
