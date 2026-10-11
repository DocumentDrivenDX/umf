---
ddx:
  id: umf.actions-release-notes-0.1.0
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.actions-documentation-plan
      kind: informed_by
    - id: umf.actions-release-integration-plan
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
---

# Release Notes — UMF Actions 0.1.0

## Release Scope

Experimental reference profile `actions-v0.1.0`: core document 0.8.0 and `umf.actions` 0.1.0. The release packages declarative action metadata, the owned PostgreSQL reference consumer, reproducible bounded analysis and the beginner documentation website. The delivery evidence linked below records the release date, exact merged revision and deployed-site verification. Fresh merged execution at `1fa21f6ea1d7a3e1009746da99f1a61d444cd489` passes 2,448 distinct behavior tests, eight semantic checks, 119 native action tests, 44 browser cases and 43 Python tests. The immutable strict baseline separately passes 174 native/browser commands and 17 admission tests.

## Audience and Channels

| Audience | Impact | Channel |
| --- | --- | --- |
| Engineers new to UMF, CQRS or formal analysis | Ten chapters introduce intent, transactions, receipts, replay and query visibility through runnable examples and eight diagrams | Documentation website and repository guide |
| Consumer implementers | A scoped reference profile and explicit obligations show what the consumer must implement and verify | Contracts, API guide and qualification certificate |
| Operators and reviewers | Native reproduction, evidence boundaries and retained results make the demonstrated behavior inspectable | Execution guide and GitHub release assets |

## Highlights

- Declare and inspect actions without executing arbitrary code. Separate portable metadata from runtime obligations and evidence.
- Run an owned PostgreSQL example that demonstrates commit, actual SQL rollback, durable refusal, replay and projection visibility.
- Reproduce bounded SMT/TLC design checks using the pinned public Java runtime. Actual implementation mutation and native history checks supply separate evidence.

## Required Actions Summary

Readers can start with the [beginner guide](../04-build/guides/actions/index.md). Native reproduction requires Bun 1.4.2, a local Docker daemon and the pinned images described in the [execution guide](../04-build/guides/actions/execution.md). No new Python package is published by this release; the TypeScript package remains private and experimental.

## Changes and Fixes

### New or Improved

| Area | Change | Affected audience |
| --- | --- | --- |
| Action declarations | Public registration, authoring, inspection, editing, bounded interpretation and inert compatibility evidence | Metadata consumers |
| Reference execution | Fixed owned PostgreSQL transactional profile with retained outcomes, token replay and projection delivery | Consumer implementers |
| Documentation | Ten linked chapters, responsive diagrams, executable portable/native examples and accessible browser checks | Beginner engineers |
| Verification | Independently audited frozen baseline and fresh merged-source results, with explicit source/runtime bounds | Reviewers |

### Fixes

| Symptom | Resolution | Impact |
| --- | --- | --- |
| Formal reproduction depended on an existing local Java image | Pull and verify a pinned public Java 21 runtime | Readers can reproduce TLC from a fresh setup |
| Native reproduction omitted required image preparation and lifecycle recovery prerequisites | Explicit pinned-image commands and recovery-test instructions | Readers can exercise real execution and recovery |
| Proof artifacts could be omitted or normalized by Git | Force-retain certified paths and verify byte hashes in Git objects | Reviewers can recover the exact recorded proof |

## Breaking Changes and Required Actions

No documentation-driven API migration is required. The action and native reference profiles remain experimental: pin the recorded core/action versions and qualify your consumer rather than treating this release as a production compatibility guarantee. Active governed action identities use FEAT/SD-900, US/TD/STP-900 for declarations, US/TD/STP-901 for execution, and CONTRACT-900/901; redirects preserve historic identities.

## Migration or Rollback Guidance

### Upgrade or Migration

1. Use the release tag or recorded source revision.
2. Follow the portable examples, then the native prerequisites and runnable tutorial.
3. Compare your intended subset with the [support boundaries](../04-build/guides/actions/support-and-evidence.md) and record independent evidence for your consumer.

### Rollback or Hold Guidance

Keep a pinned checkout for experiments. The tutorial removes only its owned test container in `finally`. For a website regression, retain the last verified deployment and revert the website change through the repository workflow. Runtime schema migration, data rollback in a production store and external side effects are outside this reference release.

## Known Issues and Support

| Limitation | Affected audience | Next step |
| --- | --- | --- |
| No universal, production, arbitrary-handler, outside-writer or cross-store guarantee | Consumer implementers | Qualify the actual runtime and supported subset independently |
| Some relationship layouts, external effects, workflows and cancellation remain unsupported | Designers | Read explicit refusals and profile boundaries before relying on them |
| Strict native/admission results are inherited from the immutable baseline; merged action/integration checks are fresh and separately bounded | Reviewers | Inspect both certificates and their exact source revisions |
| Two beginner usability sessions remain follow-up | Documentation maintainers | Collect observed comprehension and task-completion feedback |

## References

- [Beginner guide](../04-build/guides/actions/index.md)
- [Runtime reproduction and recovery](../04-build/guides/actions/execution.md)
- [Current scoped qualification](../04-build/evidence/actions-integrated-certification.md)
- [Documentation execution evidence](../04-build/evidence/actions-documentation-execution.md)
- [Delivery evidence in release assets](https://github.com/DocumentDrivenDX/umf/releases)
- [Repository issues](https://github.com/DocumentDrivenDX/umf/issues)
