// SPDX-License-Identifier: MIT OR Apache-2.0
//! Target-side admission from compilation/admission/index.ts. Source values and
//! reference identity stay in UTF-16; only accepted Python names are ASCII.
use crate::{
    resources::CodegenEngine,
    value::{array_items, js_object_members, member, object_members, string_member},
};
use std::collections::{BTreeMap, BTreeSet};
use umf_core::{Context, EngineError, Utf16, Value};

pub(super) struct Admission {
    pub diagnostics: Vec<Value>,
    pub not_expressible: Vec<Utf16>,
    pub selected_paths: BTreeSet<Utf16>,
}
fn xs<'a>(v: &'a Value, k: &str) -> &'a [Value] {
    member(v, k).and_then(array_items).unwrap_or(&[])
}
fn at<'a>(v: &'a Value, k: &str) -> &'a Value {
    member(v, k).unwrap_or(&Value::Null)
}
fn st<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    string_member(v, k)
}
fn is(v: &Value, k: &str, text: &str) -> bool {
    st(v, k) == Some(&Utf16::from(text))
}
fn yes(v: &Value, k: &str) -> bool {
    member(v, k) == Some(&Value::Bool(true))
}
fn owned(v: &Value) -> bool {
    member(v, "owned") != Some(&Value::Bool(false))
}
fn s(t: &str) -> Value {
    Value::String(t.into())
}
fn obj(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn set(v: &mut Value, k: &str, value: Value) {
    if let Value::Object(fields) = v {
        if let Some((_, old)) = fields.iter_mut().find(|(name, _)| name == &Utf16::from(k)) {
            *old = value;
        } else {
            fields.push((k.into(), value));
        }
    }
}
fn take_array(v: &mut Value, k: &str) -> Vec<Value> {
    if let Value::Object(fields) = v {
        if let Some((_, old)) = fields.iter_mut().find(|(name, _)| name == &Utf16::from(k)) {
            if matches!(old, Value::Array(_)) {
                if let Value::Array(items) = std::mem::replace(old, Value::Null) {
                    return items;
                }
            }
        }
    }
    Vec::new()
}
fn text_copy(v: &Value, k: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let Some(text) = st(v, k) else {
        return Ok(Utf16::default());
    };
    ctx.charge_work(text.len(), Utf16::default())?;
    Ok(text.clone())
}
fn path(v: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    text_copy(v, "pointer", ctx)
}
fn append(base: &Utf16, suffix: &str) -> Utf16 {
    let mut out = base.units().to_vec();
    out.extend(suffix.encode_utf16());
    Utf16::new(out)
}
fn escape(key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(key.len().saturating_mul(2), Utf16::default())?;
    let mut out = Vec::with_capacity(key.len().saturating_mul(2));
    for (i, u) in key.units().iter().enumerate() {
        if i % 1024 == 0 {
            ctx.charge_work(1, Utf16::default())?;
        }
        match u {
            47 => out.extend([126, 49]),
            126 => out.extend([126, 48]),
            x => out.push(*x),
        }
    }
    Ok(Utf16::new(out))
}
fn child(base: &Utf16, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let escaped = escape(key, ctx)?;
    ctx.charge_work(base.len() + escaped.len() + 1, Utf16::default())?;
    let mut out = base.units().to_vec();
    out.push(47);
    out.extend_from_slice(escaped.units());
    Ok(Utf16::new(out))
}
fn add(
    out: &mut Admission,
    code: &str,
    pointer: Utf16,
    logical: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        pointer.len() + logical.len() + code.len() + 64,
        Utf16::default(),
    )?;
    out.diagnostics.push(obj([
        ("code", s(code)),
        ("sourceId", Value::String(logical.clone())),
        ("pointer", Value::String(pointer)),
        (
            "message",
            s(&format!("Typed access declaration refused: {code}")),
        ),
    ]));
    Ok(())
}
fn key(v: &Value, ctx: &mut Context<'_>) -> Result<Option<(Utf16, Utf16)>, EngineError> {
    let (Some(m), Some(e)) = (st(v, "module"), st(v, "element")) else {
        return Ok(None);
    };
    ctx.charge_work(m.len() + e.len() + 1, Utf16::default())?;
    Ok(Some((m.clone(), e.clone())))
}
fn same(a: &Value, b: &Value) -> bool {
    matches!((st(a,"module"),st(a,"element"),st(b,"module"),st(b,"element")),(Some(am),Some(ae),Some(bm),Some(be))if am==bm&&ae==be)
}
fn copied(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut pending = vec![v];
    while let Some(v) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match v {
            Value::String(s) => ctx.charge_work(s.len(), Utf16::default())?,
            Value::Array(a) => {
                ctx.charge_work(a.len(), Utf16::default())?;
                pending.extend(a)
            }
            Value::Object(a) => {
                ctx.charge_work(a.len(), Utf16::default())?;
                for (k, v) in a {
                    ctx.charge_work(k.len(), Utf16::default())?;
                    pending.push(v)
                }
            }
            _ => {}
        }
    }
    Ok(v.clone())
}
struct Locator<'a> {
    nodes: BTreeMap<(Utf16, Utf16), (usize, usize, &'a Value)>,
}
impl<'a> Locator<'a> {
    fn new(doc: &'a Value, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let mut nodes = BTreeMap::new();
        for (mi, m) in xs(doc, "modules").iter().enumerate() {
            let Some(mid) = st(m, "id") else { continue };
            for (ei, e) in xs(m, "elements").iter().enumerate() {
                let Some(eid) = st(e, "id") else { continue };
                ctx.charge_work(
                    (mid.len() + eid.len() + 1).saturating_mul(64),
                    Utf16::default(),
                )?;
                nodes
                    .entry((mid.clone(), eid.clone()))
                    .or_insert((mi, ei, e));
            }
        }
        Ok(Self { nodes })
    }
    fn get(
        &self,
        r: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Option<(usize, usize, &'a Value)>, EngineError> {
        Ok(key(r, ctx)?.and_then(|k| self.nodes.get(&k).copied()))
    }
}
fn scan_find<I: IntoIterator>(
    items: I,
    ctx: &mut Context<'_>,
    mut predicate: impl FnMut(&I::Item) -> bool,
) -> Result<Option<I::Item>, EngineError> {
    for item in items {
        ctx.charge_work(1, Utf16::default())?;
        if predicate(&item) {
            return Ok(Some(item));
        }
    }
    Ok(None)
}
fn scan_position<T>(
    items: &[T],
    ctx: &mut Context<'_>,
    mut predicate: impl FnMut(&T) -> bool,
) -> Result<Option<usize>, EngineError> {
    for (index, item) in items.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if predicate(item) {
            return Ok(Some(index));
        }
    }
    Ok(None)
}
fn py_keyword(name: &Utf16) -> bool {
    "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case type".split(' ').any(|w|name==&Utf16::from(w))
}
const RESERVED: &[&str] = &[
    "StrictModel",
    "BaseModel",
    "_AliasTag",
    "_RankedRow",
    "_ProjectionT",
    "_RankedT1",
    "_RankedT2",
    "_RankedT3",
    "_RankedT4",
    "_RankedT5",
    "_RankedT6",
    "_RankedT7",
    "_RankedT8",
    "Decimal",
    "date",
    "datetime",
    "Annotated",
    "ClassVar",
    "TYPE_CHECKING",
    "final",
    "BeforeValidator",
    "MISSING",
    "TypeAdapter",
    "FieldRef",
    "RecordRef",
    "Join",
    "RequiredJoin",
    "OptionalJoin",
    "RequiredNavigation",
    "OptionalNavigation",
    "InverseNavigation",
    "ManyNavigation",
    "InverseManyNavigation",
    "JoinProjection",
    "Column",
    "Selection",
    "Query",
    "Terminal",
    "Related",
    "Param",
    "Mapping",
    "MappingProxyType",
    "TypedDict",
    "Unpack",
    "TypeVar",
    "ActionRef",
    "ActionSource",
    "ActionProfile",
    "FieldValidator",
    "seal_model",
    "unhashable_key",
    "ValueNormalizer",
    "encode_model",
    "decode_model",
    "initialize_rejection",
    "initialize_action_rejection",
    "GeneratedSource",
    "UMF_GENERATED_SOURCE",
    "UMF_SOURCE",
    "CodecField",
    "UMF_FINAL",
    "UMF_KEY",
    "Literal",
    "Never",
    "BUNDLE_INPUT_DIGEST",
    "KEY_IDENTITY",
    "UMF_PROJECTION_FIELDS",
    "UMF_PROJECTION_OWNER",
    "_umf_projection_model",
    "UMF_UPDATE_FIELDS",
    "Actions",
    "ReplayingActions",
    "ActionEndpoint",
    "ReplayingActionEndpoint",
    "ActionExecutor",
    "ReplayingActionExecutor",
    "ActionRejected",
    "OriginalOutcome",
    "UMF_BUNDLE_INPUT_DIGEST",
    "UMF_RUNTIME_ABI",
    "Vector",
    "KeywordIndex",
    "VectorIndex",
    "RankedQuery",
    "RANKED_MODEL_PROFILE",
    "require_ranked_model_profile",
    "SearchLeg",
    "Score",
    "Scored",
    "SearchResult",
    "KeyTypeRef",
    "RecordTypeRef",
    "OutcomeDetails",
    "ExecutorT",
    "ReplayingExecutorT",
    "Generic",
    "AliasOwner",
    "RecordAlias",
    "alias_column",
    "alias_record",
    "alias_relationship",
    "cast",
    "Committed",
    "make_committed_view",
    "UMF_FIELDS",
];
fn upper(u: u16) -> bool {
    (65..=90).contains(&u)
}
fn lower(u: u16) -> bool {
    (97..=122).contains(&u)
}
fn digit(u: u16) -> bool {
    (48..=57).contains(&u)
}
fn words(
    id: &Utf16,
    class: bool,
    clean: bool,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        id.len().saturating_mul(2).saturating_add(1),
        Utf16::default(),
    )?;
    let mut out = Vec::with_capacity(id.len().saturating_mul(2));
    let units = id.units();
    let mut first = true;
    for (i, raw) in units.iter().copied().enumerate() {
        if i % 1024 == 0 {
            ctx.charge_work(1, Utf16::default())?;
        }
        let u = if clean && !(upper(raw) || lower(raw) || digit(raw)) {
            95
        } else {
            raw
        };
        let prev = i.checked_sub(1).and_then(|j| units.get(j)).copied();
        let next = units.get(i + 1).copied();
        let boundary = upper(u)
            && prev.is_some_and(|p| lower(p) || digit(p) || upper(p) && next.is_some_and(lower));
        if boundary {
            if !class {
                out.push(95);
            }
            first = true;
        }
        if u == 95 {
            if !class {
                out.push(95);
            }
            first = true;
            continue;
        }
        let emitted = if class {
            if first && lower(u) {
                u - 32
            } else {
                u
            }
        } else if upper(u) {
            u + 32
        } else {
            u
        };
        out.push(emitted);
        first = false;
    }
    Ok(Utf16::new(out))
}
fn valid_identifier(
    name: &Utf16,
    underscores: bool,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    ctx.charge_work(name.len(), Utf16::default())?;
    if !name.units().first().is_some_and(|u| upper(*u) || lower(*u)) {
        return Ok(false);
    }
    for (i, u) in name.units().iter().enumerate() {
        if i % 1024 == 0 {
            ctx.charge_work(1, Utf16::default())?;
        }
        if !(upper(*u) || lower(*u) || digit(*u) || underscores && *u == 95) {
            return Ok(false);
        }
    }
    Ok(true)
}
struct Names<'a> {
    request: &'a Value,
    profile: &'a Value,
    logical: &'a Utf16,
}
impl Names<'_> {
    fn resolve(
        &self,
        id: &Utf16,
        class: bool,
        pointer: &Utf16,
        out: &mut Admission,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        let mut overrides = Vec::new();
        for n in xs(self.request, "names") {
            ctx.charge_work(1, Utf16::default())?;
            if st(n, "sourceId") == Some(self.logical) && st(n, "pointer") == Some(pointer) {
                overrides.push(n);
            }
        }
        if overrides.len() > 1 {
            add(out, "NAME", pointer.clone(), self.logical, ctx)?;
            return Ok("_invalid".into());
        }
        let name = if let Some(value) = overrides.first().and_then(|n| st(n, "python")) {
            ctx.charge_work(value.len(), Utf16::default())?;
            value.clone()
        } else {
            words(id, class, false, ctx)?
        };
        let reserved = scan_find(
            xs(self.profile, "reservedNames")
                .iter()
                .chain(xs(self.profile, "importedNames")),
            ctx,
            |v| matches!(v,Value::String(v)if v==&name),
        )?
        .is_some();
        let invalid = overrides.is_empty() && !valid_identifier(id, false, ctx)?
            || !valid_identifier(&name, true, ctx)?
            || py_keyword(&name)
            || name.units().starts_with(&Utf16::from("model_").units())
            || ["c", "s", "objects", "alias"]
                .iter()
                .chain(RESERVED)
                .any(|s| name == Utf16::from(*s))
            || reserved
            || name
                .units()
                .starts_with(Utf16::from("validate_field_").units());
        if invalid {
            add(out, "NAME", pointer.clone(), self.logical, ctx)?;
        }
        Ok(name)
    }
}
fn relevant(paths: &[Utf16], p: &Utf16, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut end = p.len();
    while end > 0 {
        ctx.charge_work(end.saturating_mul(16).saturating_add(1), Utf16::default())?;
        if paths
            .binary_search_by(|key| key.units().cmp(&p.units()[..end]))
            .is_ok()
        {
            return Ok(true);
        }
        end = p.units()[..end].iter().rposition(|u| *u == 47).unwrap_or(0);
    }
    Ok(paths.binary_search_by(|key| key.units().cmp(&[])).is_ok())
}
fn visit(
    reference: &Value,
    loc: &Locator<'_>,
    paths: &mut BTreeSet<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut pending = vec![reference];
    let mut seen = BTreeSet::new();
    while let Some(reference) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        let Some(identity) = key(reference, ctx)? else {
            continue;
        };
        if !seen.insert(identity) {
            continue;
        }
        if let Some((mi, ei, node)) = loc.get(reference, ctx)? {
            paths.insert(format!("/modules/{mi}/elements/{ei}").into());
            let members = xs(node, "members");
            ctx.charge_work(members.len() + 1, Utf16::default())?;
            if let Some(item) = member(node, "itemType") {
                pending.push(item)
            }
            for member in members.iter().rev() {
                pending.push(member);
            }
        }
    }
    Ok(())
}
fn raw_action<'a>(
    doc: &'a Value,
    a: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let Some(m) = scan_find(xs(doc, "modules"), ctx, |m| st(m, "id") == st(a, "module"))? else {
        return Ok(None);
    };
    scan_find(
        xs(at(at(m, "extensions"), "umf.actions"), "actions"),
        ctx,
        |d| st(d, "id") == st(a, "id"),
    )
}

pub(super) fn inspect_target_admission(
    engine: &CodegenEngine<'_>,
    document: &Value,
    request: &Value,
    profile: &Value,
    ir: &mut Value,
    ctx: &mut Context<'_>,
) -> Result<Admission, EngineError> {
    let logical = text_copy(request, "logical", ctx)?;
    let names = Names {
        request,
        profile,
        logical: &logical,
    };
    let mut out = Admission {
        diagnostics: Vec::new(),
        not_expressible: Vec::new(),
        selected_paths: BTreeSet::new(),
    };
    let loc = Locator::new(document, ctx)?;
    let validation = super::inspection::core_validation(engine, document, ctx)?;
    let mut records = take_array(ir, "records");
    let mut relations = take_array(ir, "relations");
    let mut actions = take_array(ir, "actions");
    let mut searches = take_array(ir, "search");
    let mut selected = BTreeSet::new();
    for r in xs(request, "records") {
        if let Some(k) = key(r, ctx)? {
            selected.insert(k);
        }
    }
    // Dependency keys preserve Map insertion order, with the last referenced
    // key retained when conflicting uses produce a reference diagnostic.
    let mut dependencies: Vec<(Value, Utf16)> = Vec::new();
    let mut dependency_index = BTreeMap::new();
    let mut requested = Vec::new();
    for relation in &relations {
        ctx.charge_work(1, Utf16::default())?;
        if let Some(k) = st(relation, "key") {
            requested.push((
                at(relation, "target"),
                k,
                append(&path(relation, ctx)?, "/target"),
            ));
        }
    }
    for action in &actions {
        ctx.charge_work(1, Utf16::default())?;
        if let Some(raw) = raw_action(document, action, ctx)? {
            for group in ["parameters", "outputs"] {
                for p in xs(raw, group) {
                    ctx.charge_work(1, Utf16::default())?;
                    if is(p, "kind", "entity") {
                        let target = at(p, "target");
                        if let Some(k) = st(target, "key") {
                            requested.push((target, k, path(action, ctx)?));
                        }
                    }
                }
            }
        }
    }
    for (reference, key_id, error_path) in requested {
        let Some(identity) = key(reference, ctx)? else {
            continue;
        };
        if selected.contains(&identity) {
            continue;
        }
        if let Some(index) = dependency_index.get(&identity).copied() {
            let index: usize = index;
            if &dependencies[index].1 != key_id {
                add(&mut out, "REFERENCE", error_path, &logical, ctx)?;
            }
            ctx.charge_work(key_id.len(), Utf16::default())?;
            dependencies[index].1 = key_id.clone();
        } else {
            let index = dependencies.len();
            dependency_index.insert(identity, index);
            ctx.charge_work(key_id.len() + 2, Utf16::default())?;
            dependencies.push((
                obj([
                    ("module", copied(at(reference, "module"), ctx)?),
                    ("element", copied(at(reference, "element"), ctx)?),
                ]),
                key_id.clone(),
            ));
        }
    }
    records.retain(|r| yes(r, "selected"));
    for (reference, key_id) in dependencies {
        ctx.charge_work(1, Utf16::default())?;
        let located = loc.get(&reference, ctx)?;
        let (mi, ei, node) = located
            .map(|(m, e, n)| (m as isize, e as isize, n))
            .unwrap_or((-1, -1, &Value::Null));
        let p: Utf16 = format!("/modules/{mi}/elements/{ei}").into();
        let key_base = append(&p, "/keys");
        let unknown_key_qualifier = Utf16::from("UNKNOWN_KEY_QUALIFIER");
        let partial = scan_find(&validation, ctx, |d| {
            d.code == unknown_key_qualifier
                && (d.path == key_base
                    || (d.path.units().starts_with(key_base.units())
                        && d.path.units().get(key_base.len()) == Some(&47)))
        })?
        .is_some();
        let selected_key = if partial {
            None
        } else {
            scan_find(xs(node, "keys"), ctx, |k| st(k, "id") == Some(&key_id))?
        };
        let Some(selected_key) = selected_key else {
            add(&mut out, "REFERENCE", key_base, &logical, ctx)?;
            continue;
        };
        let mut fields = Vec::new();
        for field_ref in xs(selected_key, "fields") {
            ctx.charge_work(1, Utf16::default())?;
            let Some((fmi, fei, field)) = loc.get(field_ref, ctx)? else {
                add(&mut out, "REFERENCE", p.clone(), &logical, ctx)?;
                continue;
            };
            if is(field, "scalarType", "date") || is(field, "scalarType", "timestamp") {
                add(&mut out, "ACCESS", p.clone(), &logical, ctx)?;
                continue;
            }
            let (facets, properties, partial) =
                super::inspection::resolve_dependency_field_with_validation(
                    document,
                    field_ref,
                    &validation,
                    ctx,
                )?;
            let facets = if let Some(first) = partial.first() {
                add(&mut out, "UNKNOWN_RELEVANT", first.clone(), &logical, ctx)?;
                obj([])
            } else {
                facets
            };
            fields.push(obj([
                ("ref", copied(field_ref, ctx)?),
                ("pointer", s(&format!("/modules/{fmi}/elements/{fei}"))),
                ("python", s("")),
                (
                    "logicalName",
                    match member(field, "name") {
                        Some(Value::String(v)) => {
                            ctx.charge_work(v.len(), Utf16::default())?;
                            Value::String(v.clone())
                        }
                        _ => Value::Null,
                    },
                ),
                ("scalarType", copied(at(field, "scalarType"), ctx)?),
                ("cardinality", s("one")),
                (
                    "row",
                    obj([
                        ("missing", Value::Bool(false)),
                        ("null", Value::Bool(false)),
                    ]),
                ),
                (
                    "create",
                    obj([
                        ("missing", Value::Bool(false)),
                        ("null", Value::Bool(false)),
                    ]),
                ),
                ("mutable", Value::Bool(false)),
                ("generated", Value::Bool(false)),
                ("facets", facets),
                ("properties", properties),
            ]));
        }
        let module = if mi >= 0 {
            xs(document, "modules")
                .get(mi as usize)
                .unwrap_or(&Value::Null)
        } else {
            &Value::Null
        };
        records.push(obj([
            ("ref", reference),
            ("pointer", Value::String(p)),
            ("python", s("")),
            ("namespace", copied(at(module, "namespace"), ctx)?),
            (
                "logicalName",
                match member(node, "name") {
                    Some(Value::String(v)) => {
                        ctx.charge_work(v.len(), Utf16::default())?;
                        Value::String(v.clone())
                    }
                    _ => Value::Null,
                },
            ),
            ("fields", Value::Array(fields)),
            (
                "keys",
                Value::Array(vec![obj([
                    ("id", Value::String(key_id)),
                    ("fields", copied(at(selected_key, "fields"), ctx)?),
                ])]),
            ),
            ("selected", Value::Bool(false)),
        ]));
    }
    for assertion in [
        "kind",
        "nullability",
        "Key",
        "facets",
        "defaults",
        "relationships",
        "actions",
        "umf.access",
    ] {
        ctx.charge_work(1, Utf16::default())?;
        if scan_find(xs(profile, "assertionKinds"), ctx, |v| *v == &s(assertion))?.is_some() {
            continue;
        }
        let mut needed = false;
        // The predecessor tests the contextual inspector's selected records,
        // before dependency key records are appended to the target IR.
        for r in &records {
            ctx.charge_work(1, Utf16::default())?;
            if !yes(r, "selected") {
                continue;
            }
            needed = matches!(assertion, "kind" | "nullability" | "umf.access")
                || assertion == "Key" && !xs(r, "keys").is_empty();
            if assertion == "facets" {
                needed = scan_find(xs(r, "fields"), ctx, |f| {
                    object_members(at(f, "facets")).is_some_and(|m| !m.is_empty())
                })?
                .is_some();
            }
            if assertion == "defaults" {
                needed = scan_find(xs(r, "fields"), ctx, |f| {
                    member(at(f, "properties"), "default").is_some()
                })?
                .is_some();
            }
            if needed {
                break;
            }
        }
        if needed {
            add(
                &mut out,
                "UNKNOWN_RELEVANT",
                "/profile/assertionKinds".into(),
                &logical,
                ctx,
            )?;
        }
    }
    for record in &records {
        ctx.charge_work(1, Utf16::default())?;
        let p = path(record, ctx)?;
        if yes(record, "selected") {
            out.selected_paths.insert(p.clone());
        } else {
            out.selected_paths.insert(append(&p, "/id"));
            out.selected_paths.insert(append(&p, "/kind"));
            if let Some((_, _, node)) = loc.get(at(record, "ref"), ctx)? {
                for k in xs(record, "keys") {
                    ctx.charge_work(1, Utf16::default())?;
                    let index =
                        scan_position(xs(node, "keys"), ctx, |raw| st(raw, "id") == st(k, "id"))?
                            .map(|x| x as isize)
                            .unwrap_or(-1);
                    out.selected_paths
                        .insert(append(&p, &format!("/keys/{index}")));
                }
            }
        }
        for f in xs(record, "fields") {
            ctx.charge_work(1, Utf16::default())?;
            out.selected_paths.insert(path(f, ctx)?);
        }
    }
    for r in xs(request, "records") {
        visit(r, &loc, &mut out.selected_paths, ctx)?;
    }
    for r in &records {
        ctx.charge_work(1, Utf16::default())?;
        if yes(r, "selected") {
            continue;
        }
        visit(at(r, "ref"), &loc, &mut out.selected_paths, ctx)?;
    }
    for search in &searches {
        out.selected_paths.insert(path(search, ctx)?);
    }
    for vocabulary in ["umf.access", "umf.actions"] {
        if vocabulary == "umf.actions" && xs(request, "actions").is_empty() {
            continue;
        }
        let base: Utf16 = format!("/vocabularies/{vocabulary}").into();
        for (k, _) in js_object_members(at(at(document, "vocabularies"), vocabulary), ctx)? {
            if k != &Utf16::from("version") {
                add(
                    &mut out,
                    "UNKNOWN_RELEVANT",
                    child(&base, k, ctx)?,
                    &logical,
                    ctx,
                )?;
            }
        }
    }
    ctx.charge_work(out.selected_paths.len(), Utf16::default())?;
    for p in &out.selected_paths {
        ctx.charge_work(p.len(), Utf16::default())?;
    }
    let relevant_paths = out.selected_paths.iter().cloned().collect::<Vec<_>>();
    for diagnostic in &validation {
        ctx.charge_work(1, Utf16::default())?;
        if diagnostic.severity == umf_core::Severity::Warning
            && diagnostic.code != Utf16::from("UNKNOWN_EXTENSION")
            && relevant(&relevant_paths, &diagnostic.path, ctx)?
        {
            add(
                &mut out,
                "UNKNOWN_RELEVANT",
                diagnostic.path.clone(),
                &logical,
                ctx,
            )?;
        }
    }
    for (k, _) in js_object_members(at(document, "extensions"), ctx)? {
        add(
            &mut out,
            "UNKNOWN_RELEVANT",
            child(&"/extensions".into(), k, ctx)?,
            &logical,
            ctx,
        )?;
    }
    for n in xs(request, "names") {
        ctx.charge_work(1, Utf16::default())?;
        if st(n, "sourceId") != Some(&logical) {
            add(&mut out, "NAME", "/names".into(), &logical, ctx)?;
        }
    }
    for (mi, module) in xs(document, "modules").iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if scan_find(xs(request, "records"), ctx, |r| {
            st(r, "module") == st(module, "id")
        })?
        .is_none()
        {
            continue;
        }
        for (k, _) in js_object_members(document, ctx)? {
            if ![
                "umf",
                "id",
                "vocabularies",
                "modules",
                "extensions",
                "title",
                "aliases",
            ]
            .iter()
            .any(|s| k == &Utf16::from(*s))
            {
                add(
                    &mut out,
                    "UNKNOWN_RELEVANT",
                    child(&Utf16::default(), k, ctx)?,
                    &logical,
                    ctx,
                )?;
            }
        }
        let base: Utf16 = format!("/modules/{mi}").into();
        for (k, _) in js_object_members(module, ctx)? {
            if ![
                "id",
                "namespace",
                "elements",
                "extensions",
                "relationships",
                "title",
                "aliases",
            ]
            .iter()
            .any(|s| k == &Utf16::from(*s))
            {
                add(
                    &mut out,
                    "UNKNOWN_RELEVANT",
                    child(&base, k, ctx)?,
                    &logical,
                    ctx,
                )?;
            }
        }
        for (k, payload) in js_object_members(at(module, "extensions"), ctx)? {
            let action_ok = k == &Utf16::from("umf.actions")
                && is(
                    at(at(document, "vocabularies"), "umf.actions"),
                    "version",
                    "0.1.0",
                )
                && object_members(payload).is_some()
                && member(payload, "actions").and_then(array_items).is_some()
                && object_members(payload)
                    .unwrap()
                    .iter()
                    .all(|(key, _)| key == &Utf16::from("actions"));
            if k != &Utf16::from("umf.access") && !action_ok {
                add(
                    &mut out,
                    "UNKNOWN_RELEVANT",
                    child(&append(&base, "/extensions"), k, ctx)?,
                    &logical,
                    ctx,
                )?;
            }
        }
    }
    for (mi, module) in xs(document, "modules").iter().enumerate() {
        for (ei, element) in xs(module, "elements").iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            let p: Utf16 = format!("/modules/{mi}/elements/{ei}").into();
            if relevant(&relevant_paths, &p, ctx)? {
                for (k, _) in js_object_members(at(element, "extensions"), ctx)? {
                    add(
                        &mut out,
                        "UNKNOWN_RELEVANT",
                        child(&append(&p, "/extensions"), k, ctx)?,
                        &logical,
                        ctx,
                    )?;
                }
                if !xs(element, "references").is_empty() {
                    add(&mut out, "LOSS", append(&p, "/references"), &logical, ctx)?;
                }
            }
        }
    }
    for record in &mut records {
        ctx.charge_work(1, Utf16::default())?;
        let p = path(record, ctx)?;
        let fields_count = xs(record, "fields").len();
        if fields_count > 10_000 {
            add(&mut out, "LIMIT", p, &logical, ctx)?;
            continue;
        }
        if yes(record, "selected") && xs(record, "keys").is_empty() {
            add(&mut out, "LOSS", append(&p, "/keys"), &logical, ctx)?;
            out.not_expressible.push(p.clone());
        }
        let mut wire_ids = BTreeSet::new();
        for f in xs(record, "fields") {
            ctx.charge_work(1, Utf16::default())?;
            if !owned(f) {
                continue;
            }
            if let Some(id) = st(at(f, "ref"), "element") {
                ctx.charge_work(id.len(), Utf16::default())?;
                if !wire_ids.insert(id.clone()) {
                    add(&mut out, "REFERENCE", append(&p, "/members"), &logical, ctx)?;
                    break;
                }
            }
        }
        let id = text_copy(at(record, "ref"), "element", ctx)?;
        set(
            record,
            "python",
            Value::String(names.resolve(&id, true, &p, &mut out, ctx)?),
        );
        let mut fields = take_array(record, "fields");
        let mut used = BTreeSet::new();
        for index in 0..fields.len() {
            ctx.charge_work(1, Utf16::default())?;
            let fp = path(&fields[index], ctx)?;
            let id = text_copy(at(&fields[index], "ref"), "element", ctx)?;
            let python = names.resolve(&id, false, &fp, &mut out, ctx)?;
            ctx.charge_work(python.len(), Utf16::default())?;
            if !used.insert(python.clone()) {
                add(&mut out, "NAME", fp.clone(), &logical, ctx)?;
            }
            set(&mut fields[index], "python", Value::String(python));
            if is(&fields[index], "scalarType", "float") && !yes(&fields[index], "vectorComponent")
                || is(&fields[index], "scalarType", "time")
                || is(&fields[index], "cardinality", "unspecified")
            {
                add(&mut out, "LOSS", fp.clone(), &logical, ctx)?;
                out.not_expressible.push(fp.clone());
            }
            if let Some(item) = member(&fields[index], "item") {
                if !member(&fields[index], "vectorDimensions").is_some()
                    && scan_find(&fields, ctx, |f| {
                        same(at(f, "ref"), item) && is(f, "scalarType", "float")
                    })?
                    .is_some()
                {
                    add(&mut out, "LOSS", fp.clone(), &logical, ctx)?;
                }
                let mut seen = BTreeSet::new();
                let mut current = Some(index);
                while let Some(i) = current {
                    ctx.charge_work(1, Utf16::default())?;
                    let Some(item) = member(&fields[i], "item") else {
                        break;
                    };
                    if let Some(k) = key(at(&fields[i], "ref"), ctx)? {
                        if !seen.insert(k) {
                            add(&mut out, "LOSS", fp.clone(), &logical, ctx)?;
                            out.not_expressible.push(fp.clone());
                            break;
                        }
                    }
                    current = scan_position(&fields, ctx, |f| same(at(f, "ref"), item))?;
                }
                if member(at(&fields[index], "properties"), "allowedValues")
                    .and_then(array_items)
                    .is_some()
                {
                    add(
                        &mut out,
                        "LOSS",
                        append(&fp, "/allowedValues"),
                        &logical,
                        ctx,
                    )?;
                    out.not_expressible.push(fp);
                }
            }
        }
        set(record, "fields", Value::Array(fields));
    }
    if let Some(package) = st(request, "package") {
        if py_keyword(package)
            || [
                "datetime",
                "decimal",
                "typing",
                "types",
                "pydantic",
                "umf_access",
            ]
            .iter()
            .any(|s| package == &Utf16::from(*s))
            || scan_find(
                xs(profile, "reservedNames")
                    .iter()
                    .chain(xs(profile, "importedNames")),
                ctx,
                |v| matches!(v,Value::String(v)if v==package),
            )?
            .is_some()
        {
            add(&mut out, "NAME", "/package".into(), &logical, ctx)?;
        }
    }
    for search in &mut searches {
        ctx.charge_work(1, Utf16::default())?;
        let id = text_copy(search, "id", ctx)?;
        let p = path(search, ctx)?;
        let python = names.resolve(&id, false, &p, &mut out, ctx)?;
        set(search, "python", Value::String(python));
    }
    for record in &records {
        let mut used = BTreeSet::new();
        for search in &searches {
            ctx.charge_work(1, Utf16::default())?;
            if !same(at(search, "record"), at(record, "ref")) {
                continue;
            }
            let py = text_copy(search, "python", ctx)?;
            ctx.charge_work(py.len(), Utf16::default())?;
            if !used.insert(py) {
                add(&mut out, "NAME", path(record, ctx)?, &logical, ctx)?;
            }
        }
    }
    let mut classes = BTreeSet::new();
    for record in &records {
        let python = text_copy(record, "python", ctx)?;
        let selected = yes(record, "selected");
        let mut suffixes = if selected {
            vec![
                "",
                "Create",
                "Patch",
                "Key",
                "Update",
                "Columns",
                "Query",
                "Alias",
                "AliasColumns",
            ]
        } else {
            vec!["Key"]
        };
        if selected
            && scan_find(&searches, ctx, |s| same(at(s, "record"), at(record, "ref")))?.is_some()
        {
            suffixes.extend(["Search", "RankedQuery", "SelectedQuery"]);
        }
        for suffix in suffixes {
            ctx.charge_work(python.len() + suffix.len() + 1, Utf16::default())?;
            if !classes.insert(append(&python, suffix)) {
                add(&mut out, "NAME", path(record, ctx)?, &logical, ctx)?;
            }
        }
    }
    for record in &records {
        for k in xs(record, "keys").iter().skip(1) {
            ctx.charge_work(1, Utf16::default())?;
            let suffix = words(st(k, "id").unwrap_or(&Utf16::default()), true, true, ctx)?;
            let python = text_copy(record, "python", ctx)?;
            ctx.charge_work(python.len() + suffix.len() + 3, Utf16::default())?;
            let mut units = python.units().to_vec();
            units.extend_from_slice(suffix.units());
            units.extend("Key".encode_utf16());
            let name = Utf16::new(units);
            if classes.contains(&name) || !valid_identifier(&name, true, ctx)? {
                add(
                    &mut out,
                    "NAME",
                    append(&path(record, ctx)?, "/keys"),
                    &logical,
                    ctx,
                )?;
            }
            classes.insert(name);
        }
    }
    for (index, projection) in xs(request, "projections").iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let mut distinct_refs = BTreeSet::new();
        let mut wire_names = BTreeSet::new();
        let mut duplicate = false;
        for field in xs(projection, "fields") {
            ctx.charge_work(1, Utf16::default())?;
            if let Some(k) = key(field, ctx)? {
                if !distinct_refs.insert(k) {
                    duplicate = true;
                }
            }
            if let Some(id) = st(field, "element") {
                ctx.charge_work(id.len(), Utf16::default())?;
                if !wire_names.insert(id.clone()) {
                    duplicate = true;
                }
            }
        }
        let selected_record =
            key(at(projection, "record"), ctx)?.is_some_and(|k| selected.contains(&k));
        if !selected_record || duplicate {
            add(&mut out, "REFERENCE", "/projections".into(), &logical, ctx)?;
            continue;
        }
        let record = scan_find(&records, ctx, |r| {
            same(at(r, "ref"), at(projection, "record"))
        })?;
        let mut reachable = BTreeSet::new();
        if let Some(k) = key(at(projection, "record"), ctx)? {
            reachable.insert(k);
        }
        for _ in 0..3 {
            let mut next = Vec::new();
            for relation in &relations {
                ctx.charge_work(1, Utf16::default())?;
                if yes(relation, "toOne")
                    && key(at(relation, "owner"), ctx)?.is_some_and(|k| reachable.contains(&k))
                {
                    if let Some(k) = key(at(relation, "target"), ctx)? {
                        next.push(k);
                    }
                }
            }
            reachable.extend(next);
        }
        let mut projection_names = BTreeSet::new();
        let mut duplicate_names = false;
        for reference in xs(projection, "fields") {
            ctx.charge_work(1, Utf16::default())?;
            let own = if let Some(r) = record {
                scan_find(xs(r, "fields"), ctx, |f| {
                    owned(f) && same(at(f, "ref"), reference)
                })?
            } else {
                None
            };
            let mut candidates = Vec::new();
            if let Some(field) = own {
                candidates.push(field)
            } else {
                for r in &records {
                    ctx.charge_work(1, Utf16::default())?;
                    if !yes(r, "selected") {
                        continue;
                    }
                    if key(at(r, "ref"), ctx)?.is_some_and(|k| reachable.contains(&k)) {
                        for f in xs(r, "fields") {
                            ctx.charge_work(1, Utf16::default())?;
                            if owned(f) && same(at(f, "ref"), reference) {
                                candidates.push(f);
                            }
                        }
                    }
                }
            }
            if candidates.len() != 1 {
                add(&mut out, "REFERENCE", "/projections".into(), &logical, ctx)?;
            } else {
                let py = text_copy(candidates[0], "python", ctx)?;
                ctx.charge_work(py.len(), Utf16::default())?;
                if !projection_names.insert(py) {
                    duplicate_names = true;
                }
            }
        }
        if xs(projection, "fields").is_empty() || duplicate_names {
            add(&mut out, "NAME", "/projections".into(), &logical, ctx)?;
        }
        let name = names.resolve(
            st(projection, "name").unwrap_or(&Utf16::default()),
            true,
            &format!("/projections/{index}").into(),
            &mut out,
            ctx,
        )?;
        ctx.charge_work(
            name.len().saturating_mul(2).saturating_add(10),
            Utf16::default(),
        )?;
        let projection_name = append(&name, "Projection");
        if classes.contains(&name) || classes.contains(&projection_name) {
            add(&mut out, "NAME", "/projections".into(), &logical, ctx)?;
        }
        classes.insert(name);
        classes.insert(projection_name);
    }
    for relation in &mut relations {
        ctx.charge_work(1, Utf16::default())?;
        set(relation, "python", s(""));
    }
    for i in 0..relations.len() {
        ctx.charge_work(1, Utf16::default())?;
        let p = path(&relations[i], ctx)?;
        let id = text_copy(&relations[i], "id", ctx)?;
        let python = names.resolve(&id, false, &p, &mut out, ctx)?;
        set(&mut relations[i], "python", Value::String(python.clone()));
        let owner = scan_find(&records, ctx, |r| {
            same(at(r, "ref"), at(&relations[i], "owner"))
        })?;
        let field_collision = if let Some(r) = owner {
            scan_find(xs(r, "fields"), ctx, |f| {
                owned(f) && st(f, "python") == Some(&python)
            })?
            .is_some()
        } else {
            false
        };
        let mut relation_collision = false;
        for (j, other) in relations.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            if i != j
                && same(at(other, "owner"), at(&relations[i], "owner"))
                && st(other, "python") == Some(&python)
            {
                relation_collision = true;
                break;
            }
        }
        if field_collision || relation_collision {
            add(&mut out, "NAME", p, &logical, ctx)?;
        }
    }
    for n in xs(request, "names") {
        ctx.charge_work(1, Utf16::default())?;
        let p = text_copy(n, "pointer", ctx)?;
        let mut known = out.selected_paths.contains(&p)
            || scan_find(&relations, ctx, |r| st(r, "pointer") == Some(&p))?.is_some();
        if !known {
            for i in 0..xs(request, "projections").len() {
                ctx.charge_work(1, Utf16::default())?;
                if p == Utf16::from(format!("/projections/{i}")) {
                    known = true;
                    break;
                }
            }
        }
        if !known {
            for a in &actions {
                ctx.charge_work(1, Utf16::default())?;
                let base = path(a, ctx)?;
                ctx.charge_work(
                    base.len().saturating_mul(2).saturating_add(p.len()),
                    Utf16::default(),
                )?;
                if p == base
                    || p.units().starts_with(append(&base, "/parameters/").units())
                    || p.units().starts_with(append(&base, "/outputs/").units())
                {
                    known = true;
                    break;
                }
            }
        }
        if !known || st(n, "sourceId") != Some(&logical) {
            add(&mut out, "NAME", "/names".into(), &logical, ctx)?;
        }
    }
    for action in &mut actions {
        ctx.charge_work(1, Utf16::default())?;
        let p = path(action, ctx)?;
        let id = text_copy(action, "id", ctx)?;
        let python = names.resolve(&id, true, &p, &mut out, ctx)?;
        if [
            "Actions",
            "ReplayingActions",
            "ActionSource",
            "KeyTypeRef",
            "RecordTypeRef",
            "ActionEndpoint",
            "ReplayingActionEndpoint",
            "ActionExecutor",
            "ReplayingActionExecutor",
        ]
        .iter()
        .any(|s| python == Utf16::from(*s))
        {
            add(&mut out, "NAME", p.clone(), &logical, ctx)?;
        }
        for suffix in ["", "Input", "Output", "Rejected", "Committed"] {
            ctx.charge_work(python.len() + suffix.len() + 1, Utf16::default())?;
            if !classes.insert(append(&python, suffix)) {
                add(&mut out, "NAME", p.clone(), &logical, ctx)?;
            }
        }
        set(action, "python", Value::String(python));
        if let Some(raw) = raw_action(document, action, ctx)? {
            for group in ["parameters", "outputs"] {
                let mut parameters = Vec::new();
                let mut used = BTreeSet::new();
                for (index, parameter) in xs(raw, group).iter().enumerate() {
                    ctx.charge_work(1, Utf16::default())?;
                    let pp = append(&p, &format!("/{group}/{index}"));
                    let id = text_copy(parameter, "id", ctx)?;
                    let python = names.resolve(&id, false, &pp, &mut out, ctx)?;
                    ctx.charge_work(python.len(), Utf16::default())?;
                    if !used.insert(python.clone()) {
                        add(&mut out, "NAME", pp.clone(), &logical, ctx)?;
                    }
                    if is(parameter, "kind", "entity") {
                        let target = at(parameter, "target");
                        let record = scan_find(&records, ctx, |r| same(at(r, "ref"), target))?;
                        let has_key = if let Some(r) = record {
                            scan_find(xs(r, "keys"), ctx, |k| st(k, "id") == st(target, "key"))?
                                .is_some()
                        } else {
                            false
                        };
                        if !has_key {
                            add(&mut out, "REFERENCE", pp, &logical, ctx)?;
                            continue;
                        }
                        parameters.push(obj([
                            ("id", Value::String(id)),
                            ("python", Value::String(python)),
                            ("required", Value::Bool(true)),
                            ("pointer", Value::String(pp)),
                            (
                                "entity",
                                obj([
                                    ("module", copied(at(target, "module"), ctx)?),
                                    ("element", copied(at(target, "element"), ctx)?),
                                ]),
                            ),
                            ("entityKey", copied(at(target, "key"), ctx)?),
                        ]));
                    } else {
                        let field =
                            scan_find(records.iter().flat_map(|r| xs(r, "fields")), ctx, |f| {
                                same(at(f, "ref"), at(parameter, "field"))
                            })?;
                        let Some(field) = field else {
                            add(&mut out, "REFERENCE", append(&pp, "/field"), &logical, ctx)?;
                            continue;
                        };
                        let mut field = copied(field, ctx)?;
                        if let Some((_, _, definition)) = loc.get(at(&field, "ref"), ctx)? {
                            let admits_null = umf_core::literal::literal_errors(
                                document,
                                definition,
                                &Value::Null,
                                true,
                                engine.resources().engine().policy(),
                                ctx,
                            )?
                            .is_empty();
                            let mut row = copied(at(&field, "row"), ctx)?;
                            set(&mut row, "null", Value::Bool(admits_null));
                            set(&mut field, "row", row);
                        }
                        parameters.push(obj([
                            ("id", Value::String(id)),
                            ("python", Value::String(python)),
                            ("required", copied(at(parameter, "required"), ctx)?),
                            ("pointer", Value::String(pp)),
                            ("field", field),
                        ]));
                    }
                }
                set(action, group, Value::Array(parameters));
            }
        }
    }
    let mut endpoints = BTreeSet::new();
    for action in &actions {
        ctx.charge_work(1, Utf16::default())?;
        let python = text_copy(action, "python", ctx)?;
        ctx.charge_work(python.len().saturating_mul(2), Utf16::default())?;
        let mut endpoint = Vec::with_capacity(python.len().saturating_mul(2));
        for (i, u) in python.units().iter().copied().enumerate() {
            if i % 1024 == 0 {
                ctx.charge_work(1, Utf16::default())?;
            }
            if upper(u) && i > 0 && (lower(python.units()[i - 1]) || digit(python.units()[i - 1])) {
                endpoint.push(95)
            }
            endpoint.push(if upper(u) { u + 32 } else { u });
        }
        let endpoint = Utf16::new(endpoint);
        if py_keyword(&endpoint) || !endpoints.insert(endpoint) {
            add(&mut out, "NAME", path(action, ctx)?, &logical, ctx)?;
        }
    }
    set(ir, "records", Value::Array(records));
    set(ir, "relations", Value::Array(relations));
    set(ir, "actions", Value::Array(actions));
    set(ir, "search", Value::Array(searches));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn admission() -> Admission {
        Admission {
            diagnostics: vec![],
            not_expressible: vec![],
            selected_paths: BTreeSet::new(),
        }
    }
    #[test]
    fn naming_acronyms_and_explicit_overrides_preserve_source_rules() {
        let request = obj([("names", Value::Array(vec![]))]);
        let profile = obj([]);
        let logical = Utf16::from("logical");
        let names = Names {
            request: &request,
            profile: &profile,
            logical: &logical,
        };
        for (id, class, expected) in [
            ("HTTPServer", true, "HTTPServer"),
            ("HTTPServer", false, "http_server"),
            ("customerID", false, "customer_id"),
            ("customerID", true, "CustomerID"),
            ("S3Bucket", false, "s3_bucket"),
        ] {
            let mut out = admission();
            assert_eq!(
                names
                    .resolve(
                        &id.into(),
                        class,
                        &"/field".into(),
                        &mut out,
                        &mut Context::ordinary()
                    )
                    .unwrap(),
                Utf16::from(expected)
            );
            assert!(out.diagnostics.is_empty());
        }
        let request = obj([(
            "names",
            Value::Array(vec![obj([
                ("sourceId", s("logical")),
                ("pointer", s("/field")),
                ("python", s("chosen_field")),
            ])]),
        )]);
        let names = Names {
            request: &request,
            profile: &profile,
            logical: &logical,
        };
        let mut out = admission();
        assert_eq!(
            names
                .resolve(
                    &"not-a-source-identifier".into(),
                    false,
                    &"/field".into(),
                    &mut out,
                    &mut Context::ordinary()
                )
                .unwrap(),
            Utf16::from("chosen_field")
        );
        assert!(out.diagnostics.is_empty());
    }
    #[test]
    fn reserved_name_scan_propagates_late_host_failure_without_semantic_diagnostic() {
        let request = obj([("names", Value::Array(vec![]))]);
        let mut reserved = (0..4096)
            .map(|i| s(&format!("Other{i}")))
            .collect::<Vec<_>>();
        reserved.push(s("Chosen"));
        let profile = obj([("reservedNames", Value::Array(reserved))]);
        let logical = Utf16::from("logical");
        let names = Names {
            request: &request,
            profile: &profile,
            logical: &logical,
        };
        let mut total = 0;
        let mut count = |amount| {
            total += amount;
            Ok(())
        };
        let mut out = admission();
        names
            .resolve(
                &"Chosen".into(),
                true,
                &"/field".into(),
                &mut out,
                &mut Context::ordinary().with_meter(&mut count),
            )
            .unwrap();
        assert_eq!(out.diagnostics.len(), 1);
        let stop_at = total * 3 / 4;
        let mut spent = 0;
        let mut stop = |amount| {
            spent += amount;
            if spent >= stop_at {
                Err(EngineError::new(
                    "VALUE_INVALID",
                    Utf16::default(),
                    "late naming stop",
                ))
            } else {
                Ok(())
            }
        };
        let mut out = admission();
        let error = names
            .resolve(
                &"Chosen".into(),
                true,
                &"/field".into(),
                &mut out,
                &mut Context::ordinary().with_meter(&mut stop),
            )
            .unwrap_err();
        assert!(error.is_control_failure());
        assert!(out.diagnostics.is_empty());
        assert!(spent >= stop_at && spent < total);
    }
}
