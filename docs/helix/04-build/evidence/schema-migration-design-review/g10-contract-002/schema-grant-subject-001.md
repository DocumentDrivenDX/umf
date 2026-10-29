# G10 schema USAGE subject and source lowering 001

Normative design addendum proposed for the next governing G10 checkpoint. It
extends the unreleased inventory0.1 subject union, not any historical deployment
wire. Read with governing G10 contract001, its contract-proposal.md and
step-branches.md. Implementation and native acceptance remain outstanding.

## Exact subject and identity

Add ONLY this closed InventorySubject variant:

```json
{"kind":"schema-grant","schema":"<original configuration.schema>","audiences":["person","batch"],"privilege":"USAGE"}
```

Schema is the exact schema string in the selected original deployment
configuration. Audiences is exactly the two literal strings in that order;
privilege is exactly uppercase USAGE. Unknown/missing/extra members, reordered
or repeated audiences, arbitrary role names, grant options, other privileges,
and a schema differing from that original configuration refuse. The actual
grantees are configuration.personRole and configuration.batchRole. This is no
authority to create a schema or role, provision membership, or accept an
arbitrary schema-level grant.

The canonical subject above is its whole semantic identity, scoped by the
original source/configuration digests of its plan. Existing dependency identity
remains table-scoped and its table remains a required string. No null table or
fabricated table binding is admitted in that branch. Distinct physical role
names and the original source configuration remain in the full prefix meaning;
the audience labels do not replace original role identity or custody.

## Exact step and catalog mapping

The one additional exhaustive step-branches row is:

| Operation | Kind | Subject | Transaction | SQL | Branch extension |
| --- | --- | --- | --- | --- | --- |
| dependency-add | grant | schema-grant | required | existing combined UMF GRANT USAGE renderer | none |

All existing common step members remain mandatory and exact. SourcePath is
`/modules/<selected-module-index>/extensions/umf.tables`, derived from the actual
selected tables extension. It is not an options path or an author-supplied
pointer. SQL is exactly the existing compiler's single combined statement:
`GRANT USAGE ON SCHEMA <quoted-schema> TO <quoted-person-role>, <quoted-batch-role>`
with that renderer's exact termination and quoting. No parallel SQL renderer,
split per-audience steps, generic grant executor or empty-SQL fallback.

One step maps to BOTH source-derived catalog.grants rows: table null, actual
role personRole or batchRole respectively, privilege usage, columns null,
grantOption false, state present, effect grant-schema-usage, and original
sourcePath. Their existing exact catalog identities remain distinct. A null
table in this private catalog projection is not a table dependency subject or
a native wildcard grant. The schema in the subject plus original configuration
binds the physical object. Native verification proves the exact two grants and
the absence of unauthorized scope through the existing complete ACL/role proof.

## Transitions and ordering

For an initial pristine inventory, the genuine original application/schema
birth must establish the before state without these two audience USAGE grants.
The typed step changes that before state to both source-declared grants
present. The owned schema and roles must already exist through their genuine
original bootstrap; planning a grant never substitutes for that authority.
Preparation does not silently install or assume these business-access grants.

Schedule this single step in a required transaction phase after the selected
business, dependency and seed effects and before the final metadata-only
publication phase. It may join the last compatible required transaction group;
otherwise it receives a required transaction phase. Do not put it in a forbidden
concurrent-index phase, a metadata step, or outside the reviewed DAG. Existing
complete-target validation and all indivisible component groups still apply.
Every phase's preconditions/expectedOutcome bind the whole before/after phase
prefix, as in governing001; this step introduces no imaginary per-step COMMIT.
The plan must include its actual phase/step in all bounds and prefix digests.

Ordinary ingress stays fenced through native final publication and original
external activation. Schema USAGE does not unfreeze the fixed head-view SELECT
gate or issue a usable client capability. Unknown COMMIT uses the same original
phase recovery and fences; it does not repeat the grant as an unrelated action.

For an installed predecessor with unchanged configuration, these original
source-declared grants are already present and no redundant grant step occurs.
They remain present across ordinary field/table changes, including removal of
the last table and publication of a real empty inventory. No schema-grant drop,
revoke, role/schema rename, ownership change or audience mutation is admitted
by this addendum. Unauthorized actual drift refuses instead of being repaired
by an unselected grant. Historical source/configuration change restrictions
remain in force.

## Internal compiler lowering

The actual source renderer may emit private typed operation/subject metadata
at ctx.add's emission site. This is an internal representation with a closed
operation/subject union, not a new public deployment-step profile. The legacy
public five-member steps, complete bundle bytes, digests and API stay exact.
G10 must independently verify that stripping those private tags produces the
original compiled public steps in full, in order. Missing, extra or
contradictory tags refuse. Tags must originate at each actual renderer; no SQL
parsing, positional guessing, duplicate renderer or generic fallback. This
also distinguishes create-table/enable-rls/force-rls which share a legacy kind
and sourcePath.

## Required verification, not completed evidence

Verify source-derived initial empty and nonempty inventories, mixed inventories,
installed unchanged and last-table removal; exact two-row/one-step correspondence;
quoted schema/role names; false variants for extra members, altered schema,
audience order, privilege, null/fake table, metadata hiding and inconsistent SQL;
full tagged/public projection equality across every renderer; legacy golden
bytes/digests; genuine native initial before/after ACL proof and fenced ordinary
clients before publication/activation; original unknown-COMMIT recovery. Source
tests alone cannot establish bootstrap custody, native ACLs or release support.
