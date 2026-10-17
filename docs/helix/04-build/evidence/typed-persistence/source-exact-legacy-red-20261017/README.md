# Legacy first-admission native red

Immutable SDK R22 / Weft R18, PostgreSQL 18.6, owned local cluster, real peer-authenticated non-owner NOSUPERUSER/NOBYPASSRLS role. Eleven empty native tables were recreated with distinct OIDs; each case used a fresh connection and target verification.

Seven incompatible native shapes were incorrectly accepted and reached the exact original data SQL once. CHAR family, required-nullability relaxation and inheritance were already refused before data SQL. `verification.json` deliberately records demonstrated-gap; the harness exits nonzero after retaining every case. Owned server cleanup passed.

The original legacy request genuinely lacks nativeColumns and verificationProfile. No profile marker was fabricated and no current runtime overlay was used. The predecessor payload manifest identifies the immutable installed cohort; it was captured in the preceding bulk campaign, not mislabeled as a fresh campaign-start capture. A matching-owner source-exact successor is required for green qualification. Temporal qualification remains held.
