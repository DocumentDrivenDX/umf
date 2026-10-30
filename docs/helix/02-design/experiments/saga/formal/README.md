# Saga recovery model

[SPIKE-901](../../../spikes/SPIKE-901-saga-recovery.md) explains the question,
requirements mapping, results and limits. This is an executable design model,
not an orchestrator or a conformance certificate.

## Reproduce

Use Python 3.9+ and Java 21. Download the official
[TLA+ tools v1.7.4 jar](https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar),
then run from the repository root:

```sh
python3 docs/helix/02-design/experiments/saga/formal/run_tlc.py \
  --java /path/to/java \
  --jar /path/to/tla2tools.jar
```

The runner verifies SHA-256
`936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`
before execution. This release reports **TLC2 Version 2.19 of 08 August 2024**;
the tools release and TLC's version string are distinct identifiers. Java's
local RMI listener requires loopback permission in restricted environments.
No provider calls or remote execution occur during model checking.

Configurations are retained here. Logs, source/configuration hashes, Java/TLC
versions and exact expected outcomes are written to
[the evidence directory](../evidence/).
Each configuration has a 180-second timeout by default. A timeout, parse error,
missing expected witness, unexpected invariant or incomplete search fails the
runner. Counterexample cases must exit 12 and violate their exact named invariant.
Successful safety/progress cases must exit zero with TLC's completion marker.
State databases are temporary; diagnostic logs and counterexample traces remain.

## Abstraction

The model contains one trusted submission namespace, one key and two possible
immutable intents, with at most two submissions. Admission atomically retains
instance identity and original intent; the acknowledgement is a separate event.
A retry may recover that identity before acknowledgement. Full input/revision/
binding equality is abstracted to intent equality. The erroneous duplicate
admission variant increments instance count; it need not simulate both instances'
effects to expose the violation.

Two or three ordered steps have separately modeled provider outcomes and
coordinator observations. Dispatch records uncertainty before provider settlement.
Provider commits/rejections can settle while the coordinator is down; observation
may never arrive in the unrestricted safety model. Redelivery retains the same
logical invocation, pending settlement and provider outcome. Provider deduplication
and atomic durable outcomes are assumptions, not implementation findings.

A cancellation races dispatch, takeover invalidates the old owner epoch, and
retirement independently affects the saga definition, forward actions and
compensation actions. Already admitted provider work may settle after retirement;
fresh retired-action admission is blocked. All modeled steps have explicit
compensation; three steps allow checking reverse compensation across several
commits. Provider rejection of compensation requires intervention and prevents
further unwinding. Crash/restart and one takeover are bounded; retirement and
cancellation are monotone in this model.

The `bad*` variables are history instrumentation: each dispatch records whether
its actual pre-state had uncertainty, retirement, stale ownership, cancellation
or an earlier outstanding compensation. Invariants inspect those observations
independently of the dispatch guards. Mutation configurations remove guards and
must produce counterexamples. `originalIntent` independently retains the first
admission to detect changed-intent overwrite.

## Safety and progress

Safety permits arbitrary scheduling and permanent unavailable observations.
`CHECK_DEADLOCK FALSE` allows intentional terminal and unresolved states; it is
not a progress claim. Positive witnesses demonstrate reachable success,
acknowledgement-loss replay plus crash/redelivery recovery, changed-intent
conflict, intervention, blocked compensation and continuation after saga-definition
retirement. Their named negative reachability assertions are expected to fail. Recovery
witnessing requires a provider commit that was still unobserved at crash and
then observed after restart. Definition-retirement continuation requires actual
forward dispatch after retirement, followed by success.

The separate progress cut fixes active definitions/actions, authority and
availability: no cancellation, crashes, takeover or retirement. It weakly fairs
`ProgressNext`; each invocation eventually receives a committed/rejected provider
outcome. All nonstuttering actions in this cut consume finite remaining work, so
fair progress implies eventual success, compensated termination or intervention.
It does not promise business success, elapsed-time bounds or termination under
unavailable provider outcomes.

## Exclusions

No model of schema parsing/type compatibility, multiple tenant namespaces,
authorization revocation, provider identity rebinding, partial external effects,
irreversible actions, retention expiry, retry budgets, manual resolution,
parallel/nested sagas or unbounded faults is included. External-effect eligibility
is modeled only as a refusal gate under the unchanged action declaration; there
is no external-provider protocol. A finite TLC pass does not establish arbitrary
bounds, correctness of a future implementation or native transaction enforcement.


## Ticket and native admission boundary

`Admission.tla` separates coordinator ticket issue from provider native admission,
as required by the detailed CONTRACT-908 protocol. Run `run_admission.py` with
the same `--java` and `--jar` arguments as the main runner. It verifies the same
jar digest. Its seven configurations cover safety, three guard mutations and
three positive witnesses: a pre-cancel ticket may settle, a native transaction
admitted before retirement may finish, and a queued retired action refuses.
Results are in `../evidence/admission-results.json` and adjacent logs. This is
an independent focused safety model, not a combined state-space proof with
Saga.tla or a model of real storage/authority enforcement.
