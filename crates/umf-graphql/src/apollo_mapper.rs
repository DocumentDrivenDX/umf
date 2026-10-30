//! Concrete Apollo Compiler 1.33.1 bridge for GraphQL.js SDL nodes. Parser spans
//! and source maps are discarded; exact scalar literal strings remain strings.
use apollo_compiler::ast as g;
use serde_json::{json, Value};

pub fn parse_sdl(source: &str) -> Result<Value, String> {
    let doc = g::Document::parse(source, "umf.graphql").map_err(|e| e.to_string())?;
    let mut definitions = Vec::new();
    for d in &doc.definitions {
        definitions.push(def(d, source)?);
    }
    Ok(strip_nulls(
        json!({"kind":"Document","definitions":definitions}),
    ))
}

pub fn print_sdl(ast: &g::Document) -> String {
    ast.serialize().to_string()
}
pub fn validate_schema(source: &str) -> Result<(), Vec<String>> {
    apollo_compiler::Schema::parse_and_validate(source, "umf.graphql")
        .map(|_| ())
        .map_err(|e| vec![e.to_string()])
}

fn name(n: &g::Name) -> Value {
    json!({"kind":"Name","value":n.as_str()})
}
fn named(n: &g::Name) -> Value {
    json!({"kind":"NamedType","name":name(n)})
}
fn block_from_span(node: &apollo_compiler::Node<str>, source: &str) -> bool {
    node.location()
        .and_then(|l| source.get(l.offset()..l.end_offset()))
        .is_some_and(|s| s.starts_with("\"\"\""))
}
fn desc(d: &Option<apollo_compiler::Node<str>>, source: &str) -> Option<Value> {
    d.as_ref()
        .map(|s| json!({"kind":"StringValue","value":s.as_str(),"block":block_from_span(s,source)}))
}
fn location_name(l: g::DirectiveLocation) -> &'static str {
    use g::DirectiveLocation::*;
    match l {
        Query => "QUERY",
        Mutation => "MUTATION",
        Subscription => "SUBSCRIPTION",
        Field => "FIELD",
        FragmentDefinition => "FRAGMENT_DEFINITION",
        FragmentSpread => "FRAGMENT_SPREAD",
        InlineFragment => "INLINE_FRAGMENT",
        VariableDefinition => "VARIABLE_DEFINITION",
        Schema => "SCHEMA",
        Scalar => "SCALAR",
        Object => "OBJECT",
        FieldDefinition => "FIELD_DEFINITION",
        ArgumentDefinition => "ARGUMENT_DEFINITION",
        Interface => "INTERFACE",
        Union => "UNION",
        Enum => "ENUM",
        EnumValue => "ENUM_VALUE",
        InputObject => "INPUT_OBJECT",
        InputFieldDefinition => "INPUT_FIELD_DEFINITION",
    }
}
fn op(x: g::OperationType) -> &'static str {
    match x {
        g::OperationType::Query => "query",
        g::OperationType::Mutation => "mutation",
        g::OperationType::Subscription => "subscription",
    }
}
fn def(d: &g::Definition, source: &str) -> Result<Value, String> {
    use g::Definition::*;
    Ok(match d {
        SchemaDefinition(x) => {
            json!({"kind":"SchemaDefinition","description":desc(&x.description,source),"directives":dirs(&x.directives,source)?,"operationTypes":x.root_operations.iter().map(|r|json!({"kind":"OperationTypeDefinition","operation":op(r.0),"type":named(&r.1)})).collect::<Vec<_>>()})
        }
        SchemaExtension(x) => {
            json!({"kind":"SchemaExtension","directives":dirs(&x.directives,source)?,"operationTypes":x.root_operations.iter().map(|r|json!({"kind":"OperationTypeDefinition","operation":op(r.0),"type":named(&r.1)})).collect::<Vec<_>>()})
        }
        ScalarTypeDefinition(x) => {
            json!({"kind":"ScalarTypeDefinition","description":desc(&x.description,source),"name":name(&x.name),"directives":dirs(&x.directives,source)?})
        }
        ScalarTypeExtension(x) => {
            json!({"kind":"ScalarTypeExtension","name":name(&x.name),"directives":dirs(&x.directives,source)?})
        }
        ObjectTypeDefinition(x) => {
            json!({"kind":"ObjectTypeDefinition","description":desc(&x.description,source),"name":name(&x.name),"interfaces":x.implements_interfaces.iter().map(named).collect::<Vec<_>>(),"directives":dirs(&x.directives,source)?,"fields":x.fields.iter().map(|f|field(f,source)).collect::<Result<Vec<_>,_>>()?})
        }
        ObjectTypeExtension(x) => {
            json!({"kind":"ObjectTypeExtension","name":name(&x.name),"interfaces":x.implements_interfaces.iter().map(named).collect::<Vec<_>>(),"directives":dirs(&x.directives,source)?,"fields":x.fields.iter().map(|f|field(f,source)).collect::<Result<Vec<_>,_>>()?})
        }
        InterfaceTypeDefinition(x) => {
            json!({"kind":"InterfaceTypeDefinition","description":desc(&x.description,source),"name":name(&x.name),"interfaces":x.implements_interfaces.iter().map(named).collect::<Vec<_>>(),"directives":dirs(&x.directives,source)?,"fields":x.fields.iter().map(|f|field(f,source)).collect::<Result<Vec<_>,_>>()?})
        }
        InterfaceTypeExtension(x) => {
            json!({"kind":"InterfaceTypeExtension","name":name(&x.name),"interfaces":x.implements_interfaces.iter().map(named).collect::<Vec<_>>(),"directives":dirs(&x.directives,source)?,"fields":x.fields.iter().map(|f|field(f,source)).collect::<Result<Vec<_>,_>>()?})
        }
        UnionTypeDefinition(x) => {
            json!({"kind":"UnionTypeDefinition","description":desc(&x.description,source),"name":name(&x.name),"directives":dirs(&x.directives,source)?,"types":x.members.iter().map(named).collect::<Vec<_>>()})
        }
        UnionTypeExtension(x) => {
            json!({"kind":"UnionTypeExtension","name":name(&x.name),"directives":dirs(&x.directives,source)?,"types":x.members.iter().map(named).collect::<Vec<_>>()})
        }
        EnumTypeDefinition(x) => {
            json!({"kind":"EnumTypeDefinition","description":desc(&x.description,source),"name":name(&x.name),"directives":dirs(&x.directives,source)?,"values":x.values.iter().map(|v|Ok(json!({"kind":"EnumValueDefinition","description":desc(&v.description,source),"name":name(&v.value),"directives":dirs(&v.directives,source)?}))).collect::<Result<Vec<_>,String>>()?})
        }
        EnumTypeExtension(x) => {
            json!({"kind":"EnumTypeExtension","name":name(&x.name),"directives":dirs(&x.directives,source)?,"values":x.values.iter().map(|v|Ok(json!({"kind":"EnumValueDefinition","description":desc(&v.description,source),"name":name(&v.value),"directives":dirs(&v.directives,source)?}))).collect::<Result<Vec<_>,String>>()?})
        }
        InputObjectTypeDefinition(x) => {
            json!({"kind":"InputObjectTypeDefinition","description":desc(&x.description,source),"name":name(&x.name),"directives":dirs(&x.directives,source)?,"fields":x.fields.iter().map(|v|input_value(v,source)).collect::<Result<Vec<_>,_>>()?})
        }
        InputObjectTypeExtension(x) => {
            json!({"kind":"InputObjectTypeExtension","name":name(&x.name),"directives":dirs(&x.directives,source)?,"fields":x.fields.iter().map(|v|input_value(v,source)).collect::<Result<Vec<_>,_>>()?})
        }
        DirectiveDefinition(x) => {
            json!({"kind":"DirectiveDefinition","description":desc(&x.description,source),"name":name(&x.name),"arguments":x.arguments.iter().map(|v|input_value(v,source)).collect::<Result<Vec<_>,_>>()?,"repeatable":x.repeatable,"locations":x.locations.iter().map(|l|json!({"kind":"Name","value":location_name(*l)})).collect::<Vec<_>>()})
        }
        OperationDefinition(_) | FragmentDefinition(_) => {
            return Err("Executable operation and fragment definitions are excluded".into())
        }
    })
}
fn dirs(x: &g::DirectiveList, source: &str) -> Result<Vec<Value>, String> {
    x.0.iter().map(|d|Ok(json!({"kind":"Directive","name":name(&d.name),"arguments":d.arguments.iter().map(|a|argument(a,source)).collect::<Result<Vec<_>,_>>()?}))).collect()
}
fn argument(a: &g::Argument, source: &str) -> Result<Value, String> {
    Ok(json!({"kind":"Argument","name":name(&a.name),"value":value(&a.value,source)?}))
}
fn field(f: &g::FieldDefinition, source: &str) -> Result<Value, String> {
    Ok(
        json!({"kind":"FieldDefinition","description":desc(&f.description,source),"name":name(&f.name),"arguments":f.arguments.iter().map(|v|input_value(v,source)).collect::<Result<Vec<_>,_>>()?,"type":ty(&f.ty),"directives":dirs(&f.directives,source)?}),
    )
}
fn input_value(v: &g::InputValueDefinition, source: &str) -> Result<Value, String> {
    Ok(
        json!({"kind":"InputValueDefinition","description":desc(&v.description,source),"name":name(&v.name),"type":ty(&v.ty),"defaultValue":v.default_value.as_ref().map(|v|value(v,source)).transpose()?,"directives":dirs(&v.directives,source)?}),
    )
}
fn ty(t: &g::Type) -> Value {
    match t {
        g::Type::Named(n) => named(n),
        g::Type::NonNullNamed(n) => json!({"kind":"NonNullType","type":named(n)}),
        g::Type::List(x) => json!({"kind":"ListType","type":ty(x)}),
        g::Type::NonNullList(x) => {
            json!({"kind":"NonNullType","type":json!({"kind":"ListType","type":ty(x)})})
        }
    }
}
fn value(node: &apollo_compiler::Node<g::Value>, source: &str) -> Result<Value, String> {
    let v: &g::Value = node;
    Ok(match v {
        g::Value::Null => json!({"kind":"NullValue"}),
        g::Value::Enum(n) => json!({"kind":"EnumValue","value":n.as_str()}),
        g::Value::Variable(_) => {
            return Err("Variable is not allowed in an SDL constant value".into())
        }
        g::Value::String(s) => {
            json!({"kind":"StringValue","value":s,"block":node.location().and_then(|l|source.get(l.offset()..l.end_offset())).is_some_and(|s|s.starts_with("\"\"\""))})
        }
        g::Value::Float(n) => json!({"kind":"FloatValue","value":n.to_string()}),
        g::Value::Int(n) => json!({"kind":"IntValue","value":n.to_string()}),
        g::Value::Boolean(b) => json!({"kind":"BooleanValue","value":b}),
        g::Value::List(a) => {
            json!({"kind":"ListValue","values":a.iter().map(|v|value(v,source)).collect::<Result<Vec<_>,_>>()?})
        }
        g::Value::Object(a) => {
            json!({"kind":"ObjectValue","fields":a.iter().map(|(n,v)|Ok(json!({"kind":"ObjectField","name":name(n),"value":value(v,source)?}))).collect::<Result<Vec<_>,String>>()?})
        }
    })
}

fn strip_nulls(v: Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(
            m.into_iter()
                .filter_map(|(k, v)| {
                    if v.is_null() {
                        None
                    } else {
                        Some((k, strip_nulls(v)))
                    }
                })
                .collect(),
        ),
        Value::Array(a) => Value::Array(a.into_iter().map(strip_nulls).collect()),
        x => x,
    }
}

/// Canonical printer for the location-free UMF AST. It deliberately consumes
/// the authored GraphQL.js node shape rather than Apollo's reduced schema model,
/// so DirectiveExtension and directives on DirectiveDefinition remain printable.
pub fn print_umf_ast(ast: &Value) -> Result<String, String> {
    let defs = ast
        .get("definitions")
        .and_then(Value::as_array)
        .ok_or("Document.definitions must be an array")?;
    let rendered = defs
        .iter()
        .map(print_definition)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(format!("{}\n", rendered.join("\n\n")))
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    v.get(k)
}
fn arr(v: &Value, k: &str) -> Result<&[Value], String> {
    get(v, k)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or_else(|| format!("{k} must be an array"))
}
fn sval(v: &Value) -> Result<&str, String> {
    v.as_str().ok_or("expected string")
}
fn nm(v: &Value) -> Result<String, String> {
    Ok(sval(v.get("value").ok_or("missing Name.value")?)?.to_owned())
}
fn ind(n: usize) -> String {
    "  ".repeat(n)
}
fn desc_print(v: &Value, depth: usize) -> Result<String, String> {
    let d = match get(v, "description") {
        Some(d) => d,
        None => return Ok(String::new()),
    };
    let value = sval(d.get("value").ok_or("missing description value")?)?;
    let raw = if d.get("block").and_then(Value::as_bool) == Some(true) {
        format!("\"\"\"{}\"\"\"", value.replace("\"\"\"", "\\\"\"\""))
    } else {
        serde_json::to_string(value).map_err(|e| e.to_string())?
    };
    Ok(format!("{}{}\n", ind(depth), raw))
}
fn directives(v: &Value) -> Result<String, String> {
    let Some(ds) = get(v, "directives").and_then(Value::as_array) else {
        return Ok(String::new());
    };
    ds.iter()
        .map(|d| {
            let name = nm(d.get("name").ok_or("missing directive name")?)?;
            let args = d
                .get("arguments")
                .and_then(Value::as_array)
                .filter(|a| !a.is_empty())
                .map(|a| {
                    a.iter()
                        .map(|x| {
                            Ok(format!(
                                "{}: {}",
                                nm(x.get("name").ok_or("missing arg name")?)?,
                                print_value(x.get("value").ok_or("missing arg value")?)?
                            ))
                        })
                        .collect::<Result<Vec<_>, String>>()
                })
                .transpose()?
                .map(|a| format!("({})", a.join(", ")))
                .unwrap_or_default();
            Ok(format!(" @{name}{args}"))
        })
        .collect::<Result<Vec<_>, String>>()
        .map(|v| v.concat())
}
fn print_type(v: &Value) -> Result<String, String> {
    Ok(match sval(v.get("kind").ok_or("missing type kind")?)? {
        "NamedType" => nm(v.get("name").ok_or("missing named type")?)?,
        "ListType" => format!(
            "[{}]",
            print_type(v.get("type").ok_or("missing list type")?)?
        ),
        "NonNullType" => format!(
            "{}!",
            print_type(v.get("type").ok_or("missing non-null type")?)?
        ),
        k => return Err(format!("unknown type node {k}")),
    })
}
fn print_value(v: &Value) -> Result<String, String> {
    Ok(match sval(v.get("kind").ok_or("missing value kind")?)? {
        "StringValue" => {
            let text = sval(v.get("value").ok_or("missing string value")?)?;
            if v.get("block").and_then(Value::as_bool) == Some(true) {
                format!("\"\"\"{}\"\"\"", text.replace("\"\"\"", "\\\"\"\""))
            } else {
                serde_json::to_string(text).map_err(|e| e.to_string())?
            }
        }
        "IntValue" | "FloatValue" | "EnumValue" => {
            sval(v.get("value").ok_or("missing literal value")?)?.to_owned()
        }
        "BooleanValue" => v
            .get("value")
            .and_then(Value::as_bool)
            .ok_or("invalid boolean")?
            .to_string(),
        "NullValue" => "null".into(),
        "ListValue" => format!(
            "[{}]",
            arr(v, "values")?
                .iter()
                .map(print_value)
                .collect::<Result<Vec<_>, _>>()?
                .join(", ")
        ),
        "ObjectValue" => format!(
            "{{ {} }}",
            arr(v, "fields")?
                .iter()
                .map(|f| Ok(format!(
                    "{}: {}",
                    nm(f.get("name").ok_or("missing object field name")?)?,
                    print_value(f.get("value").ok_or("missing object field value")?)?
                )))
                .collect::<Result<Vec<_>, String>>()?
                .join(", ")
        ),
        _ => return Err("unsupported/non-constant GraphQL value".into()),
    })
}
fn print_directives(v: &Value) -> Result<String, String> {
    directives(v)
}
fn input_def(v: &Value) -> Result<String, String> {
    let name = nm(v.get("name").ok_or("missing input name")?)?;
    let ty = print_type(v.get("type").ok_or("missing input type")?)?;
    let desc = desc_print(v, 1)?;
    let default = get(v, "defaultValue")
        .map(|x| print_value(x).map(|s| format!(" = {s}")))
        .transpose()?
        .unwrap_or_default();
    Ok(format!(
        "{desc}{name}: {ty}{default}{}",
        print_directives(v)?
    ))
}
fn field_def(v: &Value) -> Result<String, String> {
    let args = arr(v, "arguments")?;
    let args = if args.is_empty() {
        String::new()
    } else {
        format!(
            "({})",
            args.iter()
                .map(input_def)
                .collect::<Result<Vec<_>, _>>()?
                .join(", ")
        )
    };
    Ok(format!(
        "{}{}{}: {}{}",
        desc_print(v, 1)?,
        nm(v.get("name").ok_or("missing field name")?)?,
        args,
        print_type(v.get("type").ok_or("missing field type")?)?,
        print_directives(v)?
    ))
}
fn block(kind: &str, name: &str, dirs: &str, items: Vec<String>) -> String {
    if items.is_empty() {
        format!("{kind} {name}{dirs}")
    } else {
        format!(
            "{kind} {name}{dirs} {{\n{}\n}}",
            items
                .iter()
                .map(|x| format!("  {}", x.replace('\n', "\n  ")))
                .collect::<Vec<_>>()
                .join("\n")
        )
    }
}
fn print_definition(v: &Value) -> Result<String, String> {
    let kind = sval(v.get("kind").ok_or("missing definition kind")?)?;
    let name = get(v, "name").map(nm).transpose()?.unwrap_or_default();
    let desc = desc_print(v, 0)?;
    let dirs = print_directives(v)?;
    Ok(match kind {
        "SchemaDefinition" | "SchemaExtension" => {
            let head = if kind == "SchemaExtension" {
                "extend schema"
            } else {
                "schema"
            };
            let ops = arr(v, "operationTypes")?
                .iter()
                .map(|o| {
                    Ok(format!(
                        "  {}: {}",
                        sval(o.get("operation").ok_or("operation")?)?,
                        print_type(o.get("type").ok_or("type")?)?
                    ))
                })
                .collect::<Result<Vec<_>, String>>()?;
            if ops.is_empty() {
                format!("{desc}{head}{dirs}")
            } else {
                format!("{desc}{head}{dirs} {{\n{}\n}}", ops.join("\n"))
            }
        }
        "ScalarTypeDefinition" => format!("{desc}scalar {name}{dirs}"),
        "ScalarTypeExtension" => format!("extend scalar {name}{dirs}"),
        "ObjectTypeDefinition"
        | "ObjectTypeExtension"
        | "InterfaceTypeDefinition"
        | "InterfaceTypeExtension" => {
            let ext = kind.ends_with("Extension");
            let head = if kind.starts_with("Object") {
                "type"
            } else {
                "interface"
            };
            let ifaces = arr(v, "interfaces")?
                .iter()
                .map(|x| x.get("name").ok_or("interface name").and_then(nm))
                .collect::<Result<Vec<_>, _>>()?;
            let impls = if ifaces.is_empty() {
                String::new()
            } else {
                format!(" implements {}", ifaces.join(" & "))
            };
            let fields = arr(v, "fields")?
                .iter()
                .map(field_def)
                .collect::<Result<Vec<_>, _>>()?;
            format!(
                "{desc}{}{head} {name}{impls}{dirs}{}",
                if ext { "extend " } else { "" },
                if fields.is_empty() {
                    String::new()
                } else {
                    format!(" {{\n{}\n}}", fields.join("\n"))
                }
            )
        }
        "UnionTypeDefinition" | "UnionTypeExtension" => {
            let types = arr(v, "types")?
                .iter()
                .map(|x| x.get("name").ok_or("union type name").and_then(nm))
                .collect::<Result<Vec<_>, _>>()?;
            format!(
                "{desc}{}union {name}{dirs}{}",
                if kind.ends_with("Extension") {
                    "extend "
                } else {
                    ""
                },
                if types.is_empty() {
                    String::new()
                } else {
                    format!(" = {}", types.join(" | "))
                }
            )
        }
        "EnumTypeDefinition" | "EnumTypeExtension" => {
            let values = arr(v, "values")?
                .iter()
                .map(|x| {
                    Ok(format!(
                        "{}{}{}",
                        desc_print(x, 1)?,
                        nm(x.get("name").ok_or("enum value name")?)?,
                        print_directives(x)?
                    ))
                })
                .collect::<Result<Vec<_>, String>>()?;
            format!(
                "{desc}{}enum {name}{dirs}{}",
                if kind.ends_with("Extension") {
                    "extend "
                } else {
                    ""
                },
                if values.is_empty() {
                    String::new()
                } else {
                    format!(" {{\n{}\n}}", values.join("\n"))
                }
            )
        }
        "InputObjectTypeDefinition" | "InputObjectTypeExtension" => {
            let fields = arr(v, "fields")?
                .iter()
                .map(input_def)
                .collect::<Result<Vec<_>, _>>()?;
            format!(
                "{desc}{}input {name}{dirs}{}",
                if kind.ends_with("Extension") {
                    "extend "
                } else {
                    ""
                },
                if fields.is_empty() {
                    String::new()
                } else {
                    format!(" {{\n{}\n}}", fields.join("\n"))
                }
            )
        }
        "DirectiveDefinition" => {
            let args = arr(v, "arguments")?
                .iter()
                .map(input_def)
                .collect::<Result<Vec<_>, _>>()?;
            let args = if args.is_empty() {
                String::new()
            } else {
                format!("({})", args.join(", "))
            };
            let repeat = if v.get("repeatable").and_then(Value::as_bool) == Some(true) {
                " repeatable"
            } else {
                ""
            };
            let locs = arr(v, "locations")?
                .iter()
                .map(nm)
                .collect::<Result<Vec<_>, _>>()?;
            format!(
                "{desc}directive @{name}{args}{repeat} on {}{dirs}",
                locs.join(" | ")
            )
        }
        "DirectiveExtension" => format!("extend directive @{name}{dirs}"),
        _ => return Err(format!("unsupported SDL AST kind {kind}")),
    })
}
