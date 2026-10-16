# Raw PostgreSQL retirement-first component — 2026-10-15

This component supports US-057-AC2/AC5/AC7 under CONTRACT-063. It exercises the existing authored PostgreSQL17.9 read-committed publisher routine; it changes no library or native enforcement implementation.

The final [native receipt](../pg-retirement-first-component.json) retains40 unique matching observations in three schedules. A dedicated ordinary TCP/SCRAM issuer holds uncommitted retirement's exclusive advisory guard. The original ordinary reader requests the same token; an independent assessor observes its shared-lock wait blocked by that exact issuer. No early result completes. After commit, the reader refuses with42501 and no fetched rows; after rollback, it refuses reuse of the still-pending token. A deliberately unsafe routine with its claim removed returns the fixed RA/RAB rows after terminal retirement. The original routine body is restored exactly. The final owned container label and removal are checked.

Run from repository root:

```sh
/private/tmp/truss-clean-install-20261013/bin/python tools/security/pg-retirement-first-probe.py
```

The retained environment uses psycopg3.3.6 and the recorded PostgreSQL image. Fixture source snapshots and root review are retained here. Historical exploratory attempts are explicitly marked in root/README.md; the first failed before schedules due to harness placeholder handling. Independent Astra review also identified unknown Docker-create outcome cleanup; final source recovers only the exact preselected name and verifies its ownership label before removal. An unresolved outcome is an error, never a successful cleanup claim.

This tests native ordering through a psycopg harness, not the public pg-runtime decoder or final transport acknowledgment. No assignment removal occurs, so this does not qualify AC3. Authenticated host enrollment/retirement, complete writer closure, public source admission, recovery, other schedules, graph/Delta and full L03 remain required. No native case is promoted:45/158 accepted,113 unimplemented across34 criteria.

The broader current evidence audit was also executed and is **failing**:101 of221 checks fail, largely on source freshness after earlier UMF and external Weft changes. The retained acceptance ledger has45 accepted cases, of which31 currently satisfy its source-freshness checks. These figures do not promote or erase case history. The current phase-validation.json and retained audit log report the failures. None of the existing source-freshness failures references this new probe or the appended test/build documentation. Restoring complete current evidence remains goal work; the new component is not evidence of a green overall suite.
