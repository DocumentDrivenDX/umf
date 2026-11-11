// SPDX-License-Identifier: MIT OR Apache-2.0
//! Pure CONTRACT-904 bulk control, ordering and item-token semantics.
use crate::{Context, EngineError, Utf16, Value};

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn field<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(f) = v {
        f.iter().find(|(n, _)| n == &Utf16::from(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<String> {
    match v {
        Some(Value::String(s)) => s.to_utf8().ok(),
        _ => None,
    }
}
fn same_text(left: Option<&Value>, right: Option<&Value>) -> bool {
    matches!((left, right), (Some(Value::String(a)), Some(Value::String(b))) if a == b)
}
fn num(v: Option<&Value>) -> Option<u64> {
    match v {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            Some(*n as u64)
        }
        _ => None,
    }
}
fn put(v: &mut Value, k: &str, x: Value) {
    if let Value::Object(f) = v {
        if let Some((_, old)) = f.iter_mut().find(|(n, _)| n == &Utf16::from(k)) {
            *old = x;
        } else {
            f.push((Utf16::from(k), x));
        }
    }
}
fn obj(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn b(v: bool) -> Value {
    Value::Bool(v)
}
fn integer(v: u64) -> Value {
    Value::Number(v as f64)
}
fn is_true(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Bool(true)))
}
fn reserved(v: Option<&Value>) -> bool {
    match v {
        Some(Value::String(value)) => value.units().starts_with(&[
            b'p' as u16,
            b'a' as u16,
            b'p' as u16,
            b'1' as u16,
            b'/' as u16,
        ]),
        _ => false,
    }
}
fn canonical(v: &str) -> bool {
    !v.is_empty() && v.bytes().all(|c| c.is_ascii_digit()) && (v == "0" || v.as_bytes()[0] != b'0')
}
fn segment(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 128
        && v.bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}
fn fence(v: &str) -> Result<String, EngineError> {
    if !canonical(v) {
        return Err(err(
            "PAP_FENCE",
            "Fence must be exact unsigned decimal text",
        ));
    }
    let mut digits = v.as_bytes().to_vec();
    let mut i = digits.len();
    loop {
        if i == 0 {
            digits.insert(0, b'1');
            break;
        }
        i -= 1;
        if digits[i] < b'9' {
            digits[i] += 1;
            break;
        }
        digits[i] = b'0';
    }
    String::from_utf8(digits)
        .map_err(|_| err("PAP_FENCE", "Fence must be exact unsigned decimal text"))
}
fn result(ok: bool, code: Option<&str>) -> Value {
    let mut o = obj([("ok", b(ok))]);
    if let Some(c) = code {
        put(&mut o, "code", s(c));
    }
    o
}
fn accept(state: Value, basis: Option<&str>) -> Value {
    let mut o = obj([("ok", b(true)), ("state", state)]);
    if let Some(x) = basis {
        put(&mut o, "basis", s(x));
    }
    o
}
fn refuse(code: Option<&str>) -> Value {
    result(false, code)
}
fn set_claim_none(sv: &mut Value) {
    put(sv, "claim", Value::Null)
}
fn advance(sv: &mut Value) {
    let next = num(field(sv, "nextBatch")).unwrap_or(0) + 1;
    let count = num(field(sv, "batchCount")).unwrap_or(0);
    put(sv, "nextBatch", integer(next));
    put(
        sv,
        "committedBatches",
        integer(num(field(sv, "committedBatches")).unwrap_or(0) + 1),
    );
    set_claim_none(sv);
    let cancelled = is_true(field(sv, "cancelRequested"));
    put(
        sv,
        "status",
        s(if next == count {
            "completed"
        } else if cancelled {
            "cancelled"
        } else {
            "queued"
        }),
    );
}
fn apply(
    state: Option<&Value>,
    event: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let kind = text(field(event, "kind")).unwrap_or_default();
    if state.is_none() || matches!(state, Some(Value::Null)) {
        if kind != "submit" {
            return Ok(refuse(None));
        }
        let n = num(field(event, "batchCount"));
        if n.is_none() {
            return Ok(refuse(None));
        }
        let n = n.unwrap();
        let st = obj([
            ("status", s(if n == 0 { "completed" } else { "queued" })),
            ("batchCount", integer(n)),
            ("nextBatch", integer(0)),
            ("committedBatches", integer(0)),
            ("fence", s("0")),
            ("claim", Value::Null),
            ("cancelRequested", b(false)),
            ("stop", Value::Null),
        ]);
        return Ok(accept(
            st,
            Some(if n == 0 {
                "empty-manifest"
            } else {
                "seal-delegation-intent-capacity"
            }),
        ));
    }
    let mut st = crate::value::copy_host_value(state.unwrap(), ctx)?;
    let status = text(field(&st, "status")).unwrap_or_default();
    let terminal = matches!(status.as_str(), "completed" | "stopped" | "cancelled");
    if terminal {
        if kind == "cancel" {
            return Ok(accept(st, Some("terminal-noop")));
        }
        if status == "cancelled" && matches!(kind.as_str(), "claim" | "execute") {
            return Ok(refuse(Some("PAP_CANCELLED")));
        }
        return Ok(refuse(None));
    }
    if kind == "cancel" {
        let claim = field(&st, "claim");
        let unadmitted = claim
            .is_some_and(|c| !matches!(c, Value::Null) && !is_true(field(c, "effectAdmitted")));
        if status == "queued" || (status == "running" && unadmitted) {
            put(&mut st, "status", s("cancelled"));
            set_claim_none(&mut st);
            return Ok(accept(st, None));
        }
        put(&mut st, "cancelRequested", b(true));
        return Ok(accept(st, Some("cancel-requested")));
    }
    if status == "queued" {
        if kind == "claim" {
            let next = fence(&text(field(&st, "fence")).unwrap_or_default())?;
            let batch = num(field(&st, "nextBatch")).unwrap_or(0);
            put(&mut st, "status", s("running"));
            put(&mut st, "fence", s(&next));
            put(
                &mut st,
                "claim",
                obj([
                    ("batch", integer(batch)),
                    ("fence", s(&next)),
                    ("effectAdmitted", b(false)),
                ]),
            );
            return Ok(accept(st, None));
        }
        if kind == "execute" {
            return Ok(refuse(Some("PAP_FENCE")));
        }
        return Ok(refuse(None));
    }
    let claim = field(&st, "claim")
        .cloned()
        .filter(|c| !matches!(c, Value::Null));
    if status == "running" {
        if let Some(mut cl) = claim {
            match kind.as_str() {
                "execute" => {
                    if is_true(field(&st, "cancelRequested")) {
                        return Ok(refuse(Some("PAP_CANCELLED")));
                    }
                    if !same_text(field(event, "fence"), field(&cl, "fence")) {
                        return Ok(refuse(Some("PAP_FENCE")));
                    }
                    if num(field(event, "batch")) != num(field(&cl, "batch")) {
                        return Ok(refuse(Some("PAP_ORDER")));
                    }
                    if is_true(field(&cl, "effectAdmitted")) {
                        return Ok(refuse(None));
                    }
                    put(&mut cl, "effectAdmitted", b(true));
                    put(&mut st, "claim", cl);
                    return Ok(accept(st, None));
                }
                "commit" => {
                    if !is_true(field(&cl, "effectAdmitted")) {
                        return Ok(refuse(None));
                    }
                    advance(&mut st);
                    return Ok(accept(st, None));
                }
                "failure" => {
                    let batch = field(&cl, "batch").cloned().unwrap_or(Value::Null);
                    put(&mut st, "status", s("stopped"));
                    put(
                        &mut st,
                        "stop",
                        obj([
                            ("batch", batch),
                            ("code", field(event, "code").cloned().unwrap_or(Value::Null)),
                        ]),
                    );
                    set_claim_none(&mut st);
                    return Ok(accept(st, None));
                }
                "lose-custody" => {
                    if !is_true(field(&cl, "effectAdmitted")) {
                        return Ok(refuse(None));
                    }
                    put(&mut st, "status", s("reconciling"));
                    return Ok(accept(st, None));
                }
                "expire-claim" => {
                    if is_true(field(&cl, "effectAdmitted"))
                        || !is_true(field(event, "confirmedNoExecution"))
                    {
                        return Ok(refuse(None));
                    }
                    put(&mut st, "status", s("queued"));
                    set_claim_none(&mut st);
                    return Ok(accept(st, None));
                }
                _ => return Ok(refuse(None)),
            }
        }
    }
    if status == "reconciling" && kind == "reconcile" && claim.is_some() {
        let cl = claim.unwrap();
        match text(field(event, "evidence")).as_deref() {
            Some("committed") => {
                advance(&mut st);
                Ok(accept(st, None))
            }
            Some("noncommit-admitted") => {
                put(&mut st, "status", s("stopped"));
                put(
                    &mut st,
                    "stop",
                    obj([
                        ("batch", field(&cl, "batch").cloned().unwrap_or(Value::Null)),
                        ("code", s("PAP_ABORT_DISPOSITION_UNKNOWN")),
                    ]),
                );
                set_claim_none(&mut st);
                Ok(accept(st, None))
            }
            _ => Ok(accept(st, Some("unresolved"))),
        }
    } else {
        Ok(refuse(None))
    }
}

fn decision(input: &Value) -> Result<Value, EngineError> {
    if text(field(input, "delegation")).as_deref() != Some("valid") {
        return Ok(obj([
            ("status", s("denied")),
            ("code", s("AUTHORIZATION")),
            ("tx1Invoked", b(false)),
            ("itemOutcome", b(false)),
        ]));
    }
    if text(field(input, "guards")).as_deref() != Some("pass") {
        let mut r = obj([
            ("status", s("conflict")),
            ("code", s("PAP_GUARD")),
            ("tx1Invoked", b(false)),
            ("itemOutcome", b(false)),
        ]);
        if let Some(i) = field(input, "guardItem") {
            put(&mut r, "item", i.clone());
        }
        return Ok(r);
    }
    let t = field(input, "tx1")
        .ok_or_else(|| err("PAP_ORDER", "tx/1 result required once guards pass"))?;
    if matches!(t, Value::Null) {
        return Err(err("PAP_ORDER", "tx/1 result required once guards pass"));
    }
    let d = text(field(t, "decision")).unwrap_or_default();
    let r = match d.as_str() {
        "committed" => obj([
            ("status", s("committed")),
            ("tx1Invoked", b(true)),
            ("itemOutcome", b(true)),
        ]),
        "conflict" | "rejected" => {
            let mut fields = vec![(Utf16::from("status"), s(&d))];
            fields.push((
                Utf16::from("code"),
                field(t, "code").cloned().unwrap_or(Value::Null),
            ));
            fields.push((
                Utf16::from("item"),
                field(t, "item").cloned().unwrap_or(Value::Null),
            ));
            fields.push((Utf16::from("tx1Invoked"), b(true)));
            fields.push((Utf16::from("itemOutcome"), b(true)));
            Value::Object(fields)
        }
        _ => obj([
            ("status", s("rejected")),
            ("code", s("ENTITY_MISSING")),
            ("item", field(t, "item").cloned().unwrap_or(Value::Null)),
            ("tx1Invoked", b(true)),
            ("itemOutcome", b(true)),
            ("qualificationFault", b(true)),
        ]),
    };
    Ok(r)
}

pub fn execute(op: &str, request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match op {
        "bulk-actions.nextBulkFence" => Ok(Value::string_utf8(fence(
            &text(field(request, "fence"))
                .ok_or_else(|| err("PAP_FENCE", "Fence must be exact unsigned decimal text"))?,
        )?)),
        "bulk-actions.applyBulkEvent" => apply(
            field(request, "state"),
            field(request, "event").ok_or_else(|| err("PAP_INVALID", "Event required"))?,
            ctx,
        ),
        "bulk-actions.bulkDecisionOrder" => decision(
            field(request, "input").ok_or_else(|| err("PAP_ORDER", "Decision input required"))?,
        ),
        "bulk-actions.bulkItemToken" => {
            let ns = text(field(request, "namespace")).unwrap_or_default();
            let id = text(field(request, "id")).unwrap_or_default();
            let batch = num(field(request, "batch"));
            let item = num(field(request, "item"));
            if !segment(&ns) || !segment(&id) {
                return Err(err(
                    "PAP_INVALID",
                    "JobRef segments must match [A-Za-z0-9_-]{1,128}",
                ));
            }
            if batch.is_none() || item.is_none() {
                return Err(err(
                    "PAP_INVALID",
                    "Batch and item must be canonical unsigned integers",
                ));
            }
            Ok(s(&format!(
                "pap1/{ns}/{id}/{}/{}",
                batch.unwrap(),
                item.unwrap()
            )))
        }
        "bulk-actions.parseBulkItemToken" => {
            let key = text(field(request, "key")).unwrap_or_default();
            let p: Vec<_> = key.split('/').collect();
            if p.len() != 5
                || p[0] != "pap1"
                || !segment(p[1])
                || !segment(p[2])
                || !canonical(p[3])
                || !canonical(p[4])
            {
                return Err(err("PAP_INVALID", "Malformed reserved bulk token"));
            }
            let batch = p[3]
                .parse::<u64>()
                .ok()
                .filter(|n| *n <= 9_007_199_254_740_991);
            let item = p[4]
                .parse::<u64>()
                .ok()
                .filter(|n| *n <= 9_007_199_254_740_991);
            if batch.is_none() || item.is_none() {
                return Err(err("PAP_INVALID", "Ordinal out of range"));
            }
            Ok(obj([
                ("namespace", s(p[1])),
                ("id", s(p[2])),
                ("batch", integer(batch.unwrap())),
                ("item", integer(item.unwrap())),
            ]))
        }
        "bulk-actions.isReservedBulkKey" => Ok(b(reserved(field(request, "key")))),
        "bulk-actions.checkBulkKeyUse" => {
            let via = is_true(field(request, "viaBulk"));
            Ok(if reserved(field(request, "key")) && !via {
                result(false, Some("PAP_RESERVED"))
            } else {
                result(true, None)
            })
        }
        _ => Err(err("REQUEST", "Unknown bulk action operation")),
    }
}
