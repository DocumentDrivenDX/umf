//! Explicit serde_json/core boundary. serde_json's default map is sorted; this
//! restores GraphQL.js schema declaration order before values enter UMF's
//! ordered `Value::Object(Vec<...>)`, while strings become exact UTF-16.
use crate::value::{Utf16, Value};
use serde_json::{Map as JsonMap, Value as Json};

pub fn to_core(value: &Json) -> Result<Value, String> {
    Ok(match value {
        Json::Null => Value::Null,
        Json::Bool(v) => Value::Bool(*v),
        Json::Number(n) => Value::Number(
            n.as_f64()
                .ok_or("JSON number cannot be represented as core binary64")?,
        ),
        Json::String(s) => Value::String(Utf16::from_utf8(s)),
        Json::Array(a) => Value::Array(a.iter().map(to_core).collect::<Result<Vec<_>, _>>()?),
        Json::Object(m) => {
            let mut keys = m.keys().collect::<Vec<_>>();
            let kind = m.get("kind").and_then(Json::as_str).or_else(|| {
                if m.contains_key("umf") {
                    Some("__UMF_ROOT")
                } else if m.contains_key("profile") {
                    Some("__GRAPHQL_PAYLOAD")
                } else if m.contains_key("elements") {
                    Some("__UMF_MODULE")
                } else if m.contains_key("extensions") {
                    Some("__UMF_ELEMENT")
                } else {
                    None
                }
            });
            if let Some(order) = kind.and_then(property_order) {
                keys.sort_by_key(|k| order.iter().position(|x| x == k).unwrap_or(usize::MAX));
            } else {
                keys.sort();
            }
            Value::Object(
                keys.into_iter()
                    .map(|k| Ok((Utf16::from_utf8(k), to_core(&m[k])?)))
                    .collect::<Result<Vec<_>, String>>()?,
            )
        }
    })
}
pub fn from_core(value: &Value) -> Result<Json, String> {
    Ok(match value {
        Value::Null => Json::Null,
        Value::Bool(v) => Json::Bool(*v),
        Value::Number(v) => {
            Json::Number(serde_json::Number::from_f64(*v).ok_or("non-finite core number")?)
        }
        Value::String(v) => Json::String(
            v.to_utf8()
                .map_err(|_| "isolated UTF-16 surrogate cannot cross serde_json boundary")?,
        ),
        Value::Array(a) => Json::Array(a.iter().map(from_core).collect::<Result<Vec<_>, _>>()?),
        Value::Object(m) => {
            let mut out = JsonMap::new();
            for (k, v) in m {
                out.insert(
                    k.to_utf8()
                        .map_err(|_| "isolated UTF-16 surrogate in object key")?,
                    from_core(v)?,
                );
            }
            Json::Object(out)
        }
    })
}
fn property_order(kind: &str) -> Option<&'static [&'static str]> {
    Some(match kind {
        "__UMF_ROOT" => &["umf", "id", "vocabularies", "modules"],
        "__UMF_MODULE" => &["id", "namespace", "elements"],
        "__UMF_ELEMENT" => &["id", "extensions"],
        "__GRAPHQL_PAYLOAD" => &["profile", "mode", "ast", "originalSource"],
        "Document" => &["kind", "definitions"],
        "Name" => &["kind", "value"],
        "StringValue" => &["kind", "value", "block"],
        "IntValue" | "FloatValue" | "BooleanValue" | "EnumValue" => &["kind", "value"],
        "NullValue" => &["kind"],
        "SchemaDefinition" => &["kind", "description", "directives", "operationTypes"],
        "SchemaExtension" => &["kind", "directives", "operationTypes"],
        "OperationTypeDefinition" => &["kind", "operation", "type"],
        "ScalarTypeDefinition" => &["kind", "description", "name", "directives"],
        "ScalarTypeExtension" => &["kind", "name", "directives"],
        "ObjectTypeDefinition" | "InterfaceTypeDefinition" => &[
            "kind",
            "description",
            "name",
            "interfaces",
            "directives",
            "fields",
        ],
        "ObjectTypeExtension" | "InterfaceTypeExtension" => {
            &["kind", "name", "interfaces", "directives", "fields"]
        }
        "UnionTypeDefinition" => &["kind", "description", "name", "directives", "types"],
        "UnionTypeExtension" => &["kind", "name", "directives", "types"],
        "EnumTypeDefinition" => &["kind", "description", "name", "directives", "values"],
        "EnumTypeExtension" => &["kind", "name", "directives", "values"],
        "EnumValueDefinition" => &["kind", "description", "name", "directives"],
        "InputObjectTypeDefinition" => &["kind", "description", "name", "directives", "fields"],
        "InputObjectTypeExtension" => &["kind", "name", "directives", "fields"],
        "DirectiveDefinition" => &[
            "kind",
            "description",
            "name",
            "arguments",
            "directives",
            "repeatable",
            "locations",
        ],
        "DirectiveExtension" => &["kind", "name", "directives"],
        "Directive" => &["kind", "name", "arguments"],
        "Argument" => &["kind", "name", "value"],
        "FieldDefinition" => &[
            "kind",
            "description",
            "name",
            "arguments",
            "type",
            "directives",
        ],
        "InputValueDefinition" => &[
            "kind",
            "description",
            "name",
            "type",
            "defaultValue",
            "directives",
        ],
        "NamedType" => &["kind", "name"],
        "ListType" | "NonNullType" => &["kind", "type"],
        "ListValue" => &["kind", "values"],
        "ObjectValue" => &["kind", "fields"],
        "ObjectField" => &["kind", "name", "value"],
        _ => return None,
    })
}
