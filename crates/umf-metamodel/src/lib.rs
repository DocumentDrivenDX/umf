// SPDX-License-Identifier: MIT OR Apache-2.0
//! Host-independent compiler for the authored current-core metamodel.

use std::collections::{BTreeMap, BTreeSet};

use umf_core::serialization::Format;
use umf_core::{Context, EngineError, Utf16, Value};

pub mod reference;

#[derive(Clone, Debug)]
pub struct CompilerProvenance {
    pub model_sha256: String,
    pub compiler_sha256: String,
}

#[derive(Clone, Debug)]
pub struct CompiledModel {
    pub language: Value,
    /// Portable machine-readable resources consumed by the Bun Ajv assembler
    /// and by current UMF runtimes.
    pub resources: BTreeMap<String, Value>,
    /// Additional declared resources in authored declaration order.
    pub operation_outputs: Vec<(String, Value)>,
    /// Host type/resource sources rendered by the Rust compiler.
    pub sources: BTreeMap<String, String>,
    pub digest: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Output {
    pub path: String,
    pub contents: String,
}

type ModelField<'a> = (String, &'a Value, &'a Value);

/// Parse source independently of generated document validation.
pub fn parse_model(source: &[u16], ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    umf_core::serialization::read_json_value(source, Format::Yaml, ctx)
}

/// Check the closed metamodel vocabulary and produce portable compiled data.
pub fn compile_model(model: &Value, ctx: &mut Context<'_>) -> Result<CompiledModel, EngineError> {
    // Admit the complete authored tree before interpreting only the fields
    // that currently drive generation. Unknown/future content still counts.
    let model = umf_core::copy_json(model, ctx)?;
    // The compiler makes a second semantic pass over the admitted tree; meter
    // that traversal before it creates indexes and generated resources.
    charge_tree(&model, ctx)?;
    let root = get(
        get(&model, "extensions").unwrap_or(&Value::Null),
        "umf.metamodel",
    )
    .ok_or_else(|| {
        shape_error(
            "METAMODEL_ANNOTATION_OBJECT",
            "missing umf.metamodel annotation",
        )
    })?;
    check_annotation(root, true, ctx)?;
    let language = umf_core::copy_json(
        get(root, "language")
            .ok_or_else(|| shape_error("METAMODEL_LANGUAGE", "missing language metadata"))?,
        ctx,
    )?;
    let keys = [
        "version",
        "root",
        "schemaId",
        "semanticReference",
        "semanticReferenceId",
        "packageEnvelope",
        "packageSchemaId",
    ];
    let language_members = members(&language)
        .ok_or_else(|| shape_error("METAMODEL_LANGUAGE", "language metadata must be an object"))?;
    for (key, _) in language_members {
        if !keys.iter().any(|k| key == &Utf16::from(*k)) {
            return Err(shape_error(
                "METAMODEL_LANGUAGE",
                format!(
                    "unknown language property {}",
                    key.to_utf8().unwrap_or_default()
                ),
            ));
        }
    }
    for key in keys {
        let value = get(&language, key).unwrap_or(&Value::Null);
        let valid = if matches!(key, "schemaId" | "semanticReferenceId" | "packageSchemaId") {
            matches!(value,Value::String(s) if !s.is_empty())
        } else {
            text(value).is_some_and(|v| !v.is_empty())
        };
        if !valid {
            return Err(shape_error(
                "METAMODEL_LANGUAGE",
                format!("missing or invalid language property {key}"),
            ));
        }
    }
    let lang_version = text(get(&language, "version").unwrap()).unwrap();
    if text(get(&model, "umf").unwrap_or(&Value::Null)).as_deref() != Some(lang_version.as_str())
        || text(
            get(get(root, "constraints").unwrap_or(&Value::Null), "profile")
                .unwrap_or(&Value::Null),
        )
        .as_deref()
            != Some("umf.constraints/1")
    {
        return Err(shape_error(
            "METAMODEL_LANGUAGE",
            "language version or constraint profile mismatch",
        ));
    }
    if text(
        get(
            get(
                get(&model, "vocabularies").unwrap_or(&Value::Null),
                "umf.metamodel",
            )
            .unwrap_or(&Value::Null),
            "version",
        )
        .unwrap_or(&Value::Null),
    )
    .as_deref()
        != Some("1.2.0")
    {
        return Err(shape_error(
            "METAMODEL_VOCABULARY_VERSION",
            "unsupported metamodel vocabulary version",
        ));
    }
    let id_keys = ["schemaId", "semanticReferenceId", "packageSchemaId"];
    ctx.charge_work(
        id_keys
            .iter()
            .map(|key| match get(&language, key).unwrap() {
                Value::String(value) => value.len(),
                _ => 0,
            })
            .sum(),
        Utf16::default(),
    )?;
    let ids = id_keys.map(|k| match get(&language, k).unwrap() {
        Value::String(value) => value.clone(),
        _ => unreachable!("validated resource id"),
    });
    for id in &ids {
        validate_resource_id(id)?;
    }
    if ids[0] == ids[1] || ids[0] == ids[2] || ids[1] == ids[2] {
        return Err(shape_error(
            "METAMODEL_DUPLICATE_RESOURCE_ID",
            "resource identifiers must be distinct",
        ));
    }
    let constraints = umf_core::copy_json(get(root, "constraints").unwrap(), ctx)?;
    // The metamodel only needs the authored constraint-language validator.
    // The higher-level `constraints::check_program` is a pass-through here,
    // but compiling that runtime module pulls in unrelated adapter modules.
    umf_core::constraint_language::check_program(&constraints, ctx)?;

    let mut fields: Vec<ModelField<'_>> = Vec::new();
    let mut definitions: Vec<ModelField<'_>> = Vec::new();
    let mut field_indices: BTreeMap<String, usize> = BTreeMap::new();
    let mut definition_indices: BTreeMap<String, usize> = BTreeMap::new();
    if let Some(Value::Array(modules)) = get(&model, "modules") {
        for module in modules {
            let module_id = text(get(module, "id").unwrap_or(&Value::Null))
                .ok_or_else(|| shape_error("METAMODEL_DUPLICATE", "module id must be a string"))?;
            if let Some(Value::Array(elements)) = get(module, "elements") {
                for element in elements {
                    let element_id =
                        text(get(element, "id").unwrap_or(&Value::Null)).ok_or_else(|| {
                            shape_error("METAMODEL_DUPLICATE", "element id must be a string")
                        })?;
                    ctx.charge_work(
                        module_id
                            .len()
                            .saturating_add(element_id.len())
                            .saturating_add(1),
                        Utf16::default(),
                    )?;
                    let identity = format!("{module_id}:{element_id}");
                    ctx.charge_work(
                        identity.len().saturating_mul(3).saturating_add(
                            index_depth_work(field_indices.len()).saturating_mul(2),
                        ),
                        Utf16::default(),
                    )?;
                    if field_indices.contains_key(&identity) {
                        return Err(shape_error(
                            "METAMODEL_DUPLICATE",
                            format!("duplicate field {identity}"),
                        ));
                    }
                    field_indices.insert(identity.clone(), fields.len());
                    fields.push((identity.clone(), module, element));
                    let metadata = get(
                        get(element, "extensions").unwrap_or(&Value::Null),
                        "umf.metamodel",
                    )
                    .unwrap_or(&Value::Null);
                    check_annotation(metadata, false, ctx)?;
                    if let Some(name) = text(get(metadata, "definition").unwrap_or(&Value::Null)) {
                        ctx.charge_work(
                            name.len().saturating_mul(3).saturating_add(
                                index_depth_work(definition_indices.len()).saturating_mul(2),
                            ),
                            Utf16::default(),
                        )?;
                        if definition_indices.contains_key(&name) {
                            return Err(shape_error(
                                "METAMODEL_DUPLICATE_DEFINITION",
                                format!("duplicate definition {name}"),
                            ));
                        }
                        definition_indices.insert(name.clone(), definitions.len());
                        definitions.push((name, module, element));
                    }
                }
            }
        }
    }
    let mut targets: Vec<Utf16> = Vec::with_capacity(definitions.len() + 1);
    for (name, _, _) in &definitions {
        ctx.charge_work(name.len(), Utf16::default())?;
        targets.push(Utf16::from(name.as_str()));
    }
    let semantic_id = ids[1].clone();
    ctx.charge_work(semantic_id.len(), Utf16::default())?;
    targets.push(semantic_id.clone());
    let mut target_index = BTreeSet::new();
    for target in &targets {
        ctx.charge_work(
            target
                .len()
                .saturating_add(index_depth_work(target_index.len())),
            Utf16::default(),
        )?;
        target_index.insert(target.units().to_vec());
    }
    let mut defs = Vec::new();
    for (name, _module, element) in &definitions {
        let mut shape = element_shape(element, &fields, &field_indices, ctx)?;
        if text(get(element, "kind").unwrap_or(&Value::Null)).as_deref() == Some("record") {
            if let Some(Value::Array(refs)) = get(element, "members") {
                let mut properties = Vec::new();
                let mut mandatory = Vec::new();
                let mut property_names = BTreeSet::new();
                for reference in refs {
                    let module =
                        text(get(reference, "module").unwrap_or(&Value::Null)).unwrap_or_default();
                    let target =
                        text(get(reference, "element").unwrap_or(&Value::Null)).unwrap_or_default();
                    ctx.charge_work(
                        module.len().saturating_add(target.len()).saturating_add(1),
                        Utf16::default(),
                    )?;
                    let identity = format!("{module}:{target}");
                    ctx.charge_work(
                        identity
                            .len()
                            .saturating_add(index_depth_work(field_indices.len())),
                        Utf16::default(),
                    )?;
                    let field_index = *field_indices.get(&identity).ok_or_else(|| {
                        shape_error(
                            "METAMODEL_DANGLING_MEMBER",
                            format!("missing member {target}"),
                        )
                    })?;
                    let field = &fields[field_index];
                    let fname =
                        text(get(&field.2, "name").unwrap_or(&Value::Null)).ok_or_else(|| {
                            shape_error("METAMODEL_DANGLING_MEMBER", "member has no name")
                        })?;
                    ctx.charge_work(fname.len(), Utf16::default())?;
                    ctx.charge_work(
                        fname
                            .len()
                            .saturating_add(index_depth_work(property_names.len())),
                        Utf16::default(),
                    )?;
                    if !property_names.insert(fname.clone()) {
                        return Err(shape_error(
                            "METAMODEL_DUPLICATE_PROPERTY",
                            format!("duplicate property {fname}"),
                        ));
                    }
                    let fshape = element_shape(field.2, &fields, &field_indices, ctx)?;
                    if text(
                        get(
                            get(&field.2, "extensions").unwrap_or(&Value::Null),
                            "umf.metamodel",
                        )
                        .and_then(|m| get(m, "presence"))
                        .unwrap_or(&Value::Null),
                    )
                    .as_deref()
                        == Some("required")
                    {
                        ctx.charge_work(fname.len(), Utf16::default())?;
                        mandatory.push(Value::string_utf8(fname.clone()));
                    }
                    properties.push((Utf16::from(fname.as_str()), fshape));
                }
                if let Value::Object(items) = &mut shape {
                    items.retain(|(k, _)| k != &Utf16::from("tag"));
                    items.push((Utf16::from("tag"), Value::string_utf8("object")));
                    items.push((Utf16::from("fields"), Value::Object(properties)));
                    if !mandatory.is_empty() {
                        items.push((Utf16::from("mandatory"), Value::Array(mandatory)));
                    }
                }
            }
        }
        if contains_object_fragment(&shape) || contains_min_properties(&shape) {
            return Err(shape_error(
                "METAMODEL_RESOURCE_FRAGMENT_SCOPE",
                "object-fragment and minProperties are only valid in declared operation resources",
            ));
        }
        check_shape_at(&shape, &Utf16::default(), ctx)?;
        let emitted = emit_shape_at(&shape, &target_index, ctx)?;
        ctx.charge_work(name.len(), Utf16::default())?;
        defs.push((Utf16::from(name.as_str()), emitted));
    }
    let core_name = text(get(&language, "root").unwrap()).unwrap();
    let ref_name = text(get(&language, "semanticReference").unwrap()).unwrap();
    let pkg_name = text(get(&language, "packageEnvelope").unwrap()).unwrap();
    let model_title = get(&model, "title")
        .map(|value| umf_core::copy_json(value, ctx))
        .transpose()?;
    let core = schema_resource_with_context(&defs, &core_name, &ids[0], model_title, ctx)?;
    let reference = schema_resource_with_context(&defs, &ref_name, &semantic_id, None, ctx)?;
    let pkg = schema_resource_with_context(&defs, &pkg_name, &ids[2], None, ctx)?;
    let operation_resources =
        compile_operation_resources(get(root, "resources").unwrap_or(&Value::Null), &ids[0], ctx)?;
    let domains = resolve_data(
        get(root, "domains").unwrap_or(&Value::Null),
        &fields,
        &definitions,
        &field_indices,
        &definition_indices,
        ctx,
    )?;
    let literal = get(&domains, "literal").unwrap_or(&Value::Null);
    umf_core::literal_policy::check_policy(literal, ctx)?;
    let mut resources = BTreeMap::new();
    resources.insert("core".into(), core);
    resources.insert("reference".into(), reference);
    resources.insert("pkg".into(), pkg);
    resources.insert("constraints".into(), constraints);
    resources.insert("domains".into(), domains);
    resources.insert("definitions".into(), Value::Object(defs));
    let digest_text = umf_core::serialization::stringify_compact_metered(&model, ctx)?;
    let bytes = digest_text
        .to_utf8()
        .map_err(|_| shape_error("METAMODEL_DIGEST", "invalid UTF-16 in admitted model"))?;
    let digest = {
        use sha2::{Digest, Sha256};
        Some(format!("{:x}", Sha256::digest(bytes.as_bytes())))
    };
    Ok(CompiledModel {
        language,
        resources,
        operation_outputs: operation_resources,
        sources: BTreeMap::new(),
        digest,
    })
}

/// Render stable UTF-8 artifact text. The caller owns filesystem operations.
pub fn render_outputs(
    compiled: &CompiledModel,
    provenance: &CompilerProvenance,
) -> Result<Vec<Output>, EngineError> {
    render_outputs_with_context(compiled, provenance, &mut Context::ordinary())
}

/// Render stable UTF-8 artifacts under the caller's operation budget.
pub fn render_outputs_with_context(
    compiled: &CompiledModel,
    provenance: &CompilerProvenance,
    ctx: &mut Context<'_>,
) -> Result<Vec<Output>, EngineError> {
    for value in compiled.resources.values() {
        charge_tree(value, ctx)?;
    }
    charge_tree(&compiled.language, ctx)?;
    ctx.charge_work(
        provenance
            .model_sha256
            .len()
            .saturating_add(provenance.compiler_sha256.len())
            .saturating_add(512),
        Utf16::default(),
    )?;
    let comment = format!(
        "Generated from spec/metamodel/umf.yaml; model {}; compiler {}",
        provenance.model_sha256, provenance.compiler_sha256
    );
    ctx.charge_work(comment.len().saturating_mul(3), Utf16::default())?;
    let mut core = clone_metered(
        compiled
            .resources
            .get("core")
            .ok_or_else(|| shape_error("METAMODEL_OUTPUT", "missing core schema"))?,
        ctx,
    )?;
    let mut reference = clone_metered(
        compiled
            .resources
            .get("reference")
            .ok_or_else(|| shape_error("METAMODEL_OUTPUT", "missing reference schema"))?,
        ctx,
    )?;
    let mut pkg = clone_metered(
        compiled
            .resources
            .get("pkg")
            .ok_or_else(|| shape_error("METAMODEL_OUTPUT", "missing package schema"))?,
        ctx,
    )?;
    add_member(&mut core, "$comment", Value::string_utf8(comment.clone()));
    add_member(
        &mut reference,
        "$comment",
        Value::string_utf8(comment.clone()),
    );
    add_member(&mut pkg, "$comment", Value::string_utf8(comment.clone()));
    let mut constraints = clone_metered(
        compiled
            .resources
            .get("constraints")
            .ok_or_else(|| shape_error("METAMODEL_OUTPUT", "missing constraints"))?,
        ctx,
    )?;
    add_member(&mut constraints, "provenance", provenance_value(provenance));
    let mut domains = clone_metered(
        compiled
            .resources
            .get("domains")
            .ok_or_else(|| shape_error("METAMODEL_OUTPUT", "missing domains"))?,
        ctx,
    )?;
    add_member(&mut domains, "provenance", provenance_value(provenance));
    let python_shapes = obj(vec![
        ("profile", Value::string_utf8("umf.python-shapes/1")),
        (
            "currentVersion",
            clone_metered(
                get(&compiled.language, "version").unwrap_or(&Value::Null),
                ctx,
            )?,
        ),
        ("schema", clone_metered(&core, ctx)?),
        ("referenceSchema", clone_metered(&reference, ctx)?),
        ("provenance", provenance_value(provenance)),
    ]);
    let annotation_schema = annotation_schema();
    let package = obj(vec![
        ("id", Value::string_utf8("umf.metamodel")),
        ("version", Value::string_utf8("1.2.0")),
        (
            "coreVersion",
            clone_metered(
                get(&compiled.language, "version").unwrap_or(&Value::Null),
                ctx,
            )?,
        ),
        (
            "description",
            Value::string_utf8("Authored UMF language definitions and inert ordered constraints"),
        ),
        ("schema", annotation_schema),
        (
            "semantics",
            Value::string_utf8(
                "Closed declarations are interpreted by the independently bounded metamodel compiler; no raw JSON Schema or executable per-rule callbacks are accepted.",
            ),
        ),
        (
            "scopes",
            Value::Array(vec![
                Value::string_utf8("document"),
                Value::string_utf8("element"),
            ]),
        ),
        (
            "capabilities",
            obj(vec![
                ("validation", Value::string_utf8("structural")),
                ("directions", Value::Array(vec![])),
                ("evidence", Value::Array(vec![])),
            ]),
        ),
    ]);
    let version =
        text(get(&compiled.language, "version").unwrap_or(&Value::Null)).unwrap_or_default();
    let model_ts = render_typescript(&core, &domains, &version, &comment, ctx)?;
    let py_estimate = comment
        .len()
        .saturating_add(version.len().saturating_mul(8))
        .saturating_add(256);
    ctx.charge_work(py_estimate, Utf16::default())?;
    let model_py = format!(
        "# SPDX-License-Identifier: MIT OR Apache-2.0\n# {comment}\nfrom typing import Final, Literal, TypeAlias\nCURRENT_CORE_VERSION: Final = {}\nCoreVersion: TypeAlias = Literal[{}]\n",
        json_compact(&Value::string_utf8(&version))?,
        json_compact(&Value::string_utf8(&version))?
    );
    let json = |value: &Value, ctx: &mut Context<'_>| pretty_json_with_context(value, ctx);
    let mut outputs = vec![
        Output {
            path: "spec/core/schema.json".into(),
            contents: json(&core, ctx)?,
        },
        Output {
            path: "spec/core/semantic-type-reference.schema.json".into(),
            contents: json(&reference, ctx)?,
        },
        Output {
            path: "spec/core/extension-package.schema.json".into(),
            contents: json(&pkg, ctx)?,
        },
        Output {
            path: "spec/metamodel/package.json".into(),
            contents: json(&package, ctx)?,
        },
        Output {
            path: "spec/metamodel/generated/core-constraints.json".into(),
            contents: json(&constraints, ctx)?,
        },
        Output {
            path: "spec/metamodel/generated/domain-policy.json".into(),
            contents: json(&domains, ctx)?,
        },
        Output {
            path: "spec/metamodel/generated/python-shapes.json".into(),
            contents: json(&python_shapes, ctx)?,
        },
        Output {
            path: "python/umf_access/src/umf_access/generated_core.py".into(),
            contents: model_py,
        },
        Output {
            path: "src/generated/core-model.ts".into(),
            contents: model_ts,
        },
    ];
    for (path, value) in &compiled.operation_outputs {
        outputs.push(Output {
            path: path.clone(),
            contents: json(value, ctx)?,
        });
    }
    Ok(outputs)
}

fn core_type_surface_cost(value: &Value) -> usize {
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) => 8,
        Value::String(value) => value.len().saturating_add(8),
        Value::Array(items) => items.iter().fold(items.len(), |cost, value| {
            cost.saturating_add(core_type_surface_cost(value))
        }),
        Value::Object(items) => items.iter().fold(items.len(), |cost, (key, value)| {
            cost.saturating_add(key.len())
                .saturating_add(core_type_surface_cost(value))
        }),
    }
}
fn index_depth_work(len: usize) -> usize {
    (usize::BITS - len.max(1).leading_zeros()) as usize
}

fn compile_operation_resources(
    declarations: &Value,
    core_schema_id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<(String, Value)>, EngineError> {
    let Some(declarations) = arr(Some(declarations)) else {
        return Err(shape_error(
            "METAMODEL_RESOURCE_DECLARATIONS",
            "resources must be an array",
        ));
    };
    if declarations.len() != 4 {
        return Err(shape_error(
            "METAMODEL_RESOURCE_DECLARATIONS",
            "this vocabulary version requires the Facets v3, Cardinality v4, Kind v6, and Nullability v5 resources",
        ));
    }
    let mut paths = BTreeSet::new();
    let mut ids = BTreeSet::new();
    let mut output = Vec::with_capacity(declarations.len());
    for declaration in declarations {
        let Value::Object(fields) = declaration else {
            return Err(shape_error(
                "METAMODEL_RESOURCE_DECLARATION",
                "resource must be an object",
            ));
        };
        let allowed = [
            "path",
            "id",
            "title",
            "externalResourceIds",
            "definitions",
            "root",
        ];
        if fields.len() != allowed.len()
            || fields.iter().any(|(key, _)| {
                key.to_utf8()
                    .ok()
                    .is_none_or(|name| !allowed.contains(&name.as_str()))
            })
        {
            return Err(shape_error(
                "METAMODEL_RESOURCE_DECLARATION",
                "resource fields must be exactly path, id, title, externalResourceIds, definitions, root",
            ));
        }
        let path = text(get(declaration, "path").unwrap_or(&Value::Null))
            .ok_or_else(|| shape_error("METAMODEL_RESOURCE_PATH", "resource path must be text"))?;
        let id = text(get(declaration, "id").unwrap_or(&Value::Null))
            .ok_or_else(|| shape_error("METAMODEL_RESOURCE_ID", "resource id must be text"))?;
        let title = text(get(declaration, "title").unwrap_or(&Value::Null))
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                shape_error(
                    "METAMODEL_RESOURCE_TITLE",
                    "resource title must be non-empty text",
                )
            })?;
        let permitted = [
            (
                "spec/core/facet-operation-v3.schema.json",
                "urn:umf:core:facet-operation:3.0.0",
                "Facet inspection and authoring receipts (Key envelope) (Relationship envelope)",
            ),
            (
                "spec/core/cardinality-operation-v4.schema.json",
                "urn:umf:core:cardinality-operation:4.0.0",
                "Core cardinality inspection and explicit author declaration results (Key envelope) (Relationship envelope)",
            ),
            (
                "spec/core/kind-operation-v6.schema.json",
                "urn:umf:core:kind-operation:6.0.0",
                "Core kind author declaration receipt",
            ),
            (
                "spec/core/nullability-operation-v5.schema.json",
                "urn:umf:core:nullability-operation:5.0.0",
                "Core nullability inspection and explicit author declaration results (Key envelope) (Relationship envelope)",
            ),
        ];
        if !permitted
            .iter()
            .any(|(expected_path, expected_id, expected_title)| {
                path == *expected_path && id == *expected_id && title == *expected_title
            })
            || path.split('/').any(|part| part == ".." || part.is_empty())
            || !path.ends_with(".schema.json")
        {
            return Err(shape_error(
                "METAMODEL_RESOURCE_PATH",
                "unsupported path, id, or title binding",
            ));
        }
        if !paths.insert(path.clone()) || !ids.insert(id.clone()) {
            return Err(shape_error(
                "METAMODEL_RESOURCE_DUPLICATE",
                "resource paths and ids must be unique",
            ));
        }
        validate_resource_id(&Utf16::from(id.as_str()))?;
        let external_ids = arr(get(declaration, "externalResourceIds")).ok_or_else(|| {
            shape_error(
                "METAMODEL_RESOURCE_EXTERNAL_IDS",
                "externalResourceIds must be an array",
            )
        })?;
        if external_ids.len() != 1 || external_ids[0] != Value::String(core_schema_id.clone()) {
            return Err(shape_error(
                "METAMODEL_RESOURCE_EXTERNAL_IDS",
                "operation resources must explicitly allow only the current core schema id",
            ));
        }
        let definitions = arr(get(declaration, "definitions")).ok_or_else(|| {
            shape_error(
                "METAMODEL_RESOURCE_DEFINITIONS",
                "definitions must be an array",
            )
        })?;
        if definitions.is_empty() {
            return Err(shape_error(
                "METAMODEL_RESOURCE_DEFINITIONS",
                "definitions must not be empty",
            ));
        }
        let mut names = BTreeSet::new();
        let mut emitted_defs = Vec::with_capacity(definitions.len());
        for definition in definitions {
            let Value::Object(fields) = definition else {
                return Err(shape_error(
                    "METAMODEL_RESOURCE_DEFINITION",
                    "definition must be an object",
                ));
            };
            if fields.len() != 2
                || fields
                    .iter()
                    .any(|(key, _)| key != &Utf16::from("name") && key != &Utf16::from("shape"))
            {
                return Err(shape_error(
                    "METAMODEL_RESOURCE_DEFINITION",
                    "definition fields must be exactly name and shape",
                ));
            }
            let name = text(get(definition, "name").unwrap_or(&Value::Null))
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    shape_error(
                        "METAMODEL_RESOURCE_DEFINITION",
                        "definition name must be non-empty text",
                    )
                })?;
            if !names.insert(name.clone()) {
                return Err(shape_error(
                    "METAMODEL_RESOURCE_DUPLICATE",
                    "definition names must be unique",
                ));
            }
            emitted_defs.push((
                Utf16::from(name.as_str()),
                get(definition, "shape").unwrap_or(&Value::Null),
            ));
        }
        let external = text(&external_ids[0]).unwrap();
        let targets: BTreeSet<Vec<u16>> = names
            .iter()
            .map(|name| Utf16::from(name.as_str()).units().to_vec())
            .chain([Utf16::from(external.as_str()).units().to_vec()])
            .collect();
        let root = get(declaration, "root").unwrap_or(&Value::Null);
        for (_, shape) in &emitted_defs {
            check_shape_at(shape, &Utf16::default(), ctx)?;
            check_resource_shape(shape, &targets, false, ctx)?;
        }
        check_shape_at(root, &Utf16::default(), ctx)?;
        check_resource_shape(root, &targets, false, ctx)?;
        let mut defs = Vec::with_capacity(emitted_defs.len());
        for (name, shape) in emitted_defs {
            defs.push((
                name,
                reorder_operation_shape(emit_shape_mode(shape, &targets, ctx, true)?)?,
            ));
        }
        let root_schema = reorder_operation_shape(emit_shape_mode(root, &targets, ctx, true)?)?;
        let Value::Object(mut root_members) = root_schema else {
            return Err(shape_error(
                "METAMODEL_RESOURCE_ROOT",
                "root must emit a schema object",
            ));
        };
        let mut members = vec![
            (
                Utf16::from("$schema"),
                Value::string_utf8("https://json-schema.org/draft/2020-12/schema"),
            ),
            (Utf16::from("$id"), Value::string_utf8(id)),
            (Utf16::from("title"), Value::string_utf8(title)),
            (Utf16::from("$defs"), Value::Object(defs)),
        ];
        members.append(&mut root_members);
        output.push((path, Value::Object(members)));
    }
    Ok(output)
}

fn check_resource_shape(
    shape: &Value,
    _targets: &BTreeSet<Vec<u16>>,
    fragment_allowed: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let tag = text(get(shape, "tag").unwrap_or(&Value::Null)).unwrap_or_default();
    if tag == "object-fragment" && !fragment_allowed {
        return Err(shape_error(
            "METAMODEL_RESOURCE_FRAGMENT_SCOPE",
            "object-fragment is only allowed below a conditional condition or yes subtree",
        ));
    }
    if tag == "constant" || tag == "link" {
        return Ok(());
    }
    if tag == "conditional" {
        for key in ["condition", "yes"] {
            if let Some(child) = get(shape, key) {
                check_resource_shape(child, _targets, true, ctx)?;
            }
        }
        if let Some(child) = get(shape, "no") {
            check_resource_shape(child, _targets, false, ctx)?;
        }
    } else {
        for key in [
            "options",
            "fields",
            "properties",
            "item",
            "key",
            "contains",
            "open",
            "value",
            "conditions",
        ] {
            if let Some(Value::Array(items)) = get(shape, key) {
                for child in items {
                    check_resource_shape(child, _targets, fragment_allowed, ctx)?;
                }
            } else if let Some(Value::Object(items)) = get(shape, key) {
                for (_, child) in items {
                    check_resource_shape(child, _targets, fragment_allowed, ctx)?;
                }
            } else if let Some(child) = get(shape, key) {
                if matches!(child, Value::Object(_)) {
                    check_resource_shape(child, _targets, fragment_allowed, ctx)?;
                }
            }
        }
    }
    Ok(())
}

fn reorder_operation_shape(value: Value) -> Result<Value, EngineError> {
    let Value::Object(entries) = value else {
        return Ok(value);
    };
    let mut members = Vec::with_capacity(entries.len());
    for (key, value) in entries {
        let name = key.to_utf8().unwrap_or_default();
        let value = match name.as_str() {
            // These objects are data maps, not JSON Schema keyword maps.
            "const" | "enum" | "required" | "dependentRequired" => value,
            // Preserve property-name order while ordering each property's schema.
            "properties" | "$defs" => match value {
                Value::Object(entries) => Value::Object(
                    entries
                        .into_iter()
                        .map(|(name, schema)| Ok((name, reorder_operation_shape(schema)?)))
                        .collect::<Result<Vec<_>, EngineError>>()?,
                ),
                other => other,
            },
            "oneOf" | "anyOf" | "allOf" => match value {
                Value::Array(entries) => Value::Array(
                    entries
                        .into_iter()
                        .map(reorder_operation_shape)
                        .collect::<Result<Vec<_>, EngineError>>()?,
                ),
                other => other,
            },
            "if"
            | "then"
            | "else"
            | "not"
            | "items"
            | "contains"
            | "propertyNames"
            | "additionalProperties" => reorder_operation_shape(value)?,
            _ => value,
        };
        members.push((key, value));
    }
    let rank = |key: &Utf16| match key.to_utf8().as_deref() {
        Ok("type") => 0,
        Ok("additionalProperties") => 1,
        Ok("required") => 2,
        Ok("properties") => 3,
        Ok("dependentRequired") => 4,
        Ok("minProperties") => 5,
        Ok("propertyNames") => 6,
        Ok("allOf") => 7,
        Ok("if") => 8,
        Ok("then") => 9,
        Ok("else") => 10,
        _ => 11,
    };
    members.sort_by_key(|(key, _)| rank(key));
    Ok(Value::Object(members))
}

fn check_annotation(
    value: &Value,
    document: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if matches!(value, Value::Null) {
        return Ok(());
    }
    let items = members(value).ok_or_else(|| {
        shape_error(
            "METAMODEL_ANNOTATION_OBJECT",
            "annotation must be an object",
        )
    })?;
    let allowed_document = [
        "language",
        "constraints",
        "domains",
        "description",
        "resources",
    ];
    let allowed_element = [
        "description",
        "definition",
        "shape",
        "presence",
        "concept",
        "connections",
        "specializes",
        "role",
    ];
    for (key, v) in items {
        let name = key.to_utf8().unwrap_or_default();
        if !(if document {
            allowed_document.contains(&name.as_str())
        } else {
            allowed_element.contains(&name.as_str())
        }) {
            return Err(shape_error(
                "METAMODEL_ANNOTATION_KEY",
                format!("unknown annotation property {name}"),
            ));
        }
        match name.as_str() {
            "presence" if !matches!(text(v).as_deref(), Some("required" | "optional")) => {
                return Err(shape_error(
                    "METAMODEL_PRESENCE",
                    "presence must be required or optional",
                ));
            }
            "definition" if !text(v).is_some_and(|s| !s.is_empty()) => {
                return Err(shape_error(
                    "METAMODEL_DEFINITION_NAME",
                    "definition must be a non-empty string",
                ));
            }
            "shape" => check_shape_with_context(v, ctx)?,
            _ => {}
        }
    }
    Ok(())
}

fn element_shape(
    element: &Value,
    fields: &[ModelField<'_>],
    field_indices: &BTreeMap<String, usize>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let metadata = get(
        get(element, "extensions").unwrap_or(&Value::Null),
        "umf.metamodel",
    )
    .unwrap_or(&Value::Null);
    let mut shape = if let Some(shape) = get(metadata, "shape") {
        umf_core::copy_json(shape, ctx)?
    } else if let Some(Value::Array(refs)) = get(element, "references") {
        ctx.charge_work(refs.len(), Utf16::default())?;
        if let Some(reference) = refs.iter().find(|r| {
            text(get(r, "role").unwrap_or(&Value::Null)).as_deref() == Some("record-type")
        }) {
            let module = text(get(reference, "module").unwrap_or(&Value::Null)).unwrap_or_default();
            let element_id =
                text(get(reference, "element").unwrap_or(&Value::Null)).unwrap_or_default();
            ctx.charge_work(
                module
                    .len()
                    .saturating_add(element_id.len())
                    .saturating_add(1),
                Utf16::default(),
            )?;
            let identity = format!("{module}:{element_id}");
            ctx.charge_work(
                identity
                    .len()
                    .saturating_add(index_depth_work(field_indices.len())),
                Utf16::default(),
            )?;
            let target_index = *field_indices.get(&identity).ok_or_else(|| {
                shape_error(
                    "METAMODEL_DANGLING_FIELD",
                    format!("missing referenced field {element_id}"),
                )
            })?;
            let target_field = &fields[target_index];
            let target_meta = get(
                get(&target_field.2, "extensions").unwrap_or(&Value::Null),
                "umf.metamodel",
            )
            .unwrap_or(&Value::Null);
            let target =
                text(get(target_meta, "definition").unwrap_or(&Value::Null)).ok_or_else(|| {
                    shape_error(
                        "METAMODEL_DANGLING_FIELD",
                        format!("referenced field {element_id} is not a definition"),
                    )
                })?;
            obj_shape("link", vec![("target", Value::string_utf8(target))])
        } else if let Some(Value::Array(values)) = get(element, "allowedValues") {
            let mut options = Vec::with_capacity(values.len());
            for value in values {
                let scalar = [
                    ("string", get(value, "string")),
                    ("boolean", get(value, "boolean")),
                    ("integerToken", get(value, "integerToken")),
                ]
                .into_iter()
                .find_map(|(_, v)| v);
                let scalar = if let Some(scalar) = scalar {
                    umf_core::copy_json(scalar, ctx)?
                } else {
                    Value::Null
                };
                options.push(obj_shape("constant", vec![("value", scalar)]));
            }
            obj_shape("choice", vec![("options", Value::Array(options))])
        } else if let Some(scalar) = text(get(element, "scalarType").unwrap_or(&Value::Null)) {
            obj_shape(
                if scalar == "string" {
                    "text"
                } else {
                    scalar.as_str()
                },
                vec![],
            )
        } else {
            return Err(shape_error(
                "METAMODEL_FIELD_SHAPE",
                format!(
                    "no shape for {}",
                    text(get(element, "id").unwrap_or(&Value::Null)).unwrap_or_default()
                ),
            ));
        }
    } else if let Some(Value::Array(values)) = get(element, "allowedValues") {
        {
            let mut options = Vec::with_capacity(values.len());
            for value in values {
                let scalar = get(value, "string")
                    .or_else(|| get(value, "boolean"))
                    .or_else(|| get(value, "integerToken"));
                let scalar = if let Some(scalar) = scalar {
                    umf_core::copy_json(scalar, ctx)?
                } else {
                    Value::Null
                };
                options.push(obj_shape("constant", vec![("value", scalar)]));
            }
            obj_shape("choice", vec![("options", Value::Array(options))])
        }
    } else if let Some(scalar) = text(get(element, "scalarType").unwrap_or(&Value::Null)) {
        obj_shape(
            if scalar == "string" {
                "text"
            } else {
                scalar.as_str()
            },
            vec![],
        )
    } else {
        return Err(shape_error(
            "METAMODEL_FIELD_SHAPE",
            format!(
                "no shape for {}",
                text(get(element, "id").unwrap_or(&Value::Null)).unwrap_or_default()
            ),
        ));
    };
    let desc = get(element, "description");
    let has_desc = has(&shape, "description");
    if let (Value::Object(items), Some(Value::String(_description))) = (&mut shape, desc) {
        if !has_desc {
            items.push((
                Utf16::from("description"),
                clone_metered(desc.unwrap(), ctx)?,
            ));
        }
    }
    check_shape_at(&shape, &Utf16::default(), ctx)?;
    Ok(shape)
}
fn obj_shape(tag: &str, mut values: Vec<(&str, Value)>) -> Value {
    let mut members = vec![(Utf16::from("tag"), Value::string_utf8(tag))];
    members.extend(values.drain(..).map(|(k, v)| (Utf16::from(k), v)));
    Value::Object(members)
}

fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn add_member(value: &mut Value, key: &str, new: Value) {
    if let Value::Object(items) = value {
        items.retain(|(k, _)| k != &Utf16::from(key));
        items.push((Utf16::from(key), new));
    }
}
fn annotation_schema() -> Value {
    let mut props = Vec::new();
    for (name, schema) in [
        (
            "language",
            obj(vec![("type", Value::string_utf8("object"))]),
        ),
        (
            "constraints",
            obj(vec![("type", Value::string_utf8("object"))]),
        ),
        ("domains", obj(vec![("type", Value::string_utf8("object"))])),
        (
            "resources",
            obj(vec![
                ("type", Value::string_utf8("array")),
                ("items", obj(vec![("type", Value::string_utf8("object"))])),
            ]),
        ),
        (
            "description",
            obj(vec![("type", Value::string_utf8("string"))]),
        ),
        (
            "definition",
            obj(vec![("type", Value::string_utf8("string"))]),
        ),
        (
            "shape",
            obj(vec![(
                "type",
                Value::Array(vec![
                    Value::string_utf8("object"),
                    Value::string_utf8("boolean"),
                ]),
            )]),
        ),
        (
            "presence",
            obj(vec![(
                "enum",
                Value::Array(vec![
                    Value::string_utf8("required"),
                    Value::string_utf8("optional"),
                ]),
            )]),
        ),
        ("concept", obj(vec![("type", Value::string_utf8("string"))])),
        (
            "connections",
            obj(vec![("type", Value::string_utf8("array"))]),
        ),
        (
            "specializes",
            obj(vec![("type", Value::string_utf8("string"))]),
        ),
        ("role", obj(vec![("type", Value::string_utf8("string"))])),
    ] {
        props.push((Utf16::from(name), schema));
    }
    obj(vec![
        ("type", Value::string_utf8("object")),
        ("properties", Value::Object(props)),
        ("additionalProperties", Value::Bool(false)),
    ])
}
fn json_compact(value: &Value) -> Result<String, EngineError> {
    umf_core::serialization::stringify_compact(value)?
        .to_utf8()
        .map_err(|_| shape_error("METAMODEL_OUTPUT", "invalid generated UTF-16"))
}
fn pretty_json_with_context(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    // First obtain the exact compact UTF-16 representation under the caller's
    // meter, then count the indentation expansion without allocating output.
    let compact = umf_core::serialization::stringify_compact_metered(value, ctx)?;
    let units = compact.units();
    let (mut output_units, mut depth, mut in_string, mut escaped) =
        (units.len() + 1, 0usize, false, false);
    for (index, unit) in units.iter().copied().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
            } else if unit == 92 {
                escaped = true;
            } else if unit == 34 {
                in_string = false;
            }
            continue;
        }
        match unit {
            34 => in_string = true,
            123 | 91 => {
                let close = if unit == 123 { 125 } else { 93 };
                if units.get(index + 1).copied() != Some(close) {
                    depth += 1;
                    output_units = output_units.saturating_add(1 + 2 * depth);
                }
            }
            125 | 93 => {
                let open = if unit == 125 { 123 } else { 91 };
                if index > 0 && units[index - 1] != open {
                    depth = depth.saturating_sub(1);
                    output_units = output_units.saturating_add(1 + 2 * depth);
                }
            }
            44 => output_units = output_units.saturating_add(1 + 2 * depth),
            58 => output_units = output_units.saturating_add(1),
            _ => (),
        }
    }
    ctx.charge_text(output_units, Utf16::default())?;
    ctx.charge_work(output_units.saturating_mul(3), Utf16::default())?;
    fn write(value: &Value, out: &mut String, depth: usize) -> Result<(), EngineError> {
        let indent = |out: &mut String, n: usize| {
            for _ in 0..n {
                out.push_str("  ");
            }
        };
        match value {
            Value::Null => out.push_str("null"),
            Value::Bool(v) => out.push_str(if *v { "true" } else { "false" }),
            Value::Number(v) => out.push_str(&umf_core::ecma_number_to_string(*v)),
            Value::String(v) => out.push_str(&json_compact(&Value::String(v.clone()))?),
            Value::Array(items) => {
                if items.is_empty() {
                    out.push_str("[]")
                } else {
                    out.push_str("[\n");
                    for (i, v) in items.iter().enumerate() {
                        indent(out, depth + 1);
                        write(v, out, depth + 1)?;
                        if i + 1 < items.len() {
                            out.push(',')
                        }
                        out.push('\n');
                    }
                    indent(out, depth);
                    out.push(']')
                }
            }
            Value::Object(items) => {
                if items.is_empty() {
                    out.push_str("{}")
                } else {
                    out.push_str("{\n");
                    for (i, (k, v)) in items.iter().enumerate() {
                        indent(out, depth + 1);
                        out.push_str(&json_compact(&Value::String(k.clone()))?);
                        out.push_str(": ");
                        write(v, out, depth + 1)?;
                        if i + 1 < items.len() {
                            out.push(',')
                        }
                        out.push('\n');
                    }
                    indent(out, depth);
                    out.push('}')
                }
            }
        }
        Ok(())
    }
    let mut out = String::with_capacity(output_units.saturating_mul(3));
    write(value, &mut out, 0)?;
    out.push('\n');
    Ok(out)
}

fn render_typescript(
    core: &Value,
    domains: &Value,
    version: &str,
    comment: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    charge_tree(core, ctx)?;
    charge_tree(domains, ctx)?;
    let work_estimate = core_type_surface_cost(core)
        .saturating_mul(4)
        .saturating_add(core_type_surface_cost(domains).saturating_mul(4))
        .saturating_add(version.len())
        .saturating_add(comment.len())
        .saturating_add(2048);
    ctx.charge_work(work_estimate, Utf16::default())?;
    fn quote(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
        umf_core::serialization::stringify_compact_metered(value, ctx)?
            .to_utf8()
            .map_err(|_| shape_error("METAMODEL_OUTPUT", "invalid generated UTF-16"))
    }
    fn type_name(name: &str) -> String {
        match name {
            "document" => "Document".to_owned(),
            "module" => "Module".to_owned(),
            "element" => "Element".to_owned(),
            "itemType" => "CoreItemTypeReference".to_owned(),
            "semanticType" => "CoreSemanticTypeReference".to_owned(),
            _ => {
                let mut c = name.chars();
                c.next()
                    .map(|x| x.to_uppercase().collect::<String>() + c.as_str())
                    .unwrap_or_default()
            }
        }
    }
    fn type_of(schema: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        if matches!(schema, Value::Bool(true)) {
            return Ok("unknown".into());
        }
        if matches!(schema, Value::Bool(false)) {
            return Ok("never".into());
        }
        if let Some(reference) = text(get(schema, "$ref").unwrap_or(&Value::Null)) {
            let name = if let Some((_, n)) = reference.rsplit_once("#/$defs/") {
                n.to_owned()
            } else if reference.contains("semantic-type-reference") {
                "semanticType".into()
            } else {
                reference
            };
            return Ok(type_name(&name));
        }
        if let Some(value) = get(schema, "const") {
            return quote(value, ctx);
        }
        if let Some(values) = arr(get(schema, "enum")) {
            let mut types = Vec::with_capacity(values.len());
            for value in values {
                types.push(quote(value, ctx)?);
            }
            return Ok(types.join(" | "));
        }
        for key in ["anyOf", "oneOf"] {
            if let Some(values) = arr(get(schema, key)) {
                let mut types = Vec::with_capacity(values.len());
                for value in values {
                    types.push(type_of(value, ctx)?);
                }
                return Ok(types.join(" | "));
            }
        }
        if text(get(schema, "type").unwrap_or(&Value::Null)).as_deref() == Some("array") {
            return Ok(format!(
                "({})[]",
                type_of(get(schema, "items").unwrap_or(&Value::Object(vec![])), ctx)?
            ));
        }
        if text(get(schema, "type").unwrap_or(&Value::Null)).as_deref() == Some("object") {
            let props = members(get(schema, "properties").unwrap_or(&Value::Null)).unwrap_or(&[]);
            let required = arr(get(schema, "required")).unwrap_or(&[]);
            ctx.charge_work(required.len(), Utf16::default())?;
            let mut required_names: BTreeSet<Vec<u16>> = BTreeSet::new();
            for name in required {
                if let Value::String(name) = name {
                    ctx.charge_work(
                        name.len()
                            .saturating_add(index_depth_work(required_names.len())),
                        Utf16::default(),
                    )?;
                    required_names.insert(name.units().to_vec());
                }
            }
            let mut out = String::from("{");
            for (key, child) in props {
                ctx.charge_work(
                    1usize
                        .saturating_add(key.len())
                        .saturating_add(index_depth_work(required_names.len())),
                    Utf16::default(),
                )?;
                let is_required = required_names.contains(key.units());
                out.push_str(&format!(
                    "{}{}:{};",
                    quote(&Value::String(key.clone()), ctx)?,
                    if is_required { "" } else { "?" },
                    type_of(child, ctx)?
                ));
            }
            match get(schema, "additionalProperties") {
                Some(Value::Bool(false)) => {}
                Some(Value::Bool(true)) | None => out.push_str("[key:string]:unknown;"),
                Some(value) => out.push_str(&format!("[key:string]:{};", type_of(value, ctx)?)),
            }
            out.push('}');
            return Ok(out);
        }
        if let Some(values) = arr(get(schema, "allOf")) {
            let mut types = Vec::with_capacity(values.len());
            for value in values {
                types.push(type_of(value, ctx)?);
            }
            return Ok(types.join(" & "));
        }
        Ok(
            match text(get(schema, "type").unwrap_or(&Value::Null)).as_deref() {
                Some("string") => "string",
                Some("integer" | "number") => "number",
                Some("boolean") => "boolean",
                Some("null") => "null",
                _ => "unknown",
            }
            .into(),
        )
    }
    let defs = members(get(core, "$defs").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let mut types = Vec::new();
    for (name, schema) in defs {
        ctx.charge_work(name.len(), Utf16::default())?;
        let name = name
            .to_utf8()
            .map_err(|_| shape_error("METAMODEL_OUTPUT", "invalid schema definition name"))?;
        types.push(format!(
            "export type {} = {};",
            type_name(&name),
            if name == "extensions" {
                "{[key:string]:Json}".into()
            } else {
                type_of(schema, ctx)?
            }
        ));
    }
    let mut doc = clone_metered(core, ctx)?;
    if let Value::Object(items) = &mut doc {
        items.retain(|(k, _)| k != &Utf16::from("$defs"));
    }
    types.push(format!("export type Document = {};", type_of(&doc, ctx)?));
    let vocabulary = get(domains, "vocabulary").unwrap_or(&Value::Null);
    let vocabulary_members = members(vocabulary).unwrap_or(&[]);
    let mut vocabulary_entries = Vec::with_capacity(vocabulary_members.len());
    for (key, value) in vocabulary_members {
        ctx.charge_work(key.len(), Utf16::default())?;
        vocabulary_entries.push(format!(
            "{}:Object.freeze({} as const)",
            quote(&Value::String(key.clone()), ctx)?,
            quote(value, ctx)?
        ));
    }
    let vocab = vocabulary_entries.join(",");
    let result = format!(
        "// SPDX-License-Identifier: MIT OR Apache-2.0\n// {comment}\nexport const CURRENT_CORE_VERSION={} as const;\nexport {{default as coreSchema}} from '../../spec/core/schema.json';\nexport {{default as semanticTypeReferenceSchema}} from '../../spec/core/semantic-type-reference.schema.json';\nexport {{default as extensionPackageSchema}} from '../../spec/core/extension-package.schema.json';\nexport {{default as coreConstraints}} from '../../spec/metamodel/generated/core-constraints.json';\nexport {{default as domainPolicy}} from '../../spec/metamodel/generated/domain-policy.json';\nexport const coreVocabulary=Object.freeze({{{vocab}}});\nexport type Json=null|boolean|number|string|Json[]|{{[key:string]:Json}};\n{}\n",
        quote(&Value::string_utf8(version), ctx)?,
        types.join("\n")
    );
    Ok(result)
}

fn validate_resource_id(id: &Utf16) -> Result<(), EngineError> {
    if id.units().contains(&(b'#' as u16)) {
        return Err(shape_error(
            "METAMODEL_RESOURCE_ID",
            "resource identifiers must not contain fragments",
        ));
    }
    // WHATWG URL input is a WebIDL USVString: unpaired UTF-16 units become
    // U+FFFD for validation, while the original UTF-16 identity remains stored.
    let validation = String::from_utf16_lossy(id.units());
    if url::Url::parse(&validation).is_err() {
        return Err(shape_error(
            "METAMODEL_RESOURCE_ID",
            "resource identifier must be an absolute URI",
        ));
    }
    Ok(())
}

#[cfg(test)]
fn schema_resource(
    definitions: &[(Utf16, Value)],
    name: &str,
    id: &Utf16,
    title: Option<Value>,
) -> Result<Value, EngineError> {
    schema_resource_with_context(definitions, name, id, title, &mut Context::ordinary())
}

fn schema_resource_with_context(
    definitions: &[(Utf16, Value)],
    name: &str,
    id: &Utf16,
    title: Option<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(definitions.len(), Utf16::default())?;
    let (_, root) = definitions
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .ok_or_else(|| {
            shape_error(
                "METAMODEL_MISSING_ROOT",
                format!("missing definition {name}"),
            )
        })?;
    ctx.charge_work(id.len(), Utf16::default())?;
    let mut out = vec![
        (
            Utf16::from("$schema"),
            Value::string_utf8("https://json-schema.org/draft/2020-12/schema"),
        ),
        (Utf16::from("$id"), Value::String(id.clone())),
    ];
    if let Some(title) = title {
        out.push((Utf16::from("title"), title));
    }
    if let Value::Object(items) = root {
        for (key, value) in items {
            if key != &Utf16::from("$defs") {
                ctx.charge_work(key.len(), Utf16::default())?;
                out.push((key.clone(), clone_metered(value, ctx)?));
            }
        }
    }
    let mut defs = Vec::new();
    for (key, value) in definitions
        .iter()
        .filter(|(key, _)| key != &Utf16::from(name))
    {
        ctx.charge_work(key.len(), Utf16::default())?;
        defs.push((key.clone(), clone_metered(value, ctx)?));
    }
    out.push((Utf16::from("$defs"), Value::Object(defs)));
    Ok(Value::Object(out))
}

fn resolve_data(
    value: &Value,
    fields: &[ModelField<'_>],
    definitions: &[ModelField<'_>],
    field_indices: &BTreeMap<String, usize>,
    definition_indices: &BTreeMap<String, usize>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match value {
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(resolve_data(
                    item,
                    fields,
                    definitions,
                    field_indices,
                    definition_indices,
                    ctx,
                )?);
            }
            Ok(Value::Array(out))
        }
        Value::Object(items) => {
            for marker in ["$members", "$values", "$keys"] {
                if let Some(v) = get(value, marker) {
                    if items.len() != 1 {
                        return Err(shape_error(
                            "METAMODEL_DATA_REFERENCE",
                            "data reference must be the sole object member",
                        ));
                    }
                    let name = text(v).ok_or_else(|| {
                        shape_error(
                            "METAMODEL_DATA_REFERENCE",
                            "reference name must be a string",
                        )
                    })?;
                    if marker == "$members" {
                        ctx.charge_work(
                            name.len()
                                .saturating_add(index_depth_work(definition_indices.len())),
                            Utf16::default(),
                        )?;
                        let definition_index = *definition_indices.get(&name).ok_or_else(|| {
                            shape_error(
                                "METAMODEL_MEMBER_REFERENCE",
                                format!("unknown member reference {name}"),
                            )
                        })?;
                        let record = definitions[definition_index].2;
                        let refs = arr(get(record, "members")).ok_or_else(|| {
                            shape_error(
                                "METAMODEL_MEMBER_REFERENCE",
                                format!("definition {name} has no members"),
                            )
                        })?;
                        ctx.charge_work(refs.len(), Utf16::default())?;
                        let mut names = Vec::with_capacity(refs.len());
                        for r in refs {
                            let module =
                                text(get(r, "module").unwrap_or(&Value::Null)).unwrap_or_default();
                            let el =
                                text(get(r, "element").unwrap_or(&Value::Null)).unwrap_or_default();
                            ctx.charge_work(
                                module.len().saturating_add(el.len()).saturating_add(1),
                                Utf16::default(),
                            )?;
                            let identity = format!("{module}:{el}");
                            ctx.charge_work(
                                identity
                                    .len()
                                    .saturating_add(index_depth_work(field_indices.len())),
                                Utf16::default(),
                            )?;
                            let field_index = *field_indices.get(&identity).ok_or_else(|| {
                                shape_error(
                                    "METAMODEL_MEMBER_REFERENCE",
                                    format!("unknown member {el}"),
                                )
                            })?;
                            let field = &fields[field_index];
                            let member_name = text(get(&field.2, "name").unwrap_or(&Value::Null))
                                .ok_or_else(|| {
                                shape_error("METAMODEL_MEMBER_REFERENCE", "member has no name")
                            })?;
                            ctx.charge_work(member_name.len(), Utf16::default())?;
                            names.push(Value::string_utf8(member_name));
                        }
                        return Ok(Value::Array(names));
                    }
                    if marker == "$values" {
                        ctx.charge_work(
                            name.len()
                                .saturating_add(index_depth_work(definition_indices.len())),
                            Utf16::default(),
                        )?;
                        let definition_index = *definition_indices.get(&name).ok_or_else(|| {
                            shape_error(
                                "METAMODEL_VALUE_REFERENCE",
                                format!("unknown value reference {name}"),
                            )
                        })?;
                        let element = definitions[definition_index].2;
                        let shape = element_shape(element, fields, field_indices, ctx)?;
                        let options = arr(get(&shape, "options")).ok_or_else(|| {
                            shape_error(
                                "METAMODEL_VALUE_REFERENCE",
                                format!("definition {name} is not a choice"),
                            )
                        })?;
                        let mut values = Vec::new();
                        for option in options {
                            if text(get(option, "tag").unwrap_or(&Value::Null)).as_deref()
                                != Some("constant")
                            {
                                return Err(shape_error(
                                    "METAMODEL_VALUE_REFERENCE",
                                    format!("definition {name} is not a constant choice"),
                                ));
                            }
                            values.push(clone_metered(get(option, "value").unwrap(), ctx)?);
                        }
                        return Ok(Value::Array(values));
                    }
                    ctx.charge_work(name.len().saturating_add(4), Utf16::default())?;
                    let identity = format!("umf:{name}");
                    ctx.charge_work(
                        identity
                            .len()
                            .saturating_add(index_depth_work(field_indices.len())),
                        Utf16::default(),
                    )?;
                    let field_index = *field_indices.get(&identity).ok_or_else(|| {
                        shape_error(
                            "METAMODEL_KEY_REFERENCE",
                            format!("unknown key reference {name}"),
                        )
                    })?;
                    let element = fields[field_index].2;
                    let shape = element_shape(element, fields, field_indices, ctx)?;
                    let props = members(get(&shape, "fields").unwrap_or(&Value::Null)).ok_or_else(
                        || {
                            shape_error(
                                "METAMODEL_KEY_REFERENCE",
                                format!("field {name} is not an object"),
                            )
                        },
                    )?;
                    ctx.charge_work(props.len(), Utf16::default())?;
                    let mut keys = Vec::with_capacity(props.len());
                    for (key, _) in props {
                        ctx.charge_work(key.len(), Utf16::default())?;
                        keys.push(Value::String(key.clone()));
                    }
                    return Ok(Value::Array(keys));
                }
            }
            let mut out = Vec::with_capacity(items.len());
            ctx.charge_work(items.len(), Utf16::default())?;
            for (k, v) in items {
                ctx.charge_work(k.len(), Utf16::default())?;
                out.push((
                    k.clone(),
                    resolve_data(
                        v,
                        fields,
                        definitions,
                        field_indices,
                        definition_indices,
                        ctx,
                    )?,
                ));
            }
            Ok(Value::Object(out))
        }
        _ => clone_metered(value, ctx),
    }
}

/// Included in CLI responses; keeps compiler provenance in UTF-16-free metadata.
pub fn provenance_value(provenance: &CompilerProvenance) -> Value {
    Value::Object(vec![
        (
            Utf16::from("modelSha256"),
            Value::string_utf8(&provenance.model_sha256),
        ),
        (
            Utf16::from("compilerSha256"),
            Value::string_utf8(&provenance.compiler_sha256),
        ),
    ])
}

/// Validate one grammar shape. This walks every nested branch, including an
/// untaken conditional arm, so unknown operations cannot hide in dead code.
pub fn check_shape(shape: &Value) -> Result<(), EngineError> {
    check_shape_with_context(shape, &mut Context::ordinary())
}

pub fn check_shape_with_context(shape: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let admitted = umf_core::copy_json(shape, ctx)?;
    check_shape_at(&admitted, &Utf16::default(), ctx)
}

pub fn emit_shape(shape: &Value, targets: &[Utf16]) -> Result<Value, EngineError> {
    emit_shape_with_context(shape, targets, &mut Context::ordinary())
}

pub fn emit_shape_with_context(
    shape: &Value,
    targets: &[Utf16],
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let admitted_shape = umf_core::copy_json(shape, ctx)?;
    check_shape_at(&admitted_shape, &Utf16::default(), ctx)?;
    // Treat the target list as its own ordinary JSON tree. Charge before
    // constructing the temporary array, then admit it once for depth/count.
    let target_work = targets.iter().fold(targets.len(), |work, target| {
        work.saturating_add(target.len())
    });
    ctx.charge_work(target_work, Utf16::default())?;
    let target_input = Value::Array(targets.iter().cloned().map(Value::String).collect());
    let admitted_targets = umf_core::copy_json(&target_input, ctx)?;
    let Value::Array(admitted_targets) = admitted_targets else {
        unreachable!("copying an array preserves its type")
    };
    let mut target_index = BTreeSet::new();
    for target in admitted_targets {
        let Value::String(target) = target else {
            unreachable!("target input is an array of strings")
        };
        ctx.charge_work(
            target
                .len()
                .saturating_add(index_depth_work(target_index.len())),
            Utf16::default(),
        )?;
        target_index.insert(target.units().to_vec());
    }
    emit_shape_at(&admitted_shape, &target_index, ctx)
}

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(items) => items
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn members(value: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(items) = value {
        Some(items)
    } else {
        None
    }
}
fn text(value: &Value) -> Option<String> {
    if let Value::String(v) = value {
        v.to_utf8().ok()
    } else {
        None
    }
}
fn arr(value: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(v)) = value {
        Some(v)
    } else {
        None
    }
}
fn has(value: &Value, key: &str) -> bool {
    get(value, key).is_some()
}
fn shape_error(code: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, Utf16::default(), message.into())
}
fn clone_metered(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Null => Ok(Value::Null),
        Value::Bool(v) => Ok(Value::Bool(*v)),
        Value::Number(v) => Ok(Value::Number(*v)),
        Value::String(v) => {
            ctx.charge_work(v.len(), Utf16::default())?;
            Ok(Value::String(v.clone()))
        }
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(clone_metered(item, ctx)?);
            }
            Ok(Value::Array(out))
        }
        Value::Object(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut out = Vec::with_capacity(items.len());
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                out.push((key.clone(), clone_metered(item, ctx)?));
            }
            Ok(Value::Object(out))
        }
    }
}
fn charge_tree(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::String(text) => ctx.charge_work(text.len(), Utf16::default())?,
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            for item in items {
                charge_tree(item, ctx)?;
            }
        }
        Value::Object(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                charge_tree(item, ctx)?;
            }
        }
        _ => (),
    }
    Ok(())
}

fn contains_object_fragment(value: &Value) -> bool {
    text(get(value, "tag").unwrap_or(&Value::Null)).as_deref() == Some("object-fragment")
        || neutral_shape_children(value)
            .into_iter()
            .any(contains_object_fragment)
}

fn contains_min_properties(value: &Value) -> bool {
    (text(get(value, "tag").unwrap_or(&Value::Null)).as_deref() == Some("object")
        && has(value, "minProperties"))
        || neutral_shape_children(value)
            .into_iter()
            .any(contains_min_properties)
}

fn neutral_shape_children(shape: &Value) -> Vec<&Value> {
    let tag = text(get(shape, "tag").unwrap_or(&Value::Null)).unwrap_or_default();
    if matches!(tag.as_str(), "constant" | "link") {
        return Vec::new();
    }
    let keys: &[&str] = match tag.as_str() {
        "object" => &["fields", "open", "key", "conditions"],
        "object-fragment" => &["properties"],
        "sequence" => &["item", "contains"],
        "choice" | "exclusive-choice" | "all" => &["options"],
        "conditional" => &["condition", "yes", "no"],
        "not" => &["value"],
        _ => &[],
    };
    let mut children = Vec::new();
    for key in keys {
        match get(shape, key) {
            Some(Value::Object(members)) => children.extend(members.iter().map(|(_, value)| value)),
            Some(Value::Array(items)) => children.extend(items),
            Some(child) if matches!(child, Value::Object(_)) => children.push(child),
            _ => (),
        }
    }
    children
}

fn check_shape_at(shape: &Value, path: &Utf16, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    let Value::Object(fields) = shape else {
        if matches!(shape, Value::Bool(_)) {
            return Ok(());
        }
        return Err(shape_error(
            "METAMODEL_UNKNOWN_SHAPE",
            "shape must be an object or boolean",
        ));
    };
    let tag = text(get(shape, "tag").unwrap_or(&Value::Null))
        .ok_or_else(|| shape_error("METAMODEL_UNKNOWN_SHAPE", "shape tag must be a string"))?;
    let common = ["tag", "description"];
    let allowed: &[&str] = match tag.as_str() {
        "any" => &[],
        "object" => &[
            "fields",
            "mandatory",
            "open",
            "key",
            "requires",
            "conditions",
            "minProperties",
        ],
        "object-fragment" => &["required", "properties"],
        "sequence" => &["item", "min", "max", "unique", "contains"],
        "text" => &["min", "max", "pattern"],
        "integer" | "number" => &["min", "max"],
        "boolean" | "null" => &[],
        "link" => &["target"],
        "constant" => &["value"],
        "choice" | "exclusive-choice" | "all" => &["options"],
        "not" => &["value"],
        "conditional" => &["condition", "yes", "no"],
        _ => {
            return Err(shape_error(
                "METAMODEL_UNKNOWN_SHAPE",
                format!("unknown shape {tag}"),
            ));
        }
    };
    for (key, _) in fields {
        let key = key
            .to_utf8()
            .map_err(|_| shape_error("METAMODEL_SHAPE_KEY", "non-UTF8 shape key"))?;
        if !common.contains(&key.as_str()) && !allowed.contains(&key.as_str()) {
            return Err(shape_error(
                "METAMODEL_SHAPE_KEY",
                format!("unknown shape property {key}"),
            ));
        }
    }
    if tag == "link"
        && !text(get(shape, "target").unwrap_or(&Value::Null)).is_some_and(|v| !v.is_empty())
    {
        return Err(shape_error(
            "METAMODEL_LINK_TARGET",
            "link target must be a non-empty string",
        ));
    }
    if ["choice", "exclusive-choice", "all"].contains(&tag.as_str())
        && arr(get(shape, "options")).is_none_or(|v| v.is_empty())
    {
        return Err(shape_error(
            "METAMODEL_SHAPE_OPTIONS",
            "shape options must be a non-empty array",
        ));
    }
    if tag == "constant" && !has(shape, "value") {
        return Err(shape_error(
            "METAMODEL_CONSTANT_VALUE",
            "constant requires a value",
        ));
    }
    if tag == "object-fragment"
        && (!has(shape, "required") && !has(shape, "properties")
            || get(shape, "properties").is_some_and(|value| !matches!(value, Value::Object(_))))
    {
        return Err(shape_error(
            "METAMODEL_OBJECT_FRAGMENT",
            "object-fragment requires required and/or a properties object",
        ));
    }
    if let Some(required) = get(shape, "required") {
        let Value::Array(required) = required else {
            return Err(shape_error(
                "METAMODEL_OBJECT_FRAGMENT",
                "required must be an array",
            ));
        };
        let mut names = BTreeSet::new();
        for name in required {
            let Value::String(name) = name else {
                return Err(shape_error(
                    "METAMODEL_OBJECT_FRAGMENT",
                    "required entries must be strings",
                ));
            };
            if !names.insert(name.units().to_vec()) {
                return Err(shape_error(
                    "METAMODEL_OBJECT_FRAGMENT",
                    "required entries must be unique",
                ));
            }
        }
    }
    if let Some(value) = get(shape, "minProperties") {
        if !matches!(value, Value::Number(n) if *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0)
        {
            return Err(shape_error(
                "METAMODEL_MIN_PROPERTIES",
                "minProperties must be a nonnegative safe integer",
            ));
        }
    }
    if tag == "conditional" && (!has(shape, "condition") || !has(shape, "yes")) {
        return Err(shape_error(
            "METAMODEL_CONDITIONAL",
            "conditional requires condition and yes",
        ));
    }
    if let Some(required) = get(shape, "mandatory") {
        let Value::Array(required) = required else {
            return Err(shape_error(
                "METAMODEL_REQUIRED_KEYS",
                "mandatory must be an array",
            ));
        };
        let mut names = std::collections::BTreeSet::new();
        for v in required {
            let Value::String(s) = v else {
                return Err(shape_error(
                    "METAMODEL_REQUIRED_KEYS",
                    "mandatory entries must be strings",
                ));
            };
            if !names.insert(s.units().to_vec()) {
                return Err(shape_error(
                    "METAMODEL_REQUIRED_KEYS",
                    "mandatory entries must be unique",
                ));
            }
        }
    }
    if let Some(v) = get(shape, "open") {
        if !matches!(v, Value::Bool(_) | Value::Object(_)) {
            return Err(shape_error(
                "METAMODEL_OPEN_SHAPE",
                "open must be boolean or a shape",
            ));
        }
    }
    for key in ["min", "max"] {
        if let Some(v) = get(shape, key) {
            if !matches!(v,Value::Number(n) if n.fract()==0.0 && n.abs()<=9_007_199_254_740_991.0) {
                return Err(shape_error(
                    "METAMODEL_BOUND",
                    format!("{key} must be a safe integer"),
                ));
            }
        }
    }
    if let Some(pattern) = get(shape, "pattern") {
        let p = text(pattern)
            .ok_or_else(|| shape_error("METAMODEL_PATTERN", "pattern must be a string"))?;
        regress::Regex::new(&p)
            .map_err(|_| shape_error("METAMODEL_PATTERN", "invalid regular expression"))?;
    }
    for key in ["options", "conditions"] {
        if let Some(items) = get(shape, key) {
            let Value::Array(items) = items else {
                return Err(shape_error(
                    "METAMODEL_SHAPE_OPTIONS",
                    format!("{key} must be an array"),
                ));
            };
            for child in items {
                check_shape_at(child, path, ctx)?;
            }
        }
    }
    for key in ["fields", "properties"] {
        if let Some(Value::Object(fields)) = get(shape, key) {
            for (_, child) in fields {
                check_shape_at(child, path, ctx)?;
            }
        }
    }
    for key in [
        "item",
        "key",
        "contains",
        "condition",
        "yes",
        "no",
        "value",
        "open",
    ] {
        if let Some(child) = get(shape, key) {
            if key == "value" && tag != "not" {
                continue;
            }
            check_shape_at(child, path, ctx)?;
        }
    }
    if let Some(children) = get(shape, "fields") {
        match children {
            Value::Object(children) => {
                for (_, child) in children {
                    check_shape_at(child, path, ctx)?;
                }
            }
            Value::Array(children) => {
                for child in children {
                    check_shape_at(child, path, ctx)?;
                }
            }
            Value::Null => {}
            Value::String(value) => {
                for unit in value.units() {
                    check_shape_at(&Value::Number(*unit as f64), path, ctx)?;
                }
            }
            _ => {
                return Err(shape_error(
                    "METAMODEL_UNKNOWN_SHAPE",
                    "fields must be an object",
                ));
            }
        }
    }
    Ok(())
}

fn list(items: Vec<Value>) -> Value {
    Value::Array(items)
}
fn emit_shape_at(
    shape: &Value,
    targets: &BTreeSet<Vec<u16>>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    emit_shape_mode(shape, targets, ctx, false)
}

fn emit_shape_mode(
    shape: &Value,
    targets: &BTreeSet<Vec<u16>>,
    ctx: &mut Context<'_>,
    resource_mode: bool,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if let Value::Bool(_) = shape {
        return clone_metered(shape, ctx);
    }
    let tag = text(get(shape, "tag").unwrap_or(&Value::Null)).unwrap_or_default();
    let mut out = Vec::<(Utf16, Value)>::new();
    if let Some(Value::String(desc)) = get(shape, "description") {
        if !desc.is_empty() {
            out.push((
                Utf16::from("description"),
                clone_metered(get(shape, "description").unwrap(), ctx)?,
            ));
        }
    }
    let emit_children = |key: &str, ctx: &mut Context<'_>| -> Result<Vec<Value>, EngineError> {
        arr(get(shape, key))
            .unwrap_or(&[])
            .iter()
            .map(|v| emit_shape_mode(v, targets, ctx, resource_mode))
            .collect()
    };
    match tag.as_str() {
        "any" => {}
        "link" => {
            let target = text(get(shape, "target").unwrap_or(&Value::Null)).unwrap_or_default();
            let t = Utf16::from(target.as_str());
            ctx.charge_work(
                t.len().saturating_add(index_depth_work(targets.len())),
                Utf16::default(),
            )?;
            if !targets.contains(t.units()) {
                return Err(shape_error(
                    "METAMODEL_DANGLING_TARGET",
                    format!("dangling shape target {target}"),
                ));
            }
            let reference = if target.starts_with("urn:") {
                target
            } else {
                format!("#/$defs/{target}")
            };
            out.push((Utf16::from("$ref"), Value::string_utf8(reference)));
        }
        "constant" => out.push((
            Utf16::from("const"),
            clone_metered(get(shape, "value").unwrap(), ctx)?,
        )),
        "choice" | "exclusive-choice" | "all" => {
            let options = arr(get(shape, "options")).unwrap();
            if tag == "choice"
                && options.iter().all(|v| {
                    text(get(v, "tag").unwrap_or(&Value::Null)).as_deref() == Some("constant")
                })
            {
                let mut values = Vec::with_capacity(options.len());
                for v in options {
                    values.push(clone_metered(get(v, "value").unwrap(), ctx)?);
                }
                out.push((Utf16::from("enum"), list(values)));
            } else {
                let key = if tag == "choice" {
                    "anyOf"
                } else if tag == "exclusive-choice" {
                    "oneOf"
                } else {
                    "allOf"
                };
                out.push((Utf16::from(key), list(emit_children("options", ctx)?)));
            }
        }
        "not" => out.push((
            Utf16::from("not"),
            emit_shape_mode(get(shape, "value").unwrap(), targets, ctx, resource_mode)?,
        )),
        "conditional" => {
            out.push((
                Utf16::from("if"),
                emit_shape_mode(
                    get(shape, "condition").unwrap(),
                    targets,
                    ctx,
                    resource_mode,
                )?,
            ));
            out.push((
                Utf16::from("then"),
                emit_shape_mode(get(shape, "yes").unwrap(), targets, ctx, resource_mode)?,
            ));
            if has(shape, "no") {
                out.push((
                    Utf16::from("else"),
                    emit_shape_mode(get(shape, "no").unwrap(), targets, ctx, resource_mode)?,
                ));
            }
        }
        "object" => {
            out.push((Utf16::from("type"), Value::string_utf8("object")));
            if let Some(Value::Array(req)) = get(shape, "mandatory") {
                if !req.is_empty() {
                    ctx.charge_work(req.len(), Utf16::default())?;
                    let mut copy = Vec::with_capacity(req.len());
                    for item in req {
                        copy.push(clone_metered(item, ctx)?);
                    }
                    out.push((Utf16::from("required"), Value::Array(copy)));
                }
            }
            if let Some(Value::Object(fields)) = get(shape, "fields") {
                ctx.charge_work(fields.len(), Utf16::default())?;
                let mut props = Vec::with_capacity(fields.len());
                for (k, v) in fields {
                    ctx.charge_work(k.len(), Utf16::default())?;
                    props.push((k.clone(), emit_shape_mode(v, targets, ctx, resource_mode)?));
                }
                out.push((Utf16::from("properties"), Value::Object(props)));
            }
            if let Some(open) = get(shape, "open") {
                let v = match open {
                    Value::Bool(_) => clone_metered(open, ctx)?,
                    _ => emit_shape_mode(open, targets, ctx, resource_mode)?,
                };
                out.push((Utf16::from("additionalProperties"), v));
            }
            if let Some(k) = get(shape, "key") {
                out.push((
                    Utf16::from("propertyNames"),
                    emit_shape_mode(k, targets, ctx, resource_mode)?,
                ));
            }
            if let Some(req) = get(shape, "requires") {
                out.push((Utf16::from("dependentRequired"), clone_metered(req, ctx)?));
            }
            if let Some(Value::Array(conditions)) = get(shape, "conditions") {
                if !conditions.is_empty() {
                    out.push((
                        Utf16::from("allOf"),
                        list(emit_children("conditions", ctx)?),
                    ));
                }
            }
            if let Some(minimum) = get(shape, "minProperties") {
                out.push((Utf16::from("minProperties"), clone_metered(minimum, ctx)?));
            }
        }
        "object-fragment" if resource_mode => {
            if let Some(required) = get(shape, "required") {
                out.push((Utf16::from("required"), clone_metered(required, ctx)?));
            }
            if let Some(Value::Object(fields)) = get(shape, "properties") {
                let mut props = Vec::with_capacity(fields.len());
                for (key, value) in fields {
                    props.push((key.clone(), emit_shape_mode(value, targets, ctx, true)?));
                }
                out.push((Utf16::from("properties"), Value::Object(props)));
            }
        }
        "sequence" => {
            out.push((Utf16::from("type"), Value::string_utf8("array")));
            if has(shape, "item") {
                out.push((
                    Utf16::from("items"),
                    emit_shape_mode(get(shape, "item").unwrap(), targets, ctx, resource_mode)?,
                ));
            }
            for (source, target) in [
                ("min", "minItems"),
                ("max", "maxItems"),
                ("unique", "uniqueItems"),
            ] {
                if let Some(v) = get(shape, source) {
                    out.push((Utf16::from(target), clone_metered(v, ctx)?));
                }
            }
            if has(shape, "contains") {
                out.push((
                    Utf16::from("contains"),
                    emit_shape_mode(get(shape, "contains").unwrap(), targets, ctx, resource_mode)?,
                ));
            }
        }
        "text" | "integer" | "number" | "boolean" | "null" => {
            let typ = if tag == "text" {
                "string"
            } else {
                tag.as_str()
            };
            out.push((Utf16::from("type"), Value::string_utf8(typ)));
            for (source, target) in [
                (
                    "min",
                    if tag == "text" {
                        "minLength"
                    } else {
                        "minimum"
                    },
                ),
                (
                    "max",
                    if tag == "text" {
                        "maxLength"
                    } else {
                        "maximum"
                    },
                ),
                ("pattern", "pattern"),
            ] {
                if let Some(v) = get(shape, source) {
                    out.push((Utf16::from(target), clone_metered(v, ctx)?));
                }
            }
        }
        _ => return Err(shape_error("METAMODEL_UNKNOWN_SHAPE", "unknown shape")),
    }
    Ok(Value::Object(out))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn canonical_model() -> Value {
        let source = include_str!("../../../spec/metamodel/umf.yaml");
        parse_model(
            &source.encode_utf16().collect::<Vec<_>>(),
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    #[test]
    fn operation_schema_ordering_preserves_property_and_constant_data_keys() {
        let source = Value::Object(vec![
            (
                Utf16::from("properties"),
                Value::Object(vec![
                    (
                        Utf16::from("type"),
                        Value::Object(vec![(Utf16::from("type"), Value::string_utf8("string"))]),
                    ),
                    (
                        Utf16::from("alpha"),
                        Value::Object(vec![(Utf16::from("type"), Value::string_utf8("string"))]),
                    ),
                ]),
            ),
            (
                Utf16::from("const"),
                Value::Object(vec![
                    (Utf16::from("required"), Value::string_utf8("data")),
                    (Utf16::from("type"), Value::string_utf8("data")),
                ]),
            ),
            (Utf16::from("type"), Value::string_utf8("object")),
        ]);
        let Value::Object(ordered) = reorder_operation_shape(source).unwrap() else {
            panic!("schema remains an object");
        };
        assert_eq!(ordered[0].0, Utf16::from("type"));
        let ordered_value = Value::Object(ordered.clone());
        let Value::Object(properties) = get(&ordered_value, "properties").unwrap() else {
            panic!("properties remains a map");
        };
        assert_eq!(properties[0].0, Utf16::from("type"));
        assert_eq!(properties[1].0, Utf16::from("alpha"));
        let ordered_value = Value::Object(ordered);
        let Value::Object(constant) = get(&ordered_value, "const").unwrap() else {
            panic!("const remains literal data");
        };
        assert_eq!(constant[0].0, Utf16::from("required"));
        assert_eq!(constant[1].0, Utf16::from("type"));
    }

    #[test]
    fn admission_rejects_invalid_duplicate_metadata_even_when_unused() {
        let model = Value::Object(vec![(
            Utf16::from("unused"),
            Value::Object(vec![
                (Utf16::from("future"), Value::Null),
                (Utf16::from("future"), Value::Null),
            ]),
        )]);
        let error = compile_model(&model, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "DUPLICATE_KEY");
    }

    #[test]
    fn compact_ecmascript_model_digest_meter_errors_propagate() {
        let model = canonical_model();
        let mut charges = Vec::new();
        {
            let mut meter = |amount| {
                charges.push(amount);
                Ok(())
            };
            let mut ctx = Context::ordinary().with_meter(&mut meter);
            compile_model(&model, &mut ctx).unwrap();
        }
        let fail_at = charges.len() - 1;
        let mut index = 0usize;
        let mut meter = |_amount| {
            let current = index;
            index += 1;
            if current == fail_at {
                Err(EngineError::new(
                    "TEST_METER",
                    Utf16::default(),
                    "meter stopped",
                ))
            } else {
                Ok(())
            }
        };
        let error =
            compile_model(&model, &mut Context::ordinary().with_meter(&mut meter)).unwrap_err();
        assert_eq!(error.code, "TEST_METER");
    }

    #[test]
    fn context_rendering_is_deterministic_and_propagates_meter_refusal() {
        let model = canonical_model();
        let compiled = compile_model(&model, &mut Context::ordinary()).unwrap();
        let provenance = CompilerProvenance {
            model_sha256: "model".into(),
            compiler_sha256: "compiler".into(),
        };
        let ordinary = render_outputs(&compiled, &provenance).unwrap();
        let contextual =
            render_outputs_with_context(&compiled, &provenance, &mut Context::ordinary()).unwrap();
        assert_eq!(ordinary, contextual);
        let mut meter = |_| {
            Err(EngineError::new(
                "RENDER_STOP",
                Utf16::default(),
                "meter stopped",
            ))
        };
        let error = render_outputs_with_context(
            &compiled,
            &provenance,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert_eq!(error.code, "RENDER_STOP");
    }

    #[test]
    fn shape_target_index_work_grows_with_logarithmic_lookup_cost() {
        let mut shape = obj_shape("link", vec![("target", Value::string_utf8("target-999"))]);
        check_shape(&shape).unwrap();
        let targets: Vec<Utf16> = (0..1000)
            .map(|index| Utf16::from(format!("target-{index}")))
            .collect();
        let mut total = 0usize;
        let mut meter = |amount| {
            total = total.saturating_add(amount);
            Ok(())
        };
        let emitted = emit_shape_with_context(
            &shape,
            &targets,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap();
        assert!(matches!(get(&emitted, "$ref"), Some(Value::String(_))));
        drop(meter);
        // The shared target index charges O(n log n) key operations. A linear
        // scan for every candidate target would exceed this bound by orders.
        assert!(total < 100_000, "charged {total} work units");
        shape = obj_shape("link", vec![("target", Value::string_utf8("absent"))]);
        assert_eq!(
            emit_shape_with_context(&shape, &targets, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "METAMODEL_DANGLING_TARGET"
        );
    }

    fn nested_not_shape(depth: usize) -> Value {
        (0..depth).fold(Value::Bool(true), |child, _| {
            obj_shape("not", vec![("value", child)])
        })
    }

    #[test]
    fn public_shape_boundaries_apply_ordinary_json_admission_once() {
        assert!(check_shape_with_context(&nested_not_shape(128), &mut Context::ordinary()).is_ok());
        assert_eq!(
            check_shape_with_context(&nested_not_shape(129), &mut Context::ordinary())
                .unwrap_err()
                .code,
            "LIMIT"
        );

        for number in [
            f64::NAN,
            f64::INFINITY,
            f64::NEG_INFINITY,
            -0.0,
            9_007_199_254_740_992.0,
        ] {
            let shape = obj_shape("constant", vec![("value", Value::Number(number))]);
            assert_eq!(
                emit_shape(&shape, &[]).unwrap_err().code,
                "NUMBER",
                "number {number:?} must be refused at the public boundary"
            );
        }

        let exact_limit = obj_shape(
            "constant",
            vec![("value", Value::Array(vec![Value::Null; 99_997]))],
        );
        assert!(check_shape(&exact_limit).is_ok());
        let over_limit = obj_shape(
            "constant",
            vec![("value", Value::Array(vec![Value::Null; 99_998]))],
        );
        assert_eq!(check_shape(&over_limit).unwrap_err().code, "LIMIT");

        let accepted_targets: Vec<_> = (0..99_999)
            .map(|index| Utf16::from(format!("target-{index}")))
            .collect();
        assert!(emit_shape(&Value::Bool(true), &accepted_targets).is_ok());
        let over_limit_targets: Vec<_> = (0..100_000)
            .map(|index| Utf16::from(format!("target-{index}")))
            .collect();
        assert_eq!(
            emit_shape(&Value::Bool(true), &over_limit_targets)
                .unwrap_err()
                .code,
            "LIMIT"
        );

        let mut meter = |_amount| Err(EngineError::new("SHAPE_METER", Utf16::default(), "stopped"));
        assert_eq!(
            check_shape_with_context(
                &obj_shape("constant", vec![("value", Value::Null)]),
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap_err()
            .code,
            "SHAPE_METER"
        );
    }

    #[test]
    fn resource_ids_follow_absolute_url_profile_without_mutating_utf16_identity() {
        for id in [
            "ftp://example.test/schema",
            "data:application/json,{}",
            "custom:opaque",
            "urn:example:schema",
        ] {
            assert!(validate_resource_id(&Utf16::from(id)).is_ok(), "{id}");
        }
        assert_eq!(
            validate_resource_id(&Utf16::from("https://"))
                .unwrap_err()
                .code,
            "METAMODEL_RESOURCE_ID"
        );
        let id = Utf16::new(
            "https://example.test/"
                .encode_utf16()
                .chain([0xd800])
                .collect(),
        );
        assert!(validate_resource_id(&id).is_ok());
        let definitions = vec![(Utf16::from("root"), Value::Object(vec![]))];
        let schema = schema_resource(&definitions, "root", &id, None).unwrap();
        assert_eq!(get(&schema, "$id"), Some(&Value::String(id)));
    }
}
