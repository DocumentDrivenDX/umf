// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned, profile-qualified TableSpec scalar facet classification.
use crate::{
    context::{Context, Limits, ResourceProfile},
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    tablespec_adapter::TableSpecRuntime,
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};
const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/tablespec-facet-classification.schema.json");
const FACET_SCHEMA: &str = include_str!("../../../spec/core/facet-operation-v3.schema.json");
const NATIVE_SCHEMA: &str = include_str!("../../../spec/core/native-json.schema.json");
const RECOVERY:&str="Retain original native archive and authored facets; interpretation does not replace native meaning";
const NATIVE_VERSION: &str = "647e8e566ad78b864282ec65c0b0b2237aa63084";
const SUBSET:&str="Scalar-column facet interpretation under explicit consumer/input/obligation profiles; length claims cover well-formed Unicode scalar strings only; no whole-model validation, pipeline execution or native equivalence";
fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn has(v: &Value, k: &str) -> bool {
    matches!(v,Value::Object(m) if m.iter().any(|(n,_)|n==&u(k)))
}
fn text<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    match get(v, k) {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn array<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    match get(v, k) {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn err(code: &str, path: &str, msg: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), msg.into())
}
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("TABLESPEC_FACET_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *old = n
    } else {
        m.push((u(k), n))
    }
    Ok(())
}
fn read_json(s: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = s.encode_utf16().collect::<Vec<_>>();
    ctx.charge_text(units.len(), u(""))?;
    serialization::read_json_value(&units, Format::Json, ctx)
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, ctx: &mut Context<'_>, d: usize) -> Result<Value, EngineError> {
        if d > ctx.limits().max_depth {
            return Err(err("LIMIT", "", "Facet receipt depth exceeded"));
        }
        match v {
            Value::Array(a) => {
                let mut o = Vec::with_capacity(a.len());
                for x in a {
                    ctx.charge_work(1, u(""))?;
                    o.push(canon(x, ctx, d + 1)?)
                }
                Ok(Value::Array(o))
            }
            Value::Object(m) => {
                let mut o = Vec::with_capacity(m.len());
                for (k, v) in m {
                    ctx.charge_work(k.len().saturating_add(1), u(""))?;
                    o.push((k.clone(), canon(v, ctx, d + 1)?))
                }
                o.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(o))
            }
            _ => copy_json(v, ctx),
        }
    }
    Ok(canon(a, ctx, 0)? == canon(b, ctx, 0)?)
}
fn runtime(engine: &Engine, ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == ResourceProfile::Cooperative && ctx.limits() == Limits::ordinary() {
        if let Some(x) = CACHE.get() {
            return Ok(Arc::clone(x));
        }
    }
    ctx.charge_work(1, u(""))?;
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:core:facet-operation:3.0.0"),
        read_json(FACET_SCHEMA, ctx)?,
    ));
    let mut native = read_json(NATIVE_SCHEMA, ctx)?;
    if let Value::Object(fields) = &mut native {
        ctx.charge_work(fields.len(), u(""))?;
        fields.retain(|(name, _)| name != &u("example"));
    } else {
        return Err(err(
            "SCHEMA",
            "",
            "Pinned native-json schema must be an object",
        ));
    }
    resources
        .entries
        .push((u("urn:umf:native-json:0.1.0"), native));
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let req = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SCHEMA", "", "Facet request schema missing"))?;
    let request = CompiledSchema::compile(req, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == ResourceProfile::Cooperative && ctx.limits() == Limits::ordinary() {
        let _ = CACHE.set(Arc::clone(&ready));
    }
    Ok(ready)
}
struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn validate(
    v: &Value,
    s: &CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if s.validate(v, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match pinned TableSpec Facet classification schema",
        ))
    }
}
fn archive(
    source: &Value,
    a: &TableSpecRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let p = get(
        get(source, "extensions").unwrap_or(&Value::Null),
        "umf.tablespec",
    )
    .ok_or_else(|| {
        err(
            "TABLESPEC_FACET_CAPTURE",
            "/extensions/umf.tablespec",
            "TableSpec capture required",
        )
    })?;
    if get(p, "splitFiles").is_some() {
        a.export_bundle(source, ctx)
    } else {
        Ok(Value::String(a.export(source, ctx)?))
    }
}
fn member<'a>(col: &'a Value, k: &str) -> Option<&'a Value> {
    get(get(col, "members")?, k)
}
fn native_num(n: Option<&Value>, ctx: &mut Context<'_>) -> Result<Option<f64>, EngineError> {
    let Some(n) = n else { return Ok(None) };
    if text(n, "kind") != Some(&u("number")) {
        return Ok(None);
    }
    let Some(Value::String(raw)) = get(n, "value") else {
        return Ok(None);
    };
    let units = raw.units();
    ctx.charge_work(units.len(), u("/value"))?;
    let Ok(raw) = String::from_utf16(units) else {
        return Ok(None);
    };
    let bytes = raw.as_bytes();
    let mut i = 0usize;
    let negative = bytes.first() == Some(&b'-');
    if negative {
        i += 1;
    }
    let integer_start = i;
    while bytes.get(i).is_some_and(u8::is_ascii_digit) {
        i += 1;
    }
    let integer_end = i;
    let mut fraction_start = i;
    let mut fraction_end = i;
    if bytes.get(i) == Some(&b'.') {
        i += 1;
        fraction_start = i;
        while bytes.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        fraction_end = i;
    }
    let mut exponent = 0i64;
    if matches!(bytes.get(i), Some(b'e' | b'E')) {
        i += 1;
        let exponent_negative = bytes.get(i) == Some(&b'-');
        if matches!(bytes.get(i), Some(b'+' | b'-')) {
            i += 1;
        }
        let exponent_start = i;
        while let Some(b) = bytes.get(i).filter(|b| b.is_ascii_digit()) {
            exponent = match exponent
                .checked_mul(10)
                .and_then(|v| v.checked_add(i64::from(*b - b'0')))
            {
                Some(v) if v <= 10_000_000 => v,
                _ => return Ok(None),
            };
            i += 1;
        }
        if i == exponent_start {
            return Ok(None);
        }
        if exponent_negative {
            exponent = -exponent;
        }
    }
    if i != bytes.len() || integer_start == integer_end {
        return Ok(None);
    }
    let mut digits =
        Vec::with_capacity(integer_end - integer_start + fraction_end - fraction_start);
    digits.extend_from_slice(&bytes[integer_start..integer_end]);
    if fraction_end > fraction_start {
        digits.extend_from_slice(&bytes[fraction_start..fraction_end]);
    }
    let decimal_position = (integer_end - integer_start) as i64 + exponent;
    if digits.iter().all(|b| *b == b'0') {
        return Ok(Some(0.0));
    }
    if decimal_position <= 0 {
        return Ok(None);
    }
    let pos = usize::try_from(decimal_position).unwrap_or(usize::MAX);
    if pos < digits.len() && digits[pos..].iter().any(|b| *b != b'0') {
        return Ok(None);
    }
    let integer_digits = if pos < digits.len() {
        &digits[..pos]
    } else {
        &digits[..]
    };
    let first_nonzero = integer_digits
        .iter()
        .position(|b| *b != b'0')
        .unwrap_or(integer_digits.len());
    let mut normalized = integer_digits[first_nonzero..].to_vec();
    if pos > digits.len() {
        let zeros = pos - digits.len();
        if normalized.len().saturating_add(zeros) > 16 {
            return Ok(None);
        }
        normalized.resize(normalized.len() + zeros, b'0');
    }
    if normalized.len() > 16 {
        return Ok(None);
    }
    let mut value = 0u64;
    for b in normalized {
        value = match value
            .checked_mul(10)
            .and_then(|v| v.checked_add(u64::from(b - b'0')))
        {
            Some(v) if v <= 9_007_199_254_740_991 => v,
            _ => return Ok(None),
        };
    }
    let signed = if negative {
        -(value as f64)
    } else {
        value as f64
    };
    Ok(Some(signed))
}
fn absent(n: Option<&Value>) -> bool {
    n.is_none() || text(n.unwrap_or(&Value::Null), "kind") == Some(&u("null"))
}
fn observation(
    concept: &str,
    ideal: &Utf16,
    path: &Utf16,
    interp: &str,
    outcome: &str,
    basis: &str,
) -> Value {
    obj(vec![
        ("concept", t(concept)),
        ("idealPath", Value::String(ideal.clone())),
        ("nativePath", Value::String(path.clone())),
        ("interpretation", t(interp)),
        ("outcome", t(outcome)),
        ("basis", t(basis)),
    ])
}
fn loss(
    path: Utf16,
    ideal: &Utf16,
    value: &Value,
    reason: &str,
    outcome: &str,
    concept: &str,
    binding: &Value,
    residuals: &mut Vec<Value>,
    observations: &mut Vec<Value>,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    residuals.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("targetPath", Value::String(ideal.clone())),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("outcome", t(outcome)),
        ("binding", copy_json(binding, ctx)?),
        ("recovery", t(RECOVERY)),
    ]));
    observations.push(observation(
        concept,
        ideal,
        &path,
        if outcome == "not-expressible" {
            "unsupported"
        } else {
            "unknown"
        },
        outcome,
        reason,
    ));
    let code = if path.units().starts_with(ideal.units()) {
        "TABLESPEC_FACET_CONFLICT"
    } else {
        "TABLESPEC_FACET_UNRESOLVED"
    };
    diagnostics.push(obj(vec![
        ("code", t(code)),
        ("path", Value::String(path.clone())),
        ("message", t(reason)),
        ("severity", t("warning")),
    ]));
    Ok(())
}
fn control(e: &EngineError) -> bool {
    e.is_control_failure() || e.code == "LIMIT" || e.code == "CAPACITY"
}
fn canonical_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    equal(a, b, ctx)
}
fn native_string<'a>(node: Option<&'a Value>) -> Option<&'a Utf16> {
    let node = node?;
    if text(node, "kind") == Some(&u("string")) {
        if let Some(Value::String(value)) = get(node, "value") {
            return Some(value);
        }
    }
    None
}
fn native_bool(node: Option<&Value>) -> Option<bool> {
    let node = node?;
    if text(node, "kind") != Some(&u("boolean")) {
        return None;
    }
    match get(node, "value") {
        Some(Value::Bool(value)) => Some(*value),
        _ => None,
    }
}
fn pointer_segment(value: &Utf16) -> Utf16 {
    let mut out = Vec::with_capacity(value.len());
    for unit in value.units() {
        match *unit {
            0x007e => out.extend([0x007e, 0x0030]),
            0x002f => out.extend([0x007e, 0x0031]),
            other => out.push(other),
        }
    }
    Utf16::new(out)
}
fn pointer_child(base: &Utf16, segment: &Utf16) -> Utf16 {
    let mut out = base.units().to_vec();
    out.push(0x002f);
    out.extend(pointer_segment(segment).units());
    Utf16::new(out)
}
struct SuiteClaim {
    concept: &'static str,
    path: Utf16,
    facets: Value,
    basis: &'static str,
}
struct SuiteIssue {
    path: Utf16,
    value: Value,
    reason: &'static str,
}
fn suite_issue(
    issues: &mut Vec<SuiteIssue>,
    path: Utf16,
    value: &Value,
    reason: &'static str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    issues.push(SuiteIssue {
        path,
        value: copy_json(value, ctx)?,
        reason,
    });
    Ok(())
}
fn native_keys(node: &Value) -> Option<&[(Utf16, Value)]> {
    match node {
        Value::Object(fields) => Some(fields),
        _ => None,
    }
}
fn suite_facets(
    table: &Value,
    column: usize,
    ty: &str,
    ctx: &mut Context<'_>,
) -> Result<(Value, Vec<SuiteClaim>, Vec<SuiteIssue>), EngineError> {
    let mut facets = obj(vec![]);
    let mut claims = Vec::new();
    let mut issues = Vec::new();
    let base = u("/extensions/umf.tablespec/root");
    let suite_path = pointer_child(&base, &u("members"));
    let suite_path = pointer_child(&suite_path, &u("expectations"));
    if text(table, "kind") != Some(&u("object"))
        || !matches!(get(table, "members"), Some(Value::Object(_)))
    {
        suite_issue(
            &mut issues,
            suite_path,
            table,
            "Expected native table object",
            ctx,
        )?;
        return Ok((facets, claims, issues));
    }
    let table_members = get(table, "members").unwrap_or(&Value::Null);
    let columns = get(table_members, "columns").unwrap_or(&Value::Null);
    let Some(items) = (if text(columns, "kind") == Some(&u("array")) {
        get(columns, "items")
    } else {
        None
    })
    .and_then(|v| {
        if let Value::Array(a) = v {
            Some(a.as_slice())
        } else {
            None
        }
    }) else {
        suite_issue(
            &mut issues,
            suite_path,
            columns,
            "Explicit native columns array is absent or unsupported",
            ctx,
        )?;
        return Ok((facets, claims, issues));
    };
    let Some(col) = items.get(column) else {
        suite_issue(
            &mut issues,
            suite_path,
            columns,
            "Selected native column is absent",
            ctx,
        )?;
        return Ok((facets, claims, issues));
    };
    let column_path = pointer_child(&pointer_child(&base, &u("members")), &u("columns"));
    let column_path = pointer_child(&column_path, &u("items"));
    let column_path = pointer_child(&column_path, &u(&column.to_string()));
    let suite = get(
        get(table_members, "expectations").unwrap_or(&Value::Null),
        "members",
    )
    .unwrap_or(&Value::Null);
    let suite_obj = get(table_members, "expectations").unwrap_or(&Value::Null);
    let rules_node = get(suite, "expectations").unwrap_or(&Value::Null);
    let Some(rules) = (if text(rules_node, "kind") == Some(&u("array")) {
        get(rules_node, "items").and_then(|v| {
            if let Value::Array(a) = v {
                Some(a.as_slice())
            } else {
                None
            }
        })
    } else {
        None
    }) else {
        suite_issue(
            &mut issues,
            suite_path,
            suite_obj,
            "Explicit unified expectation suite is absent or unsupported",
            ctx,
        )?;
        return Ok((facets, claims, issues));
    };
    if let Some(fields) = native_keys(suite) {
        for (k, v) in fields {
            if k != &u("expectations")
                && text(v, "kind") != Some(&u("null"))
                && !(text(v, "kind") == Some(&u("array"))
                    && get(v, "items").is_some_and(|x| matches!(x,Value::Array(a)if a.is_empty())))
            {
                let path = pointer_child(&suite_path, k);
                suite_issue(
                    &mut issues,
                    path,
                    v,
                    "Suite-level policy or unknown content is not interpreted as a facet",
                    ctx,
                )?;
            }
        }
    }
    let name = native_string(member(col, "name"));
    let mut candidates: Vec<SuiteClaim> = Vec::new();
    for (index, rule) in rules.iter().enumerate() {
        ctx.charge_work(1, suite_path.clone())?;
        let at = pointer_child(
            &pointer_child(&suite_path, &u("members")),
            &u("expectations"),
        );
        let at = pointer_child(&pointer_child(&at, &u("items")), &u(&index.to_string()));
        let kind = native_string(get(rule, "members").and_then(|m| get(m, "type")));
        let kwargs = get(
            get(get(rule, "members").unwrap_or(&Value::Null), "kwargs").unwrap_or(&Value::Null),
            "members",
        )
        .unwrap_or(&Value::Null);
        let meta = get(
            get(get(rule, "members").unwrap_or(&Value::Null), "meta").unwrap_or(&Value::Null),
            "members",
        )
        .unwrap_or(&Value::Null);
        if text(rule, "kind") != Some(&u("object"))
            || text(
                get(rule, "members")
                    .and_then(|m| get(m, "kwargs"))
                    .unwrap_or(&Value::Null),
                "kind",
            ) != Some(&u("object"))
        {
            suite_issue(
                &mut issues,
                at,
                rule,
                "Malformed or unfamiliar native expectation",
                ctx,
            )?;
            continue;
        }
        let length = kind == Some(&u("expect_column_value_lengths_to_be_between"));
        let numeric = kind == Some(&u("expect_column_values_to_be_between"));
        let allowed_rule = ["type", "kwargs", "meta"];
        let allowed_args = ["column", "min_value", "max_value", "mostly"];
        let allowed_meta = [
            "stage",
            "severity",
            "blocking",
            "description",
            "tags",
            "generated_from",
        ];
        let extra_rule =
            native_keys(get(rule, "members").unwrap_or(&Value::Null)).is_some_and(|f| {
                f.iter()
                    .any(|(k, _)| !allowed_rule.iter().any(|x| k == &u(x)))
            });
        let extra_arg = native_keys(kwargs).is_some_and(|f| {
            f.iter()
                .any(|(k, _)| !allowed_args.iter().any(|x| k == &u(x)))
        });
        let extra_meta = native_keys(meta).is_some_and(|f| {
            f.iter()
                .any(|(k, _)| !allowed_meta.iter().any(|x| k == &u(x)))
        });
        let target = native_string(get(kwargs, "column"));
        let mostly = native_num(get(kwargs, "mostly"), ctx)? == Some(1.0);
        let blocking = native_bool(get(meta, "blocking")) == Some(true);
        let severity = native_string(get(meta, "severity"));
        let stage = native_string(get(meta, "stage"));
        if (!length && !numeric)
            || extra_rule
            || extra_arg
            || extra_meta
            || text(
                get(rule, "members")
                    .and_then(|m| get(m, "meta"))
                    .unwrap_or(&Value::Null),
                "kind",
            ) != Some(&u("object"))
            || target != name
            || !mostly
            || !blocking
            || !matches!(severity,Some(s) if s==&u("error")||s==&u("critical"))
            || stage != Some(&u(if length { "raw" } else { "ingested" }))
        {
            suite_issue(&mut issues,at,rule,"Only explicit, unconditional mostly=1 facet rules with appropriate stage and blocking/error metadata establish this bound",ctx)?;
            continue;
        }
        let low = native_num(get(kwargs, "min_value"), ctx)?;
        let high = native_num(get(kwargs, "max_value"), ctx)?;
        let (Some(low), Some(high)) = (low, high) else {
            suite_issue(
                &mut issues,
                at,
                rule,
                "Range endpoints must be exact safe integers in ascending order",
                ctx,
            )?;
            continue;
        };
        if low > high {
            suite_issue(
                &mut issues,
                at,
                rule,
                "Range endpoints must be exact safe integers in ascending order",
                ctx,
            )?;
            continue;
        }
        if length && ["VARCHAR", "CHAR", "TEXT"].contains(&ty) && low == 0.0 && high >= 0.0 {
            candidates.push(SuiteClaim {
                concept: "length",
                path: at,
                basis: "Canonical native unified suite rule evaluated on the general Spark carrier; no whole-pipeline acceptance guarantee",
                facets: obj(vec![(
                    "length",
                    obj(vec![
                        ("max", Value::Number(high)),
                        ("unit", t("unicode-scalar")),
                    ]),
                )]),
            });
        } else if numeric && ty == "INTEGER" {
            let mut width = None;
            for bits in 1..=32 {
                let signed_min = -(2f64.powi(bits - 1));
                let signed_max = 2f64.powi(bits - 1) - 1.0;
                if low == signed_min && high == signed_max {
                    width = Some((bits, true));
                }
                if bits <= 31 && low == 0.0 && high == 2f64.powi(bits) - 1.0 {
                    width = Some((bits, false));
                }
            }
            if let Some((bits, signed)) = width {
                candidates.push(SuiteClaim {
                    concept: "integerWidth",
                    path: at,
                    basis: "Canonical native unified suite rule evaluated on the general Spark carrier; no whole-pipeline acceptance guarantee",
                    facets: obj(vec![(
                        "integerWidth",
                        obj(vec![
                            ("bits", Value::Number(bits as f64)),
                            ("signed", Value::Bool(signed)),
                        ]),
                    )]),
                });
            } else {
                suite_issue(
                    &mut issues,
                    at,
                    rule,
                    "Range is not a canonical width domain within the signed-32-bit native carrier",
                    ctx,
                )?;
            }
        } else if numeric && ty == "DECIMAL" {
            let mut precision = None;
            for p in 1..=10 {
                let bound = 10f64.powi(p) - 1.0;
                if low == -bound && high == bound {
                    precision = Some(p);
                }
            }
            if let Some(p) = precision {
                candidates.push(SuiteClaim {
                    concept: "decimal",
                    path: at,
                    basis: "Canonical native unified suite rule evaluated on the general Spark carrier; no whole-pipeline acceptance guarantee",
                    facets: obj(vec![
                        ("precision", Value::Number(p as f64)),
                        ("scale", Value::Number(0.0)),
                    ]),
                });
            } else {
                suite_issue(&mut issues,at,rule,"Range is not a canonical precision domain on the native DecimalType(10,0) carrier",ctx)?;
            }
        } else {
            suite_issue(
                &mut issues,
                at,
                rule,
                "Predicate and native scalar family do not establish a supported core facet",
                ctx,
            )?;
        }
    }
    for concept in ["length", "decimal", "integerWidth"] {
        let mut found = candidates.iter().filter(|c| c.concept == concept);
        if let Some(first) = found.next() {
            if found.next().is_none() {
                if let Some(fields) = native_keys(&first.facets) {
                    for (k, v) in fields {
                        set(
                            &mut facets,
                            &String::from_utf16_lossy(k.units()),
                            copy_json(v, ctx)?,
                        )?;
                    }
                }
                claims.push(SuiteClaim {
                    concept: first.concept,
                    path: first.path.clone(),
                    basis: first.basis,
                    facets: copy_json(&first.facets, ctx)?,
                });
            } else {
                suite_issue(&mut issues,suite_path.clone(),suite_obj,"Multiple facet rules require explicit intersection semantics; no array-order choice is made",ctx)?;
            }
        }
    }
    if ty == "INTEGER" && !has(&facets, "integerWidth") {
        set(
            &mut facets,
            "integerWidth",
            obj(vec![
                ("bits", Value::Number(32.0)),
                ("signed", Value::Bool(true)),
            ]),
        )?;
        claims.push(SuiteClaim {
            concept: "integerWidth",
            path: pointer_child(&pointer_child(&column_path, &u("members")), &u("data_type")),
            basis: "Native general Spark INTEGER carrier supplies signed-32-bit capacity; unclassified suite rules remain residuals",
            facets: obj(vec![(
                "integerWidth",
                obj(vec![
                    ("bits", Value::Number(32.0)),
                    ("signed", Value::Bool(true)),
                ]),
            )]),
        });
    }
    for key in ["length", "max_length", "precision", "scale"] {
        let value = member(col, key);
        if absent(value) {
            continue;
        }
        let actual = native_num(value, ctx)?;
        let expected = if key == "length" || key == "max_length" {
            get(get(&facets, "length").unwrap_or(&Value::Null), "max").and_then(|v| {
                if let Value::Number(n) = v {
                    Some(*n)
                } else {
                    None
                }
            })
        } else {
            get(&facets, key).and_then(|v| {
                if let Value::Number(n) = v {
                    Some(*n)
                } else {
                    None
                }
            })
        };
        if actual.is_none() || expected.is_none() || actual != expected {
            suite_issue(
                &mut issues,
                pointer_child(&pointer_child(&column_path, &u("members")), &u(key)),
                value.unwrap_or(&Value::Null),
                "Column metadata has no matching interpreted bound in this explicit suite profile",
                ctx,
            )?;
        }
    }
    Ok((facets, claims, issues))
}

pub(crate) fn classify_table_spec_facets(
    input: &Value,
    request_in: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request_in, ctx)?;
    validate(&request, &rt.request, ctx, "TABLESPEC_FACET_REQUEST")?;
    if text(&source, "umf") != Some(&u("0.10.0")) || !adapter.inspect(&source, ctx)?.valid {
        return Err(err(
            "TABLESPEC_FACET_SOURCE",
            "",
            "Valid core 0.10.0 source required; migrate explicitly",
        ));
    }
    let _ = archive(&source, adapter, ctx)?;
    let idx = match get(&request, "column") {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            *n as usize
        }
        _ => {
            return Err(err(
                "TABLESPEC_FACET_REQUEST",
                "/column",
                "Expected nonnegative safe integer",
            ))
        }
    };
    let fragment = adapter.get_column(&source, idx, ctx)?;
    if text(&fragment, "kind") != Some(&u("object")) {
        return Err(err(
            "TABLESPEC_FACET_COLUMN",
            "/column",
            "Expected native column object",
        ));
    }
    let modules = array(&source, "modules")
        .ok_or_else(|| err("TABLESPEC_FACET_SOURCE", "/modules", "Modules required"))?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("table")))
        .ok_or_else(|| {
            err(
                "TABLESPEC_FACET_SOURCE",
                "/modules",
                "Table module required",
            )
        })?;
    let elements = array(&modules[mi], "elements").ok_or_else(|| {
        err(
            "TABLESPEC_FACET_SOURCE",
            "/modules/elements",
            "Elements required",
        )
    })?;
    let element = elements
        .get(idx)
        .ok_or_else(|| err("TABLESPEC_FACET_COLUMN", "/column", "Column does not exist"))?;
    let ideal = u(&format!("/modules/{mi}/elements/{idx}/facets"));
    let base = u(&format!(
        "/extensions/umf.tablespec/root/members/columns/items/{idx}"
    ));
    let prof = text(&request, "profile")
        .cloned()
        .ok_or_else(|| err("TABLESPEC_FACET_REQUEST", "/profile", "Profile required"))?;
    let input_mode = text(&request, "input")
        .cloned()
        .ok_or_else(|| err("TABLESPEC_FACET_REQUEST", "/input", "Input mode required"))?;
    let obligation = text(&request, "obligation").cloned().ok_or_else(|| {
        err(
            "TABLESPEC_FACET_REQUEST",
            "/obligation",
            "Obligation required",
        )
    })?;
    let mode = text(&request, "mode")
        .cloned()
        .ok_or_else(|| err("TABLESPEC_FACET_REQUEST", "/mode", "Mode required"))?;
    let binding = obj(vec![
        ("id", t("umf.tablespec.facets")),
        ("version", t("1.0.0")),
        ("nativeVersion", t(NATIVE_VERSION)),
        ("subset", t(SUBSET)),
    ]);
    let mut facets = obj(vec![]);
    let mut obs = Vec::new();
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    let mut conflict = false;
    let coltype = text(
        member(&fragment, "data_type").unwrap_or(&Value::Null),
        "value",
    )
    .cloned()
    .unwrap_or_else(|| u(""));
    let ty = String::from_utf16_lossy(coltype.units());
    let supported = [
        "VARCHAR",
        "CHAR",
        "TEXT",
        "DECIMAL",
        "INTEGER",
        "FLOAT",
        "BOOLEAN",
        "DATE",
        "DATETIME",
        "TIMESTAMP",
    ]
    .contains(&ty.as_str());
    let family = if ty == "INTEGER" {
        "integer"
    } else if ty == "DECIMAL" {
        "decimal"
    } else if ["VARCHAR", "CHAR", "TEXT"].contains(&ty.as_str()) {
        "string"
    } else {
        "other"
    };
    let model = input_mode == u("model-normalized");
    let mut block_reason = None;
    if text(element, "kind") != Some(&u("field")) {
        block_reason = Some("Facet classification requires a scalar Field; containers and record-valued Fields need explicit item/value mapping");
    }
    if let Some(cardinality) = text(element, "cardinality") {
        if cardinality != &u("one") && cardinality != &u("unspecified") {
            block_reason = Some("Facet classification requires a scalar Field; containers and record-valued Fields need explicit item/value mapping");
        }
    }
    if array(element, "references").is_some_and(|refs| {
        refs.iter()
            .any(|r| text(r, "role") == Some(&u("record-type")))
    }) {
        block_reason = Some("Facet classification requires a scalar Field; containers and record-valued Fields need explicit item/value mapping");
    }
    if has(
        get(element, "extensions").unwrap_or(&Value::Null),
        "umf.tablespec.facets",
    ) {
        block_reason =
            Some("Existing facet binding cannot be overwritten; reclassify its retained source");
    }
    if let Some(v) = get(
        get(&source, "vocabularies").unwrap_or(&Value::Null),
        "umf.tablespec.facets",
    ) {
        if text(v, "version").is_some_and(|x| x != &u("1.0.0")) {
            block_reason = Some("Existing facet vocabulary version is incompatible")
        }
    }
    let path = |key: &str| {
        u(&format!(
            "{}/members/{key}",
            String::from_utf16_lossy(base.units())
        ))
    };
    macro_rules! add_loss {
        ($key:expr,$value:expr,$reason:expr,$outcome:expr,$concept:expr,$context:expr) => {
            loss(
                path($key),
                &ideal,
                $value,
                $reason,
                $outcome,
                $concept,
                &binding,
                &mut residuals,
                &mut obs,
                &mut diagnostics,
                $context,
            )
        };
    }
    if !supported {
        add_loss!(
            "data_type",
            member(&fragment, "data_type").unwrap_or(&Value::Null),
            "Native type is outside the qualified scalar subset",
            "not-expressible",
            "native",
            ctx
        )?;
    }
    if prof == u("unresolved") {
        add_loss!(
            "data_type",
            &fragment,
            "No consumer profile selected; no facet meaning inferred",
            "unknown",
            "native",
            ctx
        )?;
    }
    let mut malformed = Vec::new();
    for key in ["length", "precision", "scale"] {
        let n = member(&fragment, key);
        if !absent(n) {
            let min = if key == "scale" { 0.0 } else { 1.0 };
            if native_num(n, ctx)?.is_none_or(|v| v < min) {
                malformed.push(key)
            }
        }
    }
    if model && !malformed.is_empty() {
        for key in &malformed {
            add_loss!(key,member(&fragment,key).unwrap_or(&Value::Null),"Model-normalized profile cannot infer an exact count from rejected, coerced or unsafe native metadata","unknown",if *key=="length"{"length"}else{"decimal"},ctx)?;
        }
    }
    let usable = supported && prof != u("unresolved") && !(model && !malformed.is_empty());
    if prof != u("unresolved")
        && supported
        && !(model && !malformed.is_empty())
        && prof != u("gx-suite-spark")
    {
        let length = member(&fragment, "length");
        let max = member(&fragment, "max_length");
        let length_supplied = !absent(length);
        let max_supplied = !absent(max);
        let mut key: Option<&str> = None;
        if prof == u("json-schema") && !model && !absent(max) {
            key = Some("max_length")
        }
        if prof == u("gx-spark") {
            key = if !model && !absent(max) && native_num(max, ctx)? != Some(0.0) {
                Some("max_length")
            } else if length_supplied {
                Some("length")
            } else {
                None
            }
        }
        if let Some(k) = key {
            let n = native_num(member(&fragment, k), ctx)?;
            if n.is_none_or(|v| v < 1.0) {
                add_loss!(k,member(&fragment,k).unwrap_or(&Value::Null),"Selected length parameter is not an uncoerced positive safe integer; zero is ignored by native truthiness and malformed JSON bounds are not valid ideals","unknown","length",ctx)?
            } else if family != "string" {
                add_loss!(
                    k,
                    member(&fragment, k).unwrap_or(&Value::Null),
                    "Selected native length rule is not qualified for this scalar family",
                    "not-expressible",
                    "length",
                    ctx
                )?
            } else {
                let n = n.unwrap_or(0.0);
                set(
                    &mut facets,
                    "length",
                    obj(vec![
                        ("max", Value::Number(n)),
                        ("unit", t("unicode-scalar")),
                    ]),
                )?;
                obs.push(observation("length",&ideal,&path(k),"inferred","exact",if prof==u("json-schema"){"Generated JSON Schema maxLength counts Unicode scalars for strings; not storage enforcement"}else{"Native-generated GX rule on Spark counts Unicode scalars in the tested string domain; not a whole ingestion guarantee"}));
            }
        }
        if length_supplied && key != Some("length") {
            let n = native_num(length, ctx)?;
            if n != get(get(&facets, "length").unwrap_or(&Value::Null), "max").and_then(|x| {
                if let Value::Number(v) = x {
                    Some(*v)
                } else {
                    None
                }
            }) {
                add_loss!("length",length.unwrap_or(&Value::Null),"Native length declaration has no matching interpreted bound under this consumer/input profile","not-expressible","length",ctx)?
            }
        }
        if key == Some("max_length") && length_supplied {
            let declared = native_num(length, ctx)?;
            let interpreted =
                get(get(&facets, "length").unwrap_or(&Value::Null), "max").and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n)
                    } else {
                        None
                    }
                });
            if declared.is_some() && declared == interpreted {
                obs.push(observation(
                    "length",
                    &ideal,
                    &path("length"),
                    "declared",
                    "exact",
                    "Equal retained length declaration agrees with the selected consumer bound",
                ));
            }
        }
        if max_supplied && key != Some("max_length") {
            add_loss!(
                "max_length",
                max.unwrap_or(&Value::Null),
                if model {
                    "Model normalization removes unknown max_length; original declaration stays archived"
                } else {
                    "This consumer does not establish the max_length bound"
                },
                "not-expressible",
                "length",
                ctx
            )?
        }
        let p = member(&fragment, "precision");
        let s = member(&fragment, "scale");
        if !absent(p) || !absent(s) {
            let precision = native_num(p, ctx)?;
            let scale = native_num(s, ctx)?;
            if family != "decimal" {
                add_loss!(
                    "precision",
                    &obj(vec![
                        ("precision", copy_json(p.unwrap_or(&Value::Null), ctx)?),
                        ("scale", copy_json(s.unwrap_or(&Value::Null), ctx)?)
                    ]),
                    "Decimal metadata on another scalar family cannot supply a core decimal facet",
                    "not-expressible",
                    "decimal",
                    ctx
                )?
            } else if precision.is_none() || scale.is_none() || scale > precision {
                add_loss!("precision",&obj(vec![("precision",copy_json(p.unwrap_or(&Value::Null),ctx)?),("scale",copy_json(s.unwrap_or(&Value::Null),ctx)?)]),"Both exact uncoerced decimal counts are required, with scale no greater than precision; native defaults and coercions are not substituted","unknown","decimal",ctx)?
            } else if prof == u("declared-metadata")
                || (prof == u("ingest-cast") && precision.unwrap_or(0.0) <= 38.0)
                || (prof == u("pyspark-schema") && precision == Some(10.0) && scale == Some(0.0))
            {
                set(
                    &mut facets,
                    "precision",
                    Value::Number(precision.unwrap_or(0.0)),
                )?;
                set(&mut facets, "scale", Value::Number(scale.unwrap_or(0.0)))?;
                obs.push(observation("decimal",&ideal,&path("precision"),if prof==u("declared-metadata"){"declared"}else{"inferred"},"exact",if prof==u("declared-metadata"){"Explicit paired decimal declarations describe bounds only; native enforcement remains consumer-specific"}else if prof==u("pyspark-schema"){"Explicit decimal pair agrees with the native DecimalType(10,0) carrier; conversion may round"}else{"Explicit Spark ingest decimal output domain; casting may round and ANSI mode changes overflow behavior"}));
            } else {
                add_loss!(
                    "precision",
                    &obj(vec![
                        ("precision", copy_json(p.unwrap_or(&Value::Null), ctx)?),
                        ("scale", copy_json(s.unwrap_or(&Value::Null), ctx)?)
                    ]),
                    if prof == u("ingest-cast") {
                        "Spark decimal capacity is limited to precision 38"
                    } else {
                        "This consumer does not enforce the explicit decimal pair; generated/default types cannot replace it"
                    },
                    "not-expressible",
                    "decimal",
                    ctx
                )?
            }
        }
        if ty == "INTEGER" && (prof == u("pyspark-schema") || prof == u("ingest-cast")) {
            set(
                &mut facets,
                "integerWidth",
                obj(vec![
                    ("bits", Value::Number(32.0)),
                    ("signed", Value::Bool(true)),
                ]),
            )?;
            obs.push(observation("integerWidth",&ideal,&path("data_type"),"inferred","exact","Explicit native INTEGER maps to signed 32-bit under the selected Spark consumer; no authored identity or arbitrary width is inferred"));
        }
    }
    if prof == u("gx-suite-spark") && usable {
        let table = adapter.get_table(&source, ctx)?;
        let (suite_mapping, claims, issues) = suite_facets(&table, idx, &ty, ctx)?;
        facets = suite_mapping;
        for claim in claims {
            obs.push(observation(
                claim.concept,
                &ideal,
                &claim.path,
                "inferred",
                "exact",
                claim.basis,
            ));
        }
        for issue in issues {
            loss(
                issue.path,
                &ideal,
                &issue.value,
                issue.reason,
                "unknown",
                "native",
                &binding,
                &mut residuals,
                &mut obs,
                &mut diagnostics,
                ctx,
            )?;
        }
        if obligation == u("exact-input") {
            let reason = if ty == "FLOAT" {
                "Binary64 1.0000000000000002 narrows to binary32 1.0 before suite validation"
            } else if ty == "DECIMAL" {
                "The general DecimalType(10,0) carrier can round fractional input before suite validation"
            } else {
                "Suite validation does not establish exact conversion into the native carrier"
            };
            let outcome = if ty == "FLOAT" || ty == "DECIMAL" {
                "approximated"
            } else {
                "unknown"
            };
            loss(
                path("data_type"),
                &ideal,
                &fragment,
                reason,
                outcome,
                "conversion",
                &binding,
                &mut residuals,
                &mut obs,
                &mut diagnostics,
                ctx,
            )?;
        }
    }
    if obligation == u("exact-input") && prof != u("gx-suite-spark") && usable {
        let (reason, outcome) = if prof == u("declared-metadata") {
            (
                "Declarations alone do not establish exact input validation or conversion",
                "unknown",
            )
        } else if prof == u("ingest-cast") {
            ("Ingest expressions can coerce, round, trim or replace inputs; output facet agreement does not prove exact input conversion","approximated")
        } else if prof == u("pyspark-schema") && (ty == "DECIMAL" || ty == "FLOAT") {
            (
                if ty == "FLOAT" {
                    "Binary64 1.0000000000000002 narrows to binary32 1.0"
                } else {
                    "Generated DecimalType(10,0) can round fractional values; declared facets cannot establish exactness"
                },
                "approximated",
            )
        } else if prof == u("gx-spark") {
            (
                "GX length validation does not establish input conversion before validation",
                "unknown",
            )
        } else {
            ("", "")
        };
        if !reason.is_empty() {
            loss(
                path("data_type"),
                &ideal,
                &fragment,
                reason,
                outcome,
                "conversion",
                &binding,
                &mut residuals,
                &mut obs,
                &mut diagnostics,
                ctx,
            )?;
        }
    }
    for key in [
        "integerWidth",
        "length_unit",
        "precision_unit",
        "facets",
        "signed",
        "unsigned",
        "bits",
        "width",
    ] {
        if has(get(&fragment, "members").unwrap_or(&Value::Null), key) {
            let value = member(&fragment, key).unwrap_or(&Value::Null);
            loss(path(key),&ideal,value,"Native qualifier is retained without a core interpretation; consumer behavior does not make it an authored facet","unknown","native",&binding,&mut residuals,&mut obs,&mut diagnostics,ctx)?;
        }
    }
    if let Some(reason) = block_reason {
        conflict = true;
        loss(
            ideal.clone(),
            &ideal,
            get(element, "facets").unwrap_or(&Value::Null),
            reason,
            "unknown",
            "native",
            &binding,
            &mut residuals,
            &mut obs,
            &mut diagnostics,
            ctx,
        )?;
    }
    if let Some(author) = get(&request, "author") {
        match crate::facets::verify_core_facet_declaration(
            author, &source, engine, registry, caps, ctx,
        ) {
            Ok(verified) => {
                let identity = get(&verified, "identity").unwrap_or(&Value::Null);
                if text(identity, "module") != Some(&u("table"))
                    || text(identity, "element") != text(element, "id")
                {
                    conflict = true;
                    loss(
                        ideal.clone(),
                        &ideal,
                        identity,
                        "Author receipt identifies a different Field",
                        "unknown",
                        "native",
                        &binding,
                        &mut residuals,
                        &mut obs,
                        &mut diagnostics,
                        ctx,
                    )?;
                } else {
                    let inspection = crate::facets::inspect_core_facets(
                        &source, identity, engine, registry, caps, ctx,
                    )?;
                    let meaning = get(&inspection, "meaning").unwrap_or(&Value::Null);
                    if let Some(declared) = get(meaning, "interpreted") {
                        for key in ["length", "precision", "scale", "integerWidth"] {
                            if let Some(d) = get(declared, key) {
                                if let Some(o) = get(&facets, key) {
                                    if !canonical_equal(d, o, ctx)? {
                                        conflict = true;
                                        let val = obj(vec![
                                            ("declared", copy_json(d, ctx)?),
                                            ("observed", copy_json(o, ctx)?),
                                        ]);
                                        loss(ideal.clone(),&ideal,&val,"Authored facet conflicts with native interpretation; neither may be overwritten","unknown","native",&binding,&mut residuals,&mut obs,&mut diagnostics,ctx)?;
                                    }
                                } else {
                                    let p = u(&format!(
                                        "{}/{}",
                                        String::from_utf16_lossy(ideal.units()),
                                        key
                                    ));
                                    loss(p,&ideal,d,"Authored bound is retained but not established by the selected native consumer","unknown","native",&binding,&mut residuals,&mut obs,&mut diagnostics,ctx)?;
                                }
                            }
                        }
                        if text(meaning, "state") == Some(&u("partial")) {
                            loss(ideal.clone(),&ideal,get(meaning,"facets").unwrap_or(&Value::Null),"Unknown authored facet qualifiers remain attached and cannot establish native enforcement","unknown","native",&binding,&mut residuals,&mut obs,&mut diagnostics,ctx)?;
                        }
                    }
                }
            }
            Err(e) if control(&e) => return Err(e),
            Err(e) => {
                conflict = true;
                loss(
                    ideal.clone(),
                    &ideal,
                    &Value::Null,
                    &format!("Author provenance is invalid or stale: {}", e.code),
                    "unknown",
                    "native",
                    &binding,
                    &mut residuals,
                    &mut obs,
                    &mut diagnostics,
                    ctx,
                )?;
            }
        }
    } else if has(element, "facets") {
        conflict = true;
        loss(
            ideal.clone(),
            &ideal,
            get(element, "facets").unwrap_or(&Value::Null),
            "Existing facets require verified author provenance before classification",
            "unknown",
            "native",
            &binding,
            &mut residuals,
            &mut obs,
            &mut diagnostics,
            ctx,
        )?;
    }
    let mut outcome = "exact";
    if !residuals.is_empty() {
        outcome = if residuals
            .iter()
            .any(|r| text(r, "outcome") == Some(&u("unknown")))
        {
            "unknown"
        } else if residuals
            .iter()
            .any(|r| text(r, "outcome") == Some(&u("not-expressible")))
        {
            "not-expressible"
        } else {
            "approximated"
        };
    }
    let blocked = conflict || mode == u("strict") && !residuals.is_empty();
    for d in &mut diagnostics {
        set(d, "severity", t(if blocked { "error" } else { "warning" }))?;
        if text(d, "path") == Some(&ideal) {
            set(d, "code", t("TABLESPEC_FACET_CONFLICT"))?;
        }
    }
    let mut result = obj(vec![
        ("operation", t("classify-tablespec-facets")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("outcome", t(outcome)),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        ("binding", copy_json(&binding, ctx)?),
        (
            "mapping",
            obj(vec![
                ("origin", t("classified")),
                ("idealPath", Value::String(ideal.clone())),
                ("nativePath", Value::String(base)),
                ("nativeFragment", copy_json(&fragment, ctx)?),
                ("facets", copy_json(&facets, ctx)?),
                ("observations", Value::Array(obs)),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        if get(&request, "author").is_none() && matches!(get(&facets, "length"), Some(_))
            || get(&request, "author").is_none() && matches!(get(&facets, "precision"), Some(_))
            || get(&request, "author").is_none() && matches!(get(&facets, "integerWidth"), Some(_))
        {
            let ms = get_mut(&mut target, "modules")
                .and_then(|v| {
                    if let Value::Array(a) = v {
                        a.get_mut(mi)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    err(
                        "TABLESPEC_FACET_TARGET",
                        "/modules",
                        "Selected module missing",
                    )
                })?;
            let es = get_mut(ms, "elements")
                .and_then(|v| {
                    if let Value::Array(a) = v {
                        a.get_mut(idx)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    err(
                        "TABLESPEC_FACET_TARGET",
                        "/modules/elements",
                        "Selected element missing",
                    )
                })?;
            set(es, "facets", copy_json(&facets, ctx)?)?;
        }
        set(
            get_mut(&mut target, "vocabularies").ok_or_else(|| {
                err(
                    "TABLESPEC_FACET_TARGET",
                    "/vocabularies",
                    "Vocabularies missing",
                )
            })?,
            "umf.tablespec.facets",
            obj(vec![("version", t("1.0.0"))]),
        )?;
        let ms = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get_mut(mi)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "TABLESPEC_FACET_TARGET",
                    "/modules",
                    "Selected module missing",
                )
            })?;
        let es = get_mut(ms, "elements")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get_mut(idx)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "TABLESPEC_FACET_TARGET",
                    "/modules/elements",
                    "Selected element missing",
                )
            })?;
        let ext = get_mut(es, "extensions").ok_or_else(|| {
            err(
                "TABLESPEC_FACET_TARGET",
                "/modules/elements/extensions",
                "Element extensions missing",
            )
        })?;
        set(
            ext,
            "umf.tablespec.facets",
            obj(vec![
                ("origin", t("classified")),
                (
                    "binding",
                    obj(vec![
                        ("id", t("umf.tablespec.facets")),
                        ("version", t("1.0.0")),
                    ]),
                ),
                ("profile", Value::String(prof)),
                ("input", Value::String(input_mode)),
                ("obligation", Value::String(obligation)),
                ("outcome", t(outcome)),
                (
                    "observations",
                    copy_json(
                        get(
                            get(&result, "mapping").unwrap_or(&Value::Null),
                            "observations",
                        )
                        .unwrap_or(&Value::Null),
                        ctx,
                    )?,
                ),
            ]),
        )?;
        if !adapter.inspect(&target, ctx)?.valid {
            return Err(err(
                "TABLESPEC_FACET_TARGET",
                "",
                "Classification would violate core constraints",
            ));
        }
        let _ = archive(&target, adapter, ctx)?;
        set(&mut result, "target", target)?;
    }
    let result = copy_json(&result, ctx)?;
    validate(&result, &rt.result, ctx, "TABLESPEC_FACET_RESULT")?;
    Ok(result)
}
pub(crate) fn verify_table_spec_facet_classification(
    receipt_in: &Value,
    current: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt_in, &rt.result, ctx, "TABLESPEC_FACET_RECEIPT")?;
    if text(receipt_in, "status") != Some(&u("classified")) {
        return Err(err(
            "TABLESPEC_FACET_RECEIPT",
            "",
            "Expected complete classified receipt",
        ));
    }
    let receipt = copy_json(receipt_in, ctx)?;
    let source = get(&receipt, "source")
        .ok_or_else(|| err("TABLESPEC_FACET_RECEIPT", "", "Source missing"))?;
    let request = get(&receipt, "request")
        .ok_or_else(|| err("TABLESPEC_FACET_RECEIPT", "", "Request missing"))?;
    let expected =
        classify_table_spec_facets(source, request, adapter, engine, registry, caps, ctx)?;
    if !equal(&receipt, &expected, ctx)? {
        return Err(err(
            "TABLESPEC_FACET_RECEIPT",
            "",
            "Receipt disagrees with retained native source and selected profile",
        ));
    }
    if !equal(
        current,
        get(&receipt, "target")
            .ok_or_else(|| err("TABLESPEC_FACET_RECEIPT", "", "Target missing"))?,
        ctx,
    )? {
        return Err(err(
            "TABLESPEC_FACET_STALE",
            "",
            "Target changed after classification",
        ));
    }
    Ok(receipt)
}
pub(crate) fn recover_table_spec_facet_source(
    receipt: &Value,
    current: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_table_spec_facet_classification(
        receipt, current, adapter, engine, registry, caps, ctx,
    )?;
    archive(
        get(&verified, "source")
            .ok_or_else(|| err("TABLESPEC_FACET_RECEIPT", "", "Source missing"))?,
        adapter,
        ctx,
    )
}
