// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::target_pin::{PlatformComponent, PlatformPin, TargetIdentity, TargetPin};

fn pin() -> TargetPin {
    TargetPin {
        kind: "postgresql".into(),
        backend_id: "pg".into(),
        backend_version: "18".into(),
        target_profile: "profile-a".into(),
        binding_sha256: "a".repeat(64),
        platform: vec![
            PlatformPin {
                name: "driver".into(),
                versions: vec!["3.2".into(), "3.3".into()],
            },
            PlatformPin {
                name: "server".into(),
                versions: vec!["18.1".into()],
            },
        ],
    }
}

fn identity() -> TargetIdentity {
    TargetIdentity {
        kind: "postgresql".into(),
        backend_id: "pg".into(),
        backend_version: "18".into(),
        target_profile: "profile-a".into(),
        binding_sha256: "a".repeat(64),
        platform: vec![
            PlatformComponent {
                name: "driver".into(),
                version: "3.2".into(),
            },
            PlatformComponent {
                name: "server".into(),
                version: "18.1".into(),
            },
        ],
    }
}

fn identity_from_packet(value: &serde_json::Value) -> TargetIdentity {
    let platform = value["platform"]
        .as_array()
        .expect("packet platform array")
        .iter()
        .map(|pair| {
            let pair = pair.as_array().expect("packet platform pair");
            PlatformComponent {
                name: pair[0].as_str().expect("platform name").into(),
                version: pair[1].as_str().expect("platform version").into(),
            }
        })
        .collect();
    TargetIdentity {
        kind: value["kind"].as_str().expect("kind").into(),
        backend_id: value["backend_id"].as_str().expect("backend_id").into(),
        backend_version: value["backend_version"]
            .as_str()
            .expect("backend_version")
            .into(),
        target_profile: value["target_profile"]
            .as_str()
            .expect("target_profile")
            .into(),
        binding_sha256: value["binding_sha256"]
            .as_str()
            .expect("binding_sha256")
            .into(),
        platform,
    }
}

#[test]
fn matches_the_thirteen_frozen_python_predecessor_cases_under_current_policy() {
    const PACKET: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/target-pin-python-predecessor-20261028/packet.json");
    const CASE_NAMES: &[&str] = &[
        "exact-identity",
        "identity-field-kind-differs",
        "identity-field-backend_id-differs",
        "identity-field-backend_version-differs",
        "identity-field-target_profile-differs",
        "identity-field-binding_sha256-differs",
        "platform-version-alternative-in-qualified-set",
        "platform-version-outside-qualified-set",
        "platform-cardinality-one-missing",
        "platform-cardinality-one-extra",
        "same-cardinality-name-absent-from-pin",
        "duplicate-observed-name-misses-other-pinned-name",
        "duplicate-observed-name-bad-version",
    ];
    let packet: serde_json::Value = serde_json::from_str(PACKET).expect("frozen packet JSON");
    assert_eq!(packet["format"], "umf-target-pin-python-predecessor/1");
    assert_eq!(
        packet["source_sha256"],
        "188e816ccad9ed609c1382ea8090471a5ed1266f412742e69b7800d32ed455ec"
    );
    assert_eq!(packet["case_count"], CASE_NAMES.len());
    assert_eq!(packet["pass_count"], CASE_NAMES.len());
    assert_eq!(packet["mismatch_count"], 0);
    let cases = packet["cases"].as_array().expect("packet cases");
    assert_eq!(cases.len(), CASE_NAMES.len());
    let pin = pin();
    for (case, expected_name) in cases.iter().zip(CASE_NAMES) {
        let name = case["name"].as_str().expect("case name");
        assert_eq!(name, *expected_name, "packet case inventory/order");
        let candidate = identity_from_packet(&case["identity"]);
        let predecessor_expected = case["expected"].as_bool().expect("case expected bool");
        // The frozen Python packet preserves the historical duplicate-name
        // defect as `true`; CONTRACT-072 now requires unique observed names.
        let expected = if name == "duplicate-observed-name-misses-other-pinned-name" {
            false
        } else {
            predecessor_expected
        };
        assert_eq!(pin.matches(&candidate), expected, "case: {name}");
    }
}

#[test]
fn rejects_duplicate_names_in_either_pin_or_observation() {
    let mut duplicate_pin = pin();
    duplicate_pin.platform[1].name = "driver".into();
    assert!(!duplicate_pin.matches(&identity()));

    let mut duplicate_observation = identity();
    duplicate_observation.platform[1].name = "driver".into();
    assert!(!pin().matches(&duplicate_observation));
}
