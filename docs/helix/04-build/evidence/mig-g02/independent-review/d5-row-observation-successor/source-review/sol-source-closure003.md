# D5 DS-F1 / DS-F2 source closure

**SOURCE ACCEPT for the reviewed D5 batch**, inheriting the bounded conclusions and runtime holds in review002 (`08dc3d4d717c49a13db86ba4f858170ee145ca97bb246aa416a91bf3a385d1af`). This review inspected only the two corrective areas and actual workflow/pin hashes; no candidate execution/import/AST/YAML evaluation/tests or Git mutation occurred.

- Access workflow: `b635644a45aae933997e3e1858242a758b89a84d5f03e9344af1a131fa274145`.
- Expected-pins manifest: `1eff411b946d3930fb2c0e70168b9a1e5f412584db1f3671b1bfe1b4dc43b69e`; its access-workflow row matches.

DS-F1 is closed: the extraction interpreter explicitly imports json before loading successor custody.

DS-F2 is closed: assembly selects both unique exact lock rows and owner-map matches first; lstat requires regular source files with exact locked sizes. It constructs the bounded receipt and checks combined selected sizes plus receipt <=2097152 before creating/copying payload bodies. Reads use O_NOFOLLOW and fstat with size-limited reads; actual source and copied hashes/sizes remain verified, followed by a final aggregate check. No additional blocker was found in these affected lines.

Successor gzip/source/patch/custody and the original assertions, 37-case matrix, cleanup, deadlines/caps, all18 lock-map binding and success-only separate release-payload upload are inherited unchanged from review002. This is source acceptance, not a D5 execution pass or release-payload acceptance. Root may commit this local batch; actual dispatch remains held until the separate old-PR source reconciliation, genuine required generation, final source/pin freeze and original PR gate are ready. No new job/campaign or unchanged runtime replay is requested.
