# Astra scoped review — security acceptance allocation

No remaining blocking finding in this allocation/accounting change. Reviewed the original gate, the isolated-control producer, the three governing stories, the original case plan, and final retained evidence `4258223f-fdb4-4d19-94f2-8aeb60007581`. This was a read-only source/evidence audit; the reviewer did not run the acceptance gate or any native command.

The required set now matches the governing stories exactly: US-079 AC1–10, US-056 AC1–10, and US-057 AC1–8. The captured original plan still contains 132 distinct required cases: 12 semantic and 30 for each of pg-raw, Truss, delta-raw, and Ashlar. Its declared covers equal those 28 criteria. Unknown or unrelated criteria produce errors and do not increase the allocation count. The reviewed diff preserves the existing runner, receipt, source-fingerprint, assertion, and native-inventory checks.

The reported per-case defect is resolved: `caseErrorsBefore` is captured before duplicate-ID and criterion validation. An otherwise passing runner cannot turn an allocation or duplicate error into `accepted: true`. Existing earlier errors do not make a later independently valid case fail.

Independent checks of the final retained evidence found:

- All seven source pins match both current bytes and the exact, duplicate-free seven-entry `sources.zip`.
- Five nonexecuting scenarios have the independently expected errors and allocation counts: 28, 27, 18, 28, and 28.
- Three executed synthetic metadata runners have distinct run IDs, matching command/source fingerprints, exit 0, no timeout/output overflow, and structured passing runner receipts. The original gate records acceptance as false for the unknown criterion, true for the later valid case, and false for the duplicate case. Its global status remains failed with exactly the two corresponding errors.
- The saved runner/oracle/implementation bytes reproduce every retained fingerprint; the saved plan reproduces the gate's plan digest. The raw gate also pins the current gate and command helper.

Receipt SHA-256: `86fe2e6f1c188a342336467849d99382e015c15e8df520c7a8a0977012cd64b7`.
Executing-control evidence SHA-256: `a169ce46297eeb75d87d8afd83ec351a500766f842d23cdb4834d8e7dda3d20a`.
Source ZIP SHA-256: `0b89c48e4852f5ecdaf2c2a4f1f9c91a28b02356b19e4eeb79d556507d8a7a67`.

The synthetic runners deliberately emit a constant observation to exercise metadata accounting. They are not behavioral or backend qualification evidence. “Allocated” denotes declared coverage, not accepted criteria. The separate full 132-case execution, trusted-runner premise, broader gate hardening, native behavior, and acceptance promotion are outside this review. Predecessor `29fab1a3` remains historical at its earlier gate/producer bytes and five-control scope. The final receipt's short scope sentence mentions nonexecuting plans; its actual retained coverage also includes the three explicitly synthetic executing controls described here and in `executing-controls.json`.

Detailed independent checks and qualification limits are retained in `astra-audit.json`.
