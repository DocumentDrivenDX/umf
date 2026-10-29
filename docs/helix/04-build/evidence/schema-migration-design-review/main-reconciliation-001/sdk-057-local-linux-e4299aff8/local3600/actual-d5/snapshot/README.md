# D5 local diagnostic evidence staging

This directory stages the selected-evidence receipt’s exact 138 files, plus the outer context, selected receipt, release-payload receipt, packet 003, and metadata-only validation report. Every selected file was checked against the receipt’s closed logical root map, byte count, and SHA-256 before and after copying. See `source-map.json` for original paths and hashes.

D5 local attempt: `/private/tmp/migration-d5-local-emulated3600-e4299aff8-001`; execution ID `local-996d7b70b8bf497aa879304e5e2fa0bd`, attempt 1. The child output reports 37 cases, 16 oracle groups, 19 no-default checks, three fault scenarios and 30 commands. The outer record identifies this as `LOCAL_DIAGNOSTIC_PASS_LOCAL_EMULATED_3600`, not hosted qualification.

Pure metadata review status: the D5 resource-profile validator passed, while the selected-evidence validator refused the actual upload directory because its replay tree includes `replay/candidate-009` and `replay/g01`, which are outside the reader’s currently allowed directory roster. The run and evidence were not altered to fit that roster. The SDK release remains held; this bundle makes no public-H or release qualification claim.

The two physical release wheels are omitted, but their exact filename, byte count, and SHA-256 remain recorded in the source selected receipt and the `omittedPhysicalWheels` section of `source-map.json`. No venv/work tree or wheel binaries are copied.
