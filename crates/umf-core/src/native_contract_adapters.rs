// SPDX-License-Identifier: MIT OR Apache-2.0
//! LinkML and ODCS interchange adapters for CONTRACT-024/023.
//! Uses the shared Engine/Registry, exact native tree and embedded schemas.
use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use num_bigint::BigInt;
use num_traits::ToPrimitive;

const LINKML: u64 = 0x4c49_4e4b_4d4c_0101;
const ODCS: u64 = 0x4f44_4353_0101_0001;
const CORE_VERSION: &str = "0.10.0";
const EXT_VERSION: &str = "0.1.0";
const LINKML_META: &str = "1.11.0";
const ODCS_VERSIONS: &[&str] = &["v3.0.0", "v3.0.1", "v3.0.2", "v3.1.0", "v3.2.0"];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ContractKind {
    Linkml,
    Odcs,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ContractFormat {
    Json,
    Yaml,
}
impl ContractFormat {
    fn text(self) -> &'static str {
        match self {
            Self::Json => "json",
            Self::Yaml => "yaml",
        }
    }
    fn parse(
        self,
        source: &Utf16,
        kind: ContractKind,
        ctx: &mut Context<'_>,
    ) -> Result<NativeJsonTree, EngineError> {
        match (self, kind) {
            (Self::Json, _) => NativeJsonTree::parse_json(source.units(), ctx),
            (Self::Yaml, ContractKind::Odcs) => NativeJsonTree::parse_yaml(source.units(), ctx),
            (Self::Yaml, ContractKind::Linkml) => NativeJsonTree::parse_yaml_with_options(
                source.units(),
                Some("1.1"),
                Some("string"),
                Some("pyyaml"),
                ctx,
            ),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ContractPayload {
    pub kind: ContractKind,
    pub root: NativeJsonTree,
    pub original_source: Utf16,
    pub original_format: ContractFormat,
    pub metamodel_version: Option<Utf16>,
    pub extras: Vec<(Utf16, Value)>,
}

pub struct ContractRuntime {
    engine: Engine,
    linkml_registry: Registry,
    odcs_registry: Registry,
    linkml_package: Value,
    odcs_package: Value,
    linkml_schema: CompiledSchema,
    odcs_schemas: Vec<(Utf16, CompiledSchema)>,
}

impl ContractRuntime {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let units = source.encode_utf16().collect::<Vec<_>>();
            ctx.charge_text(units.len(), Utf16::default())?;
            serialization::read_json_value(&units, Format::Json, ctx)
        }
        let engine = Engine::new(
            ResourceSet::new(
                read(include_str!("../../../spec/core/schema.json"), ctx)?,
                read(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    ctx,
                )?,
            ),
            ctx,
        )?;
        let resources = engine.schema_resources_with_context(ctx)?;
        let linkml_package = read(
            include_str!("../../../spec/extensions/linkml/package.json"),
            ctx,
        )?;
        let odcs_package = read(
            include_str!("../../../spec/extensions/odcs/package.json"),
            ctx,
        )?;
        let mut linkml_registry = Registry::new();
        linkml_registry.register(
            &linkml_package,
            Some(LINKML),
            engine.package_schema(),
            &resources,
            ctx,
        )?;
        let mut odcs_registry = Registry::new();
        odcs_registry.register(
            &odcs_package,
            Some(ODCS),
            engine.package_schema(),
            &resources,
            ctx,
        )?;
        let linkml_schema = compile(
            include_str!("../../../spec/extensions/linkml/native-schema.json"),
            &resources,
            ctx,
        )?;
        let mut odcs_schemas = Vec::new();
        for version in ODCS_VERSIONS {
            let source = match *version {
                "v3.0.0" => include_str!("../../../spec/extensions/odcs/native-3.0.0.json"),
                "v3.0.1" => include_str!("../../../spec/extensions/odcs/native-3.0.1.json"),
                "v3.0.2" => include_str!("../../../spec/extensions/odcs/native-3.0.2.json"),
                "v3.1.0" => include_str!("../../../spec/extensions/odcs/native-3.1.0.json"),
                _ => include_str!("../../../spec/extensions/odcs/native-3.2.0.json"),
            };
            odcs_schemas.push((Utf16::from(*version), compile(source, &resources, ctx)?));
        }
        Ok(Self {
            engine,
            linkml_registry,
            odcs_registry,
            linkml_package,
            odcs_package,
            linkml_schema,
            odcs_schemas,
        })
    }

    pub fn inspect(
        &self,
        document: &Value,
        kind: ContractKind,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        let registry = if kind == ContractKind::Linkml {
            &self.linkml_registry
        } else {
            &self.odcs_registry
        };
        self.engine.validate_document(
            document,
            registry,
            &mut ContractCapabilities { runtime: self },
            ctx,
        )
    }
    pub fn package(&self, kind: ContractKind) -> &Value {
        match kind {
            ContractKind::Linkml => &self.linkml_package,
            ContractKind::Odcs => &self.odcs_package,
        }
    }
    pub fn registry(&self, kind: ContractKind) -> &Registry {
        if kind == ContractKind::Linkml {
            &self.linkml_registry
        } else {
            &self.odcs_registry
        }
    }
}

pub fn linkml_package(runtime: &ContractRuntime) -> &Value {
    runtime.package(ContractKind::Linkml)
}
pub fn odcs_package(runtime: &ContractRuntime) -> &Value {
    runtime.package(ContractKind::Odcs)
}
pub fn linkml_registry(runtime: &ContractRuntime) -> &Registry {
    runtime.registry(ContractKind::Linkml)
}
pub fn odcs_registry(runtime: &ContractRuntime) -> &Registry {
    runtime.registry(ContractKind::Odcs)
}

struct ContractCapabilities<'a> {
    runtime: &'a ContractRuntime,
}
impl Capabilities for ContractCapabilities<'_> {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        semantic: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        let mut ctx = Context::ordinary();
        self.validate_extension_with_context(token, payload, semantic, &mut ctx)
            .map_err(|error| match error {
                CapabilityError::Host(message) => message,
                CapabilityError::HostPython { message, .. } => message,
                CapabilityError::Engine(error) => error.message,
            })
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        _semantic: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        let kind = match token {
            LINKML => ContractKind::Linkml,
            ODCS => ContractKind::Odcs,
            _ => {
                return Err(CapabilityError::Host(Utf16::from(
                    "Unknown native contract token",
                )))
            }
        };
        inspect_payload(self.runtime, payload, kind, ctx).map_err(CapabilityError::Engine)
    }
}

pub fn import_linkml_document(
    source: &Utf16,
    id: &Utf16,
    format: ContractFormat,
    metamodel_version: Option<&Utf16>,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_document(
        source,
        id,
        format,
        Some(
            metamodel_version
                .cloned()
                .unwrap_or_else(|| Utf16::from(LINKML_META)),
        ),
        ContractKind::Linkml,
        runtime,
        ctx,
    )
}
pub fn import_odcs_document(
    source: &Utf16,
    id: &Utf16,
    format: ContractFormat,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    import_document(source, id, format, None, ContractKind::Odcs, runtime, ctx)
}
pub fn inspect_linkml_document(
    document: &Value,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    runtime.inspect(document, ContractKind::Linkml, ctx)
}
pub fn inspect_odcs_document(
    document: &Value,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    runtime.inspect(document, ContractKind::Odcs, ctx)
}
pub fn export_linkml_document(
    document: &Value,
    format: Option<ContractFormat>,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    export_document(document, format, ContractKind::Linkml, runtime, ctx)
}
pub fn export_odcs_document(
    document: &Value,
    format: Option<ContractFormat>,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    export_document(document, format, ContractKind::Odcs, runtime, ctx)
}
pub fn get_linkml_document_node(
    document: &Value,
    pointer: &Utf16,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    get_node(document, pointer, ContractKind::Linkml, runtime, ctx)
}
pub fn get_odcs_document_node(
    document: &Value,
    pointer: &Utf16,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    get_node(document, pointer, ContractKind::Odcs, runtime, ctx)
}
pub fn propose_linkml_document_node_edit(
    document: &Value,
    pointer: &Utf16,
    json_text: &Utf16,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    edit_node(
        document,
        pointer,
        json_text,
        ContractKind::Linkml,
        runtime,
        ctx,
    )
}
pub fn propose_odcs_document_node_edit(
    document: &Value,
    pointer: &Utf16,
    json_text: &Utf16,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    edit_node(
        document,
        pointer,
        json_text,
        ContractKind::Odcs,
        runtime,
        ctx,
    )
}

/// Resolve a local ODCS v3.2.0 element or foreign-key notation. This is a
/// source-preserving lookup: IDs are interpreted only in their declared
/// schema/properties collections and names only for foreign-key shorthand.
pub fn resolve_odcs_reference(
    document: &Value,
    reference: &Utf16,
    usage: &Utf16,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if reference.is_empty()
        || reference.len() > 4096
        || !(usage == &key("element") || usage == &key("foreignKey"))
    {
        return Err(error(
            ContractKind::Odcs,
            "REFERENCE_OPTIONS",
            "Expected bounded reference and explicit element/foreignKey usage",
        ));
    }
    let source = copy_json(document, ctx)?;
    let payload = read_payload(&source, ContractKind::Odcs, runtime, ctx)?;
    let mut diagnostics =
        diagnostics_value(runtime.inspect(&source, ContractKind::Odcs, ctx)?, ctx)?;
    let mut status = "blocked";
    let mut target = None;
    let root = payload.root.root();
    let api = object_member(root, "apiVersion");
    if !matches!(api, Some(NativeJsonNode::String(v)) if v == &key("v3.2.0")) {
        push_diag(
            &mut diagnostics,
            "ODCS_REFERENCE_VERSION",
            "/apiVersion",
            "Reference interpretation is pinned to ODCS v3.2.0",
            "error",
        );
    } else {
        let mut ref_units = reference.units().to_vec();
        if let Some(hash) = ref_units.iter().position(|u| *u == b'#' as u16) {
            if hash > 0 {
                push_diag(&mut diagnostics, "ODCS_REFERENCE_EXTERNAL", "", "External contract must be supplied through a future explicit resource API; no fetch performed", "error");
            } else {
                ref_units.drain(..=hash);
                resolve_odcs_reference_parts(
                    root,
                    &ref_units,
                    usage,
                    &payload.root,
                    &mut target,
                    &mut diagnostics,
                    ctx,
                )?;
            }
        } else {
            resolve_odcs_reference_parts(
                root,
                &ref_units,
                usage,
                &payload.root,
                &mut target,
                &mut diagnostics,
                ctx,
            )?;
        }
        if target.is_some() {
            status = "resolved";
        }
    }
    let mut members = vec![
        (key("source"), source),
        (key("reference"), Value::String(reference.clone())),
        (key("usage"), Value::String(usage.clone())),
        (key("status"), Value::string_utf8(status)),
        (key("complete"), Value::Bool(false)),
    ];
    if let Some(target) = target {
        members.push((key("target"), target));
    }
    members.push((key("diagnostics"), Value::Array(diagnostics)));
    Ok(Value::Object(members))
}

fn resolve_odcs_reference_parts(
    root: &NativeJsonNode,
    raw: &[u16],
    usage: &Utf16,
    tree: &NativeJsonTree,
    target: &mut Option<Value>,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut ref_units = raw.to_vec();
    if ref_units.first() == Some(&(b'/' as u16)) {
        ref_units.remove(0);
    }
    let reference = Utf16::new(ref_units.clone());
    let utf8 = reference.to_utf8().unwrap_or_default();
    let (notation, keys): (&str, Vec<String>) = if utf8.starts_with("schema/") {
        let parts = utf8.split('/').collect::<Vec<_>>();
        if parts.len() % 2 != 0
            || parts.iter().enumerate().any(|(i, p)| {
                if i % 2 == 0 {
                    *p != if i == 0 { "schema" } else { "properties" }
                } else {
                    p.is_empty()
                        || p.chars()
                            .any(|c| c.is_whitespace() || ".#/\\@!%^&".contains(c))
                }
            })
        {
            push_diag(
                diagnostics,
                "ODCS_REFERENCE_SYNTAX",
                "",
                "Expected schema/id followed by properties/id pairs",
                "error",
            );
            return Ok(());
        }
        (
            "id",
            parts
                .iter()
                .skip(1)
                .step_by(2)
                .map(|s| (*s).to_owned())
                .collect(),
        )
    } else {
        if usage != &key("foreignKey") {
            push_diag(
                diagnostics,
                "ODCS_REFERENCE_USAGE",
                "",
                "Name shorthand is only interpreted for foreign-key references",
                "error",
            );
            return Ok(());
        }
        let pieces = utf8.split('.').collect::<Vec<_>>();
        let valid_ident = |s: &str| {
            let mut c = s.chars();
            c.next()
                .is_some_and(|x| x.is_ascii_alphabetic() || x == '_')
                && c.all(|x| x.is_ascii_alphanumeric() || x == '_' || x == '-')
        };
        if pieces.len() < 2 || pieces.iter().any(|s| !valid_ident(s)) {
            push_diag(
                diagnostics,
                "ODCS_REFERENCE_SYNTAX",
                "",
                "Expected foreign-key name shorthand",
                "error",
            );
            return Ok(());
        }
        ("name", pieces.into_iter().map(str::to_owned).collect())
    };
    if usage == &key("foreignKey") && keys.len() < 2 {
        push_diag(
            diagnostics,
            "ODCS_REFERENCE_TARGET",
            "",
            "Foreign-key references must select a property",
            "error",
        );
        return Ok(());
    }
    let mut parent = root;
    let mut path = Utf16::default();
    for (depth, name) in keys.iter().enumerate() {
        let collection = if depth == 0 { "schema" } else { "properties" };
        let cpath = child_pointer(&path, &key(collection), ctx)?;
        let Some(NativeJsonNode::Array(items)) = object_member(parent, collection) else {
            push_diag(
                diagnostics,
                "ODCS_REFERENCE_STRUCTURE",
                &lossy(&cpath),
                "Expected an array of schema elements",
                "error",
            );
            return Ok(());
        };
        let mut matches = Vec::new();
        for (index, node) in items.iter().enumerate() {
            ctx.charge_work(1, cpath.clone())?;
            let identity = object_member(node, notation);
            let same_identity = match identity {
                Some(NativeJsonNode::String(v)) => v.to_utf8().is_ok_and(|text| text == *name),
                _ => false,
            };
            if same_identity {
                matches.push((index, node));
            }
        }
        if matches.is_empty() {
            push_diag(
                diagnostics,
                "ODCS_REFERENCE_MISSING",
                &lossy(&cpath),
                &format!("No element with {notation} {}", json_quoted(name)),
                "error",
            );
            return Ok(());
        }
        if matches.len() != 1 {
            push_diag(
                diagnostics,
                "ODCS_REFERENCE_AMBIGUOUS",
                &lossy(&cpath),
                &format!("Multiple elements with {notation} {}", json_quoted(name)),
                "error",
            );
            return Ok(());
        }
        let (index, node) = matches[0];
        path = child_pointer(&cpath, &Utf16::from(index.to_string()), ctx)?;
        parent = node;
    }
    let selected = tree
        .subtree_clone(&path, ctx)?
        .tagged_value_preserving_extras(ctx)?;
    *target = Some(Value::Object(vec![
        (key("path"), Value::String(path.clone())),
        (key("notation"), Value::string_utf8(notation)),
        (key("node"), selected),
    ]));
    diagnostics.push(diag_value("ODCS_REFERENCE_CONTEXT", &lossy(&path), "Local element lookup only; does not validate foreign-key uniqueness, types, composite cardinality or data constraints", "warning"));
    Ok(())
}

fn json_quoted(text: &str) -> String {
    format!(
        "{}",
        serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_owned())
    )
}
fn diag_value(code: &str, path: &str, message: &str, severity: &str) -> Value {
    Value::Object(vec![
        (key("code"), Value::string_utf8(code)),
        (key("path"), Value::string_utf8(path)),
        (key("severity"), Value::string_utf8(severity)),
        (key("message"), Value::string_utf8(message)),
    ])
}
fn push_diag(diagnostics: &mut Vec<Value>, code: &str, path: &str, message: &str, severity: &str) {
    diagnostics.push(diag_value(code, path, message, severity));
}
fn diagnostics_value(
    validation: Validation,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    validation
        .diagnostics
        .iter()
        .map(|d| {
            ctx.charge_work(
                d.code.len() + d.path.len() + d.message.len(),
                Utf16::default(),
            )?;
            Ok(Value::Object(vec![
                (key("code"), Value::String(d.code.clone())),
                (key("path"), Value::String(d.path.clone())),
                (
                    key("severity"),
                    Value::string_utf8(if d.severity == Severity::Error {
                        "error"
                    } else {
                        "warning"
                    }),
                ),
                (key("message"), Value::String(d.message.clone())),
            ]))
        })
        .collect()
}

/// Compute the explicitly document-local class/slot membership projection.
pub fn inspect_linkml_class_slots(
    document: &Value,
    class_name: &Utf16,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if class_name.is_empty() || class_name.len() > 4096 {
        return Err(error(
            ContractKind::Linkml,
            "CLASS_NAME",
            "Expected bounded class name",
        ));
    }
    let source = copy_json(document, ctx)?;
    let payload = match read_payload(&source, ContractKind::Linkml, runtime, ctx) {
        Ok(payload) => payload,
        Err(e) if e.is_control_failure() => return Err(e),
        Err(e) => return Ok(class_slots_error(source, class_name, &e.to_string())),
    };
    let validation = match runtime.inspect(&source, ContractKind::Linkml, ctx) {
        Ok(validation) => validation,
        Err(e) if e.is_control_failure() => return Err(e),
        Err(e) => return Ok(class_slots_error(source, class_name, &e.to_string())),
    };
    let mut diagnostics = diagnostics_value(validation, ctx)?;
    let root = payload.root.root();
    let Some(NativeJsonNode::Object(classes)) = object_member(root, "classes") else {
        push_diag(
            &mut diagnostics,
            "LINKML_CLASS_SLOTS",
            "/classes",
            "Expected local class dictionary",
            "error",
        );
        return Ok(class_slots_result(
            source,
            class_name,
            "blocked",
            vec![Value::String(class_name.clone())],
            vec![],
            diagnostics,
        ));
    };
    let find = |name: &Utf16| {
        classes
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value)
    };
    let mut todo = vec![class_name.clone()];
    let mut seen = vec![class_name.clone()];
    let mut ancestors = vec![Value::String(class_name.clone())];
    while let Some(name) = todo.pop() {
        let p = child_pointer(&key("/classes"), &name, ctx)?;
        let Some(node) = find(&name) else {
            push_diag(
                &mut diagnostics,
                "LINKML_CLASS_SLOTS",
                &lossy(&p),
                "Class is absent or not an object in this document",
                "error",
            );
            continue;
        };
        if !matches!(node, NativeJsonNode::Object(_)) {
            push_diag(
                &mut diagnostics,
                "LINKML_CLASS_SLOTS",
                &lossy(&p),
                "Class is absent or not an object in this document",
                "error",
            );
            continue;
        }
        if let Some(explicit) = object_member(node, "name") {
            if !matches!(explicit, NativeJsonNode::String(value) if value == &name) {
                let np = child_pointer(&p, &key("name"), ctx)?;
                push_diag(
                    &mut diagnostics,
                    "LINKML_CLASS_SLOTS",
                    &lossy(&np),
                    "Dictionary key and explicit class name disagree",
                    "error",
                );
                continue;
            }
        }
        let mut parents = Vec::new();
        if let Some(mixins) = object_member(node, "mixins") {
            if let NativeJsonNode::Array(items) = mixins {
                for item in items {
                    if let NativeJsonNode::String(v) = item {
                        if !v.is_empty() {
                            parents.push(v.clone());
                        } else {
                            push_diag(
                                &mut diagnostics,
                                "LINKML_CLASS_SLOTS",
                                &lossy(&p),
                                "Expected nonempty name",
                                "error",
                            );
                        }
                    } else {
                        push_diag(
                            &mut diagnostics,
                            "LINKML_CLASS_SLOTS",
                            &lossy(&p),
                            "Expected nonempty name",
                            "error",
                        );
                    }
                }
            } else {
                let mp = child_pointer(&p, &key("mixins"), ctx)?;
                push_diag(
                    &mut diagnostics,
                    "LINKML_CLASS_SLOTS",
                    &lossy(&mp),
                    "Expected explicit name array; native singleton normalization is not applied",
                    "error",
                );
            }
        }
        if let Some(parent) = object_member(node, "is_a") {
            if let NativeJsonNode::String(v) = parent {
                if !v.is_empty() {
                    parents.push(v.clone());
                } else {
                    let ip = child_pointer(&p, &key("is_a"), ctx)?;
                    push_diag(
                        &mut diagnostics,
                        "LINKML_CLASS_SLOTS",
                        &lossy(&ip),
                        "Expected nonempty parent name",
                        "error",
                    );
                }
            } else {
                let ip = child_pointer(&p, &key("is_a"), ctx)?;
                push_diag(
                    &mut diagnostics,
                    "LINKML_CLASS_SLOTS",
                    &lossy(&ip),
                    "Expected nonempty parent name",
                    "error",
                );
            }
        }
        for parent in parents {
            if !seen.contains(&parent) {
                seen.push(parent.clone());
                ancestors.push(Value::String(parent.clone()));
                todo.push(parent);
            }
        }
    }
    let mut slot_names: Vec<Utf16> = Vec::new();
    let mut declarations: Vec<Value> = Vec::new();
    let mut blocked = diagnostics
        .iter()
        .any(|d| as_string(field(d, "severity")).is_some_and(|s| s == key("error")));
    for owner in &seen {
        let Some(class) = find(owner) else {
            continue;
        };
        let cp = child_pointer(&key("/classes"), &owner, ctx)?;
        if let Some(slots) = object_member(class, "slots") {
            if let NativeJsonNode::Array(items) = slots {
                for (i, item) in items.iter().enumerate() {
                    let NativeJsonNode::String(name) = item else {
                        let p = child_pointer(
                            &child_pointer(&cp, &key("slots"), ctx)?,
                            &key(&i.to_string()),
                            ctx,
                        )?;
                        push_diag(
                            &mut diagnostics,
                            "LINKML_CLASS_SLOTS",
                            &lossy(&p),
                            "Expected nonempty name",
                            "error",
                        );
                        blocked = true;
                        continue;
                    };
                    if name.is_empty() {
                        let p = child_pointer(
                            &child_pointer(&cp, &key("slots"), ctx)?,
                            &key(&i.to_string()),
                            ctx,
                        )?;
                        push_diag(
                            &mut diagnostics,
                            "LINKML_CLASS_SLOTS",
                            &lossy(&p),
                            "Expected nonempty name",
                            "error",
                        );
                        blocked = true;
                        continue;
                    }
                    let p = child_pointer(
                        &child_pointer(&cp, &key("slots"), ctx)?,
                        &key(&i.to_string()),
                        ctx,
                    )?;
                    class_slot_add(&mut slot_names, &mut declarations, name, &owner, &p, "slot");
                }
            } else {
                let p = child_pointer(&cp, &key("slots"), ctx)?;
                push_diag(
                    &mut diagnostics,
                    "LINKML_CLASS_SLOTS",
                    &lossy(&p),
                    "Expected explicit name array; native singleton normalization is not applied",
                    "error",
                );
                blocked = true;
            }
        }
        if let Some(attrs) = object_member(class, "attributes") {
            if let NativeJsonNode::Object(attrs) = attrs {
                for (name, value) in attrs {
                    let p =
                        child_pointer(&child_pointer(&cp, &key("attributes"), ctx)?, name, ctx)?;
                    if name.is_empty()
                        || !matches!(value, NativeJsonNode::Object(_) | NativeJsonNode::Null)
                    {
                        push_diag(
                            &mut diagnostics,
                            "LINKML_CLASS_SLOTS",
                            &lossy(&p),
                            "Expected named attribute object or compact null",
                            "error",
                        );
                        blocked = true;
                        continue;
                    }
                    if let Some(explicit) = object_member(value, "name") {
                        if !matches!(explicit,NativeJsonNode::String(v) if v==name) {
                            let np = child_pointer(&p, &key("name"), ctx)?;
                            push_diag(
                                &mut diagnostics,
                                "LINKML_CLASS_SLOTS",
                                &lossy(&np),
                                "Attribute key and explicit name disagree",
                                "error",
                            );
                            blocked = true;
                            continue;
                        }
                    }
                    class_slot_add(
                        &mut slot_names,
                        &mut declarations,
                        name,
                        &owner,
                        &p,
                        "attribute",
                    );
                }
            } else {
                let p = child_pointer(&cp, &key("attributes"), ctx)?;
                push_diag(
                    &mut diagnostics,
                    "LINKML_CLASS_SLOTS",
                    &lossy(&p),
                    "Expected attribute dictionary",
                    "error",
                );
                blocked = true;
            }
        }
    }
    if diagnostics
        .iter()
        .any(|d| as_string(field(d, "severity")).is_some_and(|s| s == key("error")))
    {
        blocked = true;
    }
    let slots = if blocked {
        Vec::new()
    } else {
        slot_names
            .into_iter()
            .map(|name| {
                let decls = declarations
                    .iter()
                    .filter(|d| as_string(field(d, "name")).as_ref() == Some(&name))
                    .map(|d| {
                        let mut d = d.clone();
                        if let Value::Object(fields) = &mut d {
                            fields.retain(|(k, _)| k != &key("name"));
                        }
                        d
                    })
                    .collect();
                Value::Object(vec![
                    (key("name"), Value::String(name)),
                    (key("declarations"), Value::Array(decls)),
                ])
            })
            .collect()
    };
    diagnostics.push(diag_value("LINKML_CLASS_CONTEXT","","Document-local class-slot membership only, matching imports:false. Imports are not merged; cycles do not imply valid inheritance. Slot definitions, slot_usage, constraints, defaults and effective values are not induced. Source and declaration occurrences remain preserved.","warning"));
    Ok(class_slots_result(
        source,
        class_name,
        if blocked { "blocked" } else { "resolved" },
        ancestors,
        slots,
        diagnostics,
    ))
}
fn class_slot_add(
    names: &mut Vec<Utf16>,
    decls: &mut Vec<Value>,
    name: &Utf16,
    owner: &Utf16,
    path: &Utf16,
    kind: &str,
) {
    if !names.contains(name) {
        names.push(name.clone());
    }
    decls.push(Value::Object(vec![
        (key("name"), Value::String(name.clone())),
        (key("className"), Value::String(owner.clone())),
        (key("path"), Value::String(path.clone())),
        (key("kind"), Value::string_utf8(kind)),
    ]));
}
fn class_slots_result(
    source: Value,
    class_name: &Utf16,
    status: &str,
    ancestors: Vec<Value>,
    slots: Vec<Value>,
    diagnostics: Vec<Value>,
) -> Value {
    Value::Object(vec![
        (key("source"), source),
        (key("className"), Value::String(class_name.clone())),
        (key("scope"), Value::string_utf8("document")),
        (key("status"), Value::string_utf8(status)),
        (key("complete"), Value::Bool(false)),
        (key("ancestors"), Value::Array(ancestors)),
        (key("slots"), Value::Array(slots)),
        (key("diagnostics"), Value::Array(diagnostics)),
    ])
}
fn class_slots_error(source: Value, class_name: &Utf16, message: &str) -> Value {
    let mut diagnostics = vec![diag_value("LINKML_CLASS_SLOTS", "", message, "error")];
    diagnostics.push(diag_value("LINKML_CLASS_CONTEXT","","Document-local class-slot membership only, matching imports:false. Imports are not merged; cycles do not imply valid inheritance. Slot definitions, slot_usage, constraints, defaults and effective values are not induced. Source and declaration occurrences remain preserved.","warning"));
    class_slots_result(
        source,
        class_name,
        "blocked",
        vec![Value::String(class_name.clone())],
        vec![],
        diagnostics,
    )
}

/// Traverse only caller-supplied LinkML resources and literal import bindings.
pub fn inspect_linkml_import_context(
    input: &Value,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let entry = as_string(field(input, "entry"));
    let schemas = arr(field(input, "schemas"));
    let bindings = arr(field(input, "bindings"));
    let bounded = |v: Option<&Utf16>| v.is_some_and(|s| !s.is_empty() && s.len() <= 4096);
    if !bounded(entry.as_ref())
        || schemas.is_none_or(|v| v.is_empty() || v.len() > 128)
        || bindings.is_none_or(|v| v.len() > 4096)
    {
        return Err(error(
            ContractKind::Linkml,
            "IMPORT_CONTEXT",
            "Expected entry, 1–128 keyed schemas and at most 4096 explicit bounded bindings",
        ));
    }
    let schemas = schemas.unwrap();
    let bindings = bindings.unwrap();
    let mut copied = copy_json(input, ctx)?;
    let context = std::mem::replace(&mut copied, Value::Null);
    let mut diagnostics = Vec::<Value>::new();
    let mut status = "resolved";
    let mut schema_keys = Vec::<Utf16>::new();
    let mut schema_docs = Vec::<Value>::new();
    for (i, s) in schemas.iter().enumerate() {
        let Some(k) = as_string(field(s, "key")) else {
            return Err(error(
                ContractKind::Linkml,
                "IMPORT_CONTEXT",
                "Expected entry, 1–128 keyed schemas and at most 4096 explicit bounded bindings",
            ));
        };
        if k.is_empty() || k.len() > 4096 {
            return Err(error(
                ContractKind::Linkml,
                "IMPORT_CONTEXT",
                "Expected entry, 1–128 keyed schemas and at most 4096 explicit bounded bindings",
            ));
        }
        if schema_keys.contains(&k) {
            status = "blocked";
            push_diag(
                &mut diagnostics,
                "LINKML_IMPORT_DUPLICATE",
                &format!("/schemas/{i}"),
                &format!("Duplicate resource key {}", json_quoted(&lossy(&k))),
                "error",
            );
        } else {
            schema_keys.push(k);
            schema_docs.push(field(s, "document").cloned().unwrap_or(Value::Null));
        }
    }
    for (i, schema) in schemas.iter().enumerate() {
        let doc = field(schema, "document").cloned().unwrap_or(Value::Null);
        if let Err(e) = read_payload(&doc, ContractKind::Linkml, runtime, ctx) {
            status = "blocked";
            push_diag(
                &mut diagnostics,
                "LINKML_IMPORT_DOCUMENT",
                &format!("/schemas/{i}/document"),
                &e.to_string(),
                "error",
            );
        }
    }
    let mut bind_from = Vec::<Utf16>::new();
    let mut bind_import = Vec::<Utf16>::new();
    let mut bind_target = Vec::<Utf16>::new();
    for (i, b) in bindings.iter().enumerate() {
        let (Some(from), Some(import), Some(target)) = (
            as_string(field(b, "from")),
            as_string(field(b, "import")),
            as_string(field(b, "target")),
        ) else {
            return Err(error(
                ContractKind::Linkml,
                "IMPORT_CONTEXT",
                "Expected entry, 1–128 keyed schemas and at most 4096 explicit bounded bindings",
            ));
        };
        if [from.len(), import.len(), target.len()]
            .iter()
            .any(|n| *n == 0 || *n > 4096)
        {
            return Err(error(
                ContractKind::Linkml,
                "IMPORT_CONTEXT",
                "Expected entry, 1–128 keyed schemas and at most 4096 explicit bounded bindings",
            ));
        }
        if !schema_keys.contains(&from) || !schema_keys.contains(&target) {
            status = "blocked";
            push_diag(
                &mut diagnostics,
                "LINKML_IMPORT_RESOURCE",
                &format!("/bindings/{i}"),
                "Binding source or target is not supplied",
                "error",
            );
        }
        if bind_from
            .iter()
            .zip(&bind_import)
            .any(|(f, im)| f == &from && im == &import)
        {
            status = "blocked";
            push_diag(
                &mut diagnostics,
                "LINKML_IMPORT_DUPLICATE",
                &format!("/bindings/{i}"),
                "Duplicate binding for the same importer and literal import",
                "error",
            );
        } else {
            bind_from.push(from);
            bind_import.push(import);
            bind_target.push(target);
        }
    }
    if !schema_keys.contains(entry.as_ref().unwrap()) {
        status = "blocked";
        push_diag(
            &mut diagnostics,
            "LINKML_IMPORT_ENTRY",
            "/entry",
            "Entry resource is not supplied",
            "error",
        );
    }
    let mut nodes = Vec::<Value>::new();
    let mut edges = Vec::<Value>::new();
    if status != "blocked" {
        let mut queue = vec![entry.unwrap()];
        let mut visited = Vec::<Utf16>::new();
        let mut q = 0;
        while q < queue.len() {
            let current = queue[q].clone();
            q += 1;
            if visited.contains(&current) {
                continue;
            }
            visited.push(current.clone());
            nodes.push(Value::String(current.clone()));
            let si = schema_keys.iter().position(|k| k == &current).unwrap();
            let doc = &schema_docs[si];
            let prefix = format!("/schemas/{si}/document");
            let result = read_payload(doc, ContractKind::Linkml, runtime, ctx);
            let Ok(payload) = result else {
                status = "blocked";
                push_diag(
                    &mut diagnostics,
                    "LINKML_IMPORT_DOCUMENT",
                    &prefix,
                    "Unable to read supplied LinkML document",
                    "error",
                );
                continue;
            };
            let validation = runtime.inspect(doc, ContractKind::Linkml, ctx)?;
            let uninterpreted = validation
                .diagnostics
                .iter()
                .any(|d| d.code == key("LINKML_VERSION") || d.code == key("LINKML_REPRESENTATION"));
            for d in validation.diagnostics {
                let mut path_units = prefix.encode_utf16().collect::<Vec<_>>();
                path_units.extend_from_slice(d.path.units());
                let path = Utf16::new(path_units);
                diagnostics.push(Value::Object(vec![
                    (key("code"), Value::String(d.code)),
                    (key("path"), Value::String(path)),
                    (
                        key("severity"),
                        Value::string_utf8(if d.severity == Severity::Error {
                            "error"
                        } else {
                            "warning"
                        }),
                    ),
                    (key("message"), Value::String(d.message)),
                ]));
            }
            if uninterpreted {
                status = "blocked";
                push_diag(
                    &mut diagnostics,
                    "LINKML_IMPORT_VERSION",
                    &prefix,
                    "Uninterpreted metamodel/representation cannot supply imports",
                    "error",
                );
                continue;
            }
            let Some(NativeJsonNode::Object(root)) = Some(payload.root.root()) else {
                status = "blocked";
                push_diag(
                    &mut diagnostics,
                    "LINKML_IMPORT_DOCUMENT",
                    &prefix,
                    "Expected schema object",
                    "error",
                );
                continue;
            };
            let imports = root
                .iter()
                .find(|(k, _)| k == &key("imports"))
                .map(|(_, v)| v);
            let Some(imports) = imports else {
                continue;
            };
            let NativeJsonNode::Array(imports) = imports else {
                status = "blocked";
                push_diag(&mut diagnostics,"LINKML_IMPORT_SHAPE",&format!("{prefix}/imports"),"Explicit import list required; native singleton normalization is not performed","error");
                continue;
            };
            for (j, item) in imports.iter().enumerate() {
                let ip = format!("{prefix}/imports/{j}");
                let NativeJsonNode::String(literal) = item else {
                    status = "blocked";
                    push_diag(
                        &mut diagnostics,
                        "LINKML_IMPORT_SHAPE",
                        &ip,
                        "Expected bounded literal import string",
                        "error",
                    );
                    continue;
                };
                if literal.is_empty() || literal.len() > 4096 {
                    status = "blocked";
                    push_diag(
                        &mut diagnostics,
                        "LINKML_IMPORT_SHAPE",
                        &ip,
                        "Expected bounded literal import string",
                        "error",
                    );
                    continue;
                }
                let bi = bind_from
                    .iter()
                    .zip(&bind_import)
                    .position(|(f, im)| f == &current && im == literal);
                let target = bi.map(|i| bind_target[i].clone());
                let mut edge = vec![
                    (key("from"), Value::String(current.clone())),
                    (key("import"), Value::String(literal.clone())),
                    (key("path"), Value::string_utf8(format!("/imports/{j}"))),
                ];
                if let Some(target) = target {
                    edge.push((key("target"), Value::String(target.clone())));
                    edges.push(Value::Object(edge));
                    if !visited.contains(&target) {
                        queue.push(target);
                    }
                } else {
                    edges.push(Value::Object(edge));
                    status = "blocked";
                    push_diag(
                        &mut diagnostics,
                        "LINKML_IMPORT_UNRESOLVED",
                        &ip,
                        &format!("No supplied binding for {}", json_quoted(&lossy(literal))),
                        "error",
                    );
                }
            }
        }
    }
    diagnostics.push(diag_value("LINKML_IMPORT_CONTEXT","","Reachability under explicit bindings only. Declared edge occurrences/order retained; no URI/CURIE resolution, merge precedence, induced schema, cycle legality or instance validation is inferred.","warning"));
    Ok(Value::Object(vec![
        (key("context"), context),
        (key("status"), Value::string_utf8(status)),
        (key("complete"), Value::Bool(false)),
        (key("nodes"), Value::Array(nodes)),
        (key("edges"), Value::Array(edges)),
        (key("diagnostics"), Value::Array(diagnostics)),
    ]))
}

pub fn propose_linkml_import_merge(
    input: &Value,
    mode: &Utf16,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if mode != &key("view") && mode != &key("merge-imports") {
        return Err(error(
            ContractKind::Linkml,
            "MERGE_MODE",
            "Select view or merge-imports precedence explicitly",
        ));
    }
    let graph = inspect_linkml_import_context(input, runtime, ctx)?;
    let graph_diags = arr(field(&graph, "diagnostics"))
        .cloned()
        .unwrap_or_default();
    let context = field(&graph, "context").cloned().unwrap_or(Value::Null);
    let mut diagnostics = graph_diags
        .into_iter()
        .filter(|d| !text_is(field(d, "code"), "LINKML_IMPORT_CONTEXT"))
        .collect::<Vec<_>>();
    let mut closure = Vec::<Utf16>::new();
    let mut selections = Vec::<Value>::new();
    if !text_is(field(&graph, "status"), "resolved") {
        return Ok(linkml_merge_result(
            context,
            mode,
            "blocked",
            closure,
            selections,
            None,
            diagnostics,
        ));
    }
    let entry = as_string(field(input, "entry")).unwrap_or_default();
    let schemas = arr(field(input, "schemas")).cloned().unwrap_or_default();
    let mut keys = Vec::<Utf16>::new();
    let mut docs = Vec::<Value>::new();
    let mut roots = Vec::<NativeJsonNode>::new();
    let mut ids = Vec::<NativeJsonNode>::new();
    for schema in &schemas {
        let k = as_string(field(schema, "key")).unwrap_or_default();
        let doc = field(schema, "document").cloned().unwrap_or(Value::Null);
        let payload = match read_payload(&doc, ContractKind::Linkml, runtime, ctx) {
            Ok(v) => v,
            Err(e) => {
                push_diag(
                    &mut diagnostics,
                    "LINKML_MERGE_DOCUMENT",
                    "",
                    &e.to_string(),
                    "error",
                );
                continue;
            }
        };
        let root = payload.root.root().clone();
        let id = object_member(&root, "id")
            .cloned()
            .unwrap_or(NativeJsonNode::Null);
        keys.push(k);
        docs.push(doc);
        roots.push(root);
        ids.push(id);
    }
    let edge_values = arr(field(&graph, "edges")).cloned().unwrap_or_default();
    let mut todo = vec![entry.clone()];
    let mut visited = Vec::<Utf16>::new();
    let mut reverse = Vec::<Utf16>::new();
    while let Some(current) = todo.pop() {
        if !visited.contains(&current) {
            for edge in &edge_values {
                if as_string(field(edge, "from")).as_ref() == Some(&current) {
                    if let Some(target) = as_string(field(edge, "target")) {
                        if target != current {
                            todo.push(target);
                        }
                    }
                }
            }
        }
        reverse.push(current.clone());
        if !visited.contains(&current) {
            visited.push(current);
        }
    }
    for key in reverse.into_iter().rev() {
        if !closure.contains(&key) {
            closure.push(key);
        }
    }
    let mut ordered_roots = Vec::<(Utf16, NativeJsonNode, NativeJsonNode)>::new();
    for k in &closure {
        let Some(i) = keys.iter().position(|x| x == k) else {
            continue;
        };
        let root = &roots[i];
        if !matches!(&ids[i], NativeJsonNode::String(_)) {
            push_diag(
                &mut diagnostics,
                "LINKML_MERGE",
                &format!("/{}/id", lossy(k)),
                "Schema id must be a string for native from_schema provenance",
                "error",
            );
        }
        for collection in ["prefixes", "classes", "slots", "enums", "subsets", "types"] {
            if let Some(value) = object_member(root, collection) {
                if !matches!(value, NativeJsonNode::Object(_)) {
                    push_diag(
                        &mut diagnostics,
                        "LINKML_MERGE",
                        &format!("/{}/{collection}", lossy(k)),
                        "Expected explicit declaration dictionary",
                        "error",
                    );
                }
            }
        }
        ordered_roots.push((k.clone(), root.clone(), ids[i].clone()));
    }
    if diagnostics
        .iter()
        .any(|d| text_is(field(d, "severity"), "error"))
    {
        return Ok(linkml_merge_result(
            context,
            mode,
            "blocked",
            closure,
            selections,
            None,
            diagnostics,
        ));
    }
    let Some(entry_index) = keys.iter().position(|x| x == &entry) else {
        return Err(error(
            ContractKind::Linkml,
            "MERGE_ENTRY",
            "Entry resource is not supplied",
        ));
    };
    let mut candidate = roots[entry_index].clone();
    let collection_order = ["prefixes", "classes", "slots", "enums", "subsets", "types"];
    for collection in collection_order {
        let mut present = false;
        let mut selected = Vec::<(Utf16, Utf16, NativeJsonNode, Vec<Utf16>)>::new();
        let mut order = ordered_roots.iter().collect::<Vec<_>>();
        if mode == &key("merge-imports") {
            order.sort_by_key(|root| if root.0 == entry { 0 } else { 1 });
        }
        for (resource, root, _) in order {
            let Some(NativeJsonNode::Object(decls)) = object_member(root, collection) else {
                continue;
            };
            present = true;
            for (name, value) in decls {
                if let Some(i) = selected.iter().position(|(n, _, _, _)| n == name) {
                    let row = &mut selected[i];
                    row.3.push(resource.clone());
                    if mode == &key("view") {
                        row.1 = resource.clone();
                        row.2 = value.clone();
                    }
                } else {
                    selected.push((
                        name.clone(),
                        resource.clone(),
                        value.clone(),
                        vec![resource.clone()],
                    ));
                }
            }
        }
        if !present {
            continue;
        }
        let mut merged = Vec::<(Utf16, NativeJsonNode)>::new();
        for (name, winner, value, seen) in selected {
            let origin = ordered_roots
                .iter()
                .find(|(k, _, _)| k == &winner)
                .map(|(_, _, id)| id.clone())
                .unwrap_or(NativeJsonNode::Null);
            let mut value = value;
            if collection != "prefixes" {
                if matches!(value, NativeJsonNode::Null) {
                    value = NativeJsonNode::Object(Vec::new());
                }
                let NativeJsonNode::Object(ref mut fields) = value else {
                    push_diag(
                        &mut diagnostics,
                        "LINKML_MERGE",
                        &format!("/{}/{collection}/{}", lossy(&winner), lossy(&name)),
                        "Expected definition object or compact null",
                        "error",
                    );
                    continue;
                };
                set_native(fields, &key("from_schema"), origin.clone());
                if collection == "classes" {
                    if let Some(attrs) = fields
                        .iter_mut()
                        .find(|(k, _)| k == &key("attributes"))
                        .map(|(_, v)| v)
                    {
                        let NativeJsonNode::Object(attrs) = attrs else {
                            push_diag(
                                &mut diagnostics,
                                "LINKML_MERGE",
                                "",
                                "Expected attribute dictionary",
                                "error",
                            );
                            continue;
                        };
                        for (_, attribute) in attrs {
                            match attribute {
                                NativeJsonNode::Null => {
                                    *attribute = NativeJsonNode::Object(vec![(
                                        key("from_schema"),
                                        origin.clone(),
                                    )])
                                }
                                NativeJsonNode::Object(m) => {
                                    set_native(m, &key("from_schema"), origin.clone())
                                }
                                _ => push_diag(
                                    &mut diagnostics,
                                    "LINKML_MERGE",
                                    "",
                                    "Expected attribute object or compact null",
                                    "error",
                                ),
                            }
                        }
                    }
                }
            }
            let shadowed = seen
                .iter()
                .filter(|k| *k != &winner)
                .cloned()
                .map(Value::String)
                .collect::<Vec<_>>();
            selections.push(Value::Object(vec![
                (key("collection"), Value::string_utf8(collection)),
                (key("name"), Value::String(name.clone())),
                (key("winner"), Value::String(winner)),
                (key("shadowed"), Value::Array(shadowed)),
            ]));
            merged.push((name, value));
        }
        set_native_object(&mut candidate, &key(collection), merged);
    }
    set_native(
        native_object_mut(&mut candidate),
        &key("imports"),
        NativeJsonNode::Array(Vec::new()),
    );
    let text = render_native_json(&candidate, ctx)?;
    let entry_doc = &docs[entry_index];
    let id = as_string(field(entry_doc, "id")).unwrap_or_default();
    let newline = Utf16::from("\n");
    let mut with_newline = text.units().to_vec();
    with_newline.extend_from_slice(newline.units());
    let candidate_doc = import_linkml_document(
        &Utf16::new(with_newline),
        &id,
        ContractFormat::Json,
        None,
        runtime,
        ctx,
    )?;
    if diagnostics
        .iter()
        .any(|d| text_is(field(d, "severity"), "error"))
    {
        selections.clear();
        return Ok(linkml_merge_result(
            context,
            mode,
            "blocked",
            closure,
            selections,
            None,
            diagnostics,
        ));
    }
    diagnostics.push(diag_value("LINKML_MERGE_CONTEXT","","Candidate uses explicit supplied bindings and selected native dictionary precedence. Imports are removed; native from_schema provenance is injected. Entry schema metadata stays authoritative; imported top-level metadata, shadowed declarations and all original layouts remain in context. No URI retrieval, instance validation, generator equivalence or arbitrary importer-scoped native equivalence is asserted.","warning"));
    Ok(linkml_merge_result(
        context,
        mode,
        "candidate",
        closure,
        selections,
        Some(candidate_doc),
        diagnostics,
    ))
}

fn native_object_mut(node: &mut NativeJsonNode) -> &mut Vec<(Utf16, NativeJsonNode)> {
    if !matches!(node, NativeJsonNode::Object(_)) {
        *node = NativeJsonNode::Object(Vec::new());
    }
    if let NativeJsonNode::Object(m) = node {
        m
    } else {
        unreachable!()
    }
}
fn set_native(fields: &mut Vec<(Utf16, NativeJsonNode)>, key: &Utf16, value: NativeJsonNode) {
    if let Some((_, v)) = fields.iter_mut().find(|(k, _)| k == key) {
        *v = value
    } else {
        fields.push((key.clone(), value));
        // Stable sorting retains insertion order for ordinary string keys and
        // applies ECMAScript integer-index ordering to numeric property names.
        fields.sort_by_key(|(k, _)| native_array_index(k).map_or((1, 0), |index| (0, index)));
    }
}
fn native_array_index(key: &Utf16) -> Option<u32> {
    let s = key.to_utf8().ok()?;
    if s.is_empty()
        || s.len() > 10
        || s.len() > 1 && s.starts_with('0')
        || !s.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let n = s.parse::<u32>().ok()?;
    (n < u32::MAX).then_some(n)
}
fn set_native_object(root: &mut NativeJsonNode, key: &Utf16, value: Vec<(Utf16, NativeJsonNode)>) {
    set_native(native_object_mut(root), key, NativeJsonNode::Object(value));
}
fn render_native_json(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    fn push(out: &mut Vec<u16>, units: &[u16], ctx: &mut Context<'_>) -> Result<(), EngineError> {
        ctx.charge_text(units.len(), Utf16::default())?;
        out.extend_from_slice(units);
        Ok(())
    }
    fn quoted(s: &Utf16, out: &mut Vec<u16>, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        push(out, &[34], ctx)?;
        let units = s.units();
        let mut i = 0;
        while i < units.len() {
            let u = units[i];
            let escaped: Option<&[u16]> = match u {
                34 => Some(&[92, 34]),
                92 => Some(&[92, 92]),
                8 => Some(&[92, 98]),
                9 => Some(&[92, 116]),
                10 => Some(&[92, 110]),
                12 => Some(&[92, 102]),
                13 => Some(&[92, 114]),
                0..=31 => None,
                _ => None,
            };
            if let Some(e) = escaped {
                push(out, e, ctx)?;
            } else if (0xd800..=0xdbff).contains(&u) {
                if i + 1 < units.len() && (0xdc00..=0xdfff).contains(&units[i + 1]) {
                    push(out, &units[i..=i + 1], ctx)?;
                    i += 1;
                } else {
                    let esc = format!("\\u{u:04x}").encode_utf16().collect::<Vec<_>>();
                    push(out, &esc, ctx)?;
                }
            } else if (0xdc00..=0xdfff).contains(&u) {
                let esc = format!("\\u{u:04x}").encode_utf16().collect::<Vec<_>>();
                push(out, &esc, ctx)?;
            } else if u < 32 {
                let esc = format!("\\u{u:04x}").encode_utf16().collect::<Vec<_>>();
                push(out, &esc, ctx)?;
            } else {
                push(out, &[u], ctx)?;
            }
            i += 1;
        }
        push(out, &[34], ctx)
    }
    fn write(
        node: &NativeJsonNode,
        out: &mut Vec<u16>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        match node {
            NativeJsonNode::Null => push(out, &[110, 117, 108, 108], ctx)?,
            NativeJsonNode::Boolean(v) => push(
                out,
                if *v {
                    &[116, 114, 117, 101]
                } else {
                    &[102, 97, 108, 115, 101]
                },
                ctx,
            )?,
            NativeJsonNode::Number(n) => push(out, &n.encode_utf16().collect::<Vec<_>>(), ctx)?,
            NativeJsonNode::String(s) => quoted(s, out, ctx)?,
            NativeJsonNode::Array(items) => {
                push(out, &[91], ctx)?;
                for (i, v) in items.iter().enumerate() {
                    if i > 0 {
                        push(out, &[44], ctx)?;
                    }
                    write(v, out, ctx)?;
                }
                push(out, &[93], ctx)?;
            }
            NativeJsonNode::Object(fields) => {
                push(out, &[123], ctx)?;
                for (i, (k, v)) in fields.iter().enumerate() {
                    if i > 0 {
                        push(out, &[44], ctx)?;
                    }
                    quoted(k, out, ctx)?;
                    push(out, &[58], ctx)?;
                    write(v, out, ctx)?;
                }
                push(out, &[125], ctx)?;
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    write(node, &mut out, ctx)?;
    Ok(Utf16::new(out))
}
fn linkml_merge_result(
    context: Value,
    mode: &Utf16,
    status: &str,
    closure: Vec<Utf16>,
    selections: Vec<Value>,
    candidate: Option<Value>,
    diagnostics: Vec<Value>,
) -> Value {
    let mut out = vec![
        (key("context"), context),
        (key("mode"), Value::String(mode.clone())),
        (key("status"), Value::string_utf8(status)),
        (key("complete"), Value::Bool(false)),
        (
            key("closure"),
            Value::Array(closure.into_iter().map(Value::String).collect()),
        ),
        (key("selections"), Value::Array(selections)),
    ];
    if let Some(candidate) = candidate {
        out.push((key("candidate"), candidate));
    }
    out.push((key("diagnostics"), Value::Array(diagnostics)));
    Value::Object(out)
}

/// Pair the ordered local ODCS foreign-key endpoints without asserting
/// enforcement, key compatibility or row-level integrity.
pub fn inspect_odcs_relationships(
    document: &Value,
    max_relationships: Option<usize>,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let max = max_relationships.unwrap_or(256);
    if !(1..=2048).contains(&max) {
        return Err(error(
            ContractKind::Odcs,
            "RELATIONSHIP_OPTIONS",
            "Expected relationship limit 1–2048",
        ));
    }
    let source = copy_json(document, ctx)?;
    let payload = read_payload(&source, ContractKind::Odcs, runtime, ctx)?;
    let mut diagnostics =
        diagnostics_value(runtime.inspect(&source, ContractKind::Odcs, ctx)?, ctx)?;
    let mut relationships = Vec::new();
    let mut status = "checked";
    if !matches!(object_member(payload.root.root(),"apiVersion"),Some(NativeJsonNode::String(v))if v==&key("v3.2.0"))
    {
        push_diag(
            &mut diagnostics,
            "ODCS_RELATIONSHIP_VERSION",
            "/apiVersion",
            "Relationship interpretation is pinned to v3.2.0",
            "error",
        );
        status = "blocked";
    } else if let Some(NativeJsonNode::Array(schemas)) =
        object_member(payload.root.root(), "schema")
    {
        let mut limited = false;
        for (i, node) in schemas.iter().enumerate() {
            let path = Utf16::from(format!("/schema/{i}"));
            walk_odcs_relationship_node(
                node,
                &path,
                "schema",
                &source,
                runtime,
                max,
                &mut relationships,
                &mut diagnostics,
                &mut status,
                &mut limited,
                ctx,
            )?;
        }
    } else {
        push_diag(
            &mut diagnostics,
            "ODCS_RELATIONSHIP_STRUCTURE",
            "/schema",
            "Expected schema array",
            "error",
        );
        status = "blocked";
    }
    diagnostics.push(diag_value("ODCS_RELATIONSHIP_CONTEXT","","Local relationship structure and ordered endpoint pairing only; no type/key compatibility, uniqueness, row checks, enforcement or external resource resolution","warning"));
    Ok(Value::Object(vec![
        (key("source"), source),
        (key("status"), Value::string_utf8(status)),
        (key("complete"), Value::Bool(false)),
        (key("relationships"), Value::Array(relationships)),
        (key("diagnostics"), Value::Array(diagnostics)),
    ]))
}

/// Propose an ID-selected local element rename and rewrite only known local
/// name-shorthand foreign-key references, then verify endpoint pairs.
pub fn propose_odcs_element_rename(
    document: &Value,
    reference: &Utf16,
    new_name: &Utf16,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let valid_name = {
        let s = new_name.to_utf8().unwrap_or_default();
        !s.is_empty() && s.len() <= 256 && {
            let mut c = s.chars();
            c.next()
                .is_some_and(|x| x.is_ascii_alphabetic() || x == '_')
                && c.all(|x| x.is_ascii_alphanumeric() || x == '_' || x == '-')
        }
    };
    if !valid_name {
        return Err(error(
            ContractKind::Odcs,
            "RENAME_OPTIONS",
            "Expected a shorthand-compatible new name of at most 256 characters",
        ));
    }
    let source = copy_json(document, ctx)?;
    let resolved = resolve_odcs_reference(&source, reference, &key("element"), runtime, ctx)?;
    let mut diagnostics = arr(field(&resolved, "diagnostics"))
        .cloned()
        .unwrap_or_default();
    let mut changes = Vec::<Value>::new();
    let target = field(&resolved, "target");
    let Some(target) = target else {
        return Ok(odcs_rename_result(
            source,
            "blocked",
            None,
            Vec::new(),
            diagnostics,
        ));
    };
    if diagnostics.iter().any(|d|matches!(as_string(field(d,"code")),Some(c) if c==key("ODCS_NATIVE_SCHEMA")||c==key("ODCS_REPRESENTATION"))){push_diag(&mut diagnostics,"ODCS_RENAME_SOURCE","","Resolve native-shape or representation uncertainty before relationship-aware rename","error");return Ok(odcs_rename_result(source,"blocked",None,changes,diagnostics));}
    let path = as_string(field(target, "path")).unwrap_or_default();
    let node = field(target, "node").unwrap_or(&Value::Null);
    let name = tagged_string(node, "name");
    let Some(name) = name else {
        push_diag(
            &mut diagnostics,
            "ODCS_RENAME_NAME",
            &lossy(&path),
            "Target must have an existing string name",
            "error",
        );
        return Ok(odcs_rename_result(
            source,
            "blocked",
            None,
            Vec::new(),
            diagnostics,
        ));
    };
    let parent = Utf16::new(
        path.units()
            .iter()
            .rposition(|u| *u == b'/' as u16)
            .map(|i| path.units()[..i].to_vec())
            .unwrap_or_default(),
    );
    let siblings = get_odcs_document_node(&source, &parent, runtime, ctx)?;
    let NativeJsonNode::Array(sibling_items) = siblings.root() else {
        push_diag(
            &mut diagnostics,
            "ODCS_RENAME_SOURCE",
            &lossy(&parent),
            "Expected containing array",
            "error",
        );
        return Ok(odcs_rename_result(
            source,
            "blocked",
            None,
            Vec::new(),
            diagnostics,
        ));
    };
    let index = path
        .units()
        .iter()
        .rposition(|u| *u == b'/' as u16)
        .and_then(|i| String::from_utf16(&path.units()[i + 1..]).ok())
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(usize::MAX);
    if sibling_items
        .iter()
        .enumerate()
        .any(|(i, n)| i != index && tagged_string_node(n, "name").as_ref() == Some(new_name))
    {
        push_diag(
            &mut diagnostics,
            "ODCS_RENAME_COLLISION",
            &lossy(&parent),
            "New name already belongs to a sibling",
            "error",
        );
        return Ok(odcs_rename_result(
            source,
            "blocked",
            None,
            Vec::new(),
            diagnostics,
        ));
    }
    let before = inspect_odcs_relationships(&source, None, runtime, ctx)?;
    if !text_is(field(&before, "status"), "checked") {
        diagnostics.extend(
            arr(field(&before, "diagnostics"))
                .cloned()
                .unwrap_or_default(),
        );
        push_diag(
            &mut diagnostics,
            "ODCS_RENAME_RELATIONSHIPS",
            "",
            "All known local relationships must pair before rename",
            "error",
        );
        return Ok(odcs_rename_result(
            source,
            "blocked",
            None,
            changes,
            diagnostics,
        ));
    }
    if name != *new_name {
        changes.push(change_value(
            &child_pointer(&path, &key("name"), ctx)?,
            &name,
            new_name,
        ));
    }
    let property_depth = path
        .units()
        .windows("/properties/".encode_utf16().count())
        .filter(|w| *w == "/properties/".encode_utf16().collect::<Vec<_>>().as_slice())
        .count();
    if let Some(rows) = arr(field(&before, "relationships")) {
        for row in rows {
            let rp = as_string(field(row, "path")).unwrap_or_default();
            let rel = get_odcs_document_node(&source, &rp, runtime, ctx)?;
            let NativeJsonNode::Object(members) = rel.root() else {
                push_diag(
                    &mut diagnostics,
                    "ODCS_RENAME_SOURCE",
                    &lossy(&rp),
                    "Expected relationship object",
                    "error",
                );
                return Ok(odcs_rename_result(
                    source,
                    "blocked",
                    None,
                    Vec::new(),
                    diagnostics,
                ));
            };
            for endpoint in ["from", "to"] {
                if let Some(value) = members
                    .iter()
                    .find(|(k, _)| k == &key(endpoint))
                    .map(|(_, v)| v)
                {
                    let ep = child_pointer(&rp, &key(endpoint), ctx)?;
                    collect_rename_references(
                        value,
                        &ep,
                        &source,
                        &path,
                        new_name,
                        property_depth,
                        runtime,
                        &mut changes,
                        ctx,
                    )?;
                }
            }
        }
    }
    let mut candidate = source.clone();
    for change in &changes {
        let p = as_string(field(change, "path")).unwrap_or_default();
        let after = as_string(field(change, "after")).unwrap_or_default();
        let encoded = serde_json::to_string(&after.to_utf8().unwrap_or_default())
            .unwrap_or_else(|_| "\"\"".into());
        let (next, _) = edit_node(
            &candidate,
            &p,
            &Utf16::from(encoded),
            ContractKind::Odcs,
            runtime,
            ctx,
        )?;
        candidate = next;
    }
    let after = inspect_odcs_relationships(&candidate, None, runtime, ctx)?;
    if !text_is(field(&after, "status"), "checked")
        || relationship_pairs(field(&before, "relationships"))
            != relationship_pairs(field(&after, "relationships"))
    {
        push_diag(
            &mut diagnostics,
            "ODCS_RENAME_VERIFICATION",
            "",
            "Candidate did not preserve all ordered local endpoint pairs",
            "error",
        );
        return Ok(odcs_rename_result(
            source,
            "blocked",
            None,
            Vec::new(),
            diagnostics,
        ));
    }
    if runtime
        .inspect(&candidate, ContractKind::Odcs, ctx)?
        .diagnostics
        .iter()
        .any(|d| d.code == key("ODCS_NATIVE_SCHEMA"))
    {
        push_diag(
            &mut diagnostics,
            "ODCS_RENAME_VERIFICATION",
            "",
            "Candidate fails pinned native shapes",
            "error",
        );
        return Ok(odcs_rename_result(
            source,
            "blocked",
            None,
            Vec::new(),
            diagnostics,
        ));
    }
    diagnostics.push(diag_value("ODCS_RENAME_CONTEXT",&lossy(&path),"Only known local foreign-key name references are rewritten. IDs and other source content remain unchanged; SQL/quality expressions, unknown metadata, external consumers and execution semantics require separate review.","warning"));
    Ok(odcs_rename_result(
        source,
        "candidate",
        Some(candidate),
        changes,
        diagnostics,
    ))
}
fn tagged_string(value: &Value, field_name: &str) -> Option<Utf16> {
    tagged_string_node_value(field(value, field_name)?)
}
fn tagged_string_node(node: &NativeJsonNode, field_name: &str) -> Option<Utf16> {
    object_member(node, field_name).and_then(|v| {
        if let NativeJsonNode::String(s) = v {
            Some(s.clone())
        } else {
            None
        }
    })
}
fn tagged_string_node_value(value: &Value) -> Option<Utf16> {
    if text_is(field(value, "kind"), "string") {
        as_string(field(value, "value")?)
    } else {
        None
    }
}
fn change_value(path: &Utf16, before: &Utf16, after: &Utf16) -> Value {
    Value::Object(vec![
        (key("path"), Value::String(path.clone())),
        (key("before"), Value::String(before.clone())),
        (key("after"), Value::String(after.clone())),
    ])
}
fn odcs_rename_result(
    source: Value,
    status: &str,
    candidate: Option<Value>,
    changes: Vec<Value>,
    diagnostics: Vec<Value>,
) -> Value {
    let mut out = vec![
        (key("source"), source),
        (key("status"), Value::string_utf8(status)),
        (key("complete"), Value::Bool(false)),
    ];
    if let Some(candidate) = candidate {
        out.push((key("candidate"), candidate));
    }
    out.push((key("changes"), Value::Array(changes)));
    out.push((key("diagnostics"), Value::Array(diagnostics)));
    Value::Object(out)
}
fn collect_rename_references(
    node: &NativeJsonNode,
    path: &Utf16,
    source: &Value,
    target_path: &Utf16,
    new_name: &Utf16,
    depth: usize,
    runtime: &ContractRuntime,
    changes: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    match node {
        NativeJsonNode::Array(items) => {
            for (i, v) in items.iter().enumerate() {
                collect_rename_references(
                    v,
                    &child_pointer(path, &key(&i.to_string()), ctx)?,
                    source,
                    target_path,
                    new_name,
                    depth,
                    runtime,
                    changes,
                    ctx,
                )?;
            }
        }
        NativeJsonNode::String(reference) => {
            let resolved =
                resolve_odcs_reference(source, reference, &key("foreignKey"), runtime, ctx)?;
            let Some(t) = field(&resolved, "target") else {
                return Ok(());
            };
            if !text_is(field(t, "notation"), "name") {
                return Ok(());
            }
            let resolved_path = as_string(field(t, "path")).unwrap_or_default();
            if !resolved_path.units().starts_with(target_path.units())
                || !(resolved_path == *target_path
                    || resolved_path.units().get(target_path.len()) == Some(&(b'/' as u16)))
            {
                return Ok(());
            }
            let prefix = if reference
                .units()
                .starts_with("#/".encode_utf16().collect::<Vec<_>>().as_slice())
            {
                "#/"
            } else if reference.units().first() == Some(&(b'#' as u16)) {
                "#"
            } else if reference.units().first() == Some(&(b'/' as u16)) {
                "/"
            } else {
                ""
            };
            let text = reference.to_utf8().unwrap_or_default();
            let body = text.strip_prefix(prefix).unwrap_or(&text).to_owned();
            let mut parts = body.split('.').map(str::to_owned).collect::<Vec<_>>();
            if depth < parts.len() {
                parts[depth] = new_name.to_utf8().unwrap_or_default();
                let after = Utf16::from(format!("{prefix}{}", parts.join(".")));
                if after != *reference {
                    changes.push(change_value(path, reference, &after));
                }
            }
        }
        _ => {}
    }
    Ok(())
}
fn relationship_pairs(value: Option<&Value>) -> Vec<Value> {
    arr(value)
        .into_iter()
        .flatten()
        .map(|row| {
            Value::Object(vec![
                (
                    key("path"),
                    field(row, "path").cloned().unwrap_or(Value::Null),
                ),
                (
                    key("pairs"),
                    field(row, "pairs").cloned().unwrap_or(Value::Null),
                ),
            ])
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn walk_odcs_relationship_node(
    node: &NativeJsonNode,
    path: &Utf16,
    scope: &str,
    source: &Value,
    runtime: &ContractRuntime,
    max: usize,
    relationships: &mut Vec<Value>,
    diagnostics: &mut Vec<Value>,
    status: &mut &str,
    limited: &mut bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let NativeJsonNode::Object(fields) = node else {
        push_diag(
            diagnostics,
            "ODCS_RELATIONSHIP_STRUCTURE",
            &lossy(path),
            "Expected schema/property object",
            "error",
        );
        *status = "blocked";
        return Ok(());
    };
    if let Some((_, NativeJsonNode::Array(rows))) =
        fields.iter().find(|(k, _)| k == &key("relationships"))
    {
        let mut ids = Vec::<(Utf16, usize)>::new();
        for row in rows {
            if let Some(NativeJsonNode::String(id)) = object_member(row, "id") {
                if let Some((_, n)) = ids.iter_mut().find(|(v, _)| v == id) {
                    *n += 1;
                } else {
                    ids.push((id.clone(), 1));
                }
            }
        }
        for (i, row) in rows.iter().enumerate() {
            if relationships.len() >= max {
                let p = child_pointer(path, &key("relationships"), ctx)?;
                let p = child_pointer(&p, &key(&i.to_string()), ctx)?;
                push_diag(
                    diagnostics,
                    "ODCS_RELATIONSHIP_LIMIT",
                    &lossy(&p),
                    "Relationship limit reached; remaining source retained",
                    "error",
                );
                *status = "blocked";
                *limited = true;
                return Ok(());
            }
            let rp = child_pointer(
                &child_pointer(path, &key("relationships"), ctx)?,
                &key(&i.to_string()),
                ctx,
            )?;
            let mut rd = Vec::<Value>::new();
            let mut pairs = Vec::<Value>::new();
            let mut rowstatus = "blocked";
            if !matches!(row, NativeJsonNode::Object(_)) {
                push_diag(
                    &mut rd,
                    "ODCS_RELATIONSHIP_STRUCTURE",
                    &lossy(&rp),
                    "Expected relationship object",
                    "error",
                );
            } else {
                let id = object_member(row, "id");
                let typ = object_member(row, "type");
                let from = object_member(row, "from");
                let to = object_member(row, "to");
                if let Some(id) = id {
                    if !matches!(id,NativeJsonNode::String(v)if !v.is_empty()&& !v.to_utf8().unwrap_or_default().chars().any(|c|c.is_whitespace()||".#/\\@!%^&".contains(c)))
                    {
                        let p = child_pointer(&rp, &key("id"), ctx)?;
                        push_diag(
                            &mut rd,
                            "ODCS_RELATIONSHIP_ID",
                            &lossy(&p),
                            "Invalid stable relationship ID",
                            "error",
                        );
                    } else if let NativeJsonNode::String(v) = id {
                        if ids.iter().any(|(x, n)| x == v && *n > 1) {
                            let p = child_pointer(&rp, &key("id"), ctx)?;
                            push_diag(
                                &mut rd,
                                "ODCS_RELATIONSHIP_ID",
                                &lossy(&p),
                                "Duplicate ID in containing relationship array",
                                "error",
                            );
                        }
                    }
                }
                if let Some(typ) = typ {
                    if !matches!(typ,NativeJsonNode::String(v)if v==&key("foreignKey")) {
                        let p = child_pointer(&rp, &key("type"), ctx)?;
                        push_diag(
                            &mut rd,
                            "ODCS_RELATIONSHIP_TYPE",
                            &lossy(&p),
                            "Unknown relationship type retained without interpretation",
                            "error",
                        );
                    }
                }
                if scope == "property" && from.is_some() {
                    let p = child_pointer(&rp, &key("from"), ctx)?;
                    push_diag(
                        &mut rd,
                        "ODCS_RELATIONSHIP_FROM",
                        &lossy(&p),
                        "Property-level from must remain implicit",
                        "error",
                    );
                }
                if scope == "schema" && from.is_none() {
                    push_diag(
                        &mut rd,
                        "ODCS_RELATIONSHIP_FROM",
                        &lossy(&rp),
                        "Schema-level relationship requires from",
                        "error",
                    );
                }
                if to.is_none() {
                    push_diag(
                        &mut rd,
                        "ODCS_RELATIONSHIP_TO",
                        &lossy(&rp),
                        "Relationship requires to",
                        "error",
                    );
                }
                if rd.is_empty() {
                    let mut left = Vec::<Utf16>::new();
                    let mut right = Vec::<Utf16>::new();
                    let mut valid = true;
                    if scope == "property" {
                        if let Some(NativeJsonNode::String(v)) = to {
                            right.push(v.clone());
                        } else {
                            let p = child_pointer(&rp, &key("to"), ctx)?;
                            push_diag(&mut rd,"ODCS_RELATIONSHIP_PROPERTY_ARRAY",&lossy(&p),"Only scalar targets interpreted for implicit single-property source; other native shapes retained","error");
                            valid = false;
                        }
                    } else {
                        match (from, to) {
                            (Some(NativeJsonNode::String(a)), Some(NativeJsonNode::String(b))) => {
                                left.push(a.clone());
                                right.push(b.clone());
                            }
                            (Some(NativeJsonNode::Array(a)), Some(NativeJsonNode::Array(b))) => {
                                if a.is_empty() || a.len() != b.len() {
                                    push_diag(
                                        &mut rd,
                                        "ODCS_RELATIONSHIP_ARITY",
                                        &lossy(&rp),
                                        "Composite from/to must be nonempty and have equal lengths",
                                        "error",
                                    );
                                    valid = false;
                                } else if a.len() > 128 {
                                    push_diag(&mut rd,"ODCS_RELATIONSHIP_LIMIT",&lossy(&rp),"Composite exceeds 128-column interpretation limit; source retained","error");
                                    valid = false;
                                } else {
                                    for (x, y) in a.iter().zip(b) {
                                        if let (
                                            NativeJsonNode::String(x),
                                            NativeJsonNode::String(y),
                                        ) = (x, y)
                                        {
                                            left.push(x.clone());
                                            right.push(y.clone());
                                        } else {
                                            push_diag(
                                                &mut rd,
                                                "ODCS_RELATIONSHIP_REFERENCE",
                                                &lossy(&rp),
                                                "Composite endpoints must be strings",
                                                "error",
                                            );
                                            valid = false;
                                            break;
                                        }
                                    }
                                }
                            }
                            _ => {
                                push_diag(
                                    &mut rd,
                                    "ODCS_RELATIONSHIP_SHAPE",
                                    &lossy(&rp),
                                    "Schema-level endpoints must both be strings or both arrays",
                                    "error",
                                );
                                valid = false;
                            }
                        }
                    }
                    if valid && rd.is_empty() {
                        let mut candidate_pairs = Vec::new();
                        for j in 0..right.len() {
                            let fp = if left.len() > 1 {
                                child_pointer(
                                    &child_pointer(&rp, &key("from"), ctx)?,
                                    &key(&j.to_string()),
                                    ctx,
                                )?
                            } else {
                                child_pointer(&rp, &key("from"), ctx)?
                            };
                            let frompath = if scope == "property" {
                                Some(path.clone())
                            } else {
                                resolve_odcs_path(source, &left[j], runtime, ctx)?
                            };
                            let tp = if right.len() > 1 {
                                child_pointer(
                                    &child_pointer(&rp, &key("to"), ctx)?,
                                    &key(&j.to_string()),
                                    ctx,
                                )?
                            } else {
                                child_pointer(&rp, &key("to"), ctx)?
                            };
                            let to_path = resolve_odcs_path(source, &right[j], runtime, ctx)?;
                            let from_missing = frompath.is_none();
                            match (frompath, to_path) {
                                (Some(a), Some(b)) => candidate_pairs.push(Value::Object(vec![
                                    (key("fromPath"), Value::String(a)),
                                    (key("toPath"), Value::String(b)),
                                ])),
                                _ => {
                                    let bad_path = if from_missing { fp } else { tp };
                                    push_diag(
                                        &mut rd,
                                        "ODCS_RELATIONSHIP_REFERENCE",
                                        &lossy(&bad_path),
                                        "Relationship endpoint did not resolve",
                                        "error",
                                    );
                                }
                            }
                        }
                        if rd.is_empty() {
                            rowstatus = "resolved";
                            pairs = candidate_pairs;
                        }
                    }
                }
            }
            if !rd.is_empty() {
                *status = "blocked";
            }
            relationships.push(Value::Object(vec![
                (key("path"), Value::String(rp)),
                (key("scope"), Value::string_utf8(scope)),
                (key("status"), Value::string_utf8(rowstatus)),
                (key("pairs"), Value::Array(pairs)),
                (key("diagnostics"), Value::Array(rd)),
            ]));
        }
    } else if fields.iter().any(|(k, _)| k == &key("relationships")) {
        let p = child_pointer(path, &key("relationships"), ctx)?;
        push_diag(
            diagnostics,
            "ODCS_RELATIONSHIP_STRUCTURE",
            &lossy(&p),
            "Expected relationship array",
            "error",
        );
        *status = "blocked";
    }
    if let Some((_, NativeJsonNode::Array(properties))) =
        fields.iter().find(|(k, _)| k == &key("properties"))
    {
        for (i, child) in properties.iter().enumerate() {
            if *limited {
                return Ok(());
            }
            let p = child_pointer(
                &child_pointer(path, &key("properties"), ctx)?,
                &key(&i.to_string()),
                ctx,
            )?;
            walk_odcs_relationship_node(
                child,
                &p,
                "property",
                source,
                runtime,
                max,
                relationships,
                diagnostics,
                status,
                limited,
                ctx,
            )?;
        }
    } else if fields.iter().any(|(k, _)| k == &key("properties")) {
        let p = child_pointer(path, &key("properties"), ctx)?;
        push_diag(
            diagnostics,
            "ODCS_RELATIONSHIP_STRUCTURE",
            &lossy(&p),
            "Expected property array",
            "error",
        );
        *status = "blocked";
    }
    Ok(())
}
fn resolve_odcs_path(
    source: &Value,
    reference: &Utf16,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Option<Utf16>, EngineError> {
    let out = match resolve_odcs_reference(source, reference, &key("foreignKey"), runtime, ctx) {
        Ok(out) => out,
        Err(e) if e.is_control_failure() => return Err(e),
        Err(_) => return Ok(None),
    };
    Ok(field(&out, "target").and_then(|t| as_string(field(t, "path"))))
}

const LINKML_SCALAR_FIELDS: &[(&str, &str)] = &[
    ("domain", "string"),
    ("inherited", "boolean"),
    ("readonly", "string"),
    ("ifabsent", "string"),
    ("list_elements_unique", "boolean"),
    ("list_elements_ordered", "boolean"),
    ("shared", "boolean"),
    ("key", "boolean"),
    ("identifier", "boolean"),
    ("designates_type", "boolean"),
    ("role", "string"),
    ("relational_role", "string"),
    ("range", "string"),
    ("required", "boolean"),
    ("recommended", "boolean"),
    ("multivalued", "boolean"),
    ("inlined", "boolean"),
    ("inlined_as_list", "boolean"),
    ("minimum_value", "number"),
    ("maximum_value", "number"),
    ("pattern", "string"),
    ("value_presence", "string"),
    ("equals_string", "string"),
    ("equals_number", "number"),
    ("equals_expression", "string"),
    ("exact_cardinality", "number"),
    ("minimum_cardinality", "number"),
    ("maximum_cardinality", "number"),
    ("description", "string"),
];

/// Induce only the pinned scalar LinkML slot fields from local declarations.
pub fn inspect_linkml_slot_values(
    document: &Value,
    class_name: &Utf16,
    slot_name: &Utf16,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if slot_name.is_empty() || slot_name.len() > 4096 {
        return Err(error(
            ContractKind::Linkml,
            "SLOT_NAME",
            "Expected bounded slot name",
        ));
    }
    let source = copy_json(document, ctx)?;
    let membership = inspect_linkml_class_slots(&source, class_name, runtime, ctx)?;
    let mut diagnostics = arr(field(&membership, "diagnostics"))
        .cloned()
        .unwrap_or_default();
    let mut status = "resolved";
    let mut fields = Vec::<(Utf16, Value)>::new();
    let mut derivations = Vec::<Value>::new();
    let fail = |diagnostics: &mut Vec<Value>, status: &mut &str, path: &str, message: &str| {
        *status = "blocked";
        push_diag(diagnostics, "LINKML_SLOT_VALUES", path, message, "error");
    };
    if !text_is(field(&membership, "status"), "resolved")
        || !arr(field(&membership, "slots")).is_some_and(|slots| {
            slots
                .iter()
                .any(|s| as_string(field(s, "name")).as_ref() == Some(slot_name))
        })
    {
        fail(
            &mut diagnostics,
            &mut status,
            "",
            "Cannot induce a slot outside resolved local membership",
        );
        return Ok(slot_values_result(
            source,
            class_name,
            slot_name,
            status,
            fields,
            derivations,
            diagnostics,
        ));
    }
    let payload = read_payload(&source, ContractKind::Linkml, runtime, ctx)?;
    let root = payload.root.root();
    let Some(NativeJsonNode::Object(classes)) = object_member(root, "classes") else {
        fail(
            &mut diagnostics,
            &mut status,
            "/classes",
            "Expected local class dictionary",
        );
        return Ok(slot_values_result(
            source,
            class_name,
            slot_name,
            status,
            fields,
            derivations,
            diagnostics,
        ));
    };
    let classmap = classes;
    let ancestors = arr(field(&membership, "ancestors"))
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| as_string(&v))
        .collect::<Vec<_>>();
    let mut base_path = Utf16::default();
    let mut base: Option<&NativeJsonNode> = None;
    let mut attribute = false;
    for ancestor in &ancestors {
        if let Some(class) = classmap.iter().find(|(k, _)| k == ancestor).map(|(_, v)| v) {
            if let Some(NativeJsonNode::Object(attrs)) = object_member(class, "attributes") {
                if let Some((_, decl)) = attrs.iter().find(|(k, _)| k == slot_name) {
                    base_path = child_pointer(
                        &child_pointer(
                            &child_pointer(&key(""), &key("classes"), ctx)?,
                            ancestor,
                            ctx,
                        )?,
                        &key("attributes"),
                        ctx,
                    )?;
                    base_path = child_pointer(&base_path, slot_name, ctx)?;
                    base = Some(decl);
                    attribute = true;
                    break;
                }
            }
        }
    }
    let globals = object_member(root, "slots");
    let globalmap = if let Some(NativeJsonNode::Object(m)) = globals {
        Some(m)
    } else {
        None
    };
    if !attribute {
        base_path = child_pointer(&key(""), &key("slots"), ctx)?;
        base_path = child_pointer(&base_path, slot_name, ctx)?;
        base = globalmap.and_then(|m| m.iter().find(|(k, _)| k == slot_name).map(|(_, v)| v));
    }
    let Some(base) = base else {
        return Ok(slot_values_result(
            source,
            class_name,
            slot_name,
            status,
            fields,
            derivations,
            diagnostics,
        ));
    };
    if !matches!(base, NativeJsonNode::Object(_) | NativeJsonNode::Null) {
        fail(
            &mut diagnostics,
            &mut status,
            &lossy(&base_path),
            "Expected supplied declaration object",
        );
        return Ok(slot_values_result(
            source,
            class_name,
            slot_name,
            status,
            fields,
            derivations,
            diagnostics,
        ));
    }
    if let Some(explicit) = object_member(base, "name") {
        if !matches!(explicit,NativeJsonNode::String(v)if v==slot_name) {
            let p = child_pointer(&base_path, &key("name"), ctx)?;
            fail(
                &mut diagnostics,
                &mut status,
                &lossy(&p),
                "Slot key and explicit name disagree",
            );
            return Ok(slot_values_result(
                source,
                class_name,
                slot_name,
                status,
                fields,
                derivations,
                diagnostics,
            ));
        }
    }
    let mut set_decl = |decl: &NativeJsonNode,
                        path: &Utf16,
                        ctx: &mut Context<'_>,
                        rule: &str,
                        only_truthy: bool,
                        fields: &mut Vec<(Utf16, Value)>,
                        derivations: &mut Vec<Value>,
                        diagnostics: &mut Vec<Value>,
                        status: &mut &str|
     -> Result<(), EngineError> {
        for (field_name, expected) in LINKML_SCALAR_FIELDS {
            let Some(value) = object_member(decl, field_name) else {
                continue;
            };
            if matches!(value, NativeJsonNode::Null) {
                continue;
            }
            let correct = matches!(
                (*expected, value),
                ("string", NativeJsonNode::String(_))
                    | ("boolean", NativeJsonNode::Boolean(_))
                    | ("number", NativeJsonNode::Number(_))
            );
            if !correct {
                let p = child_pointer(path, &key(field_name), ctx)?;
                fail(
                    diagnostics,
                    status,
                    &lossy(&p),
                    &format!("Expected {expected} scalar; loader coercion is not applied"),
                );
                continue;
            }
            if *expected == "number"
                && matches!(
                    field_name,
                    &"equals_number"
                        | &"exact_cardinality"
                        | &"minimum_cardinality"
                        | &"maximum_cardinality"
                )
            {
                if let NativeJsonNode::Number(n) = value {
                    if !native_integer(n, ctx)? {
                        let p = child_pointer(path, &key(field_name), ctx)?;
                        fail(
                            diagnostics,
                            status,
                            &lossy(&p),
                            "Expected exact integer; native integer coercion is not applied",
                        );
                        continue;
                    }
                }
            }
            if rule == "slot-usage" && matches!(*field_name, "minimum_value" | "maximum_value") {
                if let (NativeJsonNode::Number(next), Some((_, old))) =
                    (value, fields.iter().find(|(k, _)| k == &key(field_name)))
                {
                    if let Some(current) = field(old, "value").and_then(as_string) {
                        if let Ok(current) = current.to_utf8() {
                            if let Some(ordering) = decimal_cmp(next, &current, ctx)? {
                                if (*field_name == "minimum_value"
                                    && ordering != std::cmp::Ordering::Greater)
                                    || (*field_name == "maximum_value"
                                        && ordering != std::cmp::Ordering::Less)
                                {
                                    continue;
                                }
                            }
                        }
                    }
                }
            }
            let truth = match value {
                NativeJsonNode::Boolean(v) => *v,
                NativeJsonNode::Number(n) => {
                    decimal_cmp(n, "0", ctx)? != Some(std::cmp::Ordering::Equal)
                }
                NativeJsonNode::String(v) => !v.is_empty(),
                _ => false,
            };
            if only_truthy && (*field_name == "description" || !truth) {
                continue;
            }
            let p = child_pointer(path, &key(field_name), ctx)?;
            let tag = payload
                .root
                .subtree_clone(&p, ctx)?
                .tagged_value_preserving_extras(ctx)?;
            if let Some((_, old)) = fields.iter_mut().find(|(k, _)| k == &key(field_name)) {
                *old = tag.clone();
            } else {
                fields.push((key(field_name), tag.clone()));
            }
            derivations.push(Value::Object(vec![
                (key("field"), Value::string_utf8(field_name)),
                (key("value"), tag),
                (key("path"), Value::String(p)),
                (key("rule"), Value::string_utf8(rule)),
            ]));
        }
        Ok(())
    };
    set_decl(
        base,
        &base_path,
        ctx,
        "base",
        false,
        &mut fields,
        &mut derivations,
        &mut diagnostics,
        &mut status,
    )?;
    if !attribute {
        let Some(globalmap) = globalmap else {
            unreachable!()
        };
        let mut ordered = vec![slot_name.clone()];
        let mut seen = ordered.clone();
        let mut todo = ordered.clone();
        let mut decls = Vec::<(Utf16, &NativeJsonNode, Utf16)>::new();
        while let Some(name) = todo.pop() {
            let Some(decl) = globalmap.iter().find(|(k, _)| k == &name).map(|(_, v)| v) else {
                continue;
            };
            let p = child_pointer(&child_pointer(&key(""), &key("slots"), ctx)?, &name, ctx)?;
            decls.push((name.clone(), decl, p.clone()));
            let mut parents = Vec::new();
            if let Some(mixins) = object_member(decl, "mixins") {
                if let NativeJsonNode::Array(xs) = mixins {
                    for x in xs {
                        if let NativeJsonNode::String(x) = x {
                            parents.push(x.clone());
                        } else {
                            fail(
                                &mut diagnostics,
                                &mut status,
                                &lossy(&p),
                                "Expected explicit parent names",
                            );
                        }
                    }
                } else {
                    let mp = child_pointer(&p, &key("mixins"), ctx)?;
                    fail(
                        &mut diagnostics,
                        &mut status,
                        &lossy(&mp),
                        "Expected explicit parent names",
                    );
                }
            }
            if let Some(is_a) = object_member(decl, "is_a") {
                if let NativeJsonNode::String(v) = is_a {
                    parents.push(v.clone());
                } else {
                    let ip = child_pointer(&p, &key("is_a"), ctx)?;
                    fail(
                        &mut diagnostics,
                        &mut status,
                        &lossy(&ip),
                        "Expected parent name",
                    );
                }
            }
            for parent in parents {
                if !seen.contains(&parent) {
                    seen.push(parent.clone());
                    ordered.push(parent.clone());
                    todo.push(parent);
                }
            }
        }
        for name in ordered.iter().rev() {
            if let Some((_, decl, p)) = decls.iter().find(|(n, _, _)| n == name) {
                set_decl(
                    decl,
                    p,
                    ctx,
                    "slot-inheritance",
                    true,
                    &mut fields,
                    &mut derivations,
                    &mut diagnostics,
                    &mut status,
                )?;
            }
        }
    }
    for ancestor in ancestors.iter().rev() {
        let Some(class) = classmap.iter().find(|(k, _)| k == ancestor).map(|(_, v)| v) else {
            continue;
        };
        let Some(usage) = object_member(class, "slot_usage") else {
            continue;
        };
        let p = child_pointer(
            &child_pointer(
                &child_pointer(&key(""), &key("classes"), ctx)?,
                ancestor,
                ctx,
            )?,
            &key("slot_usage"),
            ctx,
        )?;
        let NativeJsonNode::Object(usages) = usage else {
            fail(
                &mut diagnostics,
                &mut status,
                &lossy(&p),
                "Expected slot usage dictionary",
            );
            continue;
        };
        let Some(decl) = usages.iter().find(|(k, _)| k == slot_name).map(|(_, v)| v) else {
            continue;
        };
        let up = child_pointer(&p, slot_name, ctx)?;
        if !matches!(decl, NativeJsonNode::Object(_) | NativeJsonNode::Null) {
            fail(
                &mut diagnostics,
                &mut status,
                &lossy(&up),
                "Expected supplied declaration object",
            );
            continue;
        }
        set_decl(
            decl,
            &up,
            ctx,
            "slot-usage",
            false,
            &mut fields,
            &mut derivations,
            &mut diagnostics,
            &mut status,
        )?;
    }
    if !fields.iter().any(|(k, _)| k == &key("range")) {
        if let Some(v) = object_member(root, "default_range") {
            if matches!(v, NativeJsonNode::String(_)) {
                let p = key("/default_range");
                let tag = payload
                    .root
                    .subtree_clone(&p, ctx)?
                    .tagged_value_preserving_extras(ctx)?;
                fields.push((key("range"), tag.clone()));
                derivations.push(Value::Object(vec![
                    (key("field"), Value::string_utf8("range")),
                    (key("value"), tag),
                    (key("path"), Value::String(p)),
                    (key("rule"), Value::string_utf8("default-range")),
                ]));
            } else if !matches!(v, NativeJsonNode::Null) {
                fail(
                    &mut diagnostics,
                    &mut status,
                    "/default_range",
                    "Expected range string",
                );
            }
        }
    }
    for (trigger, output_field, rule) in [
        ("identifier", "required", "identifier-required"),
        ("key", "required", "key-required"),
        ("inlined_as_list", "inlined", "list-inlined"),
    ] {
        if fields
            .iter()
            .any(|(k, v)| k == &key(trigger) && tagged_boolean(v) == Some(true))
        {
            let p = derivations
                .iter()
                .rev()
                .find(|d| text_is(field(d, "field"), trigger))
                .and_then(|d| as_string(field(d, "path")))
                .unwrap_or_default();
            let tag = Value::Object(vec![
                (key("kind"), Value::string_utf8("boolean")),
                (key("value"), Value::Bool(true)),
            ]);
            if let Some((_, old)) = fields.iter_mut().find(|(k, _)| k == &key(output_field)) {
                *old = tag.clone();
            } else {
                fields.push((key(output_field), tag.clone()));
            }
            derivations.push(Value::Object(vec![
                (key("field"), Value::string_utf8(output_field)),
                (key("value"), tag),
                (key("path"), Value::String(p)),
                (key("rule"), Value::string_utf8(rule)),
            ]));
        }
    }
    if status == "blocked" {
        fields.clear();
        derivations.clear();
    }
    diagnostics.push(diag_value("LINKML_SLOT_CONTEXT","","29 explicit scalar fields only. Source includes all omitted metadata. No import merging, structured constraints, aliases, owner/domain_of normalization, instance validation or inheritance legality is asserted. Unset scalar fields are omitted; native loader coercion is not performed.","warning"));
    Ok(slot_values_result(
        source,
        class_name,
        slot_name,
        status,
        fields,
        derivations,
        diagnostics,
    ))
}
fn native_integer(token: &str, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let s = token.trim_start_matches('-');
    let (mantissa, exponent) = s.split_once(['e', 'E']).map_or((s, "0"), |(m, e)| (m, e));
    let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    ctx.charge_work(whole.len().saturating_add(fraction.len()), Utf16::default())?;
    let digits = format!("{whole}{fraction}");
    if digits.chars().all(|c| c == '0') {
        return Ok(true);
    }
    ctx.charge_work(exponent.len(), Utf16::default())?;
    let exp = BigInt::parse_bytes(exponent.as_bytes(), 10).unwrap_or_else(|| BigInt::from(0));
    let scale = BigInt::from(fraction.len()) - exp;
    if scale <= BigInt::from(0) {
        return Ok(true);
    }
    let Some(scale) = scale.to_usize() else {
        return Ok(false);
    };
    Ok(digits.chars().rev().take(scale).all(|c| c == '0'))
}
fn decimal_cmp(
    a: &str,
    b: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<std::cmp::Ordering>, EngineError> {
    fn parts(
        s: &str,
        ctx: &mut Context<'_>,
    ) -> Result<Option<(i8, String, BigInt)>, EngineError> {
        let (sign, s) = if let Some(t) = s.strip_prefix('-') {
            (-1, t)
        } else {
            (1, s)
        };
        let (mantissa, exp) = if let Some((m, e)) = s.split_once(['e', 'E']) {
            ctx.charge_work(e.len(), Utf16::default())?;
            let Some(exp) = BigInt::parse_bytes(e.as_bytes(), 10) else {
                return Ok(None);
            };
            (m, exp)
        } else {
            (s, BigInt::from(0))
        };
        let (whole, frac) = mantissa.split_once('.').unwrap_or((mantissa, ""));
        ctx.charge_work(whole.len().saturating_add(frac.len()), Utf16::default())?;
        let joined = format!("{whole}{frac}");
        let digits = joined.trim_start_matches('0').to_owned();
        if digits.is_empty() {
            return Ok(Some((0, String::new(), BigInt::from(0))));
        }
        let power = exp - BigInt::from(frac.len()) + BigInt::from(digits.len());
        Ok(Some((sign, digits, power)))
    }
    let Some((sa, da, pa)) = parts(a, ctx)? else {
        return Ok(None);
    };
    let Some((sb, db, pb)) = parts(b, ctx)? else {
        return Ok(None);
    };
    if sa != sb {
        return Ok(Some(sa.cmp(&sb)));
    }
    if sa == 0 {
        return Ok(Some(std::cmp::Ordering::Equal));
    }
    let mag = if pa != pb {
        pa.cmp(&pb)
    } else {
        let n = da.len().max(db.len());
        da.chars()
            .chain(std::iter::repeat('0'))
            .take(n)
            .cmp(db.chars().chain(std::iter::repeat('0')).take(n))
    };
    Ok(Some(if sa < 0 { mag.reverse() } else { mag }))
}
fn tagged_boolean(value: &Value) -> Option<bool> {
    if text_is(field(value, "kind"), "boolean") {
        if let Some(Value::Bool(v)) = field(value, "value") {
            return Some(*v);
        }
    }
    None
}
fn slot_values_result(
    source: Value,
    class_name: &Utf16,
    slot_name: &Utf16,
    status: &str,
    fields: Vec<(Utf16, Value)>,
    derivations: Vec<Value>,
    diagnostics: Vec<Value>,
) -> Value {
    Value::Object(vec![
        (key("source"), source),
        (key("className"), Value::String(class_name.clone())),
        (key("slotName"), Value::String(slot_name.clone())),
        (
            key("scope"),
            Value::string_utf8("document-scalar-slot-values"),
        ),
        (key("status"), Value::string_utf8(status)),
        (key("complete"), Value::Bool(false)),
        (key("fields"), Value::Object(fields)),
        (key("derivations"), Value::Array(derivations)),
        (key("diagnostics"), Value::Array(diagnostics)),
    ])
}

fn compile(
    source: &str,
    resources: &SchemaResources,
    ctx: &mut Context<'_>,
) -> Result<CompiledSchema, EngineError> {
    let units = source.encode_utf16().collect::<Vec<_>>();
    ctx.charge_text(units.len(), Utf16::default())?;
    let schema = serialization::read_json_value(&units, Format::Json, ctx)?;
    CompiledSchema::compile_consumer(&schema, resources, false, ctx)
}
fn import_document(
    source: &Utf16,
    id: &Utf16,
    format: ContractFormat,
    version: Option<Utf16>,
    kind: ContractKind,
    runtime: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_text(source.len(), Utf16::default())?;
    let root = format.parse(source, kind, ctx)?;
    ctx.charge_work(source.len().saturating_add(id.len()), Utf16::default())?;
    if !matches!(root.root(), NativeJsonNode::Object(_)) {
        return Err(error(kind, "STRUCTURE", structure_message(kind)));
    }
    let payload = ContractPayload {
        kind,
        root,
        original_source: source.clone(),
        original_format: format,
        metamodel_version: version,
        extras: Vec::new(),
    };
    let document = assemble(id, &payload, ctx)?;
    let validation = runtime.inspect(&document, kind, ctx)?;
    if !validation.valid {
        return Err(validation_error(kind, "DOCUMENT", validation));
    }
    Ok(document)
}
fn assemble(id: &Utf16, p: &ContractPayload, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let module = module_name(p.kind);
    let ext = extension(p.kind);
    let mut payload = vec![(key("profile"), Value::string_utf8(profile(p.kind)))];
    if let Some(v) = &p.metamodel_version {
        payload.push((key("metamodelVersion"), Value::String(v.clone())));
    }
    payload.push((key("root"), p.root.tagged_value_preserving_extras(ctx)?));
    payload.push((
        key("originalSource"),
        Value::String(p.original_source.clone()),
    ));
    payload.push((
        key("originalFormat"),
        Value::string_utf8(p.original_format.text()),
    ));
    for (name, value) in &p.extras {
        ctx.charge_work(name.len() + 1, Utf16::default())?;
        payload.push((name.clone(), copy_json(value, ctx)?));
    }
    let element = Value::Object(vec![
        (key("id"), Value::string_utf8(module)),
        (
            key("extensions"),
            Value::Object(vec![(key(ext), Value::Object(payload))]),
        ),
    ]);
    let module_value = Value::Object(vec![
        (key("id"), Value::string_utf8(module)),
        (key("namespace"), Value::string_utf8("")),
        (key("elements"), Value::Array(vec![element])),
    ]);
    Ok(Value::Object(vec![
        (key("umf"), Value::string_utf8(CORE_VERSION)),
        (key("id"), Value::String(id.clone())),
        (
            key("vocabularies"),
            Value::Object(vec![(
                key(ext),
                Value::Object(vec![(key("version"), Value::string_utf8(EXT_VERSION))]),
            )]),
        ),
        (key("modules"), Value::Array(vec![module_value])),
    ]))
}
fn export_document(
    doc: &Value,
    format: Option<ContractFormat>,
    kind: ContractKind,
    rt: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let p = read_payload(doc, kind, rt, ctx)?;
    let target = format.unwrap_or(p.original_format);
    if !p.extras.is_empty() || p.root.has_representation_extras() {
        return Err(error(
            kind,
            "EXPORT",
            "Unknown representation fields cannot be discarded",
        ));
    }
    let archived = p.original_format.parse(&p.original_source, kind, ctx)?;
    if target == p.original_format && archived == p.root {
        return Ok(p.original_source);
    }
    let rendered = p.root.render_compact(ctx)?;
    ctx.charge_text(1, Utf16::default())?;
    let mut units = rendered.into_units();
    units.push(10);
    Ok(Utf16::new(units))
}
fn get_node(
    doc: &Value,
    pointer: &Utf16,
    kind: ContractKind,
    rt: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    read_payload(doc, kind, rt, ctx)?
        .root
        .subtree_clone(pointer, ctx)
}
fn edit_node(
    doc: &Value,
    pointer: &Utf16,
    text: &Utf16,
    kind: ContractKind,
    rt: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let mut p = read_payload(doc, kind, rt, ctx)?;
    let replacement = NativeJsonTree::parse_json(text.units(), ctx)?;
    p.root = p.root.replace_node(pointer, &replacement, ctx)?;
    let mut next = copy_json(doc, ctx)?;
    let tagged = p.root.tagged_value_preserving_extras(ctx)?;
    replace_payload_root(&mut next, kind, tagged)?;
    let validation = rt.inspect(&next, kind, ctx)?;
    if !validation.valid {
        return Err(validation_error(kind, "EDIT", validation));
    }
    Ok((next, validation))
}

fn inspect_payload(
    rt: &ContractRuntime,
    payload: &Value,
    kind: ContractKind,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut ds = vec![diag(
        kind,
        "CONTEXT",
        "",
        context_message(kind),
        Severity::Warning,
    )];
    let Some(root) = field(payload, "root") else {
        ds.push(diag(
            kind,
            "STRUCTURE",
            "",
            "Missing native root",
            Severity::Error,
        ));
        return Ok(ds);
    };
    let tree = NativeJsonTree::from_tagged_value(root, ctx)?;
    for (k, _) in object_fields(payload).unwrap_or(&[]) {
        ctx.charge_work(k.len(), Utf16::default())?;
        if !known_payload_field(kind, k) {
            ds.push(diag(
                kind,
                "REPRESENTATION",
                "",
                "Unknown representation fields remain in UMF",
                Severity::Warning,
            ));
            break;
        }
    }
    inspect_tagged_representation(kind, root, &Utf16::default(), &mut ds, ctx)?;
    if !matches!(tree.root(), NativeJsonNode::Object(_)) {
        ds.push(diag(
            kind,
            "STRUCTURE",
            "",
            structure_message(kind),
            Severity::Error,
        ));
        return Ok(ds);
    }
    let original = field(payload, "originalSource").and_then(as_string);
    let fmt = field(payload, "originalFormat")
        .and_then(as_string)
        .and_then(|v| format_from(&v));
    match (original, fmt) {
        (Some(source), Some(fmt)) => {
            if let Err(e) = fmt.parse(&source, kind, ctx) {
                if e.is_control_failure() {
                    return Err(e);
                }
                ds.push(diag(
                    kind,
                    "ARCHIVE",
                    "/originalSource",
                    &lossy(&e.message),
                    Severity::Error,
                ));
                return Ok(ds);
            }
        }
        _ => {
            ds.push(diag(
                kind,
                "ARCHIVE",
                "/originalSource",
                "Original source and format are required",
                Severity::Error,
            ));
            return Ok(ds);
        }
    }
    let version = if kind == ContractKind::Linkml {
        let selected = field(payload, "metamodelVersion").and_then(as_string);
        let declared = object_member(tree.root(), "metamodel_version");
        if selected.as_ref() != Some(&Utf16::from(LINKML_META))
            || declared.is_some_and(
                |n| !matches!(n,NativeJsonNode::String(v) if Some(v)==selected.as_ref()),
            )
        {
            ds.push(diag(
                kind,
                "VERSION",
                "/metamodel_version",
                "Unrecognized or conflicting metamodel version preserved without interpretation",
                Severity::Warning,
            ));
            return Ok(ds);
        }
        Some(Utf16::from(LINKML_META))
    } else {
        match object_member(tree.root(), "apiVersion") {
            Some(NativeJsonNode::String(v))
                if rt.odcs_schemas.iter().any(|(known, _)| known == v) =>
            {
                Some(v.clone())
            }
            _ => {
                ds.push(diag(
                    kind,
                    "VERSION",
                    "/apiVersion",
                    "Missing or unknown ODCS version preserved without interpretation",
                    Severity::Warning,
                ));
                return Ok(ds);
            }
        }
    };
    let projected = projection(&tree, ctx)?;
    let schema = if kind == ContractKind::Linkml {
        &rt.linkml_schema
    } else {
        &rt.odcs_schemas
            .iter()
            .find(|(v, _)| Some(v) == version.as_ref())
            .unwrap()
            .1
    };
    let errors = schema.validate_native_json_codegen_errors(&projected, ctx)?;
    for e in errors.iter().take(100) {
        ds.push(diag_utf16(
            kind,
            "NATIVE_SCHEMA",
            &e.instance_path,
            &e.message,
            Severity::Warning,
        ));
    }
    if errors.len() > 100 {
        ds.push(diag(
            kind,
            "DIAGNOSTICS_TRUNCATED",
            "",
            "More than 100 native schema diagnostics; first 100 retained",
            Severity::Warning,
        ));
    }
    Ok(ds)
}

fn inspect_tagged_representation(
    kind: ContractKind,
    node: &Value,
    path: &Utf16,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    let Some(Value::String(tag)) = field(node, "kind") else {
        return Ok(());
    };
    let known: &[&str] = match tag.to_utf8().as_deref() {
        Ok("null") => &["kind"],
        Ok("boolean" | "string" | "number") => &["kind", "value"],
        Ok("array") => &["kind", "items"],
        Ok("object") => &["kind", "members"],
        _ => &["kind"],
    };
    for (name, _) in object_fields(node).unwrap_or(&[]) {
        ctx.charge_work(name.len(), path.clone())?;
        if !known.iter().any(|accepted| name == &key(accepted)) {
            diagnostics.push(diag(
                kind,
                "REPRESENTATION",
                &lossy(path),
                "Unknown tagged-tree fields remain in UMF",
                Severity::Warning,
            ));
            break;
        }
    }
    match field(node, "members") {
        Some(Value::Object(members)) => {
            ctx.charge_work(members.len(), path.clone())?;
            for (name, child) in members {
                let child_path = child_pointer(path, name, ctx)?;
                inspect_tagged_representation(kind, child, &child_path, diagnostics, ctx)?;
            }
        }
        _ => {}
    }
    if let Some(Value::Array(items)) = field(node, "items") {
        ctx.charge_work(items.len(), path.clone())?;
        for (index, child) in items.iter().enumerate() {
            let child_path = child_pointer(path, &Utf16::from(index.to_string()), ctx)?;
            inspect_tagged_representation(kind, child, &child_path, diagnostics, ctx)?;
        }
    }
    Ok(())
}

fn child_pointer(parent: &Utf16, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        parent.len().saturating_add(key.len()).saturating_add(1),
        parent.clone(),
    )?;
    let mut units = parent.units().to_vec();
    units.push(b'/' as u16);
    for unit in key.units() {
        match *unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            other => units.push(other),
        }
    }
    Ok(Utf16::new(units))
}

fn read_payload(
    doc: &Value,
    kind: ContractKind,
    rt: &ContractRuntime,
    ctx: &mut Context<'_>,
) -> Result<ContractPayload, EngineError> {
    let v = rt.inspect(doc, kind, ctx)?;
    if !v.valid {
        return Err(validation_error(kind, "DOCUMENT", v));
    }
    if !text_is(field(doc, "umf"), CORE_VERSION) {
        return Err(error(kind, "DOCUMENT", "Unsupported core document version"));
    }
    let ext = extension(kind);
    if !text_is(
        field(
            field(doc, "vocabularies")
                .ok_or_else(|| error(kind, "PAYLOAD", "Missing vocabulary"))?,
            ext,
        )
        .and_then(|v| field(v, "version")),
        EXT_VERSION,
    ) {
        return Err(error(
            kind,
            "PAYLOAD",
            "Missing pinned vocabulary declaration",
        ));
    }
    let module = module_name(kind);
    let m = arr(field(doc, "modules").ok_or_else(|| error(kind, "PAYLOAD", "Missing module"))?)
        .and_then(|a| a.iter().find(|v| text_is(field(v, "id"), module)))
        .ok_or_else(|| error(kind, "PAYLOAD", "Missing native module"))?;
    let e = arr(field(m, "elements").ok_or_else(|| error(kind, "PAYLOAD", "Missing element"))?)
        .and_then(|a| a.iter().find(|v| text_is(field(v, "id"), module)))
        .ok_or_else(|| error(kind, "PAYLOAD", "Missing native element"))?;
    let raw = field(
        field(e, "extensions").ok_or_else(|| error(kind, "PAYLOAD", "Missing extensions"))?,
        ext,
    )
    .ok_or_else(|| error(kind, "PAYLOAD", "Missing native payload"))?;
    let root = NativeJsonTree::from_tagged_value(
        field(raw, "root").ok_or_else(|| error(kind, "PAYLOAD", "Missing root"))?,
        ctx,
    )?;
    let original_source = as_string(
        field(raw, "originalSource")
            .ok_or_else(|| error(kind, "PAYLOAD", "Missing original source"))?,
    )
    .ok_or_else(|| error(kind, "PAYLOAD", "Missing original source"))?;
    let original_format = format_from(
        &as_string(
            field(raw, "originalFormat")
                .ok_or_else(|| error(kind, "FORMAT", "Unsupported native format"))?,
        )
        .unwrap_or_default(),
    )
    .ok_or_else(|| error(kind, "FORMAT", "Unsupported native format"))?;
    let metamodel_version = if kind == ContractKind::Linkml {
        Some(
            as_string(
                field(raw, "metamodelVersion")
                    .ok_or_else(|| error(kind, "PAYLOAD", "Missing metamodel version"))?,
            )
            .unwrap_or_default(),
        )
    } else {
        None
    };
    let extras = object_fields(raw)
        .unwrap_or(&[])
        .iter()
        .filter(|(k, _)| !known_payload_field(kind, k))
        .map(|(k, v)| Ok((k.clone(), copy_json(v, ctx)?)))
        .collect::<Result<Vec<_>, EngineError>>()?;
    Ok(ContractPayload {
        kind,
        root,
        original_source,
        original_format,
        metamodel_version,
        extras,
    })
}
fn projection(tree: &NativeJsonTree, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    native_projection(tree.root(), 0, ctx)
}
fn native_projection(
    node: &NativeJsonNode,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "JSON nesting exceeds the admission limit",
        ));
    }
    Ok(match node {
        NativeJsonNode::Null => Value::Null,
        NativeJsonNode::Boolean(v) => Value::Bool(*v),
        NativeJsonNode::String(v) => Value::String(v.clone()),
        NativeJsonNode::Number(v) => Value::Number(v.parse::<f64>().unwrap_or(f64::INFINITY)),
        NativeJsonNode::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            Value::Array(
                items
                    .iter()
                    .map(|v| native_projection(v, depth + 1, ctx))
                    .collect::<Result<_, _>>()?,
            )
        }
        NativeJsonNode::Object(fields) => {
            ctx.charge_work(fields.len(), Utf16::default())?;
            Value::Object(
                fields
                    .iter()
                    .map(|(k, v)| {
                        ctx.charge_work(k.len(), Utf16::default())?;
                        Ok((k.clone(), native_projection(v, depth + 1, ctx)?))
                    })
                    .collect::<Result<_, EngineError>>()?,
            )
        }
    })
}
fn put_payload(doc: &mut Value, kind: ContractKind, payload: Value) -> Result<(), EngineError> {
    let module = module_name(kind);
    let ext = extension(kind);
    let modules =
        arr_mut(field_mut(doc, "modules").ok_or_else(|| error(kind, "PAYLOAD", "Missing module"))?)
            .ok_or_else(|| error(kind, "PAYLOAD", "Missing module"))?;
    let m = modules
        .iter_mut()
        .find(|v| text_is(field(v, "id"), module))
        .ok_or_else(|| error(kind, "PAYLOAD", "Missing module"))?;
    let elements =
        arr_mut(field_mut(m, "elements").ok_or_else(|| error(kind, "PAYLOAD", "Missing element"))?)
            .ok_or_else(|| error(kind, "PAYLOAD", "Missing element"))?;
    let e = elements
        .iter_mut()
        .find(|v| text_is(field(v, "id"), module))
        .ok_or_else(|| error(kind, "PAYLOAD", "Missing element"))?;
    let ex =
        field_mut(e, "extensions").ok_or_else(|| error(kind, "PAYLOAD", "Missing extensions"))?;
    let Value::Object(fields) = ex else {
        return Err(error(kind, "PAYLOAD", "Invalid extensions"));
    };
    let slot = fields
        .iter_mut()
        .find(|(key, _)| key == &key_utf16(ext))
        .ok_or_else(|| error(kind, "PAYLOAD", "Missing extension"))?;
    slot.1 = payload;
    Ok(())
}

fn replace_payload_root(
    doc: &mut Value,
    kind: ContractKind,
    root: Value,
) -> Result<(), EngineError> {
    let module = module_name(kind);
    let ext = extension(kind);
    let modules =
        arr_mut(field_mut(doc, "modules").ok_or_else(|| error(kind, "PAYLOAD", "Missing module"))?)
            .ok_or_else(|| error(kind, "PAYLOAD", "Missing module"))?;
    let m = modules
        .iter_mut()
        .find(|v| text_is(field(v, "id"), module))
        .ok_or_else(|| error(kind, "PAYLOAD", "Missing module"))?;
    let elements =
        arr_mut(field_mut(m, "elements").ok_or_else(|| error(kind, "PAYLOAD", "Missing element"))?)
            .ok_or_else(|| error(kind, "PAYLOAD", "Missing element"))?;
    let e = elements
        .iter_mut()
        .find(|v| text_is(field(v, "id"), module))
        .ok_or_else(|| error(kind, "PAYLOAD", "Missing element"))?;
    let extensions =
        field_mut(e, "extensions").ok_or_else(|| error(kind, "PAYLOAD", "Missing extensions"))?;
    let raw =
        field_mut(extensions, ext).ok_or_else(|| error(kind, "PAYLOAD", "Missing extension"))?;
    let slot = field_mut(raw, "root").ok_or_else(|| error(kind, "PAYLOAD", "Missing root"))?;
    *slot = root;
    Ok(())
}

fn known_payload_field(k: ContractKind, n: &Utf16) -> bool {
    ["profile", "root", "originalSource", "originalFormat"]
        .contains(&n.to_utf8().unwrap_or_default().as_str())
        || k == ContractKind::Linkml && n == &key("metamodelVersion")
}
fn module_name(k: ContractKind) -> &'static str {
    if k == ContractKind::Linkml {
        "schema"
    } else {
        "contract"
    }
}
fn extension(k: ContractKind) -> &'static str {
    if k == ContractKind::Linkml {
        "umf.linkml"
    } else {
        "umf.odcs"
    }
}
fn profile(k: ContractKind) -> &'static str {
    if k == ContractKind::Linkml {
        "linkml-json-yaml"
    } else {
        "odcs-json-yaml"
    }
}
fn context_message(k: ContractKind) -> &'static str {
    if k == ContractKind::Linkml {
        "YAML 1.1 date-only scalars become lexical strings in the JSON tree; their original spelling remains archived. Metamodel shape checks do not resolve imports, induce classes/slots, normalize defaults, validate instances or run generators; JS numeric precision limits apply and edits regenerate layout with original source retained"
    } else {
        "Contract shape checks do not enforce data quality/SLA rules, resolve references, map physical types or prove exact-number constraints beyond JS precision; edits regenerate layout while retaining original source"
    }
}
fn structure_message(k: ContractKind) -> &'static str {
    if k == ContractKind::Linkml {
        "Expected LINKML contract object"
    } else {
        "Expected ODCS contract object"
    }
}
fn prefix(k: ContractKind) -> &'static str {
    if k == ContractKind::Linkml {
        "LINKML"
    } else {
        "ODCS"
    }
}
fn error(k: ContractKind, s: &str, m: impl Into<String>) -> EngineError {
    EngineError::new(
        format!("{}_{}", prefix(k), s),
        Utf16::default(),
        Utf16::from(m.into()),
    )
}
fn validation_error(k: ContractKind, s: &str, v: Validation) -> EngineError {
    let message = v
        .diagnostics
        .iter()
        .map(|d| format!("{}: {}", lossy(&d.code), lossy(&d.message)))
        .collect::<Vec<_>>()
        .join("\n");
    error(k, s, message)
}
fn diag(k: ContractKind, s: &str, path: &str, msg: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(format!("{}_{}", prefix(k), s)),
        path: Utf16::from(path),
        python_source_path: false,
        message: Utf16::from(msg),
        severity,
        python_text_origin: None,
    }
}
fn diag_utf16(
    k: ContractKind,
    s: &str,
    path: &Utf16,
    msg: &Utf16,
    severity: Severity,
) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(format!("{}_{}", prefix(k), s)),
        path: path.clone(),
        python_source_path: false,
        message: msg.clone(),
        severity,
        python_text_origin: None,
    }
}
fn field<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(f) = v {
        f.iter().find(|(k, _)| k == &key_utf16(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn field_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    if let Value::Object(f) = v {
        f.iter_mut()
            .find(|(k, _)| k == &key_utf16(n))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn object_fields(v: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(f) = v {
        Some(f)
    } else {
        None
    }
}
fn arr<'a>(v: impl Into<Option<&'a Value>>) -> Option<&'a Vec<Value>> {
    let v = v.into()?;
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn arr_mut(v: &mut Value) -> Option<&mut Vec<Value>> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn as_string<'a>(v: impl Into<Option<&'a Value>>) -> Option<Utf16> {
    let v = v.into()?;
    if let Value::String(s) = v {
        Some(s.clone())
    } else {
        None
    }
}
fn text_is(v: Option<&Value>, text: &str) -> bool {
    matches!(v,Some(Value::String(v))if v==&Utf16::from(text))
}
fn object_member<'a>(n: &'a NativeJsonNode, key: &str) -> Option<&'a NativeJsonNode> {
    if let NativeJsonNode::Object(m) = n {
        m.iter().find(|(k, _)| k == &key_utf16(key)).map(|(_, v)| v)
    } else {
        None
    }
}
fn format_from(s: &Utf16) -> Option<ContractFormat> {
    if s == &Utf16::from("json") {
        Some(ContractFormat::Json)
    } else if s == &Utf16::from("yaml") {
        Some(ContractFormat::Yaml)
    } else {
        None
    }
}
fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn key_utf16(s: &str) -> Utf16 {
    key(s)
}
fn lossy(s: &Utf16) -> String {
    String::from_utf16_lossy(s.units())
}

#[cfg(test)]
mod source_contract_tests {
    use super::*;
    fn runtime(ctx: &mut Context<'_>) -> ContractRuntime {
        ContractRuntime::new(ctx).unwrap()
    }
    #[test]
    fn linkml_exact_source_inspection_access_and_copy_edit() {
        let mut ctx = Context::ordinary();
        let runtime = runtime(&mut ctx);
        let source=Utf16::from("{\"id\":\"Example\",\"metamodel_version\":\"1.11.0\",\"count\":123456789012345678901234567890}");
        let mut doc = import_linkml_document(
            &source,
            &Utf16::from("linkml-test"),
            ContractFormat::Json,
            None,
            &runtime,
            &mut ctx,
        )
        .unwrap();
        if let Some(Value::Object(payload_fields)) =
            payload_value_mut(&mut doc, ContractKind::Linkml)
        {
            payload_fields.push((key("futurePayload"), Value::string_utf8("keep")));
        }
        assert_eq!(
            export_linkml_document(&doc, None, &runtime, &mut ctx)
                .unwrap_err()
                .code,
            "LINKML_EXPORT"
        );
        assert!(
            inspect_linkml_document(&doc, &runtime, &mut ctx)
                .unwrap()
                .valid
        );
        assert!(get_linkml_document_node(&doc, &Utf16::from("/count"), &runtime, &mut ctx).is_ok());
        let replacement = Utf16::from("\"edited\"");
        let (edited, _) = propose_linkml_document_node_edit(
            &doc,
            &Utf16::from("/id"),
            &replacement,
            &runtime,
            &mut ctx,
        )
        .unwrap();
        let mut edited_copy = edited.clone();
        let edited_payload = payload_value_mut(&mut edited_copy, ContractKind::Linkml).unwrap();
        assert_eq!(
            field(edited_payload, "futurePayload"),
            Some(&Value::string_utf8("keep"))
        );
        let original_node =
            get_linkml_document_node(&doc, &Utf16::from("/id"), &runtime, &mut ctx).unwrap();
        let edited_node =
            get_linkml_document_node(&edited, &Utf16::from("/id"), &runtime, &mut ctx).unwrap();
        assert!(
            matches!(original_node.root(),NativeJsonNode::String(v)if v==&Utf16::from("Example"))
        );
        assert!(matches!(edited_node.root(),NativeJsonNode::String(v)if v==&Utf16::from("edited")));
    }
    #[test]
    fn linkml_yaml_uses_pyyaml_11_scalar_profile_and_preserves_archive() {
        let mut ctx = Context::ordinary();
        let runtime = runtime(&mut ctx);
        let source=Utf16::from("id: sample\nmetamodel_version: 1.11.0\nflag: y\ncreated: 2026-10-29\ncount: 9_223_372_036_854_775_807\n");
        let doc = import_linkml_document(
            &source,
            &Utf16::from("linkml-yaml"),
            ContractFormat::Yaml,
            None,
            &runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            export_linkml_document(&doc, None, &runtime, &mut ctx).unwrap(),
            source
        );
    }
    #[test]
    fn odcs_unknown_version_remains_inspectable_but_export_refuses_tree_extras() {
        let mut ctx = Context::ordinary();
        let runtime = runtime(&mut ctx);
        let source = Utf16::from(
            "{\"apiVersion\":\"9.9.9\",\"future\":{\"exact\":123456789012345678901234567890}}",
        );
        let mut doc = import_odcs_document(
            &source,
            &Utf16::from("odcs-test"),
            ContractFormat::Json,
            &runtime,
            &mut ctx,
        )
        .unwrap();
        let report = inspect_odcs_document(&doc, &runtime, &mut ctx).unwrap();
        assert!(report
            .diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("ODCS_VERSION")));
        assert_eq!(
            export_odcs_document(&doc, None, &runtime, &mut ctx).unwrap(),
            source
        );
        let raw = payload_value_mut(&mut doc, ContractKind::Odcs).unwrap();
        let Value::Object(fields) = raw else { panic!() };
        let Value::Object(root) = &mut fields
            .iter_mut()
            .find(|(k, _)| k == &key("root"))
            .unwrap()
            .1
        else {
            panic!()
        };
        root.push((key("futureEncoding"), Value::Null));
        assert_eq!(
            export_odcs_document(&doc, None, &runtime, &mut ctx)
                .unwrap_err()
                .code,
            "ODCS_EXPORT"
        );
    }
    #[test]
    fn advanced_local_class_membership_and_odcs_reference_preserve_source() {
        let mut ctx = Context::ordinary();
        let runtime = runtime(&mut ctx);
        let link = import_linkml_document(
            &Utf16::from("{\"id\":\"schema\",\"name\":\"Schema\",\"imports\":[],\"default_range\":\"string\",\"slots\":{\"id\":{\"range\":\"string\"}},\"classes\":{\"Person\":{\"name\":\"Person\",\"slots\":[\"id\"]}}}"),
            &Utf16::from("linkml-class-slots"), ContractFormat::Json, None, &runtime, &mut ctx,
        ).unwrap();
        let membership =
            inspect_linkml_class_slots(&link, &Utf16::from("Person"), &runtime, &mut ctx).unwrap();
        assert_eq!(
            as_string(field(&membership, "status")),
            Some(Utf16::from("resolved"))
        );
        let declarations = arr(field(&membership, "slots"))
            .and_then(|slots| slots.first())
            .and_then(|slot| arr(field(slot, "declarations")))
            .and_then(|decls| decls.first())
            .unwrap();
        assert!(field(declarations, "name").is_none());
        let odcs = import_odcs_document(
            &Utf16::from("{\"apiVersion\":\"v3.2.0\",\"kind\":\"DataContract\",\"id\":\"dc\",\"name\":\"Customer\",\"version\":\"1.0.0\",\"schema\":[{\"id\":\"customers\",\"name\":\"customers\",\"properties\":[{\"id\":\"customer_id\",\"name\":\"customer_id\",\"logicalType\":\"string\"}],\"relationships\":[]}]}"),
            &Utf16::from("odcs-reference"), ContractFormat::Json, &runtime, &mut ctx,
        ).unwrap();
        let resolved = resolve_odcs_reference(
            &odcs,
            &Utf16::from("schema/customers"),
            &Utf16::from("element"),
            &runtime,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            as_string(field(&resolved, "status")),
            Some(Utf16::from("resolved"))
        );
        assert_eq!(
            export_odcs_document(&odcs, None, &runtime, &mut ctx)
                .unwrap()
                .to_utf8()
                .unwrap()
                .contains("customers"),
            true
        );
    }

    #[test]
    fn class_slots_converts_malformed_native_source_to_blocked_diagnostic() {
        let mut ctx = Context::ordinary();
        let runtime = runtime(&mut ctx);
        // A malformed host document is still copied into the blocked report;
        // native inspection failures are diagnostics, not thrown errors.
        let report =
            inspect_linkml_class_slots(&Value::Null, &Utf16::from("Person"), &runtime, &mut ctx)
                .expect("native source failure should be reported");
        assert_eq!(
            as_string(field(&report, "status")),
            Some(Utf16::from("blocked"))
        );
        assert!(
            arr(field(&report, "diagnostics")).is_some_and(|diagnostics| {
                diagnostics.iter().any(|diagnostic| {
                    as_string(field(diagnostic, "code")) == Some(Utf16::from("LINKML_CLASS_SLOTS"))
                        && as_string(field(diagnostic, "severity")) == Some(Utf16::from("error"))
                })
            })
        );
        assert!(field(&report, "source").is_some_and(|source| source == &Value::Null));
    }
    #[test]
    fn linkml_exact_decimal_helpers_cover_zero_and_unbounded_exponents() {
        let mut ctx = Context::ordinary();
        assert!(native_integer("1e100000000000000000000000000000", &mut ctx).unwrap());
        assert!(native_integer("1.2e1", &mut ctx).unwrap());
        assert!(native_integer("-0.00e-999999999999999999999", &mut ctx).unwrap());
        assert!(!native_integer("1e-10000000000000000000000000000", &mut ctx).unwrap());
        assert_eq!(
            decimal_cmp("0e999999999999999999", "-0.00", &mut ctx).unwrap(),
            Some(std::cmp::Ordering::Equal)
        );
        assert_eq!(
            decimal_cmp("1e1000000000000000000000001", "9e100000000000000000000000", &mut ctx).unwrap(),
            Some(std::cmp::Ordering::Greater)
        );
        assert_eq!(decimal_cmp("-0", "0.00", &mut ctx).unwrap(), Some(std::cmp::Ordering::Equal));
    }
    fn payload_value_mut(doc: &mut Value, kind: ContractKind) -> Option<&mut Value> {
        let ext = extension(kind);
        let module = module_name(kind);
        let m = arr_mut(field_mut(doc, "modules")?)?
            .iter_mut()
            .find(|v| text_is(field(v, "id"), module))?;
        let e = arr_mut(field_mut(m, "elements")?)?
            .iter_mut()
            .find(|v| text_is(field(v, "id"), module))?;
        field_mut(field_mut(e, "extensions")?, ext)
    }
}
