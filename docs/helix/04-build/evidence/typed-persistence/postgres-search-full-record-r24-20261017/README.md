# PostgreSQL full-record search: R24 / R20

Actual public schema loading, generated instance construction and public CLI catalog compilation precede native PostgreSQL 18.6/pgvector 0.8.7 search. The distinct original source fixture adds owner/RLS alongside id, body, vector, signed 64-bit Integer, Decimal(38,10) and Binary.

R2 passed 17 named cases, including keyword/vector physical-row correspondence for both signed 64-bit extrema, positive/negative 38-digit Decimal values, exact Binary bytes and float32 vectors; selected projections, source freshness, RRF, asynchronous cleanup and native-index drift controls also passed. RLS hides the independent hidden principal. Native exact vector materialization is inspected independently; no ANN recall or managed service qualification follows.

SDK R24 source 8b52b7ab501225c1d02eb8f4e0213b37a95c871a, wheel 5730b2deb8f5149abdbb0837f2e4a396193c6306a2fe4b360fbab428dc9be590. Weft R20 source a6ca6fe, wheel e6eed3fbf345d33425db93f2e00b988ff318b6be78ae1aa0a8889d16a8dae932. All 49 SDK/compiler wheel payloads matched installed bytes before/after; host harness/source custody remained unchanged and the owned server stopped. The complete 1616-call journal is retained; the 1000-call convenience summary explicitly declares incompleteness. Host source snapshot is exact 5ac2c8af; production SDK wheel is the separate earlier immutable R24 source.

R1 is retained as a harness failure: the new independent physical SQL oracle left an implicit read transaction open, and the SDK correctly refused its idle-connection gate. Explicit rollback after the independent oracle corrected only test cleanup. The two earlier full-record build-only fixture refusals and actual malformed original source-pin refusal before native setup are retained. No grant/least-privilege qualification transfers from these search correctness checks. Current target/global inventory qualification remains false. Temporal qualification remains HELD.

JSON/JSONL and generated inputs compressed with gzip preserve exact original bytes. No private compiler wheel/native library is included.
