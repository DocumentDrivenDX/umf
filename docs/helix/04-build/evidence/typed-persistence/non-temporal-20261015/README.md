# Non-temporal Typed SDK and basic E2E

The public path is tested through `readDocument`, the real generator CLI, an installed `umf_access` wheel, generated constructors, shared codecs and the public core record-value oracle. Scalar, nested-container and explicit alternate-Key schemas run on Python 3.11.17 and 3.14.8. The wrong-Key negative uses two actual generated DTOs with identical Python field names and carrier types.

`execution.json` is the scope/continuation record. `e2e-311.json` and `e2e-314.json` retain subprocess commands and outcomes. `replay.json` retains installed unit tests, all three checker diagnostics, two-wheel runtime-fix proof and unchanged generated digests. `browser.json` records real Chromium byte/refusal parity. Earlier failed attempts remain separate.

Run the public E2E against an environment containing the exact wheel and pinned dependencies:

```sh
bun run test:access-e2e --python /path/to/pinned/environment/bin/python --wheel /path/to/umf_access-0.1.0.dev0-py3-none-any.whl --report /private/tmp/access-e2e.json
```

The wheel is retained in the `runtime-<sha256>/` directory. `build.json` contains the exact source inventory and dependency pins. `replay-installed.py` and `generate-full-replay.ts` retain the local replay recipe and recorded workspace paths. Static corpus source and expected diagnostics live under `tests/compilation/python/static/models/`.

Temporal qualification is **HELD**. Basic creation and codecs are not database writes. Native transport, action execution, complete DSL/catalog coverage and backend adoption remain unqualified. Full B-TP-003 and SDK completion are not claimed; remaining gates are explicit in `execution.json`.
