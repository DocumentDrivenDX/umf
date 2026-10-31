// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded port of the stage-one PROFILE predicates in
//! `src/compilation/admission/index.ts`.
use std::collections::BTreeSet;

use umf_core::{Context, EngineError, Utf16, Value};

const PROFILE_KEYS: &[&str] = &[
    "id",
    "version",
    "compilerVersion",
    "coreVersions",
    "vocabularies",
    "python",
    "dependencies",
    "checkers",
    "reservedNames",
    "importedNames",
    "assertionKinds",
    "subset",
    "codeSha256",
];
const ASSERTIONS: &[&str] = &[
    "kind",
    "nullability",
    "Key",
    "facets",
    "defaults",
    "relationships",
    "actions",
    "umf.access",
];

fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let key = Utf16::from(key);
    match value {
        Value::Object(fields) => fields.iter().find(|(name, _)| name == &key).map(|(_, v)| v),
        _ => None,
    }
}
fn string<'a>(value: &'a Value, key: &str) -> Option<&'a Utf16> {
    match field(value, key) {
        Some(Value::String(value)) => Some(value),
        _ => None,
    }
}
fn array<'a>(value: &'a Value, key: &str) -> Option<&'a [Value]> {
    match field(value, key) {
        Some(Value::Array(values)) => Some(values),
        _ => None,
    }
}
fn charge(ctx: &mut Context<'_>, units: usize, path: &str) -> Result<(), EngineError> {
    ctx.charge_work(units.max(1), Utf16::from(path))
}
fn exact_keys(
    value: &Value,
    required: &[&str],
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let Value::Object(fields) = value else {
        return Ok(false);
    };
    charge(ctx, fields.len().saturating_add(required.len()), path)?;
    let mut seen = vec![false; required.len()];
    for (name, _) in fields {
        charge(ctx, name.len().saturating_add(required.len()), path)?;
        let Some(index) = required.iter().position(|key| name == &Utf16::from(*key)) else {
            return Ok(false);
        };
        if seen[index] {
            return Ok(false);
        }
        seen[index] = true;
    }
    Ok(seen.into_iter().all(|present| present))
}
fn is_string(
    value: &Value,
    key: &str,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let Some(Value::String(text)) = field(value, key) else {
        return Ok(false);
    };
    charge(ctx, text.len(), path)?;
    Ok(true)
}
fn contains_string(
    values: &[Value],
    expected: &Utf16,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for value in values {
        charge(ctx, 1, path)?;
        if let Value::String(text) = value {
            charge(ctx, text.len().saturating_add(expected.len()), path)?;
            if text == expected {
                return Ok(true);
            }
        }
    }
    Ok(false)
}
fn valid_digest(value: &Utf16, path: &str, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    if value.len() != 64 {
        charge(ctx, value.len(), path)?;
        return Ok(false);
    }
    for unit in value.units() {
        charge(ctx, 1, path)?;
        if !(b'0' as u16..=b'9' as u16).contains(unit)
            && !(b'a' as u16..=b'f' as u16).contains(unit)
        {
            return Ok(false);
        }
    }
    Ok(true)
}
// Matches the source regular expression `^\d+(?:\.\d+)*(?:(?:a|b|rc|\.dev|\.post)\d+)?(?:\+[A-Za-z0-9.]+)?$`.
fn valid_pep_version(
    value: &Utf16,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let units = value.units();
    let mut i = 0;
    let digits = |i: &mut usize, ctx: &mut Context<'_>| -> Result<bool, EngineError> {
        let start = *i;
        while *i < units.len() {
            charge(ctx, 1, path)?;
            if !(b'0' as u16..=b'9' as u16).contains(&units[*i]) {
                break;
            }
            *i += 1;
        }
        Ok(*i > start)
    };
    if !digits(&mut i, ctx)? {
        return Ok(false);
    }
    while i < units.len() && units[i] == b'.' as u16 {
        charge(ctx, 1, path)?;
        let dot = i;
        i += 1;
        if !digits(&mut i, ctx)? {
            i = dot;
            break;
        }
    }
    let suffixes: [&[u16]; 5] = [
        &[b'.' as u16, b'd' as u16, b'e' as u16, b'v' as u16],
        &[
            b'.' as u16,
            b'p' as u16,
            b'o' as u16,
            b's' as u16,
            b't' as u16,
        ],
        &[b'r' as u16, b'c' as u16],
        &[b'a' as u16],
        &[b'b' as u16],
    ];
    for suffix in suffixes {
        if units.get(i..i + suffix.len()) == Some(suffix) {
            for _ in suffix {
                charge(ctx, 1, path)?;
            }
            i += suffix.len();
            if !digits(&mut i, ctx)? {
                return Ok(false);
            }
            break;
        }
    }
    if i < units.len() && units[i] == b'+' as u16 {
        charge(ctx, 1, path)?;
        i += 1;
        let start = i;
        while i < units.len() {
            charge(ctx, 1, path)?;
            let c = units[i];
            if !(c <= 0x7f && ((c as u8).is_ascii_alphanumeric() || c == b'.' as u16)) {
                break;
            }
            i += 1;
        }
        if i == start {
            return Ok(false);
        }
    }
    Ok(i == units.len())
}
fn normalized_distribution(
    value: &Utf16,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    charge(ctx, value.len().saturating_add(1), path)?;
    let mut out = Vec::with_capacity(value.len());
    let mut separator = false;
    for &unit in value.units() {
        charge(ctx, 1, path)?;
        if matches!(unit, 45 | 95 | 46) {
            if !separator {
                out.push(45);
            }
            separator = true;
            continue;
        }
        separator = false;
        out.push(unit);
    }
    charge(ctx, out.len().saturating_add(1), path)?;
    super::lowercase::lowercase(&Utf16::new(out), ctx)
}
fn unique_dependencies(values: &[Value], ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut normalized = BTreeSet::new();
    for (index, dependency) in values.iter().enumerate() {
        let path = format!("/profile/dependencies/{index}/distribution");
        let Some(distribution) = string(dependency, "distribution") else {
            return Ok(false);
        };
        let name = normalized_distribution(distribution, &path, ctx)?;
        charge(
            ctx,
            name.len()
                .saturating_add(normalized.len())
                .saturating_add(1),
            &path,
        )?;
        if !normalized.insert(name) {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Return the refusal pointer for an invalid profile. `None` means admitted.
pub(super) fn validate(
    profile: &Value,
    expected_id: &Utf16,
    expected_version: &Utf16,
    current_core: &Utf16,
    actions_requested: bool,
    ctx: &mut Context<'_>,
) -> Result<Option<&'static str>, EngineError> {
    // Phase one: exact outer shape, request identity, and required arrays.
    if !exact_keys(profile, PROFILE_KEYS, "/profile", ctx)? {
        return Ok(Some("/profile"));
    }
    for (key, expected) in [("id", expected_id), ("version", expected_version)] {
        let Some(actual) = string(profile, key) else {
            return Ok(Some("/profile"));
        };
        charge(ctx, actual.len().saturating_add(expected.len()), "/profile")?;
        if actual != expected {
            return Ok(Some("/profile"));
        }
    }
    let Some(digest) = string(profile, "codeSha256") else {
        return Ok(Some("/profile"));
    };
    if !valid_digest(digest, "/profile", ctx)? {
        return Ok(Some("/profile"));
    }
    let Some(core) = array(profile, "coreVersions") else {
        return Ok(Some("/profile"));
    };
    if !contains_string(core, current_core, "/profile/coreVersions", ctx)? {
        return Ok(Some("/profile"));
    }
    for key in [
        "dependencies",
        "checkers",
        "assertionKinds",
        "reservedNames",
        "importedNames",
    ] {
        if array(profile, key).is_none() {
            return Ok(Some("/profile"));
        }
    }
    let assertions = array(profile, "assertionKinds").unwrap();
    for (index, assertion) in assertions.iter().enumerate() {
        let path = format!("/profile/assertionKinds/{index}");
        let Value::String(text) = assertion else {
            return Ok(Some("/profile"));
        };
        let mut supported = false;
        for allowed in ASSERTIONS {
            charge(ctx, text.len().saturating_add(allowed.len()), &path)?;
            if *text == Utf16::from(*allowed) {
                supported = true;
                break;
            }
        }
        if !supported {
            return Ok(Some("/profile"));
        }
    }

    // Phase two: source-compatible type and exact nested-shape checks.
    for key in ["id", "version", "compilerVersion", "subset"] {
        if !is_string(profile, key, "/profile", ctx)? {
            return Ok(Some("/profile"));
        }
    }
    let Some(python) = field(profile, "python") else {
        return Ok(Some("/profile"));
    };
    if !exact_keys(python, &["version"], "/profile/python", ctx)?
        || !is_string(python, "version", "/profile/python/version", ctx)?
    {
        return Ok(Some("/profile"));
    }
    let Some(vocabularies) = array(profile, "vocabularies") else {
        return Ok(Some("/profile"));
    };
    for (index, vocabulary) in vocabularies.iter().enumerate() {
        let path = format!("/profile/vocabularies/{index}");
        if !exact_keys(vocabulary, &["id", "version"], &path, ctx)?
            || !is_string(vocabulary, "id", &path, ctx)?
            || !is_string(vocabulary, "version", &path, ctx)?
        {
            return Ok(Some("/profile"));
        }
    }
    let dependencies = array(profile, "dependencies").unwrap();
    for (index, dependency) in dependencies.iter().enumerate() {
        let path = format!("/profile/dependencies/{index}");
        if !exact_keys(dependency, &["distribution", "version"], &path, ctx)?
            || !is_string(dependency, "distribution", &path, ctx)?
            || string(dependency, "distribution").is_some_and(Utf16::is_empty)
            || !is_string(dependency, "version", &path, ctx)?
            || !valid_pep_version(string(dependency, "version").unwrap(), &path, ctx)?
        {
            return Ok(Some("/profile"));
        }
    }
    if !unique_dependencies(dependencies, ctx)? {
        return Ok(Some("/profile"));
    }
    let checkers = array(profile, "checkers").unwrap();
    for (index, checker) in checkers.iter().enumerate() {
        let path = format!("/profile/checkers/{index}");
        if !exact_keys(checker, &["name", "version", "configuration"], &path, ctx)?
            || !is_string(checker, "name", &path, ctx)?
            || !is_string(checker, "version", &path, ctx)?
            || !matches!(field(checker, "configuration"), Some(Value::Object(_)))
        {
            return Ok(Some("/profile"));
        }
    }
    for key in ["reservedNames", "importedNames", "coreVersions"] {
        for value in array(profile, key).unwrap() {
            charge(ctx, 1, "/profile")?;
            let Value::String(text) = value else {
                return Ok(Some("/profile"));
            };
            charge(ctx, text.len(), "/profile")?;
        }
    }

    // Phase three: missing vocabulary has its own pointer before runtime checks.
    let required_vocabularies = if actions_requested {
        &["umf.access", "umf.actions"][..]
    } else {
        &["umf.access"][..]
    };
    for required in required_vocabularies {
        let mut found = false;
        for vocabulary in vocabularies {
            charge(ctx, 1, "/profile/vocabularies")?;
            if string(vocabulary, "id") == Some(&Utf16::from(*required))
                && string(vocabulary, "version") == Some(&Utf16::from("0.1.0"))
            {
                found = true;
                break;
            }
        }
        if !found {
            return Ok(Some("/profile/vocabularies"));
        }
    }
    let mut pydantic = false;
    for dependency in dependencies {
        charge(ctx, 1, "/profile/dependencies")?;
        if string(dependency, "distribution") == Some(&Utf16::from("pydantic"))
            && string(dependency, "version").is_some_and(pydantic_supported)
        {
            pydantic = true;
            break;
        }
    }
    if !pydantic {
        return Ok(Some("/profile"));
    }
    let mut runtime = false;
    for dependency in dependencies {
        charge(ctx, 1, "/profile/dependencies")?;
        if matches!(string(dependency, "distribution"), Some(value) if value == &Utf16::from("umf_access") || value == &Utf16::from("umf-access"))
            && string(dependency, "version").is_some_and(|version| !version.is_empty())
        {
            runtime = true;
            break;
        }
    }
    if !runtime {
        return Ok(Some("/profile"));
    }
    let mut mypy = false;
    for checker in checkers {
        charge(ctx, 1, "/profile/checkers")?;
        if string(checker, "name") == Some(&Utf16::from("mypy"))
            && field(
                field(checker, "configuration").unwrap_or(&Value::Null),
                "check_untyped_defs",
            ) == Some(&Value::Bool(true))
        {
            mypy = true;
            break;
        }
    }
    if !mypy {
        return Ok(Some("/profile"));
    }
    let mut pyright = false;
    for checker in checkers {
        charge(ctx, 1, "/profile/checkers")?;
        let configuration = field(checker, "configuration").unwrap_or(&Value::Null);
        if string(checker, "name") == Some(&Utf16::from("pyright"))
            && string(configuration, "typeCheckingMode").is_some()
            && string(configuration, "environment").is_some()
        {
            pyright = true;
            break;
        }
    }
    if !pydantic || !runtime || !mypy || !pyright {
        return Ok(Some("/profile"));
    }
    Ok(None)
}

fn pydantic_supported(version: &Utf16) -> bool {
    let Ok(text) = version.to_utf8() else {
        return false;
    };
    let mut parts = text.split('.');
    let (Some(major), Some(minor), Some(patch), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return false;
    };
    let supported_minor = if minor.len() >= 3 {
        minor.bytes().all(|b| b.is_ascii_digit())
    } else if minor.len() == 2 {
        minor.bytes().all(|b| b.is_ascii_digit())
            && (minor.starts_with("1") && (b'3'..=b'9').contains(&minor.as_bytes()[1])
                || (b'2'..=b'9').contains(&minor.as_bytes()[0]))
    } else {
        false
    };
    major == "2"
        && supported_minor
        && !patch.is_empty()
        && patch.bytes().all(|b| b.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(value: &str) -> Value {
        Value::String(Utf16::from(value))
    }
    fn obj(items: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
        Value::Object(
            items
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        )
    }
    fn arr(items: impl IntoIterator<Item = Value>) -> Value {
        Value::Array(items.into_iter().collect())
    }
    fn valid_profile() -> Value {
        obj([
            ("id", s("test")),
            ("version", s("1")),
            ("compilerVersion", s("test")),
            ("coreVersions", arr([s("0.10.0")])),
            (
                "vocabularies",
                arr([obj([("id", s("umf.access")), ("version", s("0.1.0"))])]),
            ),
            ("python", obj([("version", s("3.14"))])),
            (
                "dependencies",
                arr([
                    obj([("distribution", s("umf_access")), ("version", s("0.1.0"))]),
                    obj([("distribution", s("pydantic")), ("version", s("2.13.1"))]),
                ]),
            ),
            (
                "checkers",
                arr([
                    obj([
                        ("name", s("mypy")),
                        ("version", s("1")),
                        (
                            "configuration",
                            obj([("check_untyped_defs", Value::Bool(true))]),
                        ),
                    ]),
                    obj([
                        ("name", s("pyright")),
                        ("version", s("1")),
                        (
                            "configuration",
                            obj([
                                ("typeCheckingMode", s("strict")),
                                ("environment", s("test")),
                            ]),
                        ),
                    ]),
                ]),
            ),
            ("reservedNames", arr([s("reserved")])),
            ("importedNames", arr([s("decimal")])),
            ("assertionKinds", arr([s("kind")])),
            ("subset", s("test")),
            ("codeSha256", s(&"a".repeat(64))),
        ])
    }
    fn validate_default(profile: &Value) -> Result<Option<&'static str>, EngineError> {
        validate(
            profile,
            &Utf16::from("test"),
            &Utf16::from("1"),
            &Utf16::from("0.10.0"),
            false,
            &mut Context::ordinary(),
        )
    }

    #[test]
    fn source_gate_order_and_exact_nested_shapes_match_typescript() {
        let mut profile = valid_profile();
        let Value::Object(fields) = &mut profile else {
            unreachable!()
        };
        fields.retain(|(key, _)| key != &Utf16::from("vocabularies"));
        assert_eq!(validate_default(&profile).unwrap(), Some("/profile"));

        let mut profile = valid_profile();
        if let Value::Object(fields) = &mut profile {
            if let Some((_, deps)) = fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("dependencies"))
            {
                if let Value::Array(deps) = deps {
                    if let Value::Object(first) = &mut deps[0] {
                        first.push((Utf16::from("extra"), s("retained-source-content")));
                    }
                }
            }
            fields.retain(|(key, _)| key != &Utf16::from("vocabularies"));
        }
        assert_eq!(validate_default(&profile).unwrap(), Some("/profile"));

        let mut profile = valid_profile();
        if let Value::Object(fields) = &mut profile {
            if let Some((_, value)) = fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("vocabularies"))
            {
                *value = arr([]);
            }
        }
        assert_eq!(
            validate_default(&profile).unwrap(),
            Some("/profile/vocabularies")
        );
    }

    #[test]
    fn profile_walk_preserves_late_control_error_code_and_origin() {
        let mut profile = valid_profile();
        if let Value::Object(fields) = &mut profile {
            for (key, value) in fields {
                if key == &Utf16::from("dependencies") {
                    let Value::Array(items) = value else {
                        unreachable!()
                    };
                    for index in 0..256 {
                        items.push(obj([
                            ("distribution", s(&format!("extra-dependency-{index}"))),
                            ("version", s("1.2.3")),
                        ]));
                    }
                } else if key == &Utf16::from("checkers") {
                    let Value::Array(items) = value else {
                        unreachable!()
                    };
                    for index in 0..256 {
                        items.push(obj([
                            ("name", s(&format!("checker-{index}"))),
                            ("version", s("1")),
                            ("configuration", obj([])),
                        ]));
                    }
                }
            }
        }
        for (code, threshold) in [("LIMIT", 450), ("NUMBER", 700), ("VALUE_INVALID", 950)] {
            let mut calls = 0;
            let mut meter = |_: usize| {
                calls += 1;
                if calls == threshold {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host/profile-meter"),
                        "injected late stop",
                    ))
                } else {
                    Ok(())
                }
            };
            let error = validate(
                &profile,
                &Utf16::from("test"),
                &Utf16::from("1"),
                &Utf16::from("0.10.0"),
                false,
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap_err();
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/profile-meter"));
        }
    }

    #[test]
    fn all_frozen_profile_admission_controls_match_their_phase_pointer() {
        let source = include_str!("../../../../tests/rust-core/fixtures/r3/sol-final-access-profile-review/frozen.json");
        let frozen = umf_core::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            umf_core::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap();
        let Some(Value::Array(cases)) = field(&frozen, "cases") else {
            panic!("frozen cases")
        };
        assert_eq!(cases.len(), 7);
        for case in cases {
            let request = field(case, "request").unwrap();
            let profile = field(request, "profile").unwrap();
            let request_body = field(request, "request").unwrap();
            let expected = field(case, "expected").unwrap();
            let expected_result = field(expected, "result").unwrap();
            let expected_diagnostics = field(expected_result, "diagnostics").unwrap();
            let Value::Array(expected_diagnostics) = expected_diagnostics else {
                panic!("expected diagnostics")
            };
            let expected_pointer = match expected_diagnostics
                .first()
                .and_then(|diagnostic| field(diagnostic, "pointer"))
            {
                Some(Value::String(pointer)) => pointer.to_utf8().unwrap(),
                _ => panic!("expected profile pointer"),
            };
            let profile_id = string(request_body, "profileId").unwrap();
            let profile_version = string(request_body, "profileVersion").unwrap();
            let action_count = array(request_body, "actions").unwrap().len();
            let actual = validate(
                profile,
                profile_id,
                profile_version,
                &Utf16::from("0.10.0"),
                action_count > 0,
                &mut Context::ordinary(),
            )
            .unwrap();
            assert_eq!(actual, Some(expected_pointer.as_str()));
        }
    }
}
