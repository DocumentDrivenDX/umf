# Official Python consumer evidence — 2026-10-07

Scope: CONTRACT-051; Python support machinery and the qualified
structure/identity/reference subset. Canonical core 0.1.0–0.8.0 schemas are copied
unchanged into distributions. TableSpec extension definitions stay in TableSpec.

| Check | Evidence |
| --- | --- |
| Python source suite | 40 tests pass with Python 3.12.15, Pydantic 2.11.10, jsonschema 4.26.0 and ruamel.yaml 0.19.1. |
| Installed-wheel suite | The same 40 cases pass with Pydantic 2.13.5; imports resolve inside the isolated environment, not the checkout. 137 canonical schema resource files are present. |
| Extracted-sdist suite | The same 40 cases pass using extracted source and schemas, without checkout paths. |
| Source/wheel builds | `uv build` successfully builds wheel from self-contained sdist. |
| Browser comparison | Chromium 153.0.8010.12 and Bun 1.4.2: 11 qualified admission comparisons and 22 JSON/YAML recoveries pass; the additional advanced-property case checks preservation/structural admission only. |
| Browser build and TypeScript checks | Browser ESM build and both TypeScript configurations pass. |

[Browser record](../../../../fixtures/validation/python-browser-conformance.json)
captures versions, source fingerprints, per-case results and the advanced-case
comparison boundary. The source/wheel/sdist suites exercise the same cases and
MUST NOT be counted as 120 independent tests.

Failed/partial attempts retained here: the first sdist wheel build used a checkout
relative forced-include path and failed; the build hook now chooses packaged
sdist resources. An initial Python alias-preservation test found that Pydantic
could reinterpret an unknown snake_case key; canonical field names now preserve
it. The loopback browser server needed the execution sandbox's network permission.
One build preflight ran test paths from the package directory instead of repository
root; corrected commands pass. None of these failures established acceptance.

This evidence does not qualify full Python/JavaScript semantic API parity, all
facets/keys/relationships/literals, every TableSpec pipeline, or native equivalence.
No PyPI or npm publication is performed by the build. The consumer owns the
supported execution binding and refusal policy.
