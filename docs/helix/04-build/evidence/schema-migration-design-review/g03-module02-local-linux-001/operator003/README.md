# G03 local Linux admission probe (source only)

Revision 003 is prepared but has not run. It retains the existing five compiler/admission cases and their refusal boundaries, using the exact held Weft `0.4.55+g03.a96e4f29262e` wheel in the Sol-custody-accepted 18-wheel cohort. The held wheel is unpublished and qualified only for this prospective local Linux/Python 3.11 probe; it is not a public immutable release. Core remains a separate immutable release input, and Access/Codegen remain source-built inputs.

The probe also requires the baseline absent-envelope compiled program digest to match `c8be43e133c5869b2ac01c520e92177d620b558c326cc8d6aa6b087454ecaf5e`. Source P remains the unchanged read-only producer-volume commit/tree. No DB, authentication, session lease, SQL, N12, full-campaign, Actions, or release claim is included.

The existing command envelope is unchanged: three candidate commands, 180 seconds per command, 600 seconds aggregate with 60 seconds reserved for evidence/cleanup, 1 MiB retained logs, 16 MiB total evidence, Linux/amd64 image pin, fresh venv, offline hash-required install, and the original nested network-isolation boundary. See `PLAN.md` and `source-identities.json` for all hashes and scope. The earlier operator-001 failure and operator-002 prepared packet are preserved, not relabeled as passing attempts.
