# UMF project documentation

Start with the repository [README](../../README.md); release history is in the [CHANGELOG](../../CHANGELOG.md) and
open work in the [ROADMAP](../../ROADMAP.md).

| Folder | What is in it |
|---|---|
| [00-discover](00-discover/) | Background research and inputs |
| [01-frame](01-frame/) | [PRD](01-frame/prd.md), [features](01-frame/features/), [user stories](01-frame/user-stories/), cross-cutting requirements |
| [02-design](02-design/) | [Architecture](02-design/architecture.md), the [ADRs](02-design/adr/) in force, [contracts](02-design/contracts/), technical and solution designs, experiments and spikes |
| [03-test](03-test/) | Test fixtures read by Rust and Bun tests (`fixtures/`) and three test plans read by tooling |
| [04-build](04-build/) | [Guides](04-build/guides/) (Actions, unified Python access, SQL containment, table lifecycle, ...) |
| [05-deploy](05-deploy/) | Microsite sources, the [schema browser](05-deploy/schema-browser/), [reference site](05-deploy/reference/), usage notes for sagas, domain packs and extension-defined kinds |
| [06-iterate](06-iterate/) | Alignment review notes |

The semantic specification is the contracts and ADRs; the executable specification is the tests in `tests/`,
`crates/*/tests/` and `python/tests/`. Support claims in these documents are only as strong as the tests CI runs.
