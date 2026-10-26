# Core PR49 source-dbapi affected source acceptance

SOURCE ACCEPT for access-boundaries.yml SHA-256 53651fbc04b2a5883f5696bf9995289ac6de1c1c5a46490d0d130b4269d1e0ac against the adopted plan f986b3d4d7146f120e891f5d267aae94b99b3b39038edc1b5dbe7d2cc6eea756.

Confirmed the exact conditional job-private RUSTUP_HOME step precedes the existing source-dbapi toolchain action, and explicit rustfmt remains on Rust 1.90.0. Removing only these four added YAML lines exactly reconstructs preimage SHA-256 87f425501fe5ebefebdbed978c6abba7be38eac9db1058a7e122a14fb9c8bde0. Matrix, triggers, source revision, locked build/install commands, tests, assertions and limits are unchanged. The unrelated untracked workflow is excluded.

No runtime was performed and provisioning/test success is unproven until the normal updated PR gate executes. The prior push twin passing does not waive the required failed PR gate. Root may commit this concrete correction and perform its normal PR update; original gates remain required.
