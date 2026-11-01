// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned DDD-to-GraphQL projection policy and receipt construction.
use crate::{
    context::Context,
    ddd_json_schema_projection,
    error::EngineError,
    value::{copy_json, Utf16, Value},
};

fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &key(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn has_only(v: &Value, allowed: &[&str]) -> bool {
    if let Value::Object(m) = v {
        m.iter().all(|(k, _)| allowed.iter().any(|a| k == &key(a)))
    } else {
        false
    }
}
fn arr(v: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(a)) = v {
        Some(a)
    } else {
        None
    }
}
fn txt(v: Option<&Value>) -> Option<String> {
    if let Some(Value::String(s)) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn ident(v: &Value) -> Option<(String, String)> {
    Some((txt(get(v, "module"))?, txt(get(v, "element"))?))
}
fn graphql_name(v: &str) -> bool {
    let mut chars = v.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first == '_' || first.is_ascii_alphabetic())
        && chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
        && !v.starts_with("__")
}
fn diagnostic(path: &str, reason: &str) -> Value {
    obj(vec![
        ("code", s("DDD_GRAPHQL_LOSS")),
        ("path", s(path)),
        ("severity", s("warning")),
        ("message", s(reason)),
    ])
}
fn residual(
    path: &str,
    reason: &str,
    choice: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(
        path.encode_utf16()
            .count()
            .saturating_add(reason.len())
            .saturating_add(1),
        Utf16::from(path),
    )?;
    Ok(obj(vec![
        ("path", s(path)),
        ("reason", s(reason)),
        ("choice", copy_json(choice, ctx)?),
    ]))
}
fn module_element<'a>(
    source: &'a Value,
    module: &str,
    element: &str,
) -> Option<(usize, usize, &'a Value)> {
    for (mi, m) in arr(get(source, "modules"))?.iter().enumerate() {
        if txt(get(m, "id")).as_deref() != Some(module) {
            continue;
        }
        for (ei, e) in arr(get(m, "elements"))?.iter().enumerate() {
            if txt(get(e, "id")).as_deref() == Some(element) {
                return Some((mi, ei, e));
            }
        }
    }
    None
}
fn selected_ddd_entity<'a>(e: &'a Value) -> Option<&'a Value> {
    let d = get(get(e, "extensions")?, "umf.ddd")?;
    (txt(get(d, "kind")).as_deref() == Some("entity")).then_some(d)
}

/// Build an entity-only projection or the full relationship projection. The
/// caller validates the produced SDL with the native GraphQL adapter.
pub fn project(
    source: &Value,
    policy: &Value,
    loss: &str,
    full: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss != "strict" && loss != "report" {
        return Err(err(
            "DDD_GRAPHQL_POLICY",
            "Expected strict or report loss policy",
        ));
    }
    let validation = ddd_json_schema_projection::inspect_ddd_document(source, ctx)?;
    if !validation.valid {
        return Err(err("DDD_GRAPHQL_SOURCE", "Valid DDD 0.1.0 source required"));
    }
    if validation
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("DDD_UNKNOWN"))
    {
        return Err(err(
            "DDD_GRAPHQL_SOURCE",
            "Uninterpreted DDD semantics cannot govern GraphQL projection",
        ));
    }
    if txt(get(
        get(source, "vocabularies").unwrap_or(&Value::Null),
        "umf.ddd",
    )
    .and_then(|v| get(v, "version")))
    .as_deref()
        != Some("0.1.0")
    {
        return Err(err("DDD_GRAPHQL_SOURCE", "DDD 0.1.0 required"));
    }
    let fields_allowed = if full {
        &[
            "entities",
            "fields",
            "scalars",
            "root",
            "sourceProfile",
            "endpoints",
            "relationships",
        ][..]
    } else {
        &["entities", "fields", "scalars", "root", "sourceProfile"][..]
    };
    let Value::Object(pairs) = policy else {
        return Err(err(
            "DDD_GRAPHQL_POLICY",
            "Projection policy must be an object",
        ));
    };
    if pairs
        .iter()
        .any(|(k, _)| !fields_allowed.iter().any(|name| k == &key(name)))
    {
        return Err(err(
            "DDD_GRAPHQL_POLICY",
            "Unknown projection policy member",
        ));
    }
    let entities = arr(get(policy, "entities"))
        .ok_or_else(|| err("DDD_GRAPHQL_POLICY", "entities must be an array"))?;
    let fields = arr(get(policy, "fields"))
        .ok_or_else(|| err("DDD_GRAPHQL_POLICY", "fields must be an array"))?;
    let scalars =
        get(policy, "scalars").ok_or_else(|| err("DDD_GRAPHQL_POLICY", "scalars are required"))?;
    let root = get(policy, "root").ok_or_else(|| err("DDD_GRAPHQL_POLICY", "root is required"))?;
    let source_profile = txt(get(policy, "sourceProfile"));
    if source_profile
        .as_deref()
        .is_some_and(|p| p != "ddd-only" && p != "core-ideals")
    {
        return Err(err("DDD_GRAPHQL_POLICY", "Unknown source profile"));
    }
    if full && source_profile.as_deref() != Some("core-ideals") {
        return Err(err(
            "DDD_GRAPHQL_POLICY",
            "Full GraphQL projection requires the core-ideals source profile",
        ));
    }
    if source_profile.as_deref() == Some("core-ideals")
        && txt(get(source, "umf")).as_deref() != Some("0.10.0")
    {
        return Err(err(
            "DDD_GRAPHQL_SOURCE",
            "Core Field profile requires current UMF",
        ));
    }
    if !full
        && arr(get(source, "modules"))
            .is_some_and(|ms| ms.iter().any(|m| get(m, "relationships").is_some()))
    {
        return Err(err(
            "DDD_GRAPHQL_RELATIONSHIP_GATE",
            "Relationship assertions require the full projection",
        ));
    }
    if !has_only(root, &["kind", "typeName", "fieldName"])
        || get(root, "kind").and_then(|v| txt(Some(v))).as_deref() != Some("synthetic-schema-root")
    {
        return Err(err("DDD_GRAPHQL_ROOT", "Synthetic schema root required"));
    }
    let root_type = txt(get(root, "typeName"))
        .ok_or_else(|| err("DDD_GRAPHQL_ROOT", "typeName is required"))?;
    let root_field = txt(get(root, "fieldName"))
        .ok_or_else(|| err("DDD_GRAPHQL_ROOT", "fieldName is required"))?;
    if !graphql_name(&root_type)
        || !graphql_name(&root_field)
        || ["String", "Boolean", "Int", "Float", "ID"].contains(&root_type.as_str())
    {
        return Err(err("DDD_GRAPHQL_ROOT", "Invalid GraphQL root name"));
    }
    let scalar_families = [
        ("string", "String"),
        ("boolean", "Boolean"),
        ("integer", "Int"),
        ("decimal", "Decimal"),
        ("date-time", "DateTime"),
        ("bytes", "Bytes"),
    ];
    let mut scalar_names = Vec::new();
    let mut scalar_set = std::collections::BTreeSet::new();
    for (family, _) in scalar_families {
        let name = txt(get(scalars, family)).ok_or_else(|| {
            err(
                "DDD_GRAPHQL_SCALAR_POLICY",
                "Every scalar family needs a GraphQL name",
            )
        })?;
        if !graphql_name(&name) || !scalar_set.insert(name.clone()) {
            return Err(err(
                "DDD_GRAPHQL_SCALAR_POLICY",
                "Scalar names must be distinct GraphQL names",
            ));
        }
        scalar_names.push((family.to_string(), name));
    }
    if let Value::Object(entries) = scalars {
        if entries.len() != scalar_families.len()
            || entries
                .iter()
                .any(|(k, _)| !scalar_families.iter().any(|(name, _)| k == &key(name)))
        {
            return Err(err(
                "DDD_GRAPHQL_SCALAR_POLICY",
                "Every scalar family must be specified exactly once",
            ));
        }
    }
    if scalar_names[0].1 != "String" || scalar_names[1].1 != "Boolean" {
        return Err(err(
            "DDD_GRAPHQL_SCALAR_POLICY",
            "String and Boolean scalar mappings are fixed",
        ));
    }
    let builtins = ["String", "Boolean", "Int", "Float", "ID"];
    let mut names = std::collections::BTreeSet::new();
    names.insert(root_type.clone());
    let mut entity_map = std::collections::BTreeMap::<(String, String), String>::new();
    for row in entities {
        if !has_only(row, &["module", "element", "name"]) {
            return Err(err(
                "DDD_GRAPHQL_ENTITY",
                "Entity mapping contains unknown members",
            ));
        }
        let (module, element) = ident(row).ok_or_else(|| {
            err(
                "DDD_GRAPHQL_ENTITY",
                "Entity references need module and element",
            )
        })?;
        let name = txt(get(row, "name"))
            .ok_or_else(|| err("DDD_GRAPHQL_ENTITY_NAME", "Entity name is required"))?;
        if !graphql_name(&name)
            || builtins.contains(&name.as_str())
            || !names.insert(name.clone())
            || entity_map.insert((module, element), name).is_some()
        {
            return Err(err(
                "DDD_GRAPHQL_ENTITY_NAME",
                "Invalid or duplicate GraphQL entity name",
            ));
        }
    }
    if entity_map.is_empty() {
        return Err(err(
            "DDD_GRAPHQL_ENTITY_SELECTION",
            "At least one entity is required",
        ));
    }
    for (_, name) in &scalar_names {
        if names.contains(name)
            || builtins.contains(&name.as_str())
                && !["String", "Boolean", "Int"].contains(&name.as_str())
        {
            return Err(err(
                "DDD_GRAPHQL_SCALAR_NAME",
                "Scalar collides with a GraphQL type",
            ));
        }
        names.insert(name.clone());
    }
    let mut core_fields = std::collections::BTreeSet::<(String, String)>::new();
    let mut field_names =
        std::collections::BTreeMap::<(String, String, String), (&Value, String)>::new();
    for row in fields {
        if !has_only(row, &["module", "element", "field", "name", "coreField"]) {
            return Err(err(
                "DDD_GRAPHQL_FIELD",
                "Field mapping contains unknown members",
            ));
        }
        let (module, element) = ident(row).ok_or_else(|| {
            err(
                "DDD_GRAPHQL_FIELD",
                "Field mappings need exact entity reference",
            )
        })?;
        let field =
            txt(get(row, "field")).ok_or_else(|| err("DDD_GRAPHQL_FIELD", "field is required"))?;
        let name = txt(get(row, "name"))
            .ok_or_else(|| err("DDD_GRAPHQL_FIELD_NAME", "GraphQL field name is required"))?;
        if !graphql_name(&name)
            || field_names
                .insert((module, element, field), (row, name))
                .is_some()
        {
            return Err(err(
                "DDD_GRAPHQL_FIELD_NAME",
                "Invalid or duplicate field mapping",
            ));
        }
        if let Some(reference) = get(row, "coreField").and_then(ident) {
            if !core_fields.insert(reference) {
                return Err(err(
                    "DDD_GRAPHQL_CORE_REFERENCE",
                    "A core Field cannot bind two DDD fields",
                ));
            }
        }
    }
    let mut residuals = Vec::new();
    let mut mappings = Vec::new();
    let mut definitions: Vec<(String, Vec<String>)> = Vec::new();
    let mut custom = std::collections::BTreeSet::new();
    let mut entity_field_names =
        std::collections::BTreeMap::<String, std::collections::BTreeSet<String>>::new();
    residuals.push(residual(
        "/policy/root",
        "Synthetic query root has no resolver or execution meaning",
        root,
        ctx,
    )?);
    for ((module, element), name) in &entity_map {
        let (mi, ei, record) = module_element(source, module, element).ok_or_else(|| {
            err(
                "DDD_GRAPHQL_ENTITY_REFERENCE",
                "Selected entity reference not found",
            )
        })?;
        let ddd = selected_ddd_entity(record).ok_or_else(|| {
            err(
                "DDD_GRAPHQL_ENTITY_REFERENCE",
                "Selected element is not a DDD entity",
            )
        })?;
        let ddd_fields = get(ddd, "fields")
            .and_then(|v| {
                if let Value::Object(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "DDD_GRAPHQL_ENTITY_FIELDS",
                    "Entity fields must be an object",
                )
            })?;
        let mut lines = Vec::new();
        let mut used = std::collections::BTreeSet::new();
        for (field_key, meaning) in ddd_fields {
            let source_field = field_key
                .to_utf8()
                .map_err(|_| err("DDD_GRAPHQL_FIELD", "Invalid field name UTF-16"))?;
            let path = format!(
                "/modules/{mi}/elements/{ei}/extensions/umf.ddd/fields/{}",
                source_field.replace('~', "~0").replace('/', "~1")
            );
            let chosen = field_names
                .get(&(module.clone(), element.clone(), source_field.clone()))
                .ok_or_else(|| {
                    err(
                        "DDD_GRAPHQL_FIELD",
                        "Every DDD field needs explicit field mapping",
                    )
                })?;
            if !used.insert(chosen.1.clone()) {
                return Err(err(
                    "DDD_GRAPHQL_FIELD_NAME",
                    "Duplicate GraphQL field in entity",
                ));
            }
            let ty = get(get(meaning, "type").unwrap_or(&Value::Null), "name")
                .and_then(|v| txt(Some(v)))
                .ok_or_else(|| {
                    err(
                        "DDD_GRAPHQL_FIELD_TYPE",
                        "Only scalar fields can be lowered",
                    )
                })?;
            if txt(get(get(meaning, "type").unwrap_or(&Value::Null), "kind")).as_deref()
                != Some("scalar")
            {
                return Err(err(
                    "DDD_GRAPHQL_FIELD_TYPE",
                    "Only scalar fields can be lowered",
                ));
            }
            let scalar = scalar_names
                .iter()
                .find(|(family, _)| family == &ty)
                .map(|x| x.1.clone())
                .ok_or_else(|| err("DDD_GRAPHQL_FIELD_TYPE", "Unknown DDD scalar family"))?;
            let mut graphql_type = scalar.clone();
            if !builtins.contains(&scalar.as_str()) {
                custom.insert(scalar.clone());
            }
            let cardinality = txt(get(meaning, "cardinality"))
                .ok_or_else(|| err("DDD_GRAPHQL_FIELD", "Field cardinality is required"))?;
            let core_ref = get(chosen.0, "coreField");
            if source_profile.as_deref() == Some("core-ideals") {
                let cref = core_ref.ok_or_else(|| {
                    err(
                        "DDD_GRAPHQL_CORE_REFERENCE",
                        "core-ideals requires exact Field references",
                    )
                })?;
                if !has_only(cref, &["module", "element"]) {
                    return Err(err(
                        "DDD_GRAPHQL_CORE_REFERENCE",
                        "Core Field reference must contain only module and element",
                    ));
                }
                let r = ident(cref).ok_or_else(|| {
                    err(
                        "DDD_GRAPHQL_CORE_REFERENCE",
                        "core-ideals requires exact Field references",
                    )
                })?;
                let (_, _, core) = module_element(source, &r.0, &r.1).ok_or_else(|| {
                    err(
                        "DDD_GRAPHQL_CORE_REFERENCE",
                        "Core Field reference is missing",
                    )
                })?;
                if txt(get(core, "kind")).as_deref() != Some("field") {
                    return Err(err(
                        "DDD_GRAPHQL_CORE_REFERENCE",
                        "Core reference must be a Field",
                    ));
                }
                let expected = match ty.as_str() {
                    "string" => "string",
                    "boolean" => "boolean",
                    "integer" => "integer",
                    "decimal" => "decimal",
                    "date-time" => "timestamp",
                    "bytes" => "binary",
                    _ => "",
                };
                let mut item_nullability = None;
                if cardinality == "many" {
                    if txt(get(core, "cardinality")).as_deref() != Some("array")
                        || get(core, "scalarType").is_some()
                    {
                        return Err(err(
                            "DDD_GRAPHQL_CORE_CONTAINER",
                            "DDD many requires a core array Field",
                        ));
                    }
                    let item = ident(get(core, "itemType").ok_or_else(|| {
                        err(
                            "DDD_GRAPHQL_CORE_CONTAINER",
                            "Core array item Field reference is required",
                        )
                    })?)
                    .ok_or_else(|| {
                        err(
                            "DDD_GRAPHQL_CORE_CONTAINER",
                            "Invalid core array item reference",
                        )
                    })?;
                    let (_, _, item_field) =
                        module_element(source, &item.0, &item.1).ok_or_else(|| {
                            err(
                                "DDD_GRAPHQL_CORE_CONTAINER",
                                "Core array item Field not found",
                            )
                        })?;
                    if txt(get(item_field, "kind")).as_deref() != Some("field")
                        || txt(get(item_field, "scalarType")).as_deref() != Some(expected)
                        || txt(get(item_field, "cardinality")).as_deref() != Some("one")
                        || get(item_field, "itemType").is_some()
                    {
                        return Err(err(
                            "DDD_GRAPHQL_CORE_SCALAR",
                            "Array item Field conflicts with DDD scalar",
                        ));
                    }
                    item_nullability = txt(get(item_field, "nullability"));
                    let item_type = match item_nullability.as_deref() {
                        Some("required") => format!("[{scalar}!]"),
                        Some("absent-allowed") | Some("unspecified") => format!("[{scalar}]"),
                        _ => {
                            return Err(err(
                                "DDD_GRAPHQL_CORE_NULLABILITY",
                                "Array item availability must be explicit",
                            ))
                        }
                    };
                    graphql_type = item_type;
                    if item_nullability.as_deref() == Some("absent-allowed") {
                        residuals.push(residual(&format!("/modules/{}/elements/{}/nullability",item.0,item.1),"Nullable GraphQL item does not preserve absent-versus-present-null meaning",get(item_field,"nullability").unwrap(),ctx)?);
                    }
                    if get(item_field, "facets").is_some() {
                        residuals.push(residual(
                            &format!("/modules/{}/elements/{}/facets", item.0, item.1),
                            "SDL does not enforce item facets",
                            get(item_field, "facets").unwrap(),
                            ctx,
                        )?);
                    }
                    mappings.push(obj(vec![
                        (
                            "sourcePath",
                            s(&format!("/modules/{}/elements/{}", item.0, item.1)),
                        ),
                        ("target", s(&format!("{}.{}[]", name, chosen.1))),
                    ]));
                    residuals.push(residual(
                        &path,
                        "DDD many does not define GraphQL list order or duplicate behavior",
                        meaning,
                        ctx,
                    )?);
                } else {
                    if txt(get(core, "cardinality")).as_deref() != Some("one")
                        || txt(get(core, "scalarType")).as_deref() != Some(expected)
                        || get(core, "itemType").is_some()
                    {
                        return Err(err(
                            "DDD_GRAPHQL_CORE_SCALAR",
                            "Core scalar Field conflicts with DDD",
                        ));
                    }
                    if cardinality == "one"
                        && txt(get(core, "nullability")).as_deref() == Some("absent-allowed")
                        || cardinality == "optional"
                            && txt(get(core, "nullability")).as_deref() == Some("required")
                    {
                        return Err(err(
                            "DDD_GRAPHQL_CORE_NULLABILITY",
                            "DDD and core availability assertions conflict",
                        ));
                    }
                }
                let nullability = txt(get(core, "nullability")).ok_or_else(|| {
                    err(
                        "DDD_GRAPHQL_CORE_NULLABILITY",
                        "Core nullability is required",
                    )
                })?;
                if nullability != "required"
                    && nullability != "absent-allowed"
                    && nullability != "unspecified"
                {
                    return Err(err(
                        "DDD_GRAPHQL_CORE_NULLABILITY",
                        "Unknown core nullability",
                    ));
                }
                if nullability == "required" {
                    if cardinality != "many" {
                        graphql_type.push('!');
                    }
                } else if nullability == "absent-allowed" {
                    residuals.push(residual(&format!("/modules/{}/elements/{}/nullability",r.0,r.1),"GraphQL nullable result does not distinguish absent value from present null",get(core,"nullability").unwrap(),ctx)?);
                } else {
                    residuals.push(residual(
                        &format!("/modules/{}/elements/{}/nullability", r.0, r.1),
                        "Core availability is unspecified; SDL remains nullable",
                        get(core, "nullability").unwrap(),
                        ctx,
                    )?);
                    if cardinality == "one" {
                        residuals.push(residual(&path,"DDD one requires a value, but core availability does not justify SDL non-null",meaning,ctx)?);
                    }
                }
                mappings.push(obj(vec![
                    (
                        "sourcePath",
                        s(&format!("/modules/{}/elements/{}", r.0, r.1)),
                    ),
                    ("target", s(&format!("{}.{}", name, chosen.1))),
                ]));
            } else if core_ref.is_some() {
                return Err(err(
                    "DDD_GRAPHQL_CORE_REFERENCE",
                    "DDD-only profile cannot ignore core Field pairing",
                ));
            }
            if source_profile.as_deref() == Some("core-ideals") {
                // Core-ideals cardinalities were checked against the paired core
                // Field above; its GraphQL type/nullability was built there too.
            } else if cardinality == "one" {
                graphql_type.push('!');
            } else if cardinality == "many" {
                graphql_type = format!("[{graphql_type}]");
                residuals.push(residual(
                    &path,
                    "DDD many does not define GraphQL list order, duplicate or item-null behavior",
                    meaning,
                    ctx,
                )?);
            } else if cardinality != "optional" {
                return Err(err("DDD_GRAPHQL_FIELD", "Unknown DDD cardinality"));
            }
            if cardinality == "optional" && source_profile.as_deref() != Some("core-ideals") {
                residuals.push(residual(
                    &path,
                    "GraphQL nullable result does not distinguish absent value from present null",
                    meaning,
                    ctx,
                )?);
            }
            if ty == "integer" && scalar == "Int" {
                residuals.push(residual(&path,if source_profile.as_deref()==Some("core-ideals"){"GraphQL Int is signed 32-bit; DDD integer and core domain need explicit compatibility evidence"}else{"GraphQL Int is signed 32-bit; DDD integer has no such bound"},meaning,ctx)?);
            }
            if ty == "string" {
                residuals.push(residual(&path,"GraphQL String coercion and Unicode equality are not defined by DDD scalar naming",meaning,ctx)?);
            }
            lines.push(format!("  {}: {}", chosen.1, graphql_type));
            mappings.push(obj(vec![
                ("sourcePath", s(&path)),
                ("target", s(&format!("{}.{}", name, chosen.1))),
            ]));
        }
        if lines.is_empty() {
            return Err(err(
                "DDD_GRAPHQL_ENTITY_EMPTY",
                "Selected entity has no safe output field",
            ));
        }
        entity_field_names.insert(name.clone(), used);
        definitions.push((name.clone(), lines));
        residuals.push(residual(
            &format!("/modules/{mi}/elements/{ei}/extensions/umf.ddd/identity"),
            "GraphQL object type does not enforce DDD identity or lifecycle",
            get(ddd, "identity").unwrap_or(&Value::Null),
            ctx,
        )?);
        if let Some(a) = get(ddd, "aggregate") {
            residuals.push(residual(
                &format!("/modules/{mi}/elements/{ei}/extensions/umf.ddd/aggregate"),
                "GraphQL SDL does not enforce DDD aggregate boundary",
                a,
                ctx,
            )?);
        }
        if let Some(invariants) = arr(get(ddd, "invariants")) {
            for (i, v) in invariants.iter().enumerate() {
                residuals.push(residual(
                    &format!("/modules/{mi}/elements/{ei}/extensions/umf.ddd/invariants/{i}"),
                    "DDD invariant is retained but not interpreted or enforced",
                    v,
                    ctx,
                )?);
            }
        }
        mappings.push(obj(vec![
            (
                "sourcePath",
                s(&format!("/modules/{mi}/elements/{ei}/extensions/umf.ddd")),
            ),
            ("target", s(name)),
        ]));
    }
    for ((module, element, field), _) in &field_names {
        if !entity_map.contains_key(&(module.clone(), element.clone())) {
            return Err(err(
                "DDD_GRAPHQL_FIELD_REFERENCE",
                "Field mapping has no selected entity",
            ));
        }
    }
    let mut unions = Vec::<String>::new();
    if full {
        let endpoint_rows = arr(get(policy, "endpoints"))
            .ok_or_else(|| err("DDD_GRAPHQL_ENDPOINT", "endpoints must be an array"))?;
        let relationship_rows = arr(get(policy, "relationships"))
            .ok_or_else(|| err("DDD_GRAPHQL_RELATIONSHIP", "relationships must be an array"))?;
        let mut endpoint_names = std::collections::BTreeMap::<(String, String), String>::new();
        let mut paired_entities = std::collections::BTreeSet::<(String, String)>::new();
        for pair in endpoint_rows {
            if !has_only(pair, &["record", "entity"])
                || get(pair, "record").is_some_and(|r| !has_only(r, &["module", "element"]))
                || get(pair, "entity").is_some_and(|r| !has_only(r, &["module", "element"]))
            {
                return Err(err(
                    "DDD_GRAPHQL_ENDPOINT",
                    "Endpoint pair contains unknown members",
                ));
            }
            let record = get(pair, "record")
                .and_then(ident)
                .ok_or_else(|| err("DDD_GRAPHQL_ENDPOINT", "Record endpoint reference required"))?;
            let entity = get(pair, "entity")
                .and_then(ident)
                .ok_or_else(|| err("DDD_GRAPHQL_ENDPOINT", "Entity endpoint reference required"))?;
            let (_, _, record_value) = module_element(source, &record.0, &record.1)
                .ok_or_else(|| err("DDD_GRAPHQL_ENDPOINT", "Endpoint record not found"))?;
            if txt(get(record_value, "kind")).as_deref() != Some("record") {
                return Err(err(
                    "DDD_GRAPHQL_ENDPOINT",
                    "Endpoint must resolve to a core Record",
                ));
            }
            let type_name = entity_map
                .get(&entity)
                .ok_or_else(|| err("DDD_GRAPHQL_ENDPOINT", "Endpoint entity must be selected"))?
                .clone();
            if endpoint_names.insert(record.clone(), type_name).is_some()
                || !paired_entities.insert(entity)
            {
                return Err(err(
                    "DDD_GRAPHQL_ENDPOINT",
                    "Record/entity pairs must be one-to-one",
                ));
            }
        }
        let mut declared = std::collections::BTreeMap::<(String, String), (&Value, String)>::new();
        for (mi, module) in arr(get(source, "modules"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            for (ri, r) in arr(get(module, "relationships"))
                .unwrap_or(&[])
                .iter()
                .enumerate()
            {
                let Some(id) = txt(get(r, "id")) else {
                    continue;
                };
                let module_id = txt(get(module, "id")).unwrap_or_default();
                if declared
                    .insert(
                        (module_id.clone(), id),
                        (r, format!("/modules/{mi}/relationships/{ri}")),
                    )
                    .is_some()
                {
                    return Err(err(
                        "DDD_GRAPHQL_RELATIONSHIP",
                        "Duplicate declared relationship identity",
                    ));
                }
            }
        }
        let mut selected = std::collections::BTreeSet::<(String, String)>::new();
        let mut make_output = |refs: &[Value],
                               union: Option<String>,
                               path: &str,
                               names: &mut std::collections::BTreeSet<String>,
                               unions: &mut Vec<String>,
                               residuals: &mut Vec<Value>,
                               ctx: &mut Context<'_>|
         -> Result<String, EngineError> {
            let mut types = Vec::new();
            for r in refs {
                let id = ident(r).ok_or_else(|| {
                    err(
                        "DDD_GRAPHQL_ENDPOINT",
                        "Relationship endpoint reference is invalid",
                    )
                })?;
                types.push(
                    endpoint_names
                        .get(&id)
                        .ok_or_else(|| {
                            err(
                                "DDD_GRAPHQL_ENDPOINT",
                                "Every endpoint requires explicit Record/entity pairing",
                            )
                        })?
                        .clone(),
                );
            }
            if types.is_empty() {
                return Err(err(
                    "DDD_GRAPHQL_ENDPOINT",
                    "Relationship endpoint set cannot be empty",
                ));
            }
            if types.len() == 1 {
                if union.is_some() {
                    return Err(err(
                        "DDD_GRAPHQL_UNION",
                        "Union name supplied for homogeneous endpoint",
                    ));
                }
                return Ok(types[0].clone());
            }
            let name = union.ok_or_else(|| {
                err(
                    "DDD_GRAPHQL_UNION",
                    "Heterogeneous outputs require an explicit union name",
                )
            })?;
            if !graphql_name(&name) || !names.insert(name.clone()) {
                return Err(err(
                    "DDD_GRAPHQL_UNION",
                    "Union name must be valid and distinct",
                ));
            }
            unions.push(format!("union {name} = {}", types.join(" | ")));
            let mut choices = Vec::new();
            for r in refs {
                choices.push(copy_json(r, ctx)?);
            }
            residuals.push(residual(path,"GraphQL output union does not establish endpoint membership, shared identity or resolver type discrimination",&Value::Array(choices),ctx)?);
            Ok(name)
        };
        for row in relationship_rows {
            if !has_only(
                row,
                &[
                    "module",
                    "id",
                    "forwardName",
                    "inverseName",
                    "orientation",
                    "forwardUnion",
                    "inverseUnion",
                ],
            ) {
                return Err(err(
                    "DDD_GRAPHQL_RELATIONSHIP",
                    "Relationship policy contains unknown members",
                ));
            }
            let module = txt(get(row, "module"))
                .ok_or_else(|| err("DDD_GRAPHQL_RELATIONSHIP", "Relationship module required"))?;
            let id = txt(get(row, "id"))
                .ok_or_else(|| err("DDD_GRAPHQL_RELATIONSHIP", "Relationship id required"))?;
            let key_id = (module.clone(), id.clone());
            let (relationship, path) = declared.get(&key_id).ok_or_else(|| {
                err(
                    "DDD_GRAPHQL_RELATIONSHIP",
                    "Missing exact declared relationship",
                )
            })?;
            if !selected.insert(key_id) {
                return Err(err(
                    "DDD_GRAPHQL_RELATIONSHIP",
                    "Duplicate selected relationship",
                ));
            }
            let forward = txt(get(row, "forwardName"))
                .ok_or_else(|| err("DDD_GRAPHQL_NAME", "forwardName required"))?;
            if !graphql_name(&forward) {
                return Err(err("DDD_GRAPHQL_NAME", "Invalid GraphQL relationship name"));
            }
            let sources = arr(get(relationship, "source")).ok_or_else(|| {
                err(
                    "DDD_GRAPHQL_ENDPOINT",
                    "Relationship source endpoints required",
                )
            })?;
            let targets = arr(get(relationship, "target")).ok_or_else(|| {
                err(
                    "DDD_GRAPHQL_ENDPOINT",
                    "Relationship target endpoints required",
                )
            })?;
            let inverse = txt(get(relationship, "inverse"));
            let inverse_name = txt(get(row, "inverseName"));
            if inverse.is_some() && inverse_name.as_ref().is_none_or(|n| !graphql_name(n))
                || inverse.is_none()
                    && (inverse_name.is_some() || get(row, "inverseUnion").is_some())
            {
                return Err(err(
                    "DDD_GRAPHQL_INVERSE",
                    "Inverse policy must match authored inverse",
                ));
            }
            let directed = matches!(get(relationship, "directed"), Some(Value::Bool(true)));
            let orientation = txt(get(row, "orientation"));
            if orientation
                .as_deref()
                .is_some_and(|v| v != "source-to-target")
                || directed && orientation.is_some()
                || !directed && orientation.as_deref() != Some("source-to-target")
            {
                return Err(err(
                    "DDD_GRAPHQL_ORIENTATION",
                    "Undirected relationships require explicit source-to-target orientation",
                ));
            }
            let forward_union = txt(get(row, "forwardUnion"));
            let target_type = make_output(
                targets,
                forward_union,
                &format!("{path}/target"),
                &mut names,
                &mut unions,
                &mut residuals,
                ctx,
            )?;
            let target_mult = get(relationship, "targetMultiplicity")
                .ok_or_else(|| err("DDD_GRAPHQL_MULTIPLICITY", "targetMultiplicity required"))?;
            let min = txt(get(target_mult, "min"))
                .or_else(|| {
                    get(target_mult, "min").and_then(|v| {
                        if let Value::Number(n) = v {
                            Some(n.to_string())
                        } else {
                            None
                        }
                    })
                })
                .unwrap_or_default();
            let max_star = txt(get(target_mult, "max")).as_deref() == Some("*");
            let max_one = txt(get(target_mult, "max")).as_deref() == Some("1")
                || matches!(get(target_mult,"max"),Some(Value::Number(n)) if n.to_string()=="1");
            let wrapped = if max_star || !max_one {
                format!("[{target_type}]")
            } else if min == "1"
                || matches!(get(target_mult,"min"),Some(Value::Number(n)) if n.to_string()=="1")
            {
                format!("{target_type}!")
            } else {
                target_type.clone()
            };
            for endpoint in sources {
                let id = ident(endpoint)
                    .ok_or_else(|| err("DDD_GRAPHQL_ENDPOINT", "Invalid source endpoint"))?;
                let owner = endpoint_names.get(&id).ok_or_else(|| {
                    err(
                        "DDD_GRAPHQL_ENDPOINT",
                        "Source endpoint needs explicit pairing",
                    )
                })?;
                let used = entity_field_names
                    .get_mut(owner)
                    .ok_or_else(|| err("DDD_GRAPHQL_ENDPOINT", "Source entity is not selected"))?;
                if !used.insert(forward.clone()) {
                    return Err(err(
                        "DDD_GRAPHQL_NAME",
                        "Relationship field collides with existing field",
                    ));
                }
                definitions
                    .iter_mut()
                    .find(|(n, _)| n == owner)
                    .ok_or_else(|| err("DDD_GRAPHQL_ENDPOINT", "Entity definition missing"))?
                    .1
                    .push(format!("  {forward}: {wrapped}"));
                mappings.push(obj(vec![
                    ("sourcePath", s(path)),
                    ("target", s(&format!("{owner}.{forward}"))),
                ]));
            }
            let inverse_union = txt(get(row, "inverseUnion"));
            if inverse.is_some() {
                let source_type = make_output(
                    sources,
                    inverse_union,
                    &format!("{path}/source"),
                    &mut names,
                    &mut unions,
                    &mut residuals,
                    ctx,
                )?;
                let sm = get(relationship, "sourceMultiplicity").ok_or_else(|| {
                    err("DDD_GRAPHQL_MULTIPLICITY", "sourceMultiplicity required")
                })?;
                let smin = txt(get(sm, "min"))
                    .or_else(|| {
                        get(sm, "min").and_then(|v| {
                            if let Value::Number(n) = v {
                                Some(n.to_string())
                            } else {
                                None
                            }
                        })
                    })
                    .unwrap_or_default();
                let smax_star = txt(get(sm, "max")).as_deref() == Some("*");
                let smax_one = txt(get(sm, "max")).as_deref() == Some("1")
                    || matches!(get(sm,"max"),Some(Value::Number(n)) if n.to_string()=="1");
                let inverse_type = if smax_star || !smax_one {
                    format!("[{source_type}]")
                } else if smin == "1"
                    || matches!(get(sm,"min"),Some(Value::Number(n)) if n.to_string()=="1")
                {
                    format!("{source_type}!")
                } else {
                    source_type
                };
                let inverse_name = inverse_name.unwrap();
                for endpoint in targets {
                    let id = ident(endpoint)
                        .ok_or_else(|| err("DDD_GRAPHQL_ENDPOINT", "Invalid target endpoint"))?;
                    let owner = endpoint_names.get(&id).ok_or_else(|| {
                        err(
                            "DDD_GRAPHQL_ENDPOINT",
                            "Target endpoint needs explicit pairing",
                        )
                    })?;
                    let used = entity_field_names.get_mut(owner).ok_or_else(|| {
                        err("DDD_GRAPHQL_ENDPOINT", "Target entity is not selected")
                    })?;
                    if !used.insert(inverse_name.clone()) {
                        return Err(err(
                            "DDD_GRAPHQL_NAME",
                            "Inverse field collides with existing field",
                        ));
                    }
                    definitions
                        .iter_mut()
                        .find(|(n, _)| n == owner)
                        .ok_or_else(|| err("DDD_GRAPHQL_ENDPOINT", "Entity definition missing"))?
                        .1
                        .push(format!("  {inverse_name}: {inverse_type}"));
                    mappings.push(obj(vec![
                        ("sourcePath", s(&format!("{path}/inverse"))),
                        ("target", s(&format!("{owner}.{inverse_name}"))),
                    ]));
                }
                residuals.push(residual(
                    &format!("{path}/inverse"),
                    "Paired SDL fields do not enforce inverse consistency or execution",
                    get(relationship, "inverse").unwrap_or(&Value::Null),
                    ctx,
                )?);
            }
            for (member,reason,choice) in [
                ("target","SDL does not resolve named target Key IDs or enforce referential integrity",get(relationship,"target").unwrap_or(&Value::Null)),
                ("sourceMultiplicity","SDL does not enforce source-end participation bounds",get(relationship,"sourceMultiplicity").unwrap_or(&Value::Null)),
                ("targetMultiplicity","SDL output wrappers do not enforce stored participation, list minima/maxima, collection uniqueness or item availability",get(relationship,"targetMultiplicity").unwrap_or(&Value::Null)),
                ("targetLifecycle","SDL does not enforce ownership or lifecycle",get(relationship,"targetLifecycle").unwrap_or(&Value::Null)),
                ("directed",if directed{"Object-returning SDL fields may be computed; no association execution is implied"}else{"Directed display approximates the authored undirected association"},get(relationship,"directed").unwrap_or(&Value::Null)),
                ("name","SDL naming policy does not retain authored relationship identity or presentation without this report",get(relationship,"name").unwrap_or(&Value::Null)),
            ] {residuals.push(residual(&format!("{path}/{member}"),reason,choice,ctx)?);}
            if let Some(record) = get(relationship, "associationRecord") {
                residuals.push(residual(&format!("{path}/associationRecord"),"Association Record identity, attributes and endpoint-row correspondence are not enforced by object fields",record,ctx)?);
            }
        }
        if selected.len() != declared.len() {
            return Err(err(
                "DDD_GRAPHQL_RELATIONSHIP",
                "Every relationship requires explicit naming policy",
            ));
        }
        for pair in endpoint_rows {
            let record = ident(get(pair, "record").unwrap_or(&Value::Null)).unwrap();
            if !declared.values().any(|(r, _)| {
                arr(get(r, "source"))
                    .unwrap_or(&[])
                    .iter()
                    .chain(arr(get(r, "target")).unwrap_or(&[]))
                    .any(|v| ident(v).as_ref() == Some(&record))
            }) {
                return Err(err(
                    "DDD_GRAPHQL_ENDPOINT",
                    "Unused Record/entity endpoint pairing",
                ));
            }
        }
        // Preserve native/unknown extension surfaces in the receipt and report.
        for (mi, m) in arr(get(source, "modules"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let module_id = txt(get(m, "id"));
            if module_id
                .as_ref()
                .is_some_and(|id| entity_map.keys().any(|(module, _)| module == id))
            {
                if let Some(context) = get(get(m, "extensions").unwrap_or(&Value::Null), "umf.ddd")
                {
                    residuals.push(residual(
                        &format!("/modules/{mi}/extensions/umf.ddd"),
                        "DDD bounded-context namespace and terms are retained but not expressed in SDL",
                        context,
                        ctx,
                    )?);
                }
            }
            if let Some(exts) = get(m, "extensions") {
                if let Value::Object(exts) = exts {
                    for (ext, value) in exts {
                        if ext != &key("umf.ddd") {
                            residuals.push(residual(
                                &format!(
                                    "/modules/{mi}/extensions/{}",
                                    ext.to_utf8().unwrap_or_default()
                                ),
                                "Native or unknown module extension remains retained only",
                                value,
                                ctx,
                            )?);
                        }
                    }
                }
            }
            for (ei, e) in arr(get(m, "elements")).unwrap_or(&[]).iter().enumerate() {
                let ddd = get(get(e, "extensions").unwrap_or(&Value::Null), "umf.ddd");
                let eid = txt(get(m, "id")).zip(txt(get(e, "id")));
                if ddd.is_some()
                    && eid
                        .as_ref()
                        .is_none_or(|(m, e)| !entity_map.contains_key(&(m.clone(), e.clone())))
                {
                    residuals.push(residual(
                        &format!("/modules/{mi}/elements/{ei}/extensions/umf.ddd"),
                        "Unselected DDD behavior is retained and not expressed or enforced",
                        ddd.unwrap(),
                        ctx,
                    )?);
                }
                if txt(get(e, "kind")).as_deref() == Some("record") {
                    residuals.push(residual(&format!("/modules/{mi}/elements/{ei}"),"Core Record membership, named Keys and equality are retained but not enforced by SDL",e,ctx)?);
                }
                if let Some(exts) = get(e, "extensions") {
                    if let Value::Object(exts) = exts {
                        for (ext, value) in exts {
                            if ext != &key("umf.ddd") {
                                residuals.push(residual(
                                    &format!(
                                        "/modules/{mi}/elements/{ei}/extensions/{}",
                                        ext.to_utf8().unwrap_or_default()
                                    ),
                                    "Native or unknown extension content has no SDL interpretation",
                                    value,
                                    ctx,
                                )?);
                            }
                        }
                    }
                }
            }
        }
        if let Some(exts) = get(source, "extensions") {
            if let Value::Object(exts) = exts {
                for (ext, value) in exts {
                    residuals.push(residual(
                        &format!("/extensions/{}", ext.to_utf8().unwrap_or_default()),
                        "Document extension content remains retained only",
                        value,
                        ctx,
                    )?);
                }
            }
        }
        for d in validation.diagnostics {
            if d.code.to_utf8().unwrap_or_default().starts_with("UNKNOWN") {
                residuals.push(residual(
                    &d.path.to_utf8().unwrap_or_default(),
                    "Uninterpreted source content is retained",
                    &Value::String(d.code),
                    ctx,
                )?);
            }
        }
    }
    for (family, name) in &scalar_names {
        if custom.contains(name) {
            residuals.push(residual(
                &format!("/policy/scalars/{family}"),
                "Custom scalar coercion and serialization are outside SDL",
                &s(name),
                ctx,
            )?);
        }
    }
    let scalar_defs = custom
        .iter()
        .map(|name| format!("scalar {name}"))
        .collect::<Vec<_>>();
    let entity_defs = definitions
        .iter()
        .map(|(name, fields)| format!("type {name} {{\n{}\n}}", fields.join("\n")))
        .collect::<Vec<_>>();
    let mut parts = vec![format!(
        "schema {{ query: {root_type} }}\n\ntype {root_type} {{\n  {root_field}: Boolean\n}}"
    )];
    parts.extend(scalar_defs);
    parts.extend(entity_defs);
    parts.extend(unions);
    let candidate = parts.join("\n\n") + "\n";
    let blocked = loss == "strict" && !residuals.is_empty();
    let status = if blocked {
        "blocked"
    } else if residuals.is_empty() {
        "proposed"
    } else {
        "reported"
    };
    let mut output = if full {
        vec![("operation",s("project-ddd-graphql")),("version",s("1.0.0")),("status",s(status)),("logical",copy_json(source,ctx)?),("policy",copy_json(policy,ctx)?),("lossPolicy",s(loss)),("profile",s("graphql-js-17.0.2-sdl")),("sourceVersions",obj(vec![("core",s("0.10.0")),("ddd",s("0.1.0"))])),("targetVersions",obj(vec![("graphqlJs",s("17.0.2")),("graphqlCore",s("3.2.12")),("subset",s("schema SDL with scalar fields, object relationships and explicit output unions; no execution"))])),("residuals",Value::Array(residuals)),("mappings",Value::Array(mappings)),("diagnostics",Value::Array(Vec::new()))]
    } else {
        vec![
            ("status", s(status)),
            ("logical", copy_json(source, ctx)?),
            ("policy", copy_json(policy, ctx)?),
            ("profile", s("graphql-js-17.0.2-sdl")),
            ("residuals", Value::Array(residuals)),
            ("mappings", Value::Array(mappings)),
        ]
    };
    if !blocked {
        output.push(("candidate", s(&candidate)));
    }
    Ok(obj(output))
}
