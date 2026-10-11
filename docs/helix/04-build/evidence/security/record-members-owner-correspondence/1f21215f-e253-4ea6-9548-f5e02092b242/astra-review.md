# Scoped independent formal review

No remaining blocker found within the stated conditional model. All 22 saved SMT files were independently parsed and checked in separate fresh Z3 4.15.4 contexts: 10 UNSAT and 12 SAT, matching their recorded outcomes. The exact formula file set and SHA-256 values, all 518 current source pins, and the exact ZIP entry set were verified. The producer itself was not rerun.

The model assumes admitted original 0.7 source, faithful ordered qualified-member and unknown-path carriers, source/context representations and expected state equations. It checks state, context, member-list, source, result-shape and exact unknown-path correspondence. Known/partial/missing/inapplicable positive populations are satisfiable. Single-guard controls preserve the other modeled guards; their abstract unequal carriers do not themselves prove any concrete serializer or JavaScript mutation behavior.

Review findings are resolved. Exact unknown-path equality is now explicit. The closed-schema premise requires empty paths for known results and nonempty paths for partial results. Accordingly, state-only erasure cannot admit unknown-as-known while retaining exact paths; that check is UNSAT. A separately named state-and-path erasure admits a schema-consistent known result and is SAT. The path-only substitution control remains satisfiable with nonempty unequal path carriers.

Proof receipt SHA-256: `11afec20f1b7d891ff2951fd715afbe0f2fc45874f6a53ed68af87ca1b721820`. ZIP SHA-256: `dc3a7449f9648f35cb99a809d5c42df4cf2eeebd3d5b561da538ceeb7f256e7b`. Per-query outcomes, models and hashes are retained in `astra-replay.json`.

Source admission, actual target resolution, single-Record ownership, concrete list/path encoding and empty-list representation are premises or separate runtime behavior, not theorems here. This is not JavaScript/schema/compiler/SQL refinement, author or issuer authentication, native enforcement, or complete report admission. Earlier 19-query `48fcedb5` lacked the path coordinate; 21-query `5ad9453d` lacked the modeled known/partial path-schema relationship. They remain historical. No acceptance criterion is promoted.
