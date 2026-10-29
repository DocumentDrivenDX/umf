# Weft G02 browser WASM parity evidence

This receipt rebuilds Weft from frozen commit `54a8af9d02827cce85374db56e9cd50fbb7de97c` and compares the actual browser-ready wasm-bindgen output with native PostgreSQL compiler snapshots in a real Chromium browser. It covers all seven expression families; NULL intrinsic numeric/text typing; NULL-safe `eq`/`ne` and their `not` forms; boolean/UUID ordering refusals; exponent cancellation, fractional controls and numeric bounds; and literal byte limits.

The 31 native/WASM results matched exactly in Chromium 153.0.8010.12. The run includes one tamper control and two invalid-Unicode transport controls, issued no external requests, and does not qualify database execution, transaction behavior, locks or native execution authority. `source-manifest.json` records the exact source inputs, commands and artifact hashes. The compressed corpus includes each request and its native expected result.
