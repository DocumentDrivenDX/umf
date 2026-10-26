# Stage-A fresh branch delta — source acceptance

SOURCE ACCEPT for the branch/pin delta against committed generation input12a634ebb and accepted review2360e5fc83a0211da6513763ec95322da8a3a2ed1cb778e7e88d7c2ff7c6d4fd. Read-only diff/source/hash inspection only; no local runtime, generation, imports, tests, AST evaluation, Git mutation or push.

The workflow admits exactly the existing metering branch plus fresh `codex/migration-main-metering-generation`; its preflight admits those same two exact refs. The driver adds the new ref only for `stage-a`, preserving the original metering allowance and integrated-ref stage-B-reproduction restriction. Event/checkout/workflow/source integrity checks remain. All nine refreshed input pins match actual files; the only changed pin is the actual driver postimage, and the workflow embeds the actual new manifest hash.

Six broad workflows add only the new exact push exclusion. The action-runtime job adds the same exact push-only exclusion; PR, tags, manual dispatch, other refs and job bodies are preserved. The accepted capture, deadlines, caps, GNU timeout ownership, artifact-only behavior and upload assembly are byte-unchanged apart from this branch/preflight/pin delta. No qualification or generated-output adoption is authorized by this receipt.

Use a fresh branch and normal push; preserve the old remote branch and root's normal-push/force-lease rejection provenance. This review does not approve history rewriting. Historical placeholders, deferred downstream generation and unrelated native split remain outside the delta and retain prior restrictions.

Exact postimages:

```text
1448e1f70d345652b494d3282e91abd2e1674ae0979b90999aa4c3513d1418fb  .github/workflows/r2-metering-stage-a.yml
32d66948460ea7f6118082af70ea80bf563a6c67b5bef6eb441a25f0c97731c1  scripts/qualification/r2-metering-generate.ts
ffeb22448d5f941ca67e7d9746728141c07a7e211314cf9efda35d9bda0103e1  qualification-inputs/r2-metering-stage-a.sha256
df8162b29ac49d0815cbbc725825487d1dfc8689126886202555b0a4da654c2e  .github/workflows/python-action-runtime.yml
bc1421b578504cc381a1349a25e6a5f58e9f8fb17fdbb1acce0051feaf9a47a5  .github/workflows/access-boundaries.yml
1ef2f223be34d4f05755451ff6353ac26ae0542b00b6f8bd13bb2ba407255ff8  .github/workflows/actions.yml
8a912627c05a0863e5c531840da4d11ecab3670937cc3d9c67274787b0529025  .github/workflows/python.yml
d057b3380bf1f1e2c5e52c7a4002655bde235aa9982240e77ef6e7a6e7d01dac  .github/workflows/rust-core.yml
4d27c19244cfcf25ad3da4778ae0001a3cec693fac54e6abd1c9df510e5a6514  .github/workflows/rust-spike.yml
a36bbf7bfdf8bf04cd6b814ced84387bed57da5df245184f48b80df45b86b89a  .github/workflows/sql-containment.yml
```
