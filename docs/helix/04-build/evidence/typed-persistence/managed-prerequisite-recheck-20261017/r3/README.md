# Approved managed test-principal recheck

At 2026-10-17 12:56 UTC, the filtered read-only lookup succeeded with no existing test principal. The subsequent exact user-approved creation still received an administrator-only rejection. Read access is not evidence of creation authority. No principal, credential, grant or compute was created, so no cleanup object exists from this attempt. Independent native managed authorization remains unqualified; temporal qualification stays HELD.

Commands used the existing `aidev-cus` profile, exact display name `umf-typed-sdk-qualification-20261016-reader`, `service-principals list --filter`, then `service-principals create --active`. Credential/account output was suppressed. The retained JSON records actual exits and explicitly detected the native administrator rejection; these are readiness observations, not a native E2E pass.
