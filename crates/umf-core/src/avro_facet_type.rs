// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact-token interpretation of one selected Avro scalar declaration.
//! This reports declared native meaning only; it does not validate a writer or codec.
use crate::{
    context::Context,
    error::EngineError,
    native_json::{NativeJsonNode as N, NativeJsonTree},
    value::{Utf16, Value},
};

fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn member<'a>(node: &'a N, name: &str) -> Option<&'a N> {
    if let N::Object(m) = node {
        m.iter().find(|(k, _)| k == &u(name)).map(|(_, v)| v)
    } else {
        None
    }
}
fn text(node: Option<&N>) -> Option<&Utf16> {
    if let Some(N::String(v)) = node {
        Some(v)
    } else {
        None
    }
}
fn token_integer(node: Option<&N>) -> Option<u64> {
    let N::Number(token) = node? else {
        return None;
    };
    if token.is_empty()
        || !token.bytes().all(|b| b.is_ascii_digit())
        || (token.len() > 1 && token.starts_with('0'))
    {
        return None;
    }
    let value = token.parse::<u64>().ok()?;
    (value <= 9_007_199_254_740_991).then_some(value)
}
fn valid_fixed_name(name: &Utf16) -> bool {
    let units = name.units();
    if units.is_empty() {
        return false;
    }
    let mut first = true;
    for unit in units {
        if *unit == b'.' as u16 {
            if first {
                return false;
            }
            first = true;
            continue;
        }
        let valid = (*unit == b'_' as u16)
            || (*unit >= b'A' as u16 && *unit <= b'Z' as u16)
            || (*unit >= b'a' as u16 && *unit <= b'z' as u16)
            || (!first && *unit >= b'0' as u16 && *unit <= b'9' as u16);
        if !valid {
            return false;
        }
        first = false;
    }
    !first
}
fn capacity_digits(size: usize) -> usize {
    // Decimal digit count of 2^(8*size-1)-1, minus one, computed exactly.
    let mut digits = vec![1u8];
    for _ in 0..8 * size - 1 {
        let mut carry = 0u8;
        for digit in digits.iter_mut() {
            let value = *digit * 2 + carry;
            *digit = value % 10;
            carry = value / 10;
        }
        if carry > 0 {
            digits.push(carry);
        }
    }
    if digits.iter().all(|d| *d == 0) {
        0
    } else {
        digits.len().saturating_sub(1)
    }
}
fn unsupported(native: Value, reason: &str, unclaimed: Vec<Value>) -> Value {
    let result = vec![
        ("native", native),
        ("basis", t("isolated-native-declaration")),
        ("enforcement", t("unverified")),
        ("state", t("unsupported")),
        ("reason", t(reason)),
        ("unclaimedPaths", Value::Array(unclaimed)),
    ];
    obj(result)
}
fn declared(
    native: Value,
    family: &str,
    attrs: Vec<(&str, Value)>,
    unclaimed: Vec<Value>,
) -> Value {
    let mut meaning = vec![("family", t(family))];
    meaning.extend(attrs);
    obj(vec![
        ("native", native),
        ("basis", t("isolated-native-declaration")),
        ("enforcement", t("unverified")),
        ("state", t("declared")),
        (
            "meaning",
            Value::Object(meaning.into_iter().map(|(k, v)| (u(k), v)).collect()),
        ),
        ("unclaimedPaths", Value::Array(unclaimed)),
    ])
}
/// Interpret one already-selected scalar node without normalizing numeric tokens.
pub fn inspect_avro_facet_type(
    tree: &NativeJsonTree,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    inspect_avro_facet_node(tree.root(), ctx)
}
/// Inspect one native node selected from a parsed schema tree.
pub fn inspect_avro_facet_node(node: &N, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let native = tagged(node, ctx)?;
    let mut unclaimed = Vec::<(Utf16, Value)>::new();
    let ty = match node {
        N::String(v) => Some(v.clone()),
        N::Object(_) => text(member(node, "type")).cloned(),
        _ => None,
    };
    let Some(ty) = ty else {
        return Ok(unsupported(
            native,
            "Select one scalar type fragment; unions and containers require explicit context",
            vec![],
        ));
    };
    let members = if let N::Object(m) = node {
        m.as_slice()
    } else {
        &[]
    };
    let logical = text(member(node, "logicalType"));
    let is_decimal = logical.is_some_and(|v| v == &u("decimal"));
    let mut interpreted = vec![u("type")];
    if ty == u("fixed") {
        interpreted.push(u("size"));
    }
    if logical.is_some() {
        interpreted.push(u("logicalType"));
        if is_decimal {
            interpreted.extend([u("precision"), u("scale")]);
        }
    }
    ctx.charge_work(members.len().saturating_add(1), Utf16::default())?;
    for (key, _) in members {
        if !interpreted.contains(key) {
            let mut path = vec![b'/' as u16];
            for unit in key.units() {
                match *unit {
                    0x7e => path.extend([b'~' as u16, b'0' as u16]),
                    0x2f => path.extend([b'~' as u16, b'1' as u16]),
                    other => path.push(other),
                }
            }
            ctx.charge_work(path.len(), Utf16::new(path.clone()))?;
            unclaimed.push((key.clone(), Value::String(Utf16::new(path))));
        }
    }
    unclaimed.sort_by(|a, b| a.0.cmp(&b.0));
    let unclaimed = unclaimed.into_iter().map(|(_, p)| p).collect::<Vec<_>>();
    let mut size = None;
    if ty == u("fixed") {
        if !text(member(node, "name")).is_some_and(valid_fixed_name) {
            return Ok(unsupported(
                native,
                "Fixed identity must be a supported Avro name",
                unclaimed,
            ));
        }
        size = token_integer(member(node, "size"));
        if size.is_none() {
            return Ok(unsupported(
                native,
                "Fixed size must have an exact nonnegative supported JSON integer token",
                unclaimed,
            ));
        }
    }
    if logical.is_some() {
        if !is_decimal || (ty != u("bytes") && ty != u("fixed")) {
            return Ok(unsupported(native,"Logical meaning is outside this facet declaration profile; native fallback remains separate",unclaimed));
        }
        let precision = token_integer(member(node, "precision"));
        let scale = if member(node, "scale").is_none() {
            Some(0)
        } else {
            token_integer(member(node, "scale"))
        };
        if precision.is_none_or(|p| p < 1) || scale.is_none_or(|s| s > precision.unwrap_or(0)) {
            return Ok(unsupported(
                native,
                "Decimal precision/scale must form a valid exact supported pair",
                unclaimed,
            ));
        }
        let precision = precision.unwrap();
        let scale = scale.unwrap();
        if ty == u("fixed") {
            let n = size.unwrap() as usize;
            if n == 0 {
                return Ok(unsupported(
                    native,
                    "Zero-byte fixed cannot carry positive decimal precision",
                    unclaimed,
                ));
            }
            if n > 4096 {
                return Ok(unsupported(
                    native,
                    "Fixed decimal capacity calculation exceeds the 4096-byte interpretation bound",
                    unclaimed,
                ));
            }
            // The native decimal precision token is constrained to an exact
            // JavaScript-safe integer (at most 16 decimal digits). At eight
            // fixed bytes, the signed coefficient already admits 18 digits;
            // larger arrays therefore need no O(n^2) decimal expansion.
            if n < 8 && precision as usize > capacity_digits(n) {
                return Ok(unsupported(
                    native,
                    "Declared decimal precision exceeds signed fixed-byte capacity",
                    unclaimed,
                ));
            }
        }
        let exact = if ty == u("fixed") {
            Value::Number(size.unwrap() as f64)
        } else {
            Value::Null
        };
        return Ok(declared(
            native,
            "decimal",
            vec![
                ("precision", Value::Number(precision as f64)),
                ("scale", Value::Number(scale as f64)),
                ("carrier", Value::String(ty)),
                ("exactBytes", exact),
            ],
            unclaimed,
        ));
    }
    if ty == u("int") || ty == u("long") {
        return Ok(declared(
            native,
            "integer",
            vec![
                (
                    "bits",
                    Value::Number(if ty == u("int") { 32.0 } else { 64.0 }),
                ),
                ("signed", Value::Bool(true)),
            ],
            unclaimed,
        ));
    }
    if ty == u("float") || ty == u("double") {
        return Ok(declared(
            native,
            "float",
            vec![(
                "bits",
                Value::Number(if ty == u("float") { 32.0 } else { 64.0 }),
            )],
            unclaimed,
        ));
    }
    if ty == u("string") {
        return Ok(declared(native, "string", vec![], unclaimed));
    }
    if ty == u("bytes") || ty == u("fixed") {
        return Ok(declared(
            native,
            "binary",
            vec![(
                "exactBytes",
                size.map_or(Value::Null, |v| Value::Number(v as f64)),
            )],
            unclaimed,
        ));
    }
    Ok(unsupported(native,"Named references, containers, null, records, enums and other non-facet carriers require separate interpretation",unclaimed))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn inspect(source: &str) -> Value {
        let mut ctx = Context::ordinary();
        let tree = NativeJsonTree::parse_json(&source.encode_utf16().collect::<Vec<_>>(), &mut ctx)
            .unwrap();
        inspect_avro_facet_type(&tree, &mut ctx).unwrap()
    }
    fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
        if let Value::Object(fields) = value {
            fields
                .iter()
                .find(|(key, _)| key == &Utf16::from(name))
                .map(|(_, value)| value)
        } else {
            None
        }
    }
    #[test]
    fn exact_integer_and_binary_meanings() {
        let integer = inspect(r#""int""#);
        assert_eq!(
            get(&integer, "state"),
            Some(&Value::string_utf8("declared"))
        );
        assert_eq!(
            get(get(&integer, "meaning").unwrap(), "bits"),
            Some(&Value::Number(32.0))
        );
        let binary = inspect(r#"{"type":"fixed","name":"B","size":2}"#);
        assert_eq!(
            get(get(&binary, "meaning").unwrap(), "exactBytes"),
            Some(&Value::Number(2.0))
        );
        let exponent = inspect(r#"{"type":"fixed","name":"B","size":2e0}"#);
        assert_eq!(
            get(&exponent, "state"),
            Some(&Value::string_utf8("unsupported"))
        );
    }
    #[test]
    fn selected_union_resolves_dependency_declaration_without_flattening() {
        let mut ctx = Context::ordinary();
        let root = NativeJsonTree::parse_json(
            r#"["null","Money"]"#.encode_utf16().collect::<Vec<_>>().as_slice(),
            &mut ctx,
        )
        .unwrap();
        // Use a named declaration in the dependency; the union branch remains a reference.
        let dependency=NativeJsonTree::parse_json(r#"{"type":"fixed","name":"Money","size":2,"logicalType":"decimal","precision":4,"scale":2}"#.encode_utf16().collect::<Vec<_>>().as_slice(),&mut ctx).unwrap();
        let roots = vec![(Some(Utf16::from("money")), dependency), (None, root)];
        let selection = inspect_avro_facet_selection(
            &roots,
            &AvroFacetLocation {
                dependency_id: None,
                path: u(""),
            },
            &mut ctx,
        )
        .unwrap();
        let Value::Array(branches) = get(&selection, "branches").unwrap() else {
            panic!()
        };
        assert_eq!(branches.len(), 2);
        assert_eq!(
            get(get(&branches[1], "inspection").unwrap(), "state"),
            Some(&Value::string_utf8("declared"))
        );
        assert_eq!(
            get(
                get(&get(&branches[1], "inspection").unwrap(), "meaning").unwrap(),
                "family"
            ),
            Some(&Value::string_utf8("decimal"))
        );
    }
    #[test]
    fn decimal_fixed_capacity_and_unclaimed_paths_are_retained() {
        let decimal = inspect(
            r#"{"type":"bytes","logicalType":"decimal","precision":3,"scale":2,"future":1}"#,
        );
        assert_eq!(
            get(&decimal, "state"),
            Some(&Value::string_utf8("declared"))
        );
        let Value::Array(paths) = get(&decimal, "unclaimedPaths").unwrap() else {
            panic!()
        };
        assert_eq!(paths, &vec![Value::string_utf8("/future")]);
        let too_precise = inspect(
            r#"{"type":"fixed","name":"B","size":1,"logicalType":"decimal","precision":3}"#,
        );
        assert_eq!(
            get(&too_precise, "state"),
            Some(&Value::string_utf8("unsupported"))
        );
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct AvroFacetLocation {
    pub dependency_id: Option<Utf16>,
    pub path: Utf16,
}
#[derive(Clone, Debug)]
struct Catalog {
    namespaces: std::collections::HashMap<AvroFacetLocation, Utf16>,
    names: std::collections::HashMap<Utf16, AvroFacetLocation>,
}
fn child(location: &AvroFacetLocation, suffix: &str) -> AvroFacetLocation {
    let mut path = location.path.units().to_vec();
    path.extend(suffix.encode_utf16());
    AvroFacetLocation {
        dependency_id: location.dependency_id.clone(),
        path: Utf16::new(path),
    }
}
fn qualified(name: &Utf16, namespace: &Utf16) -> Utf16 {
    if name.units().contains(&(b'.' as u16)) || namespace.is_empty() {
        return name.clone();
    }
    let mut full = namespace.units().to_vec();
    full.push(b'.' as u16);
    full.extend(name.units());
    Utf16::new(full)
}
fn valid_avro_name(name: &Utf16, qualified: bool) -> bool {
    let units = name.units();
    if units.is_empty() {
        return false;
    }
    let mut first = true;
    for unit in units {
        if qualified && *unit == b'.' as u16 {
            if first {
                return false;
            }
            first = true;
            continue;
        }
        let valid = (*unit == b'_' as u16)
            || (*unit >= b'A' as u16 && *unit <= b'Z' as u16)
            || (*unit >= b'a' as u16 && *unit <= b'z' as u16)
            || (!first && *unit >= b'0' as u16 && *unit <= b'9' as u16);
        if !valid {
            return false;
        }
        first = false;
    }
    !first
}
fn namespace_of(name: &Utf16) -> Utf16 {
    match name.units().iter().rposition(|unit| *unit == b'.' as u16) {
        Some(i) => Utf16::new(name.units()[..i].to_vec()),
        None => u(""),
    }
}
impl Catalog {
    fn build(
        roots: &[(Option<Utf16>, NativeJsonTree)],
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let mut catalog = Self {
            namespaces: std::collections::HashMap::new(),
            names: std::collections::HashMap::new(),
        };
        for (dependency, tree) in roots {
            let loc = AvroFacetLocation {
                dependency_id: dependency.clone(),
                path: u(""),
            };
            catalog.walk(tree.root(), &loc, &u(""), ctx)?;
        }
        Ok(catalog)
    }
    fn walk(
        &mut self,
        node: &N,
        loc: &AvroFacetLocation,
        namespace: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(loc.path.len().saturating_add(1), loc.path.clone())?;
        self.namespaces.insert(loc.clone(), namespace.clone());
        match node {
            N::Array(items) => {
                for (i, item) in items.iter().enumerate() {
                    self.walk(item, &child(loc, &format!("/{i}")), namespace, ctx)?;
                }
            }
            N::Object(_) => {
                let kind = match member(node, "type") {
                    Some(N::String(kind)) => kind,
                    Some(nested) => {
                        self.walk(nested, &child(loc, "/type"), namespace, ctx)?;
                        return Ok(());
                    }
                    None => {
                        return Err(EngineError::new(
                            "AVRO_FACET_TYPE",
                            loc.path.clone(),
                            "Native type declaration requires a type",
                        ))
                    }
                };
                let mut local = namespace.clone();
                if ["record", "error", "enum", "fixed"]
                    .iter()
                    .any(|v| kind == &u(v))
                {
                    let name = text(member(node, "name")).ok_or_else(|| {
                        EngineError::new(
                            "AVRO_FACET_TYPE",
                            loc.path.clone(),
                            "Named declaration requires a name",
                        )
                    })?;
                    let declared = text(member(node, "namespace")).unwrap_or(namespace);
                    if !valid_avro_name(name, true)
                        || (!declared.is_empty() && !valid_avro_name(declared, true))
                    {
                        return Err(EngineError::new(
                            "AVRO_FACET_TYPE",
                            loc.path.clone(),
                            "Invalid Avro named identity",
                        ));
                    }
                    let full = qualified(name, declared);
                    if self.names.insert(full.clone(), loc.clone()).is_some() {
                        return Err(EngineError::new(
                            "AVRO_FACET_TYPE",
                            loc.path.clone(),
                            "Duplicate native name",
                        ));
                    }
                    local = namespace_of(&full);
                }
                if kind == &u("record") || kind == &u("error") {
                    if let Some(N::Array(fields)) = member(node, "fields") {
                        let mut field_names = std::collections::HashSet::new();
                        for (i, field) in fields.iter().enumerate() {
                            let field_name = text(member(field, "name")).ok_or_else(|| {
                                EngineError::new(
                                    "AVRO_FACET_TYPE",
                                    loc.path.clone(),
                                    "Record field requires a name",
                                )
                            })?;
                            if !field_names.insert(field_name.clone())
                                || !valid_avro_name(field_name, false)
                            {
                                return Err(EngineError::new(
                                    "AVRO_FACET_TYPE",
                                    loc.path.clone(),
                                    "Invalid or duplicate native field name",
                                ));
                            }
                            if let Some(ty) = member(field, "type") {
                                self.walk(
                                    ty,
                                    &child(loc, &format!("/fields/{i}/type")),
                                    &local,
                                    ctx,
                                )?;
                            }
                        }
                    }
                } else if kind == &u("array") {
                    if let Some(items) = member(node, "items") {
                        self.walk(items, &child(loc, "/items"), &local, ctx)?;
                    }
                } else if kind == &u("map") {
                    if let Some(values) = member(node, "values") {
                        self.walk(values, &child(loc, "/values"), &local, ctx)?;
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }
}
fn pointer_parts(path: &Utf16) -> Result<Vec<Vec<u16>>, EngineError> {
    let units = path.units();
    if units.is_empty() {
        return Ok(Vec::new());
    }
    if units[0] != b'/' as u16 {
        return Err(EngineError::new(
            "AVRO_FACET_LOCATION",
            path.clone(),
            "Location must be an RFC 6901 pointer",
        ));
    }
    let mut parts = Vec::new();
    for part in units[1..].split(|u| *u == b'/' as u16) {
        let mut out = Vec::new();
        let mut i = 0;
        while i < part.len() {
            if part[i] == b'~' as u16 {
                if i + 1 >= part.len() {
                    return Err(EngineError::new(
                        "AVRO_FACET_LOCATION",
                        path.clone(),
                        "Malformed pointer escape",
                    ));
                }
                match part[i + 1] {
                    x if x == b'0' as u16 => out.push(b'~' as u16),
                    x if x == b'1' as u16 => out.push(b'/' as u16),
                    _ => {
                        return Err(EngineError::new(
                            "AVRO_FACET_LOCATION",
                            path.clone(),
                            "Malformed pointer escape",
                        ))
                    }
                }
                i += 2;
            } else {
                out.push(part[i]);
                i += 1;
            }
        }
        parts.push(out);
    }
    Ok(parts)
}
fn at<'a>(tree: &'a NativeJsonTree, path: &Utf16) -> Result<&'a N, EngineError> {
    let mut node = tree.root();
    for part in pointer_parts(path)? {
        node = match node {
            N::Array(items) => {
                let text = String::from_utf16(&part).map_err(|_| {
                    EngineError::new(
                        "AVRO_FACET_LOCATION",
                        path.clone(),
                        "Array index is malformed UTF-16",
                    )
                })?;
                if text.is_empty()
                    || (text.len() > 1 && text.starts_with('0'))
                    || !text.bytes().all(|b| b.is_ascii_digit())
                {
                    return Err(EngineError::new(
                        "AVRO_FACET_LOCATION",
                        path.clone(),
                        "Invalid array index",
                    ));
                }
                items
                    .get(text.parse::<usize>().unwrap_or(usize::MAX))
                    .ok_or_else(|| {
                        EngineError::new(
                            "AVRO_FACET_LOCATION",
                            path.clone(),
                            "Selected native location is absent",
                        )
                    })?
            }
            N::Object(members) => members
                .iter()
                .find(|(key, _)| key.units() == part)
                .map(|(_, v)| v)
                .ok_or_else(|| {
                    EngineError::new(
                        "AVRO_FACET_LOCATION",
                        path.clone(),
                        "Selected native location is absent",
                    )
                })?,
            _ => {
                return Err(EngineError::new(
                    "AVRO_FACET_LOCATION",
                    path.clone(),
                    "Selected native location is not a container",
                ))
            }
        };
    }
    Ok(node)
}
fn tagged(node: &N, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match node {
        N::Null => obj(vec![("kind", t("null"))]),
        N::Boolean(v) => obj(vec![("kind", t("boolean")), ("value", Value::Bool(*v))]),
        N::String(v) => obj(vec![
            ("kind", t("string")),
            ("value", Value::String(v.clone())),
        ]),
        N::Number(v) => obj(vec![("kind", t("number")), ("value", t(v))]),
        N::Array(items) => obj(vec![
            ("kind", t("array")),
            (
                "items",
                Value::Array(
                    items
                        .iter()
                        .map(|v| tagged(v, ctx))
                        .collect::<Result<Vec<_>, _>>()?,
                ),
            ),
        ]),
        N::Object(members) => {
            let mut values = Vec::new();
            for (k, v) in members {
                values.push((k.clone(), tagged(v, ctx)?));
            }
            obj(vec![
                ("kind", t("object")),
                ("members", Value::Object(values)),
            ])
        }
    })
}
fn loc_value(location: &AvroFacetLocation) -> Value {
    let mut fields = vec![(u("path"), Value::String(location.path.clone()))];
    if let Some(id) = &location.dependency_id {
        fields.push((u("dependencyId"), Value::String(id.clone())));
    }
    Value::Object(fields)
}
fn node_at<'a>(
    roots: &'a [(Option<Utf16>, NativeJsonTree)],
    location: &AvroFacetLocation,
) -> Result<&'a N, EngineError> {
    let tree = roots
        .iter()
        .find(|(id, _)| id == &location.dependency_id)
        .map(|(_, tree)| tree)
        .ok_or_else(|| {
            EngineError::new(
                "AVRO_FACET_LOCATION",
                location.path.clone(),
                "Selected dependency is absent",
            )
        })?;
    at(tree, &location.path)
}
fn definition_for_branch(
    roots: &[(Option<Utf16>, NativeJsonTree)],
    catalog: &Catalog,
    node: &N,
    location: &AvroFacetLocation,
) -> Result<AvroFacetLocation, EngineError> {
    let ty = match node {
        N::String(value) => value,
        N::Object(_) => text(member(node, "type")).ok_or_else(|| {
            EngineError::new(
                "AVRO_FACET_TYPE",
                location.path.clone(),
                "Union branch requires a string type",
            )
        })?,
        _ => {
            return Err(EngineError::new(
                "AVRO_FACET_TYPE",
                location.path.clone(),
                "Unresolved union branch",
            ))
        }
    };
    if ["record", "error", "enum", "fixed"]
        .iter()
        .any(|v| ty == &u(v))
    {
        return Ok(location.clone());
    }
    if [
        "null", "boolean", "int", "long", "float", "double", "bytes", "string", "array", "map",
    ]
    .iter()
    .any(|v| ty == &u(v))
    {
        return Ok(location.clone());
    }
    let namespace = catalog
        .namespaces
        .get(location)
        .cloned()
        .unwrap_or_else(|| u(""));
    let full = qualified(ty, &namespace);
    catalog.names.get(&full).cloned().ok_or_else(|| {
        EngineError::new(
            "AVRO_FACET_TYPE",
            location.path.clone(),
            "Unresolved named type",
        )
    })
}
/// Resolve an explicitly selected native path across ordered dependencies and the main root.
pub fn inspect_avro_facet_selection(
    roots: &[(Option<Utf16>, NativeJsonTree)],
    selected: &AvroFacetLocation,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let catalog = Catalog::build(roots, ctx)?;
    let selected_node = node_at(roots, selected)?;
    let mut nodes = Vec::new();
    if let N::Array(items) = selected_node {
        for (i, node) in items.iter().enumerate() {
            nodes.push((node, child(selected, &format!("/{i}"))));
        }
    } else {
        nodes.push((selected_node, selected.clone()));
    }
    let mut branches = Vec::new();
    let mut shapes = Vec::<Utf16>::new();
    let mut allows_null = false;
    for (node, location) in nodes {
        let ty = match node {
            N::String(v) => v.clone(),
            N::Object(_) => text(member(node, "type")).cloned().ok_or_else(|| {
                EngineError::new(
                    "AVRO_FACET_TYPE",
                    location.path.clone(),
                    "Union branch requires native string type",
                )
            })?,
            _ => {
                return Err(EngineError::new(
                    "AVRO_FACET_TYPE",
                    location.path.clone(),
                    "Unresolved union branch",
                ))
            }
        };
        let mut shape = u("one");
        let mut definition = None;
        let mut item = None;
        if ty == u("null") {
            shape = u("null");
            allows_null = true;
        } else if ty == u("array") || ty == u("map") {
            shape = ty.clone();
            let key = if ty == u("array") { "items" } else { "values" };
            if let N::Object(_) = node {
                let item_node = member(node, key).ok_or_else(|| {
                    EngineError::new(
                        "AVRO_FACET_TYPE",
                        location.path.clone(),
                        "Missing container item type",
                    )
                })?;
                item = Some(obj(vec![
                    ("location", loc_value(&child(&location, &format!("/{key}")))),
                    ("native", tagged(item_node, ctx)?),
                ]));
            } else {
                return Err(EngineError::new(
                    "AVRO_FACET_TYPE",
                    location.path.clone(),
                    "Missing container definition",
                ));
            }
        } else if ["record", "error", "enum", "fixed"]
            .iter()
            .any(|v| ty == u(v))
        {
            definition = Some(location.clone());
        } else if ![
            "boolean", "int", "long", "float", "double", "bytes", "string",
        ]
        .iter()
        .any(|v| ty == u(v))
        {
            let namespace = catalog
                .namespaces
                .get(&location)
                .cloned()
                .unwrap_or_else(|| u(""));
            let name = qualified(&ty, &namespace);
            definition = Some(catalog.names.get(&name).cloned().ok_or_else(|| {
                EngineError::new(
                    "AVRO_FACET_TYPE",
                    location.path.clone(),
                    "Unresolved named type",
                )
            })?);
        }
        let non_null = shape != u("null");
        if non_null {
            shapes.push(shape.clone());
        }
        let mut fields = vec![
            (u("location"), loc_value(&location)),
            (u("native"), tagged(node, ctx)?),
            (u("type"), Value::String(ty)),
            (u("shape"), Value::String(shape)),
        ];
        if let Some(def) = definition {
            fields.push((u("definition"), loc_value(&def)));
        }
        if let Some(item) = item {
            fields.push((u("item"), item));
        }
        let branch = Value::Object(fields);
        let declaration_location = definition_for_branch(roots, &catalog, node, &location)?;
        let declaration_node = node_at(roots, &declaration_location)?;
        let inspection = inspect_avro_facet_node(declaration_node, ctx)?;
        branches.push(obj(vec![
            ("branch", branch),
            (
                "declaration",
                obj(vec![
                    ("location", loc_value(&declaration_location)),
                    ("native", tagged(declaration_node, ctx)?),
                ]),
            ),
            ("inspection", inspection),
        ]));
    }
    let shape = if shapes.is_empty() || shapes.iter().any(|v| v != &shapes[0]) {
        u("unspecified")
    } else {
        shapes[0].clone()
    };
    Ok(obj(vec![
        ("location", loc_value(selected)),
        ("native", tagged(selected_node, ctx)?),
        ("shape", Value::String(shape)),
        ("allowsNull", Value::Bool(allows_null)),
        ("branches", Value::Array(branches)),
        ("basis", t("structural-selection-not-enforcement")),
    ]))
}
