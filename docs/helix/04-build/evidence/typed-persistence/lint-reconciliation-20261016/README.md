# Current-main Python lint reconciliation

Base: `96eb347f88694b492a7fc0a0363824ab2b46e5a7`. Curated Python-only repair of249 Ruff0.17.1 findings; no generator/native/search feature changes. Independent Astra source review found removed compatibility aliases, now restored with import regressions. All30 declared compatibility exports and four async failure/cancellation settlement controls pass. Public generated-client ExecutorT/ReplayingExecutorT names are retained.

Ruff and diff checks pass; core Python43 tests pass. With actual generated commerce/native fixtures,132 SDK unit tests pass with10 explicitly native-dependent skips; a separate18-test capture run adds the public TypeVar import regression. This is source-runtime unit evidence on Python3.11.17/Pydantic2.14.1, not an installed/native/full SDK qualification. The full discovery first refused absent generated fixtures and then refused the historical refactor checkpoint’s missing absolute-path wheel. Refactor replay is excluded from the passing scoped run and remains unqualified here.

A pinned Python3.14.8 wheel build verifies all packaged source bytes and records the complete inventory in `wheel-build.json`. Build alone qualifies no runtime/native behavior. Existing CONTRACT-067/068/069 and US/TD/STP-080–085 adoption/release obligations remain unchanged.

Wheel SHA-256: `2a28a951ed6ce37dd46f0e5dfc4ddd8fe7904e908ffa0b81a6986ee65afbc761`.
