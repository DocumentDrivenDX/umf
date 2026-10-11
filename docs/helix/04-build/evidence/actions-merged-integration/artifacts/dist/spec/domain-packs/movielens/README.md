# MovieLens 32M ratings and tags

Authored TableSpec 1.0 schema profile, not a native data parser or source-instance validator. Unlisted fields and future source content must remain in the original input; do not silently discard them.

Profile: {
  "subset": "Four CSV files in the fixed ml-32m release; no fabricated user records.",
  "privacy": "Publisher-anonymized user IDs; no independent privacy certification.",
  "license": "Research conditions, attribution and same-conditions redistribution; commercial use requires publisher permission. See official README.",
  "member_bindings": {
    "movies": "movies.csv",
    "links": "links.csv",
    "ratings": "ratings.csv",
    "tags": "tags.csv"
  }
}

## Source and reproducibility

[Official documentation](https://files.grouplens.org/datasets/movielens/ml-32m-README.html), revision ml-32m (generated 2023-10-13). Its SHA-256 is recorded separately from row sources. Dataset bytes remain external references; no download, row pin, redistribution clearance or generator is implied.

## Schemas

- [movies](umf/movies.json): MovieLens movies.csv field profile.
- [links](umf/links.json): MovieLens links.csv field profile.
- [ratings](umf/ratings.json): MovieLens ratings.csv field profile; no inferred primary key.
- [tags](umf/tags.json): MovieLens tags.csv field profile; repeated tag events are not deduplicated.

## Verification

Regenerate with `bun scripts/public-dataset-packs.ts`; check with `--check`. Pack tests verify metadata, references and exact TableSpec adapter recovery; browser checks inspect the same artifacts. Source parsers and data validation belong to consumers.
