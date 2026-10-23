// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{
    context::Context,
    error::{EngineError, PythonSchemaTerminal},
    python_regex::{PythonReVersion, PythonRegex},
    python_value::{
        instances_equal, value_equals_instance, InstanceKind, InstanceNumber, InstanceText,
        InstanceView,
    },
    value::{copy_json, Utf16, Value},
};
use num_traits::ToPrimitive;
use std::collections::BTreeSet;

#[derive(Clone, Debug, PartialEq)]
pub struct StructuralError {
    pub instance_path: Utf16,
    pub python_source_path: bool,
    pub schema_path: Utf16,
    pub keyword: String,
    pub params: Value,
    pub message: Utf16,
    /// Original property name on compiler-mode propertyNames child errors.
    pub compiler_property_name: Option<Utf16>,
    pub python_params: Option<std::sync::Arc<crate::python_value::PythonConsumerValue>>,
    pub python_error: Option<PythonErrorMetadata>,
    pub python_physical_instance_path: Option<Utf16>,
    pub python_instance_override: Option<std::sync::Arc<crate::python_value::PythonConsumerValue>>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct PythonErrorMetadata {
    pub validator: Option<crate::python_value::PyText>,
    pub validator_value: std::sync::Arc<crate::python_value::PythonConsumerValue>,
}
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SchemaResources {
    pub entries: Vec<(Utf16, Value)>,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SchemaDialect {
    Draft3,
    Draft4,
    Draft6,
    Draft7,
    Draft2019_09,
    Draft2020_12,
}
#[derive(Clone, Debug)]
pub struct CompiledSchema {
    schema: Value,
    resources: SchemaResources,
    dialect: SchemaDialect,
    strict: bool,
    regex_profile: RegexProfile,
    resolve_references_at_compile: bool,
    /// Original Python code-point text keyed by projected schema pointer.
    python_text_origins: std::collections::BTreeMap<Vec<u16>, crate::python_value::PyText>,
    python_member_keys: std::collections::BTreeMap<(Vec<u16>, usize), crate::python_value::PyText>,
    python_source_strings: std::collections::BTreeMap<usize, crate::python_value::PyText>,
    python_source_keys: std::collections::BTreeMap<usize, crate::python_value::PyText>,
    python_exact_values:
        std::collections::BTreeMap<usize, std::sync::Arc<crate::python_value::PythonConsumerValue>>,
    python_reference_targets: std::collections::BTreeMap<usize, PythonReferenceTarget>,
    python_resource_roots: std::collections::BTreeMap<usize, PythonResourceLocator>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) enum EvaluationMode {
    #[default]
    AllErrors,
    FirstError,
}

pub(crate) struct EvaluationOutcome {
    pub errors: Vec<StructuralError>,
    pub terminal_error: Option<EngineError>,
}

#[derive(Clone, Debug)]
struct PythonReferenceTarget {
    resource: Option<usize>,
    /// Pointer from the supplied tree root to the nearest recognized schema
    /// resource base. A reference fragment is resolved from this base.
    resource_root_indices: Vec<usize>,
    source_resource_uri: Option<PythonResourceUri>,
    source_resource_recursive_anchor: bool,
    indices: Vec<usize>,
    failure: Option<PythonReferenceFailure>,
}

/// Python resource identity remains in native codepoints. Diagnostic UTF-16
/// is a one-way display boundary and is never used for scope equality/lookup.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct PythonResourceUri(Vec<u32>);
impl PythonResourceUri {
    fn from_points(points: &[u32], ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        ctx.charge_work_u64(points.len() as u64 + 1, Utf16::default())?;
        Ok(Self(points.to_vec()))
    }
    fn len(&self) -> usize {
        self.0.len()
    }
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
    fn points(&self) -> &[u32] {
        &self.0
    }
    fn same(&self, other: &Self, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
        ctx.charge_work_u64(self.len().min(other.len()) as u64 + 1, Utf16::default())?;
        Ok(self == other)
    }
    fn display_path(&self, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        ctx.charge_work_u64(
            (self.len() as u64).saturating_mul(2).saturating_add(1),
            Utf16::default(),
        )?;
        let mut units = Vec::with_capacity(self.len().saturating_mul(2).saturating_add(1));
        for point in &self.0 {
            if *point <= u16::MAX as u32 {
                units.push(*point as u16);
            } else if let Some(character) = char::from_u32(*point) {
                let mut buffer = [0u16; 2];
                units.extend_from_slice(character.encode_utf16(&mut buffer));
            } else {
                return Err(schema_error(
                    &Utf16::default(),
                    "Invalid Python URI codepoint",
                ));
            }
        }
        units.push(b'#' as u16);
        Ok(Utf16::new(units))
    }
    fn join(&self, reference: &Self, ctx: &mut Context<'_>) -> Result<Option<Self>, EngineError> {
        ctx.charge_work_u64(
            (self.len() as u64)
                .saturating_add(reference.len() as u64)
                .saturating_mul(40)
                .saturating_add(100),
            Utf16::default(),
        )?;
        Ok(resolve_relative_python_uri(self.points(), reference.points()).map(Self))
    }
}
#[derive(Clone, Debug)]
struct PythonResourceLocator {
    uri: PythonResourceUri,
    resource: Option<usize>,
    root_indices: Vec<usize>,
    recursive_anchor: bool,
}

#[derive(Clone, Copy, Debug)]
enum PythonReferenceFailure {
    InvalidArrayIndex,
    InvalidTraversal,
    Unresolved,
}

#[derive(Clone, Copy, Debug)]
enum RegexProfile {
    Ecma262Unicode,
    Python(PythonReVersion),
}
enum CompiledRegex {
    Ecma(regress::Regex),
    Python(PythonRegex),
}

fn compiler_object_order<T: InstanceView>(
    data: &T,
    count: usize,
    ctx: &mut Context<'_>,
) -> Result<Vec<usize>, EngineError> {
    ctx.charge_work(count.saturating_mul(64), Utf16::default())?;
    let mut indices = std::collections::BTreeMap::new();
    let mut ordinary = Vec::with_capacity(count);
    for index in 0..count {
        ctx.charge_work(1, Utf16::default())?;
        let Some((name, _)) = data.object_entry(index) else {
            continue;
        };
        let numeric = match name {
            InstanceText::Utf16(name) => {
                let units = name.units();
                let mut number = 0u64;
                let valid = !units.is_empty()
                    && units.len() <= 10
                    && (units.len() == 1 || units[0] != 48)
                    && units.iter().all(|u| {
                        if !(48..=57).contains(u) {
                            return false;
                        }
                        number = number * 10 + u64::from(*u - 48);
                        true
                    });
                if valid && number < u64::from(u32::MAX) {
                    Some(number as u32)
                } else {
                    None
                }
            }
            _ => None,
        };
        if let Some(number) = numeric {
            indices.insert(number, index);
        } else {
            ordinary.push(index);
        }
    }
    let mut ordered = Vec::with_capacity(count);
    ordered.extend(indices.into_values());
    ordered.extend(ordinary);
    Ok(ordered)
}

// Source: pinned Ajv 8.20 groups plus createValidator/installJsonEquality.
// The custom const/enum/uniqueItems rules are re-added after their groups'
// standard rules. Metadata and unknown inert keywords have no error phase.
fn compiler_keyword_rank(key: &Utf16) -> usize {
    const ORDER: &[&str] = &[
        "type",
        "$dynamicRef",
        "$recursiveRef",
        "$ref",
        "not",
        "anyOf",
        "oneOf",
        "allOf",
        "if",
        "then",
        "else",
        "const",
        "enum",
        "maximum",
        "minimum",
        "exclusiveMaximum",
        "exclusiveMinimum",
        "multipleOf",
        "maxLength",
        "minLength",
        "pattern",
        "format",
        "maxItems",
        "minItems",
        "additionalItems",
        "prefixItems",
        "items",
        "contains",
        "minContains",
        "maxContains",
        "unevaluatedItems",
        "uniqueItems",
        "maxProperties",
        "minProperties",
        "required",
        "propertyNames",
        "additionalProperties",
        "dependencies",
        "properties",
        "patternProperties",
        "dependentRequired",
        "dependentSchemas",
        "unevaluatedProperties",
    ];
    ORDER
        .iter()
        .position(|name| {
            key.len() == name.len() && key.units().iter().copied().eq(name.encode_utf16())
        })
        .unwrap_or(usize::MAX)
}

#[derive(Clone, Debug, Default)]
struct Evaluated {
    properties: BTreeSet<Vec<u32>>,
    items: BTreeSet<usize>,
    dynamic_scope: Vec<(Vec<u16>, Utf16, usize)>,
    /// Python Draft 2019-09 resolver history. Each evaluator branch owns its
    /// snapshot; a reference lookup updates only the descended resolver.
    python_recursive_history: Vec<PythonResourceLocator>,
    mode: EvaluationMode,
    collect_annotations: bool,
    /// Opt-in compiler diagnostic presentation; ordinary/Python validation
    /// retains its qualified aggregate combinator behavior.
    codegen_errors: bool,
    annotation_scan: bool,
    annotation_scan_short_circuit: bool,
}
impl Evaluated {
    fn child(&self, ctx: &mut Context<'_>, path: &Utf16) -> Result<Self, EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        for entry in &self.python_recursive_history {
            ctx.charge_work_u64(
                entry.uri.len() as u64 + entry.root_indices.len() as u64 + 2,
                Utf16::default(),
            )?;
        }
        for (name, scope, _) in &self.dynamic_scope {
            ctx.charge_work(1, Utf16::default())?;
            ctx.charge_work_u64(name.len() as u64 + scope.len() as u64 + 2, Utf16::default())?;
        }
        Ok(Self {
            dynamic_scope: self.dynamic_scope.clone(),
            python_recursive_history: self.python_recursive_history.clone(),
            mode: self.mode,
            collect_annotations: self.collect_annotations,
            codegen_errors: self.codegen_errors,
            ..Self::default()
        })
    }
    fn merge(
        &mut self,
        other: Self,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<(), EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        for name in other.properties {
            ctx.charge_work(path.len(), Utf16::default())?;
            ctx.charge_work_u64(
                (name.len() as u64 + 1) * tree_compare_bound(self.properties.len()),
                Utf16::default(),
            )?;
            self.properties.insert(name);
        }
        for index in other.items {
            ctx.charge_work(path.len(), Utf16::default())?;
            ctx.charge_work_u64(tree_compare_bound(self.items.len()), Utf16::default())?;
            self.items.insert(index);
        }
        Ok(())
    }

    fn contains_item(
        &self,
        index: usize,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<bool, EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        ctx.charge_work_u64(tree_compare_bound(self.items.len()), Utf16::default())?;
        Ok(self.items.contains(&index))
    }

    fn insert_item(
        &mut self,
        index: usize,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<(), EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        ctx.charge_work_u64(tree_compare_bound(self.items.len()), Utf16::default())?;
        self.items.insert(index);
        Ok(())
    }

    fn contains_property(
        &self,
        text: InstanceText<'_>,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<bool, EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        ctx.charge_work_u64(
            (text.codepoint_len() as u64 + 1) * tree_compare_bound(self.properties.len()),
            Utf16::default(),
        )?;
        let points = text.codepoints();
        Ok(self.properties.contains(&points))
    }

    fn insert_property(
        &mut self,
        text: InstanceText<'_>,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<(), EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        ctx.charge_work_u64(
            (text.codepoint_len() as u64 + 1) * tree_compare_bound(self.properties.len()),
            Utf16::default(),
        )?;
        self.properties.insert(text.codepoints());
        Ok(())
    }
}

fn tree_compare_bound(previous: usize) -> u64 {
    let n = previous as u64 + 1;
    let height = 64 - n.saturating_add(1).leading_zeros() as u64;
    n.min(11 * (height + 1))
}

impl CompiledSchema {
    fn uses_python_2019_annotation_profile(&self) -> bool {
        matches!(self.regex_profile, RegexProfile::Python(_))
            && self.dialect == SchemaDialect::Draft2019_09
    }

    fn uses_python_2020_annotation_profile(&self) -> bool {
        matches!(self.regex_profile, RegexProfile::Python(_))
            && self.dialect == SchemaDialect::Draft2020_12
    }

    fn collect_python_legacy_property_names<T: InstanceView>(
        &self,
        rule: &Value,
        schema_path: &Utf16,
        data: &T,
        ip: &Utf16,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.object_len() else {
            return Ok(());
        };
        match rule {
            Value::Bool(true) => {
                for index in 0..count {
                    if let Some((name, _)) = data.object_entry(index) {
                        evaluated.insert_property(name, ctx, ip)?;
                    }
                }
            }
            Value::Object(names) => {
                for (index, (name, _)) in names.iter().enumerate() {
                    let source_name = self.source_member_text(schema_path, index, name, ctx)?;
                    for instance_index in 0..count {
                        let Some((actual_name, _)) = data.object_entry(instance_index) else {
                            continue;
                        };
                        if source_name.equals_with_context(actual_name, ctx)? {
                            evaluated.insert_property(actual_name, ctx, ip)?;
                            break;
                        }
                    }
                }
            }
            Value::Bool(false)
            | Value::Array(_)
            | Value::Null
            | Value::String(_)
            | Value::Number(_) => {}
        }
        Ok(())
    }

    fn collect_python_property_predicates<T: InstanceView>(
        &self,
        rule: &Value,
        schema_path: &Utf16,
        data: &T,
        ip: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.object_len() else {
            return Ok(());
        };
        for index in 0..count {
            let Some((name, value)) = data.object_entry(index) else {
                continue;
            };
            let mut predicate = evaluated.child(ctx, ip)?;
            predicate.mode = EvaluationMode::FirstError;
            predicate.annotation_scan = false;
            predicate.collect_annotations = false;
            let mut errors = Vec::new();
            self.eval(
                rule,
                value,
                &self.instance_pointer(ip, name, ctx)?,
                schema_path,
                depth + 1,
                ctx,
                &mut errors,
                &mut predicate,
            )?;
            if errors.is_empty() {
                evaluated.insert_property(name, ctx, ip)?;
            }
        }
        Ok(())
    }

    fn collect_python_legacy_additional_property_predicates<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        rule: &Value,
        schema_path: &Utf16,
        data: &T,
        ip: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.object_len() else {
            return Ok(());
        };
        let declared_path = append_schema_path(schema_path, "properties");
        let declared = member(members, "properties");
        let patterns = member(members, "patternProperties");
        let mut compiled_patterns = Vec::new();
        if let Some(Value::Object(patterns)) = patterns {
            ctx.charge_work(patterns.len(), ip.clone())?;
            for (pattern, _) in patterns.iter() {
                let pattern_path = self.schema_pointer(
                    &append_schema_path(schema_path, "patternProperties"),
                    pattern,
                    ctx,
                )?;
                let regex = self.compile_pattern(pattern, &pattern_path, ctx)?;
                compiled_patterns.push(regex);
            }
        }

        for index in 0..count {
            let Some((name, value)) = data.object_entry(index) else {
                continue;
            };
            let mut covered = false;
            if let Some(Value::Object(properties)) = declared {
                for (property_index, (property, _)) in properties.iter().enumerate() {
                    let source =
                        self.source_member_text(&declared_path, property_index, property, ctx)?;
                    if source.equals_with_context(name, ctx)? {
                        covered = true;
                        break;
                    }
                }
            }
            if !covered {
                for regex in &compiled_patterns {
                    if Self::pattern_matches_text(regex, name, ctx)? {
                        covered = true;
                        break;
                    }
                }
            }
            if covered {
                continue;
            }
            let mut predicate = evaluated.child(ctx, ip)?;
            predicate.mode = EvaluationMode::FirstError;
            predicate.annotation_scan = false;
            predicate.collect_annotations = false;
            let mut errors = Vec::new();
            self.eval(
                rule,
                value,
                &self.instance_pointer(ip, name, ctx)?,
                &self.schema_pointer(schema_path, &Utf16::from("additionalProperties"), ctx)?,
                depth + 1,
                ctx,
                &mut errors,
                &mut predicate,
            )?;
            if errors.is_empty() {
                evaluated.insert_property(name, ctx, ip)?;
            }
        }
        Ok(())
    }

    fn collect_python_item_predicates<T: InstanceView>(
        &self,
        rule: &Value,
        schema_path: &Utf16,
        data: &T,
        ip: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.array_len() else {
            return Ok(());
        };
        for index in 0..count {
            let Some(value) = data.array_get(index) else {
                continue;
            };
            let mut predicate = evaluated.child(ctx, ip)?;
            predicate.mode = EvaluationMode::FirstError;
            predicate.annotation_scan = false;
            predicate.collect_annotations = false;
            let mut errors = Vec::new();
            let index_text = Utf16::from(index.to_string());
            let path = self.instance_pointer(ip, InstanceText::Utf16(&index_text), ctx)?;
            self.eval(
                rule,
                value,
                &path,
                schema_path,
                depth + 1,
                ctx,
                &mut errors,
                &mut predicate,
            )?;
            if errors.is_empty() {
                evaluated.insert_item(index, ctx, ip)?;
            }
        }
        Ok(())
    }

    fn collect_schema_annotations<T: InstanceView>(
        &self,
        schema_path: &Utf16,
        schema: &Value,
        data: &T,
        ip: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let mut scan = evaluated.child(ctx, ip)?;
        scan.mode = EvaluationMode::AllErrors;
        scan.collect_annotations = true;
        scan.annotation_scan = true;
        let mut ignored_errors = Vec::new();
        self.eval(
            schema,
            data,
            ip,
            schema_path,
            depth,
            ctx,
            &mut ignored_errors,
            &mut scan,
        )?;
        evaluated.merge(scan, ctx, ip)?;
        Ok(())
    }

    /// Python's annotation helpers have their own fixed traversal order. They
    /// are not an ordinary validation pass: some rules only mark names/indexes,
    /// while predicates run through the same evaluator in FirstError mode.
    #[inline(never)]
    fn visit_python_annotations<T: InstanceView>(
        &self,
        schema: &Value,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        ctx.charge_work_u64(ip.len() as u64 + 1, Utf16::default())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                ip.clone(),
                "Schema evaluation depth exceeded",
            ));
        }
        // Both native helpers return no annotations for a boolean schema.
        let Value::Object(members) = schema else {
            return Ok(());
        };
        let legacy = self.uses_python_2019_annotation_profile();
        let order: &[&str] = if data.object_len().is_some() {
            if legacy {
                &[
                    "$ref",
                    "$recursiveRef",
                    "properties",
                    "additionalProperties",
                    "unevaluatedProperties",
                    "patternProperties",
                    "dependentSchemas",
                    "allOf",
                    "oneOf",
                    "anyOf",
                    "if",
                ]
            } else {
                &[
                    "$ref",
                    "$dynamicRef",
                    "properties",
                    "additionalProperties",
                    "unevaluatedProperties",
                    "patternProperties",
                    "dependentSchemas",
                    "allOf",
                    "oneOf",
                    "anyOf",
                    "if",
                ]
            }
        } else if data.array_len().is_some() {
            if legacy {
                // The legacy helper resolves references before its items return.
                &[
                    "$ref",
                    "$recursiveRef",
                    "items",
                    "if",
                    "contains",
                    "unevaluatedItems",
                    "allOf",
                    "oneOf",
                    "anyOf",
                ]
            } else {
                // Presence of items returns all indexes before even resolving
                // references or reaching any other annotation predicate.
                &[
                    "items",
                    "$ref",
                    "$dynamicRef",
                    "prefixItems",
                    "if",
                    "contains",
                    "unevaluatedItems",
                    "allOf",
                    "oneOf",
                    "anyOf",
                ]
            }
        } else {
            return Ok(());
        };
        let mut ignored = Vec::new();
        let mut scan_complete = false;
        let mut unevaluated_properties = None;
        let mut unevaluated_items = None;
        for &keyword in order {
            let mut selected = None;
            for (key, rule) in members {
                // Admit the borrowed lookup/comparison before inspecting long
                // source keys. No schema, key or member vector is copied here.
                ctx.charge_work_u64(key.len() as u64 + 1, Utf16::default())?;
                if key.units().iter().copied().eq(keyword.encode_utf16()) {
                    selected = Some((key, rule));
                    break;
                }
            }
            let Some((key, rule)) = selected else {
                continue;
            };
            let kp = self.schema_pointer(sp, key, ctx)?;
            let error_start = ignored.len();
            // These are the existing shared marking/predicate mechanisms, not
            // duplicate validation logic. Keep a single Result temporary so
            // recursive debug frames don't retain one Try slot per match arm.
            let result = match keyword {
                "$ref" | "$dynamicRef" | "$recursiveRef" => self.eval_keyword_references(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "properties" => self.eval_keyword_properties(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "additionalProperties" => self.eval_keyword_additional_properties(
                    members,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                ),
                "patternProperties" => self.eval_keyword_patterns_additional(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "unevaluatedProperties" | "unevaluatedItems" => self.eval_keyword_annotations(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "dependentSchemas" => self.eval_keyword_dependencies(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "items" | "prefixItems" => self.eval_keyword_items(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "contains" => self.eval_keyword_contains(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "allOf" | "oneOf" | "anyOf" | "if" => self.eval_keyword_combinators(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                _ => unreachable!("fixed annotation keyword order"),
            };
            result?;
            if evaluated.annotation_scan_short_circuit {
                return Ok(());
            }
        }
        Ok(())
    }

    /// Source-preserving Python schema admission entrypoint.
    pub fn compile_python_source(
        source_schema: &crate::python_value::PythonConsumerValue,
        resources: &crate::python_value::PythonSchemaResources,
        strict: bool,
        version: PythonReVersion,
        ctx: &mut Context<'_>,
    ) -> Result<crate::python_value::PythonCompiledSchema, EngineError> {
        if ctx.profile() == crate::context::ResourceProfile::HardIsolated {
            return Err(unavailable());
        }
        let (schema, mut source_origins) = source_schema.project_schema_source(ctx)?;
        let mut projected_resources = SchemaResources::default();
        rebase_source_origins(&mut source_origins, &schema_origin_path(&schema));
        for (id, value) in &resources.entries {
            let id = id.to_utf16(ctx)?;
            let (value, mut origins) = value.project_schema_source(ctx)?;
            let mut root = id.units().to_vec();
            root.push(0x23);
            rebase_source_origins(&mut origins, &Utf16::new(root));
            source_origins.values.extend(origins.values);
            source_origins.members.extend(origins.members);
            projected_resources.entries.push((id, value));
        }
        let dialect = if matches!(schema, Value::Bool(_)) {
            SchemaDialect::Draft2020_12
        } else {
            select_dialect(&schema)?
        };
        let mut compiled = Self::compile_inner(
            &schema,
            &projected_resources,
            dialect,
            strict,
            RegexProfile::Python(version),
            false,
            !strict,
            true,
            ctx,
        )?;
        compiled.python_text_origins = source_origins.values;
        compiled.python_member_keys = source_origins.members;
        bind_python_source_tree(
            source_schema,
            &compiled.schema,
            &mut compiled.python_source_strings,
            &mut compiled.python_source_keys,
            &mut compiled.python_exact_values,
            ctx,
        )?;
        bind_python_reference_targets(
            &source_schema,
            &compiled.schema,
            None,
            None,
            dialect,
            &mut compiled.python_reference_targets,
            &mut compiled.python_resource_roots,
            ctx,
        )?;
        for (resource_index, ((id, source), (_, target))) in resources
            .entries
            .iter()
            .zip(compiled.resources.entries.iter())
            .enumerate()
        {
            bind_python_source_tree(
                source,
                target,
                &mut compiled.python_source_strings,
                &mut compiled.python_source_keys,
                &mut compiled.python_exact_values,
                ctx,
            )?;
            bind_python_reference_targets(
                source,
                target,
                Some(resource_index),
                Some(id),
                dialect,
                &mut compiled.python_reference_targets,
                &mut compiled.python_resource_roots,
                ctx,
            )?;
        }
        compiled.preflight(
            &compiled.schema,
            &schema_origin_path(&compiled.schema),
            &schema_id(&compiled.schema)
                .map(|id| resolve_schema_uri(dialect, "", &id).unwrap_or(id))
                .unwrap_or_default(),
            0,
            ctx,
            &mut BTreeSet::new(),
        )?;
        for (id, resource) in &compiled.resources.entries {
            let mut root_path = id.units().to_vec();
            root_path.push(0x23);
            let retrieval = id.to_utf8().unwrap_or_default();
            compiled.preflight(
                resource,
                &Utf16::new(root_path),
                &retrieval,
                0,
                ctx,
                &mut BTreeSet::new(),
            )?;
        }
        Ok(crate::python_value::PythonCompiledSchema {
            compiled: Box::new(compiled),
        })
    }

    /// Compile a strict Draft 2020-12 schema. The supplied resource set is the
    /// complete resolution boundary: references are never fetched implicitly.
    pub fn compile(
        schema: &Value,
        resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let dialect = select_dialect(schema)?;
        Self::compile_with_dialect(schema, resources, dialect, true, ctx)
    }
    /// Consumer entry: honor a declared Draft 7 or Draft 2020-12 dialect and
    /// default an omitted declaration to the current Draft 2020-12 surface.
    pub fn compile_consumer(
        schema: &Value,
        resources: &SchemaResources,
        strict: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let dialect = select_dialect(schema)?;
        Self::compile_with_dialect(schema, resources, dialect, strict, ctx)
    }
    /// Validate only the pinned dialect metaschema, without compiling or
    /// resolving schema references. This lets callers report malformed schema
    /// shape even when a separate reference in the same schema is unresolved.
    pub fn validate_consumer_metaschema_only(
        schema: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        if ctx.profile() == crate::context::ResourceProfile::HardIsolated {
            return Err(unavailable());
        }
        let dialect = select_dialect(schema)?;
        validate_schema_against_metaschema(schema, dialect, RegexProfile::Ecma262Unicode, ctx)
    }
    /// Construct a consumer schema validator with the exact Python `re`
    /// profile supplied by the binding. References remain local-only and are
    /// resolved when evaluation reaches them, matching the predecessor API.
    pub fn compile_python_consumer(
        schema: &Value,
        resources: &SchemaResources,
        version: PythonReVersion,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        Self::compile_python_schema(schema, resources, false, version, ctx)
    }
    /// Python validator entry used for strict core resources as well as
    /// ordinary consumer schemas. Strictness controls keyword admission; the
    /// regex profile remains the host's explicitly supplied Python version.
    pub fn compile_python_schema(
        schema: &Value,
        resources: &SchemaResources,
        strict: bool,
        version: PythonReVersion,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let dialect = if matches!(schema, Value::Bool(_)) {
            SchemaDialect::Draft2020_12
        } else {
            select_dialect(schema)?
        };
        Self::compile_inner(
            schema,
            resources,
            dialect,
            strict,
            RegexProfile::Python(version),
            false,
            !strict,
            false,
            ctx,
        )
    }
    pub fn schema_value(&self) -> &Value {
        &self.schema
    }
    pub fn snapshot_with_context(&self, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        for (path, text) in &self.python_text_origins {
            ctx.charge_work_u64(path.len() as u64 + text.len() as u64 + 2, Utf16::default())?;
        }
        for ((path, _), text) in &self.python_member_keys {
            ctx.charge_work_u64(path.len() as u64 + text.len() as u64 + 3, Utf16::default())?;
        }
        for text in self
            .python_source_strings
            .values()
            .chain(self.python_source_keys.values())
        {
            ctx.charge_work_u64(text.len() as u64 + 2, Utf16::default())?;
        }
        for target in self.python_reference_targets.values() {
            ctx.charge_work_u64(
                target.indices.len() as u64
                    + target.resource_root_indices.len() as u64
                    + target
                        .source_resource_uri
                        .as_ref()
                        .map_or(0, |uri| uri.len() as u64)
                    + 3,
                Utf16::default(),
            )?;
        }
        for root in self.python_resource_roots.values() {
            ctx.charge_work_u64(
                root.uri.len() as u64 + root.root_indices.len() as u64 + 3,
                Utf16::default(),
            )?;
        }
        ctx.charge_work(
            self.python_exact_values
                .len()
                .saturating_add(self.resources.entries.len()),
            Utf16::default(),
        )?;
        let schema = copy_json(&self.schema, ctx)?;
        let mut entries = Vec::with_capacity(self.resources.entries.len());
        for (id, value) in &self.resources.entries {
            ctx.charge_work(id.len(), Utf16::default())?;
            entries.push((id.clone(), copy_json(value, ctx)?));
        }
        Ok(Self {
            schema,
            resources: SchemaResources { entries },
            dialect: self.dialect,
            strict: self.strict,
            regex_profile: self.regex_profile,
            resolve_references_at_compile: self.resolve_references_at_compile,
            python_text_origins: self.python_text_origins.clone(),
            python_member_keys: self.python_member_keys.clone(),
            python_source_strings: self.python_source_strings.clone(),
            python_source_keys: self.python_source_keys.clone(),
            python_exact_values: self.python_exact_values.clone(),
            python_reference_targets: self.python_reference_targets.clone(),
            python_resource_roots: self.python_resource_roots.clone(),
        })
    }
    fn compile_pattern(
        &self,
        pattern: &Utf16,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<CompiledRegex, EngineError> {
        let source = self
            .python_source_strings
            .get(&(pattern as *const Utf16 as usize))
            .or_else(|| {
                self.python_source_keys
                    .get(&(pattern as *const Utf16 as usize))
            })
            .or_else(|| self.python_text_origins.get(path.units()));
        self.compile_pattern_source(pattern, source, path, ctx)
    }
    fn compile_pattern_source(
        &self,
        pattern: &Utf16,
        source: Option<&crate::python_value::PyText>,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<CompiledRegex, EngineError> {
        match self.regex_profile {
            RegexProfile::Ecma262Unicode => compile_regex(pattern)
                .map(CompiledRegex::Ecma)
                .map_err(|_| schema_error(path, "Invalid ECMAScript regular expression")),
            RegexProfile::Python(version) => {
                let compiled = if let Some(source) = source {
                    PythonRegex::compile_codepoints_with_context(source.codepoints(), version, ctx)
                } else {
                    PythonRegex::compile_with_context(pattern, version, ctx)
                };
                compiled.map(CompiledRegex::Python).map_err(|error| {
                    if error.code == "PYTHON_REGEX_SYNTAX" {
                        EngineError::new("SCHEMA_INVALID", path.clone(), error.message)
                    } else {
                        error
                    }
                })
            }
        }
    }
    fn source_member_text<'a>(
        &'a self,
        object_path: &Utf16,
        index: usize,
        fallback: &'a Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<InstanceText<'a>, EngineError> {
        let lookup_cost = btree_lookup_work(
            self.python_member_keys.len(),
            object_path.len().saturating_add(1),
        );
        let fallback_cost = btree_index_lookup_work(self.python_source_keys.len());
        ctx.charge_work_u64(
            lookup_cost.saturating_add(fallback_cost).saturating_add(1),
            Utf16::default(),
        )?;
        Ok(self
            .python_member_keys
            .get(&(object_path.units().to_vec(), index))
            .or_else(|| {
                self.python_source_keys
                    .get(&(fallback as *const Utf16 as usize))
            })
            .map(InstanceText::Python)
            .unwrap_or(InstanceText::Utf16(fallback)))
    }
    fn source_text_value<'a>(
        &'a self,
        path: &Utf16,
        fallback: &'a Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<InstanceText<'a>, EngineError> {
        let lookup_cost = btree_lookup_work(self.python_text_origins.len(), path.len());
        let fallback_cost = btree_index_lookup_work(self.python_source_strings.len());
        ctx.charge_work_u64(
            lookup_cost.saturating_add(fallback_cost).saturating_add(1),
            Utf16::default(),
        )?;
        Ok(self
            .python_text_origins
            .get(path.units())
            .or_else(|| {
                self.python_source_strings
                    .get(&(fallback as *const Utf16 as usize))
            })
            .map(InstanceText::Python)
            .unwrap_or(InstanceText::Utf16(fallback)))
    }
    fn value_matches<T: InstanceView>(
        &self,
        expected: &Value,
        actual: &T,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        if let Some(source) = self
            .python_exact_values
            .get(&(expected as *const Value as usize))
        {
            instances_equal(source.as_ref(), actual, ctx)
        } else {
            canonical_equal(expected, actual, ctx)
        }
    }
    fn schema_pointer(
        &self,
        path: &Utf16,
        segment: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        let lookup_cost = btree_index_lookup_work(self.python_source_keys.len());
        if let Some(source) = self
            .python_source_keys
            .get(&(segment as *const Utf16 as usize))
        {
            ctx.charge_work_u64(
                marked_python_path_work(path, source).saturating_add(lookup_cost),
                Utf16::default(),
            )?;
            return Ok(append_marked_python_path(path, source));
        }
        ctx.charge_work_u64(
            (path.len() as u64)
                .saturating_add((segment.len() as u64).saturating_mul(3))
                .saturating_add(lookup_cost)
                .saturating_add(1),
            Utf16::default(),
        )?;
        Ok(append_schema_pointer(path, segment))
    }
    fn instance_pointer(
        &self,
        path: &Utf16,
        segment: InstanceText<'_>,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        match segment {
            InstanceText::Utf16(text) => {
                ctx.charge_work_u64(
                    (path.len() as u64)
                        .saturating_add((text.len() as u64).saturating_mul(3))
                        .saturating_add(1),
                    Utf16::default(),
                )?;
                Ok(append_instance_path(path, text))
            }
            InstanceText::Python(text) if matches!(self.regex_profile, RegexProfile::Python(_)) => {
                ctx.charge_work_u64(marked_python_path_work(path, text), Utf16::default())?;
                Ok(append_marked_python_path(path, text))
            }
            InstanceText::Python(text) => Ok(append_instance_path(path, &text.to_utf16(ctx)?)),
        }
    }
    fn pattern_matches_text(
        regex: &CompiledRegex,
        text: InstanceText<'_>,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        match (regex, text) {
            (CompiledRegex::Python(regex), InstanceText::Python(text)) => Ok(regex
                .find_from_codepoints_with_context(text.codepoints(), 0, ctx)?
                .is_some()),
            (CompiledRegex::Python(regex), InstanceText::Utf16(text)) => Ok(regex
                .find_from_utf16_with_context(text.units(), 0, ctx)?
                .is_some()),
            (CompiledRegex::Ecma(regex), InstanceText::Python(text)) => {
                let text = text.to_utf16(ctx)?;
                Ok(regex.find_from_utf16(text.units(), 0).next().is_some())
            }
            (CompiledRegex::Ecma(regex), InstanceText::Utf16(text)) => {
                Ok(regex.find_from_utf16(text.units(), 0).next().is_some())
            }
        }
    }
    pub fn compile_with_dialect(
        schema: &Value,
        resources: &SchemaResources,
        dialect: SchemaDialect,
        strict: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        Self::compile_inner(
            schema,
            resources,
            dialect,
            strict,
            RegexProfile::Ecma262Unicode,
            true,
            false,
            false,
            ctx,
        )
    }
    fn compile_inner(
        schema: &Value,
        resources: &SchemaResources,
        dialect: SchemaDialect,
        strict: bool,
        regex_profile: RegexProfile,
        resolve_references_at_compile: bool,
        apply_local_reference_gate: bool,
        allow_duplicate_schema_keys: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        if ctx.profile() == crate::context::ResourceProfile::HardIsolated {
            return Err(unavailable());
        }
        let schema = if allow_duplicate_schema_keys {
            copy_schema_json(schema, ctx)?
        } else {
            copy_json(schema, ctx)?
        };
        let mut owned = Vec::with_capacity(resources.entries.len());
        let mut identities: Vec<(&Utf16, &Value)> = Vec::new();
        for (id, value) in &resources.entries {
            ctx.charge_work(id.len(), Utf16::default())?;
            ctx.charge_work(1, id.clone())?;
            if let Some((_, previous)) = identities.iter().find(|(key, _)| *key == id) {
                if !canonical_equal(previous, value, ctx)? {
                    return Err(EngineError::new(
                        "SCHEMA_ID_CONFLICT",
                        id.clone(),
                        "Conflicting schema identity",
                    ));
                }
                continue;
            }
            let copied = if allow_duplicate_schema_keys {
                copy_schema_json(value, ctx)?
            } else {
                copy_json(value, ctx)?
            };
            identities.push((id, value));
            owned.push((id.clone(), copied));
        }
        let compiled = Self {
            schema,
            resources: SchemaResources { entries: owned },
            dialect,
            strict,
            regex_profile,
            resolve_references_at_compile,
            python_text_origins: std::collections::BTreeMap::new(),
            python_member_keys: std::collections::BTreeMap::new(),
            python_source_strings: std::collections::BTreeMap::new(),
            python_source_keys: std::collections::BTreeMap::new(),
            python_exact_values: std::collections::BTreeMap::new(),
            python_reference_targets: std::collections::BTreeMap::new(),
            python_resource_roots: std::collections::BTreeMap::new(),
        };
        if apply_local_reference_gate {
            validate_local_reference_gate(&compiled.schema, &Utf16::default(), ctx)?;
        }
        compiled.preflight(
            &compiled.schema,
            &schema_origin_path(&compiled.schema),
            &schema_id(&compiled.schema)
                .map(|id| resolve_schema_uri(dialect, "", &id).unwrap_or(id))
                .unwrap_or_default(),
            0,
            ctx,
            &mut BTreeSet::new(),
        )?;
        for (id, resource) in &compiled.resources.entries {
            let mut root_path = id.units().to_vec();
            root_path.push(0x23);
            let retrieval = id.to_utf8().unwrap_or_default();
            compiled.preflight(
                resource,
                &Utf16::new(root_path),
                &retrieval,
                0,
                ctx,
                &mut BTreeSet::new(),
            )?;
        }
        validate_schema_against_metaschema(&compiled.schema, dialect, regex_profile, ctx)?;
        Ok(compiled)
    }
    pub fn validate(
        &self,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<StructuralError>, EngineError> {
        self.validate_with_codegen_errors(value, false, ctx)
    }
    /// Return the compiler's all-errors ECMAScript presentation, including
    /// failed oneOf branches and the indices of its first two passing branches.
    /// This uses the same evaluator and live Context as ordinary validation;
    /// artifact content cannot select this presentation mode.
    pub fn validate_codegen_errors(
        &self,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<StructuralError>, EngineError> {
        if !matches!(self.regex_profile, RegexProfile::Ecma262Unicode) {
            return Err(EngineError::new(
                "SCHEMA_PROFILE",
                Utf16::default(),
                "Compiler diagnostics require the ECMAScript schema profile",
            ));
        }
        self.validate_with_codegen_errors(value, true, ctx)
    }
    fn validate_with_codegen_errors(
        &self,
        value: &Value,
        codegen_errors: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<StructuralError>, EngineError> {
        let value = copy_json(value, ctx)?;
        let mut errors = Vec::new();
        let mut evaluated = Evaluated::default();
        evaluated.codegen_errors = codegen_errors;
        self.eval(
            &self.schema,
            &value,
            &Utf16::default(),
            &Utf16::from("#"),
            0,
            ctx,
            &mut errors,
            &mut evaluated,
        )?;
        Ok(errors)
    }
    /// Evaluate an already-admitted source value through the same interpreter
    /// as UMF values. Bindings must meter/admit the owned Python tree before
    /// calling this method; it intentionally does not project it to `Value`.
    pub(crate) fn validate_instance<T: InstanceView>(
        &self,
        value: &T,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<StructuralError>, EngineError> {
        let outcome = self.evaluate_instance_with_mode(value, EvaluationMode::AllErrors, ctx)?;
        match outcome.terminal_error {
            Some(error) => Err(error),
            None => Ok(outcome.errors),
        }
    }

    pub(crate) fn evaluate_instance_with_mode<T: InstanceView>(
        &self,
        value: &T,
        mode: EvaluationMode,
        ctx: &mut Context<'_>,
    ) -> Result<EvaluationOutcome, EngineError> {
        let mut errors = Vec::new();
        let mut evaluated = Evaluated::default();
        evaluated.mode = mode;
        let result = self.eval(
            &self.schema,
            value,
            &Utf16::default(),
            &Utf16::from("#"),
            0,
            ctx,
            &mut errors,
            &mut evaluated,
        );
        let terminal_error = match result {
            Ok(()) => None,
            Err(error) if error.is_python_schema_terminal() => Some(error),
            Err(error) => return Err(error),
        };
        if !self.python_source_keys.is_empty() || !self.python_source_strings.is_empty() {
            for error in &mut errors {
                error.python_source_path = true;
            }
        }
        Ok(EvaluationOutcome {
            errors,
            terminal_error,
        })
    }
    fn preflight(
        &self,
        schema: &Value,
        path: &Utf16,
        scope: &str,
        depth: usize,
        ctx: &mut Context<'_>,
        seen: &mut BTreeSet<usize>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, path.clone())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "Schema nesting depth exceeded",
            ));
        }
        let Value::Object(m) = schema else {
            if matches!(schema, Value::Bool(_)) {
                let path_text = path.to_utf8().ok();
                let boolean_allowed_by_legacy_keyword =
                    matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                        && path_text.as_deref().is_some_and(|p| {
                            p.ends_with("/additionalProperties") || p.ends_with("/additionalItems")
                        });
                if matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                    && !boolean_allowed_by_legacy_keyword
                {
                    return Err(schema_error(
                        path,
                        "Boolean schemas are not valid in this dialect",
                    ));
                }
                return Ok(());
            }
            return Err(schema_error(path, "Schema must be an object or boolean"));
        };
        let known = keywords(self.dialect);
        let scope = if let Some(id) = schema_id(schema) {
            ctx.charge_work(scope.len().saturating_add(id.len()), path.clone())?;
            resolve_schema_uri(self.dialect, scope, &id).unwrap_or(id)
        } else {
            scope.to_owned()
        };
        for (key, val) in m {
            let text = match key.to_utf8() {
                Ok(text) => text,
                Err(_) if !self.strict => continue,
                Err(_) => return Err(schema_error(path, "Schema keyword is not valid Unicode")),
            };
            if !known.contains(text.as_str()) {
                if self.strict {
                    return Err(EngineError::new(
                        "SCHEMA_UNKNOWN_KEYWORD",
                        path.clone(),
                        format!("Unknown schema keyword '{text}'"),
                    ));
                }
                continue;
            }
            let child = append_schema_path(path, &text);
            match text.as_str() {
                "$ref" | "$dynamicRef" | "$recursiveRef" => {
                    if !matches!(val, Value::String(_)) {
                        return Err(schema_error(&child, "reference keyword must be a string"));
                    }
                    if self.resolve_references_at_compile {
                        self.resolve_ref_with_scope(val, &child, &scope, ctx)?;
                    }
                }
                "$anchor" | "$dynamicAnchor" => {
                    let anchor = as_utf8(val)
                        .ok_or_else(|| schema_error(&child, "anchor must be a string"))?;
                    let mut chars = anchor.chars();
                    let valid = chars.next().is_some_and(|c| c.is_ascii_alphabetic())
                        && chars.all(|c| {
                            c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-')
                        });
                    if !valid {
                        return Err(schema_error(&child, "Invalid schema anchor"));
                    }
                }
                "type" | "disallow" => {
                    // Draft 3's metaschema intentionally permits extension
                    // type names (and delegates their meaning to its type
                    // checker). Later drafts enumerate the primitive names.
                    if self.dialect != SchemaDialect::Draft3 {
                        validate_type_declaration(val, &child, self.dialect)?;
                    }
                    if self.dialect == SchemaDialect::Draft3 {
                        match val {
                            Value::Object(_) => {
                                self.preflight(val, &child, &scope, depth + 1, ctx, seen)?;
                            }
                            Value::Array(items) => {
                                for (index, branch) in items.iter().enumerate() {
                                    if matches!(branch, Value::Object(_)) {
                                        self.preflight(
                                            branch,
                                            &append_schema_path(&child, &index.to_string()),
                                            &scope,
                                            depth + 1,
                                            ctx,
                                            seen,
                                        )?;
                                    }
                                }
                            }
                            _ => (),
                        }
                    }
                }
                "required" => {
                    if self.dialect == SchemaDialect::Draft3 && matches!(val, Value::Bool(_)) {
                        // Draft 3 expresses a required property on the property schema itself.
                    } else {
                        validate_string_array(val, &child, true)?;
                    }
                }
                "enum" => {
                    if let Value::Array(items) = val {
                        if items.is_empty()
                            && matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                        {
                            return Err(schema_error(
                                &child,
                                "enum must contain at least one value",
                            ));
                        }
                    } else {
                        return Err(schema_error(&child, "enum must be an array"));
                    }
                }
                "properties" | "patternProperties" | "$defs" | "definitions"
                | "dependentSchemas" => {
                    // Draft 3's `definitions` has no schema semantics in the
                    // predecessor profile. Its contents are opaque annotations;
                    // a `$ref` that later resolves to a boolean fails at runtime.
                    if self.dialect == SchemaDialect::Draft3 && text == "definitions" {
                        continue;
                    }
                    if let Value::Object(children) = val {
                        for (_member_index, (name, child_schema)) in children.iter().enumerate() {
                            if text == "patternProperties" {
                                let pattern_path = append_schema_pointer(&child, name);
                                self.compile_pattern(name, &pattern_path, ctx)?;
                            }
                            let p = append_schema_pointer(&append_schema_path(path, &text), name);
                            self.preflight(child_schema, &p, &scope, depth + 1, ctx, seen)?;
                        }
                    } else {
                        return Err(schema_error(&child, "Keyword value must be an object"));
                    }
                }
                "items"
                | "additionalItems"
                | "additionalProperties"
                | "unevaluatedProperties"
                | "unevaluatedItems"
                | "contains"
                | "not"
                | "if"
                | "then"
                | "else"
                | "propertyNames" => {
                    if text == "items"
                        && self.dialect == SchemaDialect::Draft2020_12
                        && matches!(val, Value::Array(_))
                    {
                        return Err(schema_error(
                            &child,
                            "Draft 2020-12 items must be a schema; use prefixItems for tuple validation",
                        ));
                    }
                    if text == "additionalItems"
                        && self.dialect == SchemaDialect::Draft2020_12
                        && self.strict
                    {
                        return Err(schema_error(
                            &child,
                            "additionalItems is not available in Draft 2020-12",
                        ));
                    }
                    if text == "additionalItems" && self.dialect == SchemaDialect::Draft2020_12 {
                        continue;
                    }
                    if let Value::Array(items) = val {
                        for (i, x) in items.iter().enumerate() {
                            self.preflight(
                                x,
                                &append_schema_path(
                                    &append_schema_path(path, &text),
                                    &i.to_string(),
                                ),
                                &scope,
                                depth + 1,
                                ctx,
                                seen,
                            )?;
                        }
                    } else {
                        self.preflight(val, &child, &scope, depth + 1, ctx, seen)?;
                    }
                }
                "allOf" | "anyOf" | "oneOf" | "prefixItems" => {
                    if let Value::Array(items) = val {
                        if items.is_empty() && text != "prefixItems" {
                            return Err(schema_error(&child, "Applicator array must not be empty"));
                        }
                        for (i, x) in items.iter().enumerate() {
                            self.preflight(
                                x,
                                &append_schema_path(&child, &i.to_string()),
                                &scope,
                                depth + 1,
                                ctx,
                                seen,
                            )?;
                        }
                    } else {
                        return Err(schema_error(&child, "Applicator must be an array"));
                    }
                }
                "extends" if self.dialect == SchemaDialect::Draft3 => {
                    if let Value::Array(items) = val {
                        for (index, item) in items.iter().enumerate() {
                            self.preflight(
                                item,
                                &append_schema_path(&child, &index.to_string()),
                                &scope,
                                depth + 1,
                                ctx,
                                seen,
                            )?;
                        }
                    } else {
                        self.preflight(val, &child, &scope, depth + 1, ctx, seen)?;
                    }
                }
                "pattern" => {
                    let Value::String(pat) = val else {
                        return Err(schema_error(&child, "pattern must be a string"));
                    };
                    self.compile_pattern(pat, &child, ctx)?;
                }
                "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
                | "divisibleBy" => {
                    let old_exclusive =
                        matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                            && matches!(text.as_str(), "exclusiveMinimum" | "exclusiveMaximum");
                    if old_exclusive && !matches!(val, Value::Bool(_)) {
                        return Err(schema_error(
                            &child,
                            "Exclusive bound flag must be a boolean",
                        ));
                    }
                    if !old_exclusive && !matches!(val, Value::Number(_)) {
                        return Err(schema_error(&child, "Numeric keyword must be a number"));
                    }
                    if matches!(text.as_str(), "multipleOf" | "divisibleBy")
                        && matches!(val,Value::Number(n) if *n<=0.0)
                    {
                        return Err(schema_error(&child, "multipleOf must be greater than zero"));
                    }
                }
                "minLength" | "maxLength" | "minItems" | "maxItems" | "minProperties"
                | "maxProperties" => {
                    if !matches!(val,Value::Number(n) if n.fract()==0.0&&(self.dialect == SchemaDialect::Draft3 || *n>=0.0))
                    {
                        return Err(schema_error(
                            &child,
                            "Size keyword must be a non-negative integer",
                        ));
                    }
                }
                "minContains" | "maxContains" => {
                    if self.dialect == SchemaDialect::Draft2019_09
                        || self.dialect == SchemaDialect::Draft2020_12
                    {
                        if !matches!(val,Value::Number(n) if n.fract()==0.0&&*n>=0.0) {
                            return Err(schema_error(
                                &child,
                                "Size keyword must be a non-negative integer",
                            ));
                        }
                    }
                }
                "uniqueItems" => {
                    if !matches!(val, Value::Bool(_)) {
                        return Err(schema_error(&child, "uniqueItems must be a boolean"));
                    }
                }
                "dependencies" => {
                    if let Value::Object(deps) = val {
                        for (name, dep) in deps {
                            if matches!(dep, Value::Array(_)) {
                                validate_string_array(
                                    dep,
                                    &append_schema_pointer(&child, name),
                                    true,
                                )?;
                            } else if self.dialect == SchemaDialect::Draft3
                                && matches!(dep, Value::String(_))
                            {
                                // Draft 3 permits a string dependency naming a peer property.
                            } else {
                                self.preflight(
                                    dep,
                                    &append_schema_pointer(&child, name),
                                    &scope,
                                    depth + 1,
                                    ctx,
                                    seen,
                                )?;
                            }
                        }
                    } else {
                        return Err(schema_error(&child, "dependencies must be an object"));
                    }
                }
                "dependentRequired" => {
                    if let Value::Object(deps) = val {
                        for (name, dep) in deps {
                            validate_string_array(dep, &append_schema_pointer(&child, name), true)?;
                        }
                    } else {
                        return Err(schema_error(&child, "dependentRequired must be an object"));
                    }
                }
                _ => {}
            }
        }
        let _ = &mut *seen;
        Ok(())
    }
    fn resolve_eval_ref<'a>(
        &'a self,
        reference: &Value,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        self.resolve_ref(reference, path, ctx).map_err(|error| {
            if matches!(self.regex_profile, RegexProfile::Python(_))
                && error.code == "SCHEMA_REF_UNRESOLVED"
            {
                error.with_python_schema_terminal(PythonSchemaTerminal::LocalReference)
            } else {
                error
            }
        })
    }

    fn python_record_reference_lookup(
        &self,
        keyword: &str,
        reference: &Value,
        evaluated: &mut Evaluated,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        if !matches!(self.regex_profile, RegexProfile::Python(_)) {
            return Ok(());
        }
        ctx.charge_work_u64(
            btree_index_lookup_work(self.python_reference_targets.len()),
            Utf16::default(),
        )?;
        let Some(bound) = self
            .python_reference_targets
            .get(&(reference as *const Value as usize))
        else {
            return Ok(());
        };
        let Some(current_uri) = bound.source_resource_uri.as_ref() else {
            return Ok(());
        };
        if current_uri.is_empty() {
            return Ok(());
        }
        // Source consumers admit local references; recursiveRef always looks up #.
        // Preserve the lookup distinction for explicitly supplied strict resources.
        ctx.charge_work_u64(
            btree_index_lookup_work(self.python_source_strings.len()),
            Utf16::default(),
        )?;
        let source = if let Value::String(value) = reference {
            self.python_source_strings
                .get(&(value as *const Utf16 as usize))
        } else {
            None
        };
        let lookup_owned =
            if keyword == "$recursiveRef" && self.dialect == SchemaDialect::Draft2019_09 {
                None
            } else if let Some(source) = source {
                ctx.charge_work(source.len(), Utf16::default())?;
                let end = source
                    .codepoints()
                    .iter()
                    .position(|p| *p == b'#' as u32)
                    .unwrap_or(source.len());
                if end == 0 {
                    None
                } else {
                    let base = PythonResourceUri::from_points(&source.codepoints()[..end], ctx)?;
                    current_uri.join(&base, ctx)?.or(Some(base))
                }
            } else {
                None
            };
        let should_push = evaluated.python_recursive_history.is_empty()
            || if let Some(lookup) = &lookup_owned {
                !lookup.same(current_uri, ctx)?
            } else {
                false
            };
        if should_push {
            ctx.charge_work_u64(
                current_uri.len() as u64
                    + bound.resource_root_indices.len() as u64
                    + evaluated.python_recursive_history.len() as u64
                    + 3,
                Utf16::default(),
            )?;
            evaluated.python_recursive_history.insert(
                0,
                PythonResourceLocator {
                    uri: current_uri.clone(),
                    resource: bound.resource,
                    root_indices: bound.resource_root_indices.clone(),
                    recursive_anchor: bound.source_resource_recursive_anchor,
                },
            );
        }
        Ok(())
    }
    fn python_recursive_retarget<'a>(
        &'a self,
        reference: &Value,
        evaluated: &Evaluated,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        let (mut target, mut path) = self.resolve_python_source_resource(reference, ctx)?;
        if !matches!(get(target, "$recursiveAnchor"), Some(Value::Bool(true))) {
            return Ok((target, path));
        }
        for entry in &evaluated.python_recursive_history {
            ctx.charge_work(1, Utf16::default())?;
            if !entry.recursive_anchor {
                break;
            }
            (target, path) =
                self.python_resource_location(entry.resource, &entry.root_indices, ctx)?;
        }
        Ok((target, path))
    }
    fn python_resource_display_path(
        &self,
        root: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        ctx.charge_work_u64(
            btree_index_lookup_work(self.python_resource_roots.len()) + 1,
            Utf16::default(),
        )?;
        if let Some(locator) = self
            .python_resource_roots
            .get(&(root as *const Value as usize))
        {
            locator.uri.display_path(ctx)
        } else {
            ctx.charge_work(1, Utf16::default())?;
            Ok(Utf16::from("#"))
        }
    }

    fn python_resource_location<'a>(
        &'a self,
        resource: Option<usize>,
        indices: &[usize],
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        ctx.charge_work_u64(indices.len() as u64 + 1, Utf16::default())?;
        let mut current = if let Some(index) = resource {
            self.resources.entries.get(index).map(|(_, v)| v)
        } else {
            Some(&self.schema)
        }
        .ok_or_else(|| schema_error(&Utf16::default(), "Python source resource is unavailable"))?;
        let mut path = self.python_resource_display_path(current, ctx)?;
        for index in indices {
            current = match current {
                Value::Object(members) => {
                    let (key, value) = members
                        .get(*index)
                        .ok_or_else(|| schema_error(&path, "Python source resource changed"))?;
                    path = self.schema_pointer(&path, key, ctx)?;
                    value
                }
                Value::Array(items) => {
                    let value = items
                        .get(*index)
                        .ok_or_else(|| schema_error(&path, "Python source resource changed"))?;
                    ctx.charge_work(path.len().saturating_add(22), Utf16::default())?;
                    path = append_schema_path(&path, &index.to_string());
                    value
                }
                _ => return Err(schema_error(&path, "Python source resource changed")),
            };
            path = self.effective_schema_path(current, &path, ctx)?;
        }
        Ok((current, path))
    }
    fn python_scope_node<'a>(
        &'a self,
        address: usize,
        ctx: &mut Context<'_>,
    ) -> Result<&'a Value, EngineError> {
        fn find<'a>(
            node: &'a Value,
            address: usize,
            ctx: &mut Context<'_>,
        ) -> Result<Option<&'a Value>, EngineError> {
            ctx.charge_work(1, Utf16::default())?;
            if node as *const Value as usize == address {
                return Ok(Some(node));
            }
            match node {
                Value::Object(members) => {
                    for (_, child) in members {
                        if let Some(found) = find(child, address, ctx)? {
                            return Ok(Some(found));
                        }
                    }
                }
                Value::Array(items) => {
                    for child in items {
                        if let Some(found) = find(child, address, ctx)? {
                            return Ok(Some(found));
                        }
                    }
                }
                _ => {}
            }
            Ok(None)
        }
        if let Some(node) = find(&self.schema, address, ctx)? {
            return Ok(node);
        }
        for (_, root) in &self.resources.entries {
            if let Some(node) = find(root, address, ctx)? {
                return Ok(node);
            }
        }
        Err(schema_error(
            &Utf16::default(),
            "Python dynamic scope node is unavailable",
        ))
    }

    fn resolve_python_source_resource<'a>(
        &'a self,
        reference: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        ctx.charge_work_u64(
            btree_index_lookup_work(self.python_reference_targets.len()),
            Utf16::default(),
        )?;
        if let Some(bound) = self
            .python_reference_targets
            .get(&(reference as *const Value as usize))
        {
            self.python_resource_location(bound.resource, &bound.resource_root_indices, ctx)
        } else {
            self.python_resource_location(None, &[], ctx)
        }
    }

    fn resolve_ref<'a>(
        &'a self,
        reference: &Value,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        self.resolve_ref_scoped(reference, path, None, ctx)
    }

    fn resolve_ref_with_scope<'a>(
        &'a self,
        reference: &Value,
        path: &Utf16,
        scope: &str,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        self.resolve_ref_scoped(reference, path, Some(scope), ctx)
    }

    fn resolve_ref_scoped<'a>(
        &'a self,
        reference: &Value,
        path: &Utf16,
        scope_override: Option<&str>,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        ctx.charge_work_u64(
            path.len() as u64 + btree_index_lookup_work(self.python_reference_targets.len()) + 1,
            Utf16::default(),
        )?;
        if let Some(target) = self
            .python_reference_targets
            .get(&(reference as *const Value as usize))
        {
            if matches!(target.failure, Some(PythonReferenceFailure::Unresolved)) {
                return Err(EngineError::new(
                    "SCHEMA_REF_UNRESOLVED",
                    path.clone(),
                    "Schema reference target does not exist",
                )
                .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
            }
            if let Some(PythonReferenceFailure::InvalidArrayIndex) = target.failure {
                return Err(EngineError::new(
                    "PYTHON_SCHEMA_EVALUATION",
                    path.clone(),
                    "Invalid array index in schema reference",
                )
                .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
            }
            if let Some(PythonReferenceFailure::InvalidTraversal) = target.failure {
                return Err(EngineError::new(
                    "PYTHON_SCHEMA_EVALUATION",
                    path.clone(),
                    "Invalid schema reference traversal",
                )
                .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
            }
            let mut current = if let Some(index) = target.resource {
                self.resources.entries.get(index).map(|(_, value)| value)
            } else {
                Some(&self.schema)
            }
            .ok_or_else(|| schema_error(path, "Python source reference resource is unavailable"))?;
            let mut target_path = self.python_resource_display_path(current, ctx)?;
            ctx.charge_work_u64(
                target.indices.len() as u64 + target.resource_root_indices.len() as u64,
                Utf16::default(),
            )?;
            for index in &target.resource_root_indices {
                current = match current {
                    Value::Object(members) => {
                        let (key, value) = members.get(*index).ok_or_else(|| {
                            schema_error(path, "Python source reference resource changed")
                        })?;
                        target_path = self.schema_pointer(&target_path, key, ctx)?;
                        value
                    }
                    Value::Array(items) => {
                        let value = items.get(*index).ok_or_else(|| {
                            schema_error(path, "Python source reference resource changed")
                        })?;
                        ctx.charge_work(target_path.len().saturating_add(22), Utf16::default())?;
                        target_path = append_schema_path(&target_path, &index.to_string());
                        value
                    }
                    _ => {
                        return Err(schema_error(
                            path,
                            "Python source reference resource changed",
                        ))
                    }
                };
            }
            if !target.resource_root_indices.is_empty() {
                target_path = self.effective_schema_path(current, &target_path, ctx)?;
            }
            for index in &target.indices {
                current = match current {
                    Value::Object(members) => {
                        let (key, value) = members.get(*index).ok_or_else(|| {
                            schema_error(path, "Python source reference target changed")
                        })?;
                        target_path = self.schema_pointer(&target_path, key, ctx)?;
                        value
                    }
                    Value::Array(items) => {
                        let value = items.get(*index).ok_or_else(|| {
                            schema_error(path, "Python source reference target changed")
                        })?;
                        ctx.charge_work(target_path.len().saturating_add(22), Utf16::default())?;
                        target_path = append_schema_path(&target_path, &index.to_string());
                        value
                    }
                    _ => return Err(schema_error(path, "Python source reference target changed")),
                };
                // Pointer traversal can enter a recognized resource in any dialect.
                // `tsp` must then be relative to that resource so evaluation
                // errors and subsequent references use the correct origin.
                if matches!(self.regex_profile, RegexProfile::Python(_)) {
                    target_path = self.effective_schema_path(current, &target_path, ctx)?;
                }
            }
            return Ok((current, target_path));
        }
        if let Value::String(reference) = reference {
            ctx.charge_work(reference.len(), path.clone())?;
        }
        let text = as_utf8(reference).ok_or_else(|| schema_error(path, "$ref must be a string"))?;
        let (base, fragment) = text.split_once('#').unwrap_or((&text, ""));
        // A relative reference within an externally supplied resource resolves
        // against that resource's root, not the primary schema's root.
        let current_origin = scope_override.map(str::to_owned).or_else(|| path
            .to_utf8()
            .ok()
            .and_then(|p| p.split_once('#').map(|(id, _)| id.to_owned()))
            .filter(|origin| !origin.is_empty())
            .or_else(|| schema_id(&self.schema)))
            .unwrap_or_default();
        let effective_base = if base.is_empty() {
            if current_origin.is_empty() {
                schema_id(&self.schema).unwrap_or_default()
            } else {
                current_origin
            }
        } else if base.contains(':') {
            base.to_owned()
        } else {
            resolve_schema_uri(self.dialect, &current_origin, base).ok_or_else(|| {
                EngineError::new(
                    "SCHEMA_REF_UNRESOLVED",
                    path.clone(),
                    "Relative schema reference has no absolute base URI",
                )
            })?
        };
        let root = if effective_base.is_empty() {
            &self.schema
        } else if schema_id(&self.schema).as_deref() == Some(effective_base.as_str()) {
            &self.schema
        } else {
            let mut selected = None;
            for (id, value) in &self.resources.entries {
                ctx.charge_work(1, path.clone())?;
                if id.to_utf8().ok().as_deref() == Some(effective_base.as_str()) {
                    selected = Some(value);
                    break;
                }
            }
            if selected.is_none() {
                selected =
                    find_embedded_resource(&self.schema, &effective_base, self.dialect, ctx, path)?;
            }
            if selected.is_none() {
                for (id, value) in &self.resources.entries {
                    if let Some(found) =
                        find_embedded_resource(value, &effective_base, self.dialect, ctx, path)?
                    {
                        selected = Some(found);
                        break;
                    }
                    if id.to_utf8().ok().as_deref() == Some(effective_base.as_str()) {
                        selected = Some(value);
                        break;
                    }
                }
            }
            selected.ok_or_else(|| {
                EngineError::new(
                    "SCHEMA_REF_UNRESOLVED",
                    path.clone(),
                    "Schema reference is not in the supplied resource set",
                )
            })?
        };
        let mut current = root;
        if !fragment.is_empty() {
            ctx.charge_work(fragment.len(), path.clone())?;
            let decoded_fragment = percent_decode_fragment(fragment);
            if decoded_fragment.starts_with('/') {
                for part in decoded_fragment[1..].split('/') {
                    let key = unescape_pointer(part);
                    let traversing_scalar = !matches!(current, Value::Object(_) | Value::Array(_));
                    current = match current {
                        Value::Object(m) => {
                            ctx.charge_work(m.len(), path.clone())?;
                            m.iter()
                                .find(|(k, _)| k.units() == key.as_slice())
                                .map(|(_, v)| v)
                        }
                        Value::Array(a) => part.parse::<usize>().ok().and_then(|i| a.get(i)),
                        _ => None,
                    }
                    .ok_or_else(|| {
                        if traversing_scalar
                            && matches!(self.regex_profile, RegexProfile::Python(_))
                        {
                            EngineError::new(
                                "PYTHON_SCHEMA_EVALUATION",
                                path.clone(),
                                "Schema reference path traverses a non-container value",
                            )
                            .with_python_schema_terminal(PythonSchemaTerminal::LocalReference)
                        } else {
                            EngineError::new(
                                "SCHEMA_REF_UNRESOLVED",
                                path.clone(),
                                "Schema reference target does not exist",
                            )
                        }
                    })?;
                }
            } else {
                current = if let Some(anchor) =
                    find_anchor(root, &decoded_fragment, self.dialect, ctx, path)?
                {
                    anchor
                } else {
                    find_legacy_id_fragment(root, &decoded_fragment, self.dialect, ctx, path)?
                        .ok_or_else(|| {
                            EngineError::new(
                                "SCHEMA_REF_UNRESOLVED",
                                path.clone(),
                                "Schema anchor does not exist",
                            )
                        })?
                };
            }
        }
        let mut schema_path = effective_base.encode_utf16().collect::<Vec<_>>();
        schema_path.push(0x23);
        schema_path.extend(fragment.encode_utf16());
        let sp = Utf16::new(schema_path);
        Ok((current, sp))
    }
    fn draft3_type_matches<T: InstanceView>(
        &self,
        rule: &Value,
        data: &T,
        ip: &Utf16,
        kp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        let branches: Vec<(usize, &Value)> = match rule {
            Value::Object(_) => vec![(0, rule)],
            Value::Array(items) => items.iter().enumerate().collect(),
            _ => return Ok(type_matches(rule, data, self.dialect)),
        };
        for (index, branch) in branches {
            match branch {
                Value::Object(_) => {
                    let mut errors = Vec::new();
                    let mut evaluated = Evaluated::default();
                    evaluated.mode = EvaluationMode::FirstError;
                    self.eval(
                        branch,
                        data,
                        ip,
                        &append_schema_path(kp, &index.to_string()),
                        depth + 1,
                        ctx,
                        &mut errors,
                        &mut evaluated,
                    )?;
                    if errors.is_empty() {
                        return Ok(true);
                    }
                }
                _ if type_matches(branch, data, self.dialect) => return Ok(true),
                _ => (),
            }
        }
        Ok(false)
    }

    fn eval<T: InstanceView>(
        &self,
        schema: &Value,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let scoped_path = self.effective_schema_path(schema, sp, ctx)?;
        let scope_len = evaluated.dynamic_scope.len();
        if let Some(Value::String(anchor)) = get(schema, "$dynamicAnchor") {
            ctx.charge_work_u64(
                anchor.len() as u64 + scoped_path.len() as u64 + 2,
                Utf16::default(),
            )?;
            evaluated.dynamic_scope.push((
                anchor.units().to_vec(),
                scoped_path.clone(),
                schema as *const Value as usize,
            ));
        } else if self.dialect == SchemaDialect::Draft2019_09
            && matches!(get(schema, "$recursiveAnchor"), Some(Value::Bool(true)))
        {
            ctx.charge_work_u64(scoped_path.len() as u64 + 1, Utf16::default())?;
            evaluated.dynamic_scope.push((
                Vec::new(),
                scoped_path.clone(),
                schema as *const Value as usize,
            ));
        }
        let result = if evaluated.annotation_scan
            && (self.uses_python_2019_annotation_profile()
                || self.uses_python_2020_annotation_profile())
        {
            self.visit_python_annotations(schema, data, ip, &scoped_path, depth, ctx, evaluated)
        } else {
            self.eval_inner(schema, data, ip, &scoped_path, depth, ctx, out, evaluated)
        };
        evaluated.dynamic_scope.truncate(scope_len);
        result
    }

    fn effective_schema_path(
        &self,
        schema: &Value,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        if matches!(self.regex_profile, RegexProfile::Python(_)) {
            ctx.charge_work_u64(
                path.len() as u64 + btree_index_lookup_work(self.python_resource_roots.len()) + 1,
                Utf16::default(),
            )?;
            if std::ptr::eq(schema, &self.schema) {
                return Ok(path.clone());
            }
            if let Some(resource) = self
                .python_resource_roots
                .get(&(schema as *const Value as usize))
            {
                return resource.uri.display_path(ctx);
            }
            return Ok(path.clone());
        }
        let id_len = get(schema, "$id")
            .or_else(|| get(schema, "id"))
            .and_then(|value| match value {
                Value::String(id) => Some(id.len()),
                _ => None,
            })
            .unwrap_or(0);
        ctx.charge_work_u64(
            path.len() as u64 * 3 + id_len as u64 * 4 + 4,
            Utf16::default(),
        )?;
        if std::ptr::eq(schema, &self.schema) {
            return Ok(path.clone());
        }
        let Some(id) = schema_id(schema) else {
            return Ok(path.clone());
        };
        let parent = path
            .to_utf8()
            .ok()
            .and_then(|text| text.split_once('#').map(|(base, _)| base.to_owned()))
            .filter(|base| !base.is_empty())
            .or_else(|| schema_id(&self.schema))
            .unwrap_or_default();
        let effective = if id.contains(':') {
            id
        } else {
            resolve_schema_uri(self.dialect, &parent, &id).unwrap_or(id)
        };
        let mut units = effective.encode_utf16().collect::<Vec<_>>();
        units.push(b'#' as u16);
        Ok(Utf16::new(units))
    }

    fn eval_unevaluated_properties<T: InstanceView>(
        &self,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.object_len() else {
            return Ok(());
        };
        let mut unevaluated = Vec::new();
        for index in 0..count {
            let Some((name, value)) = data.object_entry(index) else {
                continue;
            };
            if evaluated.contains_property(name, ctx, ip)? {
                continue;
            }
            let path_name = name.to_utf16(ctx)?;
            if matches!(rule, Value::Bool(false)) {
                ctx.charge_work(path_name.len(), Utf16::default())?;
                unevaluated.push(Value::String(path_name));
                continue;
            }
            let mut child_annotations = evaluated.child(ctx, ip)?;
            child_annotations.mode = EvaluationMode::AllErrors;
            let mut child_errors = Vec::new();
            self.eval(
                rule,
                value,
                &self.instance_pointer(ip, name, ctx)?,
                kp,
                depth + 1,
                ctx,
                &mut child_errors,
                &mut child_annotations,
            )?;
            evaluated.insert_property(name, ctx, ip)?;
            if !child_errors.is_empty() {
                ctx.charge_work(path_name.len(), Utf16::default())?;
                unevaluated.push(Value::String(path_name));
            }
        }
        if !unevaluated.is_empty() {
            if let Some(Value::String(first)) = unevaluated.first() {
                ctx.charge_work(first.len(), Utf16::default())?;
            }
            push_ctx(
                ctx,
                out,
                ip,
                kp,
                "unevaluatedProperties",
                object(vec![("unevaluatedProperty", unevaluated[0].clone())]),
                "must NOT have unevaluated properties",
            )?;
        }
        Ok(())
    }

    fn eval_unevaluated_items<T: InstanceView>(
        &self,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.array_len() else {
            return Ok(());
        };
        let mut unevaluated = Vec::new();
        for index in 0..count {
            let Some(value) = data.array_get(index) else {
                continue;
            };
            if evaluated.contains_item(index, ctx, ip)? {
                continue;
            }
            if matches!(rule, Value::Bool(false)) {
                ctx.charge_work(1, Utf16::default())?;
                unevaluated.push(Value::Number(index as f64));
                continue;
            }
            let mut child_annotations = evaluated.child(ctx, ip)?;
            child_annotations.mode = EvaluationMode::AllErrors;
            let mut child_errors = Vec::new();
            self.eval(
                rule,
                value,
                &append_instance_path(ip, &Utf16::from(index.to_string())),
                kp,
                depth + 1,
                ctx,
                &mut child_errors,
                &mut child_annotations,
            )?;
            evaluated.insert_item(index, ctx, ip)?;
            if !child_errors.is_empty() {
                ctx.charge_work(1, Utf16::default())?;
                unevaluated.push(Value::Number(index as f64));
            }
        }
        if !unevaluated.is_empty() {
            push_ctx(
                ctx,
                out,
                ip,
                kp,
                "unevaluatedItems",
                object(vec![("unevaluatedItems", Value::Array(unevaluated))]),
                "must NOT have unevaluated items",
            )?;
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_annotations<'a, T: InstanceView>(
        &self,
        schema: &'a Value,
        members: &'a [(Utf16, Value)],
        keyword: &str,
        rule: &'a Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&'a Value, Utf16)>,
        unevaluated_items: &mut Option<(&'a Value, Utf16)>,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan {
            if self.uses_python_2020_annotation_profile() {
                match keyword {
                    "unevaluatedProperties" => self.collect_python_property_predicates(
                        rule, kp, data, ip, depth, ctx, evaluated,
                    )?,
                    // The Python 2020 item helper returns all indexes at once
                    // when `items` is present. Without `items`, the
                    // unevaluatedItems validator predicates every array item,
                    // including indexes already marked by prefixItems.
                    "unevaluatedItems" if member(members, "items").is_none() => self
                        .collect_python_item_predicates(
                            rule, kp, data, ip, depth, ctx, evaluated,
                        )?,
                    "unevaluatedItems" => {}
                    _ => {}
                }
            } else if self.uses_python_2019_annotation_profile() {
                match keyword {
                    "unevaluatedProperties" => self
                        .collect_python_legacy_property_names(rule, kp, data, ip, ctx, evaluated)?,
                    "unevaluatedItems" => {
                        // The legacy helper short-circuits after `items` when it
                        // can establish the covered index set there. Tuple-form
                        // items continue into unevaluatedItems predicates.
                        match member(members, "items") {
                            Some(Value::Object(_)) | Some(Value::Bool(_))
                                if member(members, "additionalItems").is_some() => {}
                            Some(Value::Object(_)) => {}
                            Some(Value::Bool(_)) => {
                                let error = EngineError::new(
                                    "PYTHON_SCHEMA_EVALUATION",
                                    ip.clone(),
                                    "Draft 2019-09 boolean items annotation has no length",
                                )
                                .with_python_schema_terminal(
                                    PythonSchemaTerminal::LegacyBooleanItems,
                                );
                                return Err(error);
                            }
                            _ => self.collect_python_item_predicates(
                                rule, kp, data, ip, depth, ctx, evaluated,
                            )?,
                        }
                    }
                    _ => {}
                }
            }
            return Ok(());
        }
        match keyword {
            "unevaluatedProperties" => {
                if data.object_len().is_some() && !*annotation_scan_complete {
                    self.collect_schema_annotations(sp, schema, data, ip, depth, ctx, evaluated)?;
                    *annotation_scan_complete = true;
                }
                if matches!(self.regex_profile, RegexProfile::Python(_)) {
                    self.eval_unevaluated_properties(
                        rule, &kp, data, ip, depth, ctx, out, evaluated,
                    )?;
                } else {
                    *unevaluated_properties = Some((rule, kp.clone()));
                }
            }
            "unevaluatedItems" => {
                if data.array_len().is_some() && !*annotation_scan_complete {
                    self.collect_schema_annotations(sp, schema, data, ip, depth, ctx, evaluated)?;
                    *annotation_scan_complete = true;
                }
                if matches!(self.regex_profile, RegexProfile::Python(_)) {
                    self.eval_unevaluated_items(rule, &kp, data, ip, depth, ctx, out, evaluated)?;
                } else {
                    *unevaluated_items = Some((rule, kp.clone()));
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_references<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        // Keep static recursion independent of the larger dynamic resolver
        // temporaries; both retain their original semantic/error paths.
        match keyword {
            "$ref" => self.eval_static_reference(
                schema,
                members,
                keyword,
                rule,
                kp,
                data,
                ip,
                sp,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
                annotation_scan_complete,
                unevaluated_properties,
                unevaluated_items,
            ),
            "$dynamicRef" | "$recursiveRef" => self.eval_dynamic_reference(
                schema,
                members,
                keyword,
                rule,
                kp,
                data,
                ip,
                sp,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
                annotation_scan_complete,
                unevaluated_properties,
                unevaluated_items,
            ),
            _ => Ok(()),
        }
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_static_reference<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        let (target, tsp) = self.resolve_eval_ref(rule, &kp, ctx)?;
        // The Draft 3 predecessor's reference applicator treats
        // boolean targets as mappings and raises TypeError. Keep
        // this a runtime failure: unrelated `definitions` values
        // remain inert and schema construction still succeeds.
        if self.dialect == SchemaDialect::Draft3
            && matches!(target, Value::Bool(_))
            && draft3_reference_crosses_subresource(&tsp, ctx)?
        {
            return Err(EngineError::new(
                "PYTHON_SCHEMA_EVALUATION",
                ip.clone(),
                "Draft 3 reference target is not an object schema",
            )
            .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
        }
        if matches!(self.regex_profile, RegexProfile::Python(_))
            && !matches!(target, Value::Object(_) | Value::Bool(_))
        {
            return Err(EngineError::new(
                "PYTHON_SCHEMA_EVALUATION",
                ip.clone(),
                "Schema reference target is not an object or boolean schema",
            )
            .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
        }
        let mut reference_annotations = evaluated.child(ctx, ip)?;
        self.python_record_reference_lookup(keyword, rule, &mut reference_annotations, ctx)?;
        if evaluated.annotation_scan
            && (self.uses_python_2020_annotation_profile()
                || self.uses_python_2019_annotation_profile())
        {
            self.collect_schema_annotations(
                &tsp,
                target,
                data,
                ip,
                depth + 1,
                ctx,
                &mut reference_annotations,
            )?;
            evaluated.merge(reference_annotations, ctx, ip)?;
            return Ok(());
        }
        let mut reference_errors = Vec::new();
        if let Err(error) = self.eval(
            target,
            data,
            ip,
            &tsp,
            depth + 1,
            ctx,
            &mut reference_errors,
            &mut reference_annotations,
        ) {
            if matches!(self.regex_profile, RegexProfile::Python(_)) {
                for error in &mut reference_errors {
                    if error
                        .python_error
                        .as_ref()
                        .is_some_and(|metadata| metadata.validator.is_none())
                    {
                        ctx.charge_work(kp.len(), Utf16::default())?;
                        error.schema_path = kp.clone();
                    }
                }
                rebase_reference_errors(&mut reference_errors, &tsp, ctx)?;
                prefix_reference_errors(&mut reference_errors, sp, ctx)?;
            }
            out.extend(reference_errors);
            return Err(error);
        }
        if matches!(self.regex_profile, RegexProfile::Python(_)) {
            for error in &mut reference_errors {
                if error
                    .python_error
                    .as_ref()
                    .is_some_and(|metadata| metadata.validator.is_none())
                {
                    ctx.charge_work(sp.len(), Utf16::default())?;
                    error.schema_path = sp.clone();
                }
            }
            rebase_reference_errors(&mut reference_errors, &tsp, ctx)?;
            prefix_reference_errors(&mut reference_errors, sp, ctx)?;
        }
        if reference_errors.is_empty() {
            evaluated.merge(reference_annotations, ctx, ip)?;
        }
        out.extend(reference_errors);

        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_dynamic_reference<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        let python_recursive = keyword == "$recursiveRef"
            && self.dialect == SchemaDialect::Draft2019_09
            && matches!(self.regex_profile, RegexProfile::Python(_));
        let (mut target, mut tsp) = if python_recursive {
            self.python_recursive_retarget(rule, evaluated, ctx)?
        } else {
            self.resolve_eval_ref(rule, &kp, ctx)?
        };
        if matches!(self.regex_profile, RegexProfile::Python(_))
            && !matches!(target, Value::Object(_) | Value::Bool(_))
        {
            return Err(EngineError::new(
                "PYTHON_SCHEMA_EVALUATION",
                ip.clone(),
                "Schema reference target is not an object or boolean schema",
            )
            .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
        }
        if let Value::String(reference) = rule {
            ctx.charge_work_u64(
                (reference.len() as u64).saturating_mul(4).saturating_add(1),
                Utf16::default(),
            )?;
        }
        if let Value::Object(members) = target {
            ctx.charge_work_u64((members.len() as u64).saturating_mul(40), Utf16::default())?;
        }
        if let Some(Value::String(anchor)) = get(target, "$dynamicAnchor") {
            ctx.charge_work_u64((anchor.len() as u64).saturating_mul(3), Utf16::default())?;
        }
        if let Some(reference) = as_utf8(rule) {
            let fragment = reference.split_once('#').map(|(_, f)| f).unwrap_or("");
            let recursive = !matches!(self.regex_profile, RegexProfile::Python(_))
                && keyword == "$recursiveRef"
                && matches!(get(target, "$recursiveAnchor"), Some(Value::Bool(true)));
            let dynamic = keyword == "$dynamicRef"
                && !fragment.is_empty()
                && !fragment.starts_with('/')
                && get(target, "$dynamicAnchor").and_then(as_utf8).as_deref() == Some(fragment);
            if recursive || dynamic {
                let anchor_name = if recursive {
                    Vec::new()
                } else {
                    fragment.encode_utf16().collect::<Vec<_>>()
                };
                let mut selected_scope = None;
                for (anchor, dynamic_path, node_address) in &evaluated.dynamic_scope {
                    ctx.charge_work_u64(
                        anchor.len().min(anchor_name.len()) as u64 + 1,
                        Utf16::default(),
                    )?;
                    if anchor == &anchor_name {
                        selected_scope = Some((dynamic_path, node_address));
                        break;
                    }
                }
                if let Some((dynamic_path, node_address)) = selected_scope {
                    ctx.charge_work(dynamic_path.len(), Utf16::default())?;
                    if matches!(self.regex_profile, RegexProfile::Python(_)) {
                        // The scope owns a stable node identity. Its diagnostic
                        // path is display-only and may collapse Python codepoints.
                        target = self.python_scope_node(*node_address, ctx)?;
                        tsp = dynamic_path.clone();
                    } else {
                        let dynamic_ref = Value::String(dynamic_path.clone());
                        (target, tsp) = self.resolve_eval_ref(&dynamic_ref, dynamic_path, ctx)?;
                    }
                    if matches!(self.regex_profile, RegexProfile::Python(_))
                        && !matches!(target, Value::Object(_) | Value::Bool(_))
                    {
                        return Err(EngineError::new(
                            "PYTHON_SCHEMA_EVALUATION",
                            ip.clone(),
                            "Schema reference target is not an object or boolean schema",
                        )
                        .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
                    }
                }
            }
        }
        let mut reference_annotations = evaluated.child(ctx, ip)?;
        self.python_record_reference_lookup(keyword, rule, &mut reference_annotations, ctx)?;
        if evaluated.annotation_scan
            && (self.uses_python_2020_annotation_profile()
                || self.uses_python_2019_annotation_profile())
        {
            self.collect_schema_annotations(
                &tsp,
                target,
                data,
                ip,
                depth + 1,
                ctx,
                &mut reference_annotations,
            )?;
            evaluated.merge(reference_annotations, ctx, ip)?;
            return Ok(());
        }
        let mut reference_errors = Vec::new();
        if let Err(error) = self.eval(
            target,
            data,
            ip,
            &tsp,
            depth + 1,
            ctx,
            &mut reference_errors,
            &mut reference_annotations,
        ) {
            if matches!(self.regex_profile, RegexProfile::Python(_)) {
                for error in &mut reference_errors {
                    if error
                        .python_error
                        .as_ref()
                        .is_some_and(|metadata| metadata.validator.is_none())
                    {
                        ctx.charge_work(kp.len(), Utf16::default())?;
                        error.schema_path = kp.clone();
                    }
                }
                rebase_reference_errors(&mut reference_errors, &tsp, ctx)?;
                prefix_reference_errors(&mut reference_errors, &kp, ctx)?;
            }
            out.extend(reference_errors);
            return Err(error);
        }
        if matches!(self.regex_profile, RegexProfile::Python(_)) {
            for error in &mut reference_errors {
                if error
                    .python_error
                    .as_ref()
                    .is_some_and(|metadata| metadata.validator.is_none())
                {
                    ctx.charge_work(kp.len(), Utf16::default())?;
                    error.schema_path = kp.clone();
                }
            }
            rebase_reference_errors(&mut reference_errors, &tsp, ctx)?;
            prefix_reference_errors(&mut reference_errors, &kp, ctx)?;
        }
        if reference_errors.is_empty() {
            evaluated.merge(reference_annotations, ctx, ip)?;
        }
        out.extend(reference_errors);

        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_basic<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "type" => {
                let matches = if self.dialect == SchemaDialect::Draft3 {
                    self.draft3_type_matches(rule, data, ip, &kp, depth, ctx)?
                } else {
                    type_matches(rule, data, self.dialect)
                };
                if !matches {
                    let kind = type_label(rule);
                    push_ctx(
                        ctx,
                        out,
                        ip,
                        &kp,
                        "type",
                        object(vec![("type", Value::String(Utf16::from(kind.clone())))]),
                        &format!("must be {kind}"),
                    )?;
                }
            }
            "disallow" => {
                let matches = if self.dialect == SchemaDialect::Draft3 {
                    self.draft3_type_matches(rule, data, ip, &kp, depth, ctx)?
                } else {
                    type_matches(rule, data, self.dialect)
                };
                if matches {
                    // type_label walks strings/arrays, and format! allocates; admit
                    // the source tree before either operation, then charge the exact
                    // diagnostic size and value-copy budget before constructing it.
                    meter_value_copy(rule, ctx)?;
                    let label = type_label(rule);
                    let message_len = "must not be ".len().saturating_add(label.len());
                    let fixed = (ip.len() as u64)
                        .saturating_add(kp.len() as u64)
                        .saturating_add("disallow".len() as u64)
                        .saturating_add("type".len() as u64)
                        .saturating_add(message_len as u64)
                        .saturating_add(3);
                    ctx.charge_work_u64(fixed, Utf16::default())?;
                    meter_value_copy(rule, ctx)?;
                    let message = format!("must not be {label}");
                    let params = object(vec![("type", rule.clone())]);
                    push_ctx_precharged(out, ip, &kp, "disallow", params, Utf16::from(message));
                }
            }
            "const" => {
                if !self.value_matches(rule, data, ctx)? {
                    push_ctx_copy_value(
                        ctx,
                        out,
                        ip,
                        &kp,
                        "const",
                        "allowedValue",
                        rule,
                        "must be equal to constant",
                    )?;
                    if let Some(source) = self
                        .python_exact_values
                        .get(&(rule as *const Value as usize))
                    {
                        let source = source.snapshot_with_context(ctx)?;
                        ctx.charge_work(2, kp.clone())?;
                        let params = crate::python_value::PythonConsumerValue::Object(vec![(
                            crate::python_value::PyText::from_utf8("allowedValue"),
                            source,
                        )]);
                        out.last_mut()
                            .expect("const just emitted an error")
                            .python_params = Some(std::sync::Arc::new(params));
                    }
                }
            }
            "enum" => {
                if let Value::Array(allowed) = rule {
                    let mut found = false;
                    for candidate in allowed {
                        if self.value_matches(candidate, data, ctx)? {
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        push_ctx_copy_value(
                            ctx,
                            out,
                            ip,
                            &kp,
                            "enum",
                            "allowedValues",
                            rule,
                            "must be equal to one of the allowed values",
                        )?;
                        if let Some(source) = self
                            .python_exact_values
                            .get(&(rule as *const Value as usize))
                        {
                            let source = source.snapshot_with_context(ctx)?;
                            ctx.charge_work(2, kp.clone())?;
                            let params = crate::python_value::PythonConsumerValue::Object(vec![(
                                crate::python_value::PyText::from_utf8("allowedValues"),
                                source,
                            )]);
                            out.last_mut()
                                .expect("enum just emitted an error")
                                .python_params = Some(std::sync::Arc::new(params));
                        }
                    }
                }
            }
            "required" => {
                if let Value::Array(required) = rule {
                    for (index, req) in required.iter().enumerate() {
                        if let Value::String(name) = req {
                            let req_path =
                                append_schema_pointer(&kp, &Utf16::from(index.to_string()));
                            let source_name = self.source_text_value(&req_path, name, ctx)?;
                            if data.object_find(source_name, ctx)?.is_none()
                                && data.object_len().is_some()
                            {
                                let message_name = source_name.to_utf16(ctx)?;
                                push_required_ctx(ctx, out, ip, &kp, name, &message_name)?;
                            }
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_properties<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan
            && self.uses_python_2019_annotation_profile()
            && keyword == "properties"
            && matches!(rule, Value::Bool(_))
        {
            if matches!(rule, Value::Bool(true)) {
                if let Some(count) = data.object_len() {
                    for index in 0..count {
                        if let Some((name, _)) = data.object_entry(index) {
                            evaluated.insert_property(name, ctx, ip)?;
                        }
                    }
                }
            }
            return Ok(());
        }
        match keyword {
            "properties" => {
                if let Value::Object(schemas) = rule {
                    let order = if evaluated.codegen_errors {
                        Some(compiler_object_order(rule, schemas.len(), ctx)?)
                    } else {
                        None
                    };
                    for slot in 0..schemas.len() {
                        let member_index = order.as_ref().map_or(slot, |order| order[slot]);
                        let (name, sub) = &schemas[member_index];
                        let source_name = self.source_member_text(&kp, member_index, name, ctx)?;
                        if let Some(v) = data.object_find(source_name, ctx)? {
                            evaluated.insert_property(source_name, ctx, ip)?;
                            // Annotation collection asks which instance properties
                            // the `properties` keyword covers. It does not re-run the
                            // property's schema: doing so can surface child failures
                            // before an earlier parent keyword and needlessly doubles
                            // recursive evaluator depth.
                            if evaluated.annotation_scan {
                                continue;
                            }
                            let mut child_annotations = evaluated.child(ctx, ip)?;
                            let child_path = self.instance_pointer(ip, source_name, ctx)?;
                            let error_start = out.len();
                            if let Err(error) = self.eval(
                                sub,
                                v,
                                &child_path,
                                &self.schema_pointer(&kp, name, ctx)?,
                                depth + 1,
                                ctx,
                                out,
                                &mut child_annotations,
                            ) {
                                return Err(error);
                            }
                            if matches!(self.regex_profile, RegexProfile::Python(_))
                                && matches!(sub, Value::Bool(false))
                            {
                                for error in &mut out[error_start..] {
                                    if error
                                        .python_error
                                        .as_ref()
                                        .is_some_and(|metadata| metadata.validator.is_none())
                                    {
                                        ctx.charge_work_u64(
                                            (ip.len() as u64).saturating_add(kp.len() as u64),
                                            Utf16::default(),
                                        )?;
                                        error.instance_path = ip.clone();
                                        error.schema_path = kp.clone();
                                        error.python_physical_instance_path =
                                            Some(child_path.clone());
                                    }
                                }
                            }
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        } else if !evaluated.annotation_scan
                            && self.dialect == SchemaDialect::Draft3
                            && matches!(get(sub, "required"), Some(Value::Bool(true)))
                        {
                            let required_instance_path =
                                self.instance_pointer(ip, source_name, ctx)?;
                            let property_schema_path = self.schema_pointer(&kp, name, ctx)?;
                            ctx.charge_work_u64(
                                (property_schema_path.len() as u64)
                                    .saturating_add("required".len() as u64 + 1),
                                Utf16::default(),
                            )?;
                            let required_schema_path =
                                append_schema_path(&property_schema_path, "required");
                            precharge_string_diagnostic(
                                ctx,
                                &required_instance_path,
                                &required_schema_path,
                                "required",
                                "is a required property '".len() + name.len() + 1,
                                &[("property", name)],
                            )?;
                            let mut message = "is a required property '"
                                .encode_utf16()
                                .collect::<Vec<_>>();
                            message.extend(name.units());
                            message.push(0x27);
                            push_units_ctx_after_precharge(
                                out,
                                &required_instance_path,
                                &required_schema_path,
                                "required",
                                object(vec![("property", Value::String(name.clone()))]),
                                Utf16::new(message),
                            );
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_patterns_additional<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "patternProperties" => {
                if let Value::Object(schemas) = rule {
                    let schema_order = if evaluated.codegen_errors {
                        Some(compiler_object_order(rule, schemas.len(), ctx)?)
                    } else {
                        None
                    };
                    let data_order = if evaluated.codegen_errors {
                        Some(compiler_object_order(
                            data,
                            data.object_len().unwrap_or(0),
                            ctx,
                        )?)
                    } else {
                        None
                    };
                    for slot in 0..schemas.len() {
                        let (name, sub) =
                            &schemas[schema_order.as_ref().map_or(slot, |order| order[slot])];
                        let Some(count) = data.object_len() else {
                            continue;
                        };
                        ctx.charge_work(count, ip.clone())?;
                        let pattern_path = self.schema_pointer(&kp, name, ctx)?;
                        let re = self.compile_pattern(name, &pattern_path, ctx)?;
                        for slot in 0..count {
                            let index = data_order.as_ref().map_or(slot, |order| order[slot]);
                            let Some((k, v)) = data.object_entry(index) else {
                                continue;
                            };
                            if Self::pattern_matches_text(&re, k, ctx)? {
                                evaluated.insert_property(k, ctx, ip)?;
                                if evaluated.annotation_scan {
                                    continue;
                                }
                                let mut child_annotations = evaluated.child(ctx, ip)?;
                                self.eval(
                                    sub,
                                    v,
                                    &self.instance_pointer(ip, k, ctx)?,
                                    &self.schema_pointer(&kp, name, ctx)?,
                                    depth + 1,
                                    ctx,
                                    out,
                                    &mut child_annotations,
                                )?;
                                if mode == EvaluationMode::FirstError
                                    && out.len() > initial_error_count
                                {
                                    break;
                                }
                            }
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        }
                        if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                            break;
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    fn eval_keyword_additional_properties<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan && self.uses_python_2019_annotation_profile() {
            if matches!(rule, Value::Object(_)) {
                self.collect_python_legacy_additional_property_predicates(
                    members, rule, sp, data, ip, depth, ctx, evaluated,
                )?;
            } else {
                self.collect_python_legacy_property_names(rule, &kp, data, ip, ctx, evaluated)?;
            }
            return Ok(());
        }
        if evaluated.annotation_scan && self.uses_python_2020_annotation_profile() {
            self.collect_python_property_predicates(rule, &kp, data, ip, depth, ctx, evaluated)?;
            return Ok(());
        }
        if let Some(count) = data.object_len() {
            let mut has_undeclared = false;
            let compiler_order = if evaluated.codegen_errors {
                Some(compiler_object_order(data, count, ctx)?)
            } else {
                None
            };
            for slot in 0..count {
                let index = compiler_order.as_ref().map_or(slot, |order| order[slot]);
                let Some((k, v)) = data.object_entry(index) else {
                    continue;
                };
                let key_path = self.instance_pointer(ip, k, ctx)?;
                ctx.charge_work(1, key_path.clone())?;
                if !self.additional_property_is_covered(members, k, &key_path, sp, ctx)? {
                    if evaluated.annotation_scan {
                        if self.evaluate_additional_property(
                            rule, v, &key_path, &kp, depth, ctx, ip, evaluated, true, out,
                        )? {
                            evaluated.insert_property(k, ctx, ip)?;
                        }
                    } else if matches!(rule, Value::Bool(false)) {
                        evaluated.insert_property(k, ctx, ip)?;
                        if evaluated.codegen_errors {
                            let name = k.to_utf16(ctx)?;
                            push_ctx(
                                ctx,
                                out,
                                ip,
                                &kp,
                                "additionalProperties",
                                object(vec![("additionalProperty", Value::String(name))]),
                                "must NOT have additional properties",
                            )?;
                        } else {
                            has_undeclared = true;
                        }
                    } else {
                        evaluated.insert_property(k, ctx, ip)?;
                        self.evaluate_additional_property(
                            rule, v, &key_path, &kp, depth, ctx, ip, evaluated, false, out,
                        )?;
                    }
                }
                if mode == EvaluationMode::FirstError
                    && (out.len() > initial_error_count || has_undeclared)
                {
                    break;
                }
            }
            if has_undeclared {
                push_ctx(
                    ctx,
                    out,
                    ip,
                    &kp,
                    "additionalProperties",
                    object(vec![]),
                    "must NOT have additional properties",
                )?;
            }
        }

        Ok(())
    }

    #[inline(never)]
    fn additional_property_is_covered(
        &self,
        members: &[(Utf16, Value)],
        name: InstanceText<'_>,
        key_path: &Utf16,
        sp: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        ctx.charge_work_u64(
            (sp.len() as u64).saturating_add("properties".len() as u64 + 1),
            Utf16::default(),
        )?;
        let declared_path = append_schema_path(sp, "properties");
        if let Some(properties) = member(members, "properties") {
            for property_index in 0..properties.object_len().unwrap_or(0) {
                let Some((property_name, _)) = properties.object_entry(property_index) else {
                    continue;
                };
                let fallback = match property_name {
                    InstanceText::Utf16(units) => units,
                    InstanceText::Python(_) => {
                        if property_name.equals_with_context(name, ctx)? {
                            return Ok(true);
                        }
                        continue;
                    }
                };
                let source =
                    self.source_member_text(&declared_path, property_index, fallback, ctx)?;
                if source.equals_with_context(name, ctx)? {
                    return Ok(true);
                }
            }
        }
        if let Some(Value::Object(patterns)) = member(members, "patternProperties") {
            for (pattern, _) in patterns {
                ctx.charge_work_u64(
                    (key_path.len() as u64)
                        .saturating_add(1)
                        .saturating_add(sp.len() as u64)
                        .saturating_add("patternProperties".len() as u64 + 1),
                    Utf16::default(),
                )?;
                ctx.charge_work(1, key_path.clone())?;
                let pattern_path = self.schema_pointer(
                    &append_schema_path(sp, "patternProperties"),
                    pattern,
                    ctx,
                )?;
                let regex = self.compile_pattern(pattern, &pattern_path, ctx)?;
                if Self::pattern_matches_text(&regex, name, ctx)? {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }

    #[inline(never)]
    fn evaluate_additional_property<T: InstanceView>(
        &self,
        rule: &Value,
        value: &T,
        key_path: &Utf16,
        schema_path: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        parent_ip: &Utf16,
        evaluated: &Evaluated,
        annotation_scan: bool,
        out: &mut Vec<StructuralError>,
    ) -> Result<bool, EngineError> {
        let mut child_annotations = evaluated.child(ctx, parent_ip)?;
        if annotation_scan {
            child_annotations.mode = EvaluationMode::FirstError;
            child_annotations.annotation_scan = false;
            child_annotations.collect_annotations = false;
            let mut child_errors = Vec::new();
            self.eval(
                rule,
                value,
                key_path,
                schema_path,
                depth + 1,
                ctx,
                &mut child_errors,
                &mut child_annotations,
            )?;
            Ok(child_errors.is_empty())
        } else {
            self.eval(
                rule,
                value,
                key_path,
                schema_path,
                depth + 1,
                ctx,
                out,
                &mut child_annotations,
            )?;
            Ok(true)
        }
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_property_names<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "propertyNames" => {
                if let Some(count) = data.object_len() {
                    let order = if evaluated.codegen_errors {
                        Some(compiler_object_order(data, count, ctx)?)
                    } else {
                        None
                    };
                    for slot in 0..count {
                        let index = order.as_ref().map_or(slot, |order| order[slot]);
                        let Some((k, _)) = data.object_entry(index) else {
                            continue;
                        };
                        let keyval = T::text_instance(k, ctx)?;
                        let mut errs = Vec::new();
                        let mut key_annotations = evaluated.child(ctx, ip)?;
                        let branch_mode = key_annotations.mode;
                        if let Err(error) = self.eval(
                            rule,
                            &keyval,
                            ip,
                            &kp,
                            depth + 1,
                            ctx,
                            &mut errs,
                            &mut key_annotations,
                        ) {
                            out.extend(errs);
                            return Err(error);
                        }
                        if !errs.is_empty() {
                            if evaluated.codegen_errors {
                                let property_name = k.to_utf16(ctx)?;
                                for error in &mut errs {
                                    ctx.charge_work(
                                        property_name.len().saturating_add(1),
                                        ip.clone(),
                                    )?;
                                    error.compiler_property_name = Some(property_name.clone());
                                }
                                ctx.charge_work(errs.len(), ip.clone())?;
                                out.extend(errs);
                                ctx.charge_work(property_name.len().saturating_add(1), ip.clone())?;
                                push_ctx(
                                    ctx,
                                    out,
                                    ip,
                                    kp,
                                    "propertyNames",
                                    object(vec![("propertyName", Value::String(property_name))]),
                                    "property name must be valid",
                                )?;
                            } else if matches!(self.regex_profile, RegexProfile::Python(_)) {
                                let override_value =
                                    std::sync::Arc::new(keyval.python_snapshot(ctx)?);
                                ctx.charge_work_u64(
                                    (ip.len() as u64).saturating_mul(errs.len() as u64 + 1),
                                    Utf16::default(),
                                )?;
                                for error in &mut errs {
                                    error.python_physical_instance_path = Some(ip.clone());
                                    error.python_instance_override = Some(override_value.clone());
                                }
                                out.extend(errs);
                            } else {
                                let error_path = self.instance_pointer(ip, k, ctx)?;
                                push_ctx(
                                    ctx,
                                    out,
                                    &error_path,
                                    &kp,
                                    "propertyNames",
                                    object(vec![]),
                                    "property name must be valid",
                                )?;
                            }
                            if branch_mode == EvaluationMode::FirstError {
                                break;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_items<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan && self.uses_python_2020_annotation_profile() {
            if keyword == "items" {
                // Draft 2020-12's evaluated-index helper treats the presence
                // of `items` as covering the whole instance array without
                // evaluating the child schema a second time.
                if let Some(count) = data.array_len() {
                    for index in 0..count {
                        evaluated.insert_item(index, ctx, ip)?;
                    }
                }
                evaluated.annotation_scan_short_circuit = true;
                return Ok(());
            }
            if keyword == "prefixItems" {
                if let (Value::Array(schemas), Some(count)) = (rule, data.array_len()) {
                    for index in 0..count.min(schemas.len()) {
                        evaluated.insert_item(index, ctx, ip)?;
                    }
                }
                return Ok(());
            }
        }
        if evaluated.annotation_scan && self.uses_python_2019_annotation_profile() {
            match keyword {
                "items" => {
                    let Some(count) = data.array_len() else {
                        return Ok(());
                    };
                    if member(members, "additionalItems").is_some() {
                        for index in 0..count {
                            evaluated.insert_item(index, ctx, ip)?;
                        }
                        evaluated.annotation_scan_short_circuit = true;
                        return Ok(());
                    }
                    match rule {
                        Value::Object(_) => {
                            for index in 0..count {
                                evaluated.insert_item(index, ctx, ip)?;
                            }
                            evaluated.annotation_scan_short_circuit = true;
                        }
                        Value::Array(schemas) => {
                            for index in 0..count.min(schemas.len()) {
                                evaluated.insert_item(index, ctx, ip)?;
                            }
                        }
                        Value::Bool(_) => {
                            return Err(EngineError::new(
                                "PYTHON_SCHEMA_EVALUATION",
                                ip.clone(),
                                "Draft 2019-09 boolean items annotation has no length",
                            )
                            .with_python_schema_terminal(
                                PythonSchemaTerminal::LegacyBooleanItems,
                            ));
                        }
                        _ => {}
                    }
                    return Ok(());
                }
                "additionalItems" => {
                    if member(members, "items").is_some() {
                        if let Some(count) = data.array_len() {
                            for index in 0..count {
                                evaluated.insert_item(index, ctx, ip)?;
                            }
                        }
                        evaluated.annotation_scan_short_circuit = true;
                    }
                    return Ok(());
                }
                _ => {}
            }
        }
        match keyword {
            "items" => self.eval_items_keyword_branch(
                members,
                rule,
                kp,
                data,
                ip,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
            ),
            "prefixItems" => self.eval_prefix_items_keyword_branch(
                members,
                rule,
                kp,
                data,
                ip,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
            ),
            "additionalItems" => self.eval_additional_items_keyword_branch(
                members,
                rule,
                kp,
                data,
                ip,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
            ),
            _ => Ok(()),
        }?;
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_items_keyword_branch<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
    ) -> Result<(), EngineError> {
        if let Some(value_count) = data.array_len() {
            match rule {
                Value::Array(schemas) => {
                    for i in 0..value_count.min(schemas.len()) {
                        let (Some(v), s) = (data.array_get(i), &schemas[i]) else {
                            continue;
                        };
                        evaluated.insert_item(i, ctx, ip)?;
                        let mut child_annotations = evaluated.child(ctx, ip)?;
                        let child_path = append_instance_path(ip, &Utf16::from(i.to_string()));
                        let child_schema_path = append_schema_path(&kp, &i.to_string());
                        let error_start = out.len();
                        self.eval(
                            s,
                            v,
                            &child_path,
                            &child_schema_path,
                            depth + 1,
                            ctx,
                            out,
                            &mut child_annotations,
                        )?;
                        if matches!(self.regex_profile, RegexProfile::Python(_))
                            && matches!(s, Value::Bool(false))
                        {
                            adjust_direct_false_schema_errors(
                                &mut out[error_start..],
                                ip,
                                &child_path,
                                &kp,
                                ctx,
                            )?;
                        }
                        if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                            break;
                        }
                    }
                }
                s => {
                    let start = if self.dialect == SchemaDialect::Draft7 {
                        match member(members, "items") {
                            Some(Value::Array(a)) => a.len(),
                            _ => 0,
                        }
                    } else {
                        member(members, "prefixItems")
                            .and_then(|x| {
                                if let Value::Array(a) = x {
                                    Some(a.len())
                                } else {
                                    None
                                }
                            })
                            .unwrap_or(0)
                    };
                    let aggregate_false = self.dialect == SchemaDialect::Draft2020_12
                        && matches!(self.regex_profile, RegexProfile::Python(_))
                        && matches!(s, Value::Bool(false))
                        && start < value_count;
                    if aggregate_false {
                        push_ctx(
                            ctx,
                            out,
                            ip,
                            &kp,
                            "items",
                            object(vec![]),
                            "must NOT have additional items",
                        )?;
                        for i in start..value_count {
                            evaluated.insert_item(i, ctx, ip)?;
                        }
                    }
                    if !aggregate_false {
                        for i in start..value_count {
                            let Some(v) = data.array_get(i) else { continue };
                            evaluated.insert_item(i, ctx, ip)?;
                            let mut child_annotations = evaluated.child(ctx, ip)?;
                            let child_path = append_instance_path(ip, &Utf16::from(i.to_string()));
                            let error_start = out.len();
                            self.eval(
                                s,
                                v,
                                &child_path,
                                &kp,
                                depth + 1,
                                ctx,
                                out,
                                &mut child_annotations,
                            )?;
                            if matches!(self.regex_profile, RegexProfile::Python(_))
                                && matches!(s, Value::Bool(false))
                            {
                                adjust_direct_false_schema_errors(
                                    &mut out[error_start..],
                                    ip,
                                    &child_path,
                                    &kp,
                                    ctx,
                                )?;
                            }
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_prefix_items_keyword_branch<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
    ) -> Result<(), EngineError> {
        if let Value::Array(schemas) = rule {
            let Some(value_count) = data.array_len() else {
                return Ok(());
            };
            for i in 0..value_count.min(schemas.len()) {
                let (Some(v), s) = (data.array_get(i), &schemas[i]) else {
                    continue;
                };
                evaluated.insert_item(i, ctx, ip)?;
                let mut child_annotations = evaluated.child(ctx, ip)?;
                let child_path = append_instance_path(ip, &Utf16::from(i.to_string()));
                let child_schema_path = append_schema_path(&kp, &i.to_string());
                let error_start = out.len();
                if let Err(error) = self.eval(
                    s,
                    v,
                    &child_path,
                    &child_schema_path,
                    depth + 1,
                    ctx,
                    out,
                    &mut child_annotations,
                ) {
                    return Err(error);
                }
                if matches!(self.regex_profile, RegexProfile::Python(_))
                    && matches!(s, Value::Bool(false))
                {
                    adjust_direct_false_schema_errors(
                        &mut out[error_start..],
                        ip,
                        &child_path,
                        &kp,
                        ctx,
                    )?;
                }
                if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                    break;
                }
            }
        }

        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_additional_items_keyword_branch<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
    ) -> Result<(), EngineError> {
        if let Some(Value::Array(schemas)) = member(members, "items") {
            let Some(value_count) = data.array_len() else {
                return Ok(());
            };
            for i in schemas.len()..value_count {
                let Some(v) = data.array_get(i) else { continue };
                let item_path = append_instance_path(ip, &Utf16::from(i.to_string()));
                if matches!(rule, Value::Bool(false)) {
                    push_ctx(
                        ctx,
                        out,
                        &item_path,
                        &kp,
                        "additionalItems",
                        object(vec![]),
                        "must NOT have additional items",
                    )?;
                } else {
                    evaluated.insert_item(i, ctx, ip)?;
                    let mut child_annotations = evaluated.child(ctx, ip)?;
                    self.eval(
                        rule,
                        v,
                        &item_path,
                        &kp,
                        depth + 1,
                        ctx,
                        out,
                        &mut child_annotations,
                    )?;
                    if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                        break;
                    }
                }
            }
        }

        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_simple<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "minItems" | "maxItems" => {
                if let Some(length) = data.array_len() {
                    bound_error_ctx(ctx, out, ip, &kp, &keyword, rule, length, "items")?
                }
            }
            "minProperties" | "maxProperties" => {
                if let Some(length) = data.object_len() {
                    bound_error_ctx(ctx, out, ip, &kp, &keyword, rule, length, "properties")?
                }
            }
            "minLength" | "maxLength" => {
                if let Some(s) = data.text_value() {
                    bound_error_ctx(
                        ctx,
                        out,
                        ip,
                        &kp,
                        &keyword,
                        rule,
                        s.codepoint_len(),
                        "length",
                    )?
                }
            }
            "pattern" => {
                if let Some(s) = data.text_value() {
                    let Value::String(pat) = rule else {
                        return Ok(());
                    };
                    let re = self.compile_pattern(pat, &kp, ctx)?;
                    if !Self::pattern_matches_text(&re, s, ctx)? {
                        push_ctx_pattern_value(ctx, out, ip, &kp, rule, pat)?;
                    }
                }
            }
            "uniqueItems" => {
                if matches!(rule, Value::Bool(true)) {
                    if let Some(length) = data.array_len() {
                        let mut duplicate = None;
                        for i in 0..length {
                            let Some(value_i) = data.array_get(i) else {
                                continue;
                            };
                            for j in 0..i {
                                let Some(previous) = data.array_get(j) else {
                                    continue;
                                };
                                if instances_equal(previous, value_i, ctx)? {
                                    duplicate = Some((i, j));
                                    break;
                                }
                            }
                            if duplicate.is_some() {
                                break;
                            }
                        }
                        if let Some((i, j)) = duplicate {
                            push_ctx(
                                ctx,
                                out,
                                ip,
                                &kp,
                                "uniqueItems",
                                object(vec![
                                    ("i", Value::Number(i as f64)),
                                    ("j", Value::Number(j as f64)),
                                ]),
                                "must NOT have duplicate items (items ## 1 and 0 are identical)",
                            )?;
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_numeric<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" => {
                if let (Some(n), Value::Number(bound)) = (data.number_value(), rule) {
                    let ordering = n.partial_cmp_f64(*bound, ctx)?;
                    let bad = match keyword {
                        "minimum" => {
                            ordering == Some(std::cmp::Ordering::Less)
                                || matches!(
                                    self.dialect,
                                    SchemaDialect::Draft3 | SchemaDialect::Draft4
                                ) && matches!(
                                    member(members, "exclusiveMinimum"),
                                    Some(Value::Bool(true))
                                ) && ordering == Some(std::cmp::Ordering::Equal)
                        }
                        "maximum" => {
                            ordering == Some(std::cmp::Ordering::Greater)
                                || matches!(
                                    self.dialect,
                                    SchemaDialect::Draft3 | SchemaDialect::Draft4
                                ) && matches!(
                                    member(members, "exclusiveMaximum"),
                                    Some(Value::Bool(true))
                                ) && ordering == Some(std::cmp::Ordering::Equal)
                        }
                        "exclusiveMinimum"
                            if matches!(
                                self.dialect,
                                SchemaDialect::Draft3 | SchemaDialect::Draft4
                            ) =>
                        {
                            false
                        }
                        "exclusiveMaximum"
                            if matches!(
                                self.dialect,
                                SchemaDialect::Draft3 | SchemaDialect::Draft4
                            ) =>
                        {
                            false
                        }
                        // Python's comparisons with NaN are all false. An
                        // unordered comparison therefore does not violate
                        // either exclusive bound in the consumer profile.
                        "exclusiveMinimum" => matches!(
                            ordering,
                            Some(std::cmp::Ordering::Less | std::cmp::Ordering::Equal)
                        ),
                        _ => matches!(
                            ordering,
                            Some(std::cmp::Ordering::Greater | std::cmp::Ordering::Equal)
                        ),
                    };
                    if bad {
                        let rel = if keyword.contains("Minimum") {
                            if keyword == "minimum" {
                                "must be >="
                            } else {
                                "must be >="
                            }
                        } else if keyword == "maximum" {
                            "must be <="
                        } else {
                            "must be <="
                        };
                        push_ctx(
                            ctx,
                            out,
                            ip,
                            &kp,
                            &keyword,
                            object(vec![
                                ("comparison", Value::String(Utf16::from(rel))),
                                ("limit", Value::Number(*bound)),
                            ]),
                            &format!("must be {rel} {}", crate::ecma_number_to_string(*bound)),
                        )?;
                    }
                }
            }
            "multipleOf" | "divisibleBy" => {
                if let (Some(n), Value::Number(d)) = (data.number_value(), rule) {
                    let source_divisor = self
                        .python_exact_values
                        .get(&(rule as *const Value as usize));
                    if !is_multiple_of_source(
                        n,
                        *d,
                        source_divisor.map(std::sync::Arc::as_ref),
                        ctx,
                        ip,
                    )? {
                        push_ctx(
                            ctx,
                            out,
                            ip,
                            &kp,
                            if source_divisor.is_some() {
                                &keyword
                            } else {
                                "multipleOf"
                            },
                            object(vec![(
                                if source_divisor.is_some() {
                                    &keyword
                                } else {
                                    "multipleOf"
                                },
                                rule.clone(),
                            )]),
                            &format!("must be multiple of {}", crate::ecma_number_to_string(*d)),
                        )?;
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_combinators<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan
            && (self.uses_python_2020_annotation_profile()
                || self.uses_python_2019_annotation_profile())
        {
            match keyword {
                "allOf" | "anyOf" | "oneOf" => {
                    if let Value::Array(schemas) = rule {
                        for (index, subschema) in schemas.iter().enumerate() {
                            let mut predicate = evaluated.child(ctx, ip)?;
                            predicate.mode = EvaluationMode::FirstError;
                            predicate.annotation_scan = false;
                            predicate.collect_annotations = false;
                            let mut errors = Vec::new();
                            let child_schema_path = append_schema_path(&kp, &index.to_string());
                            self.eval(
                                subschema,
                                data,
                                ip,
                                &child_schema_path,
                                depth + 1,
                                ctx,
                                &mut errors,
                                &mut predicate,
                            )?;
                            if errors.is_empty() {
                                self.collect_schema_annotations(
                                    &child_schema_path,
                                    subschema,
                                    data,
                                    ip,
                                    depth + 1,
                                    ctx,
                                    evaluated,
                                )?;
                            }
                        }
                    }
                    return Ok(());
                }
                "if" => {
                    if let Some(condition) = member(members, "if") {
                        let mut predicate = evaluated.child(ctx, ip)?;
                        predicate.mode = EvaluationMode::FirstError;
                        predicate.annotation_scan = false;
                        predicate.collect_annotations = false;
                        let mut errors = Vec::new();
                        self.eval(
                            condition,
                            data,
                            ip,
                            &kp,
                            depth + 1,
                            ctx,
                            &mut errors,
                            &mut predicate,
                        )?;
                        if errors.is_empty() {
                            self.collect_schema_annotations(
                                &kp,
                                condition,
                                data,
                                ip,
                                depth + 1,
                                ctx,
                                evaluated,
                            )?;
                        }
                        let (name, branch) = if errors.is_empty() {
                            ("then", member(members, "then"))
                        } else {
                            ("else", member(members, "else"))
                        };
                        if let Some(branch) = branch {
                            let branch_path = append_schema_path(sp, name);
                            self.collect_schema_annotations(
                                &branch_path,
                                branch,
                                data,
                                ip,
                                depth + 1,
                                ctx,
                                evaluated,
                            )?;
                        }
                    }
                    return Ok(());
                }
                _ => {}
            }
        }
        match keyword {
            "allOf" => {
                if let Value::Array(schemas) = rule {
                    for (i, s) in schemas.iter().enumerate() {
                        let mut branch_errors = Vec::new();
                        let mut branch_annotations = evaluated.child(ctx, ip)?;
                        if let Err(error) = self.eval(
                            s,
                            data,
                            ip,
                            &append_schema_path(&kp, &i.to_string()),
                            depth + 1,
                            ctx,
                            &mut branch_errors,
                            &mut branch_annotations,
                        ) {
                            out.extend(branch_errors);
                            return Err(error);
                        }
                        if branch_errors.is_empty() {
                            evaluated.merge(branch_annotations, ctx, ip)?;
                        }
                        out.extend(branch_errors);
                        if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                            break;
                        }
                    }
                }
            }
            "extends" => {
                if let Value::Array(schemas) = rule {
                    for (index, schema) in schemas.iter().enumerate() {
                        self.eval(
                            schema,
                            data,
                            ip,
                            &append_schema_path(&kp, &index.to_string()),
                            depth + 1,
                            ctx,
                            out,
                            evaluated,
                        )?;
                        if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                            break;
                        }
                    }
                } else {
                    self.eval(rule, data, ip, &kp, depth + 1, ctx, out, evaluated)?;
                }
            }
            "anyOf" | "oneOf" => {
                if let Value::Array(schemas) = rule {
                    let mut matches = 0;
                    let codegen_one_of = keyword == "oneOf" && evaluated.codegen_errors;
                    let mut passing_schemas = Vec::new();
                    let mut successful_annotations = Vec::new();
                    // Ajv's default all-errors core profile includes the errors from
                    // each failed anyOf branch before the aggregate anyOf error. The
                    // Python jsonschema consumer profile intentionally exposes only
                    // its aggregate error, so retain branch diagnostics only for the
                    // ECMAScript profile.
                    let mut failed_branch_errors = Vec::new();
                    for (i, s) in schemas.iter().enumerate() {
                        let mut e = Vec::new();
                        let mut branch_annotations = evaluated.child(ctx, ip)?;
                        // jsonschema fully consumes anyOf/oneOf branches
                        // until it finds a success. After the first oneOf
                        // match, later branches are checked with is_valid
                        // (first-error), while anyOf stops immediately.
                        branch_annotations.mode = if !codegen_one_of
                            && matches > 0
                            && (keyword == "oneOf" || evaluated.collect_annotations)
                        {
                            EvaluationMode::FirstError
                        } else {
                            EvaluationMode::AllErrors
                        };
                        let branch_result = self.eval(
                            s,
                            data,
                            ip,
                            &append_schema_path(&kp, &i.to_string()),
                            depth + 1,
                            ctx,
                            &mut e,
                            &mut branch_annotations,
                        );
                        if let Err(error) = branch_result {
                            return Err(error);
                        }
                        if e.is_empty() {
                            matches += 1;
                            successful_annotations.push(branch_annotations);
                            if codegen_one_of {
                                ctx.charge_work(1, ip.clone())?;
                                passing_schemas.push(Value::Number(i as f64));
                                if matches == 2 {
                                    break;
                                }
                            }
                            if keyword == "anyOf" && !evaluated.collect_annotations {
                                break;
                            }
                        } else if (keyword == "anyOf" || codegen_one_of)
                            && matches!(self.regex_profile, RegexProfile::Ecma262Unicode)
                            && mode == EvaluationMode::AllErrors
                        {
                            failed_branch_errors.extend(e);
                        }
                    }
                    let failed = if keyword == "anyOf" {
                        matches == 0
                    } else {
                        matches != 1
                    };
                    if failed {
                        // Ajv retains the first passing branch's annotations
                        // even when the second pass makes oneOf invalid.
                        if codegen_one_of {
                            if let Some(first) = successful_annotations.into_iter().next() {
                                evaluated.merge(first, ctx, ip)?;
                            }
                        }
                        out.extend(failed_branch_errors);
                        push_ctx(
                            ctx,
                            out,
                            ip,
                            &kp,
                            &keyword,
                            if codegen_one_of {
                                object(vec![(
                                    "passingSchemas",
                                    if matches == 0 {
                                        Value::Null
                                    } else {
                                        Value::Array(passing_schemas)
                                    },
                                )])
                            } else {
                                object(vec![])
                            },
                            if keyword == "anyOf" {
                                "must match a schema in anyOf"
                            } else {
                                "must match exactly one schema in oneOf"
                            },
                        )?;
                    } else if keyword == "anyOf" {
                        for annotations in successful_annotations {
                            evaluated.merge(annotations, ctx, ip)?;
                        }
                    } else if let Some(annotations) = successful_annotations.pop() {
                        evaluated.merge(annotations, ctx, ip)?;
                    }
                }
            }
            "not" => {
                let mut errs = Vec::new();
                let mut predicate_annotations = evaluated.child(ctx, ip)?;
                predicate_annotations.mode = EvaluationMode::FirstError;
                self.eval(
                    rule,
                    data,
                    ip,
                    &kp,
                    depth + 1,
                    ctx,
                    &mut errs,
                    &mut predicate_annotations,
                )?;
                if errs.is_empty() {
                    push_ctx(
                        ctx,
                        out,
                        ip,
                        &kp,
                        "not",
                        object(vec![]),
                        "must NOT be valid",
                    )?;
                }
            }
            "if" => {
                let mut errs = Vec::new();
                let mut condition_annotations = evaluated.child(ctx, ip)?;
                condition_annotations.mode = EvaluationMode::FirstError;
                self.eval(
                    rule,
                    data,
                    ip,
                    &kp,
                    depth + 1,
                    ctx,
                    &mut errs,
                    &mut condition_annotations,
                )?;
                if errs.is_empty() {
                    evaluated.merge(condition_annotations, ctx, ip)?;
                }
                let then = if errs.is_empty() {
                    member(members, "then")
                } else {
                    member(members, "else")
                };
                if let Some(sub) = then {
                    let name = if errs.is_empty() { "then" } else { "else" };
                    let mut branch_annotations = evaluated.child(ctx, ip)?;
                    let mut branch_errors = Vec::new();
                    if let Err(error) = self.eval(
                        sub,
                        data,
                        ip,
                        &append_schema_path(sp, name),
                        depth + 1,
                        ctx,
                        &mut branch_errors,
                        &mut branch_annotations,
                    ) {
                        out.extend(branch_errors);
                        return Err(error);
                    }
                    if branch_errors.is_empty() {
                        evaluated.merge(branch_annotations, ctx, ip)?;
                    }
                    out.extend(branch_errors);
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_dependencies<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "dependentRequired" | "dependencies" => {
                if let Value::Object(deps) = rule {
                    if data.object_len().is_some() {
                        for (trigger, dep) in deps {
                            if data
                                .object_find(InstanceText::Utf16(trigger), ctx)?
                                .is_some()
                            {
                                if self.dialect == SchemaDialect::Draft3 {
                                    if let Value::String(name) = dep {
                                        if data
                                            .object_find(InstanceText::Utf16(name), ctx)?
                                            .is_none()
                                        {
                                            precharge_string_diagnostic(
                                                ctx,
                                                ip,
                                                &kp,
                                                "dependencies",
                                                "must have property '".len()
                                                    + name.len()
                                                    + "' when property '".len()
                                                    + trigger.len()
                                                    + "' is present".len(),
                                                &[("property", trigger), ("missingProperty", name)],
                                            )?;
                                            let mut message = "must have property '"
                                                .encode_utf16()
                                                .collect::<Vec<_>>();
                                            message.extend(name.units());
                                            message.extend("' when property '".encode_utf16());
                                            message.extend(trigger.units());
                                            message.extend("' is present".encode_utf16());
                                            push_units_ctx_after_precharge(
                                                out,
                                                ip,
                                                &kp,
                                                "dependencies",
                                                object(vec![
                                                    ("property", Value::String(trigger.clone())),
                                                    (
                                                        "missingProperty",
                                                        Value::String(name.clone()),
                                                    ),
                                                ]),
                                                Utf16::new(message),
                                            );
                                        }
                                        if mode == EvaluationMode::FirstError
                                            && out.len() > initial_error_count
                                        {
                                            break;
                                        }
                                        continue;
                                    }
                                }
                                if let Value::Array(names) = dep {
                                    for name in names {
                                        if let Value::String(n) = name {
                                            if data
                                                .object_find(InstanceText::Utf16(n), ctx)?
                                                .is_none()
                                            {
                                                let dependency_keyword =
                                                    if keyword == "dependencies" {
                                                        "dependencies"
                                                    } else {
                                                        "dependentRequired"
                                                    };
                                                precharge_string_diagnostic(
                                                    ctx,
                                                    ip,
                                                    &kp,
                                                    dependency_keyword,
                                                    "must have property '".len()
                                                        + n.len()
                                                        + "' when property '".len()
                                                        + trigger.len()
                                                        + "' is present".len(),
                                                    &[
                                                        ("property", trigger),
                                                        ("missingProperty", n),
                                                    ],
                                                )?;
                                                let mut message = "must have property '"
                                                    .encode_utf16()
                                                    .collect::<Vec<_>>();
                                                message.extend(n.units());
                                                message.extend("' when property '".encode_utf16());
                                                message.extend(trigger.units());
                                                message.extend("' is present".encode_utf16());
                                                push_units_ctx_after_precharge(
                                                    out,
                                                    ip,
                                                    &kp,
                                                    dependency_keyword,
                                                    object(vec![
                                                        (
                                                            "property",
                                                            Value::String(trigger.clone()),
                                                        ),
                                                        (
                                                            "missingProperty",
                                                            Value::String(n.clone()),
                                                        ),
                                                    ]),
                                                    Utf16::new(message),
                                                );
                                            }
                                            if mode == EvaluationMode::FirstError
                                                && out.len() > initial_error_count
                                            {
                                                break;
                                            }
                                        }
                                    }
                                } else {
                                    self.eval(
                                        dep,
                                        data,
                                        ip,
                                        &append_schema_pointer(&kp, trigger),
                                        depth + 1,
                                        ctx,
                                        out,
                                        evaluated,
                                    )?;
                                }
                            }
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        }
                    }
                }
            }
            "dependentSchemas" => {
                if let Value::Object(deps) = rule {
                    for (trigger, sub) in deps {
                        if data
                            .object_find(InstanceText::Utf16(trigger), ctx)?
                            .is_some()
                        {
                            let child_schema_path = append_schema_pointer(&kp, trigger);
                            if evaluated.annotation_scan
                                && (self.uses_python_2020_annotation_profile()
                                    || self.uses_python_2019_annotation_profile())
                            {
                                self.collect_schema_annotations(
                                    &child_schema_path,
                                    sub,
                                    data,
                                    ip,
                                    depth + 1,
                                    ctx,
                                    evaluated,
                                )?;
                                continue;
                            }
                            let mut branch_errors = Vec::new();
                            let mut branch_annotations = evaluated.child(ctx, ip)?;
                            if let Err(error) = self.eval(
                                sub,
                                data,
                                ip,
                                &child_schema_path,
                                depth + 1,
                                ctx,
                                &mut branch_errors,
                                &mut branch_annotations,
                            ) {
                                out.extend(branch_errors);
                                return Err(error);
                            }
                            if branch_errors.is_empty() {
                                evaluated.merge(branch_annotations, ctx, ip)?;
                            }
                            out.extend(branch_errors);
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_contains<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &Utf16,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, Utf16)>,
        unevaluated_items: &mut Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan
            && (self.uses_python_2020_annotation_profile()
                || self.uses_python_2019_annotation_profile())
        {
            if keyword == "contains" {
                self.collect_python_item_predicates(rule, kp, data, ip, depth, ctx, evaluated)?;
            }
            return Ok(());
        }
        match keyword {
            "contains" => {
                if let Some(value_count) = data.array_len() {
                    let contains_bounds_apply = matches!(
                        self.dialect,
                        SchemaDialect::Draft2019_09 | SchemaDialect::Draft2020_12
                    );
                    let min = if contains_bounds_apply {
                        member(members, "minContains")
                            .and_then(as_usize)
                            .unwrap_or(1)
                    } else {
                        1
                    };
                    let max = if contains_bounds_apply {
                        member(members, "maxContains").and_then(as_usize)
                    } else {
                        None
                    };
                    if evaluated.codegen_errors {
                        // Ajv ignores an unconstrained zero minimum and rejects
                        // contradictory bounds before evaluating the predicate.
                        if min == 0 && max.is_none() {
                            return Ok(());
                        }
                        let always_valid = match rule {
                            Value::Bool(value) => *value,
                            Value::Object(fields) => {
                                let mut inert = true;
                                for (key, _) in fields {
                                    ctx.charge_work(key.len().saturating_add(1), ip.clone())?;
                                    if compiler_keyword_rank(key) != usize::MAX {
                                        inert = false;
                                        break;
                                    }
                                }
                                inert
                            }
                            _ => false,
                        };
                        let contradictory = max.is_some_and(|limit| min > limit);
                        let mut matches = if always_valid { value_count } else { 0 };
                        let mut failures = Vec::new();
                        if !contradictory && !always_valid {
                            // Ajv's nontrivial contains predicate evaluates the
                            // complete array for unevaluatedItems, even on failure.
                            for index in 0..value_count {
                                evaluated.insert_item(index, ctx, ip)?;
                            }
                            for index in 0..value_count {
                                ctx.charge_work(1, ip.clone())?;
                                let Some(value) = data.array_get(index) else {
                                    continue;
                                };
                                let mut errors = Vec::new();
                                let mut branch = evaluated.child(ctx, ip)?;
                                branch.mode = EvaluationMode::AllErrors;
                                self.eval(
                                    rule,
                                    value,
                                    &append_instance_path(ip, &Utf16::from(index.to_string())),
                                    kp,
                                    depth + 1,
                                    ctx,
                                    &mut errors,
                                    &mut branch,
                                )?;
                                if errors.is_empty() {
                                    matches += 1;
                                    if max.is_some_and(|limit| matches > limit)
                                        || (max.is_none() && matches >= min)
                                    {
                                        break;
                                    }
                                } else {
                                    ctx.charge_work(errors.len(), ip.clone())?;
                                    failures.extend(errors);
                                }
                            }
                        }
                        if contradictory
                            || matches < min
                            || max.is_some_and(|limit| matches > limit)
                        {
                            out.extend(failures);
                            let mut params = vec![("minContains", Value::Number(min as f64))];
                            let message = if let Some(limit) = max {
                                params.push(("maxContains", Value::Number(limit as f64)));
                                format!("must contain at least {min} and no more than {limit} valid item(s)")
                            } else {
                                format!("must contain at least {min} valid item(s)")
                            };
                            push_ctx(ctx, out, ip, kp, "contains", object(params), &message)?;
                        }
                        return Ok(());
                    }
                    let mut matches = 0;
                    let mut matching_indices = Vec::new();
                    for i in 0..value_count {
                        let Some(v) = data.array_get(i) else { continue };
                        let mut errs = Vec::new();
                        let mut predicate_annotations = evaluated.child(ctx, ip)?;
                        predicate_annotations.mode = EvaluationMode::FirstError;
                        self.eval(
                            rule,
                            v,
                            &append_instance_path(ip, &Utf16::from(i.to_string())),
                            &kp,
                            depth + 1,
                            ctx,
                            &mut errs,
                            &mut predicate_annotations,
                        )?;
                        if errs.is_empty() {
                            matches += 1;
                            matching_indices.push(i);
                            if matches!(self.dialect, SchemaDialect::Draft6 | SchemaDialect::Draft7)
                            {
                                break;
                            }
                            if max.is_some_and(|limit| matches > limit) {
                                // The upper bound has already failed.  The
                                // Python validator returns this keyword
                                // error without evaluating later items.
                                break;
                            }
                        }
                    }
                    if matches < min || max.is_some_and(|limit| matches > limit) {
                        let keyword = if !matches!(self.regex_profile, RegexProfile::Python(_)) {
                            "contains"
                        } else if max.is_some_and(|limit| matches > limit) {
                            "maxContains"
                        } else if contains_bounds_apply
                            && (min > 1 || member(members, "minContains").is_some())
                        {
                            "minContains"
                        } else {
                            "contains"
                        };
                        push_ctx(
                            ctx,
                            out,
                            ip,
                            &kp,
                            keyword,
                            object(vec![]),
                            "must contain at least one valid item",
                        )?;
                    } else {
                        for index in matching_indices {
                            evaluated.insert_item(index, ctx, ip)?;
                        }
                    }
                }
            }
            "format" => {}
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    fn eval_boolean_schema(
        &self,
        allow: bool,
        ip: &Utf16,
        sp: &Utf16,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
    ) -> Result<(), EngineError> {
        if allow {
            return Ok(());
        }

        let error_start = out.len();
        let false_schema_segment = "false schema";
        let false_schema_path_len = (sp.len() as u64)
            .saturating_add(u64::from(sp.units().last() != Some(&(b'/' as u16))))
            .saturating_add(false_schema_segment.encode_utf16().count() as u64);
        let python_metadata = matches!(self.regex_profile, RegexProfile::Python(_));
        // Charge path construction and the diagnostic copies before either is allocated.
        let mut work = (ip.len() as u64)
            .saturating_add(sp.len() as u64)
            .saturating_add(false_schema_path_len)
            .saturating_add("false schema".len() as u64)
            .saturating_add("boolean schema is false".encode_utf16().count() as u64)
            .saturating_add(1);
        if python_metadata {
            // The Python projection also retains the physical instance pointer and
            // copies the parent schema pointer into the error record.
            work = work
                .saturating_add(ip.len() as u64)
                .saturating_add(sp.len() as u64)
                .saturating_add(sp.len() as u64);
        }
        ctx.charge_work_u64(work, Utf16::default())?;
        let false_schema_path = append_schema_path(sp, false_schema_segment);
        push_ctx_precharged(
            out,
            ip,
            &false_schema_path,
            "false schema",
            Value::Object(vec![]),
            Utf16::from("boolean schema is false"),
        );
        if python_metadata {
            let error = out.get_mut(error_start).expect("false schema just emitted");
            error.python_error = Some(PythonErrorMetadata {
                validator: None,
                validator_value: std::sync::Arc::new(
                    crate::python_value::PythonConsumerValue::Null,
                ),
            });
            error.python_physical_instance_path = Some(ip.clone());
            let mut parent_path = sp.units().to_vec();
            if let Some(last_slash) = parent_path.iter().rposition(|unit| *unit == b'/' as u16) {
                let last_segment = &parent_path[last_slash + 1..];
                if !last_segment.is_empty()
                    && last_segment
                        .iter()
                        .all(|unit| (b'0' as u16..=b'9' as u16).contains(unit))
                {
                    parent_path.truncate(last_slash);
                }
            }
            error.schema_path = Utf16::new(parent_path);
        }
        Ok(())
    }

    fn eval_inner<T: InstanceView>(
        &self,
        schema: &Value,
        data: &T,
        ip: &Utf16,
        sp: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let mode = evaluated.mode;
        let initial_error_count = out.len();
        ctx.charge_work(1, ip.clone())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                ip.clone(),
                "Schema evaluation depth exceeded",
            ));
        }
        if let Value::Bool(allow) = schema {
            self.eval_boolean_schema(*allow, ip, sp, ctx, out)?;
            return Ok(());
        }
        let Value::Object(members) = schema else {
            return Ok(());
        };
        let mut annotation_scan_complete = false;
        // Ajv reports keyword errors in source/schema insertion order.
        let has_ref = matches!(
            self.dialect,
            SchemaDialect::Draft3
                | SchemaDialect::Draft4
                | SchemaDialect::Draft6
                | SchemaDialect::Draft7
        ) && members
            .iter()
            .any(|(k, _)| k.to_utf8().ok().as_deref() == Some("$ref"));
        let mut unevaluated_properties: Option<(&Value, Utf16)> = None;
        let mut unevaluated_items: Option<(&Value, Utf16)> = None;
        // Opt-in compiler presentation follows the pinned ECMAScript
        // validator's keyword groups, rather than schema insertion order.
        // The normal/Python path allocates no ordering vector and retains its
        // original traversal, callbacks and diagnostic order.
        let compiler_order = if evaluated.codegen_errors {
            ctx.charge_work(members.len().saturating_mul(128), Utf16::default())?;
            let mut order = Vec::with_capacity(members.len());
            for (index, (key, _)) in members.iter().enumerate() {
                ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                order.push((compiler_keyword_rank(key), index));
            }
            order.sort_unstable();
            Some(order)
        } else {
            None
        };
        'keywords: for slot in 0..members.len() {
            let index = compiler_order.as_ref().map_or(slot, |order| order[slot].1);
            let (key, rule) = &members[index];
            let Ok(keyword) = key.to_utf8() else { continue };
            if evaluated.annotation_scan
                && !matches!(
                    keyword.as_str(),
                    "$ref"
                        | "$dynamicRef"
                        | "$recursiveRef"
                        | "allOf"
                        | "anyOf"
                        | "oneOf"
                        | "extends"
                        | "properties"
                        | "patternProperties"
                        | "additionalProperties"
                        | "items"
                        | "prefixItems"
                        | "additionalItems"
                        | "contains"
                        | "dependencies"
                        | "dependentSchemas"
                        | "if"
                        | "unevaluatedProperties"
                        | "unevaluatedItems"
                )
            {
                continue;
            }
            // A keyword known to a newer dialect is an inert extension in
            // older consumer dialects. In particular, do not execute a
            // Draft 2020/2019 arm merely because it shares the same spelling.
            if !active_keywords(self.dialect).contains(&keyword.as_str()) {
                continue;
            }
            if has_ref
                && keyword != "$ref"
                && !matches!(
                    keyword.as_str(),
                    "$schema"
                        | "$id"
                        | "$comment"
                        | "title"
                        | "description"
                        | "default"
                        | "examples"
                        | "definitions"
                )
            {
                continue;
            }
            let kp = self.schema_pointer(sp, key, ctx)?;
            let result = match keyword.as_str() {
                "unevaluatedProperties" | "unevaluatedItems" => self.eval_keyword_annotations(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "$ref" | "$dynamicRef" | "$recursiveRef" => self.eval_keyword_references(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "type" | "disallow" | "const" | "enum" | "required" => self.eval_keyword_basic(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "properties" => self.eval_keyword_properties(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "patternProperties" => self.eval_keyword_patterns_additional(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "additionalProperties" => self.eval_keyword_additional_properties(
                    members,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                ),
                "propertyNames" => self.eval_keyword_property_names(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "items" | "prefixItems" | "additionalItems" => self.eval_keyword_items(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "minItems" | "maxItems" | "minProperties" | "maxProperties" | "minLength"
                | "maxLength" | "pattern" | "uniqueItems" => self.eval_keyword_simple(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
                | "divisibleBy" => self.eval_keyword_numeric(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "allOf" | "extends" | "anyOf" | "oneOf" | "not" | "if" => self
                    .eval_keyword_combinators(
                        schema,
                        members,
                        &keyword,
                        rule,
                        &kp,
                        data,
                        ip,
                        sp,
                        depth,
                        ctx,
                        out,
                        evaluated,
                        mode,
                        initial_error_count,
                        &mut annotation_scan_complete,
                        &mut unevaluated_properties,
                        &mut unevaluated_items,
                    ),
                "dependentRequired" | "dependencies" | "dependentSchemas" => self
                    .eval_keyword_dependencies(
                        schema,
                        members,
                        &keyword,
                        rule,
                        &kp,
                        data,
                        ip,
                        sp,
                        depth,
                        ctx,
                        out,
                        evaluated,
                        mode,
                        initial_error_count,
                        &mut annotation_scan_complete,
                        &mut unevaluated_properties,
                        &mut unevaluated_items,
                    ),
                "contains" | "format" => self.eval_keyword_contains(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                _ => Ok(()),
            };
            result?;
            if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                break 'keywords;
            }
            if evaluated.annotation_scan && evaluated.annotation_scan_short_circuit {
                break 'keywords;
            }
        }
        self.finish_eval_inner(
            members,
            data,
            ip,
            depth,
            ctx,
            out,
            evaluated,
            mode,
            initial_error_count,
            unevaluated_properties,
            unevaluated_items,
        )
    }

    #[inline(never)]
    fn finish_eval_inner<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        data: &T,
        ip: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        unevaluated_properties: Option<(&Value, Utf16)>,
        unevaluated_items: Option<(&Value, Utf16)>,
    ) -> Result<(), EngineError> {
        // continue into post-keyword annotation work (notably unevaluated*).
        if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
            return Ok(());
        }
        if let Some((rule, kp)) = unevaluated_properties {
            if let Some(count) = data.object_len() {
                let mut unevaluated = Vec::new();
                for index in 0..count {
                    let Some((name, value)) = data.object_entry(index) else {
                        continue;
                    };
                    if evaluated.contains_property(name, ctx, ip)? {
                        continue;
                    }
                    let path_name = name.to_utf16(ctx)?;
                    if matches!(rule, Value::Bool(false)) {
                        unevaluated.push(Value::String(path_name.clone()));
                        continue;
                    }
                    let mut child_annotations = evaluated.child(ctx, ip)?;
                    self.eval(
                        rule,
                        value,
                        &self.instance_pointer(ip, name, ctx)?,
                        &kp,
                        depth + 1,
                        ctx,
                        out,
                        &mut child_annotations,
                    )?;
                    evaluated.insert_property(name, ctx, ip)?;
                    if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                        break;
                    }
                }
                if !unevaluated.is_empty() {
                    push_ctx(
                        ctx,
                        out,
                        ip,
                        &kp,
                        "unevaluatedProperties",
                        object(vec![("unevaluatedProperty", unevaluated[0].clone())]),
                        "must NOT have unevaluated properties",
                    )?;
                }
            }
        }
        if let Some((rule, kp)) = unevaluated_items {
            if let Some(count) = data.array_len() {
                let mut unevaluated = Vec::new();
                for index in 0..count {
                    let Some(value) = data.array_get(index) else {
                        continue;
                    };
                    if evaluated.contains_item(index, ctx, ip)? {
                        continue;
                    }
                    if matches!(rule, Value::Bool(false)) {
                        unevaluated.push(Value::Number(index as f64));
                        continue;
                    }
                    let mut child_annotations = evaluated.child(ctx, ip)?;
                    self.eval(
                        rule,
                        value,
                        &append_instance_path(ip, &Utf16::from(index.to_string())),
                        &kp,
                        depth + 1,
                        ctx,
                        out,
                        &mut child_annotations,
                    )?;
                    evaluated.insert_item(index, ctx, ip)?;
                    if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                        break;
                    }
                }
                if !unevaluated.is_empty() {
                    push_ctx(
                        ctx,
                        out,
                        ip,
                        &kp,
                        "unevaluatedItems",
                        object(vec![("unevaluatedItems", Value::Array(unevaluated))]),
                        "must NOT have unevaluated items",
                    )?;
                }
            }
        }
        if matches!(self.regex_profile, RegexProfile::Python(_)) {
            self.attach_python_error_metadata(&mut out[initial_error_count..], members, ctx)?;
            for error in &mut out[initial_error_count..] {
                if error.python_physical_instance_path.is_none() {
                    ctx.charge_work(ip.len(), Utf16::default())?;
                    error.python_physical_instance_path = Some(ip.clone());
                }
            }
        }
        Ok(())
    }

    fn attach_python_error_metadata(
        &self,
        errors: &mut [StructuralError],
        members: &[(Utf16, Value)],
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        for error in errors {
            if error.python_error.is_some() {
                continue;
            }
            let keyword = error.keyword.as_str();
            let value = if keyword == "required" && self.dialect == SchemaDialect::Draft3 {
                // Draft 3's property-level required form reports the literal
                // child keyword value, not the parent's `properties` object.
                members
                    .iter()
                    .find(|(name, _)| name == &Utf16::from("properties"))
                    .and_then(|(_, properties)| match properties {
                        Value::Object(properties) => properties.iter().find_map(|(_, schema)| {
                            matches!(get(schema, "required"), Some(Value::Bool(true)))
                                .then_some(get(schema, "required").expect("matched"))
                        }),
                        _ => None,
                    })
                    .or_else(|| {
                        members
                            .iter()
                            .find(|(name, _)| name == &Utf16::from("required"))
                            .map(|(_, rule)| rule)
                    })
            } else {
                members
                    .iter()
                    .find(|(name, _)| name == &Utf16::from(keyword))
                    .map(|(_, rule)| rule)
            };
            let validator_value = if let Some(value) = value {
                self.python_schema_value(value, ctx)?
            } else {
                crate::python_value::PythonConsumerValue::Null
            };
            ctx.charge_work_u64(keyword.len() as u64 + 1, error.schema_path.clone())?;
            error.python_error = Some(PythonErrorMetadata {
                validator: Some(crate::python_value::PyText::from_utf8(keyword)),
                validator_value: std::sync::Arc::new(validator_value),
            });
        }
        Ok(())
    }

    fn python_schema_value(
        &self,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<crate::python_value::PythonConsumerValue, EngineError> {
        use crate::python_value::PythonConsumerValue as Py;
        ctx.charge_work(1, Utf16::default())?;
        if let Some(source) = self
            .python_exact_values
            .get(&(value as *const Value as usize))
        {
            return source.snapshot_with_context(ctx);
        }
        Ok(match value {
            Value::Null => Py::Null,
            Value::Bool(value) => Py::Bool(*value),
            Value::Number(value) => Py::Float(value.to_bits()),
            Value::String(text) => {
                let source = self
                    .python_source_strings
                    .get(&(text as *const Utf16 as usize));
                if let Some(source) = source {
                    ctx.charge_work(source.len(), Utf16::default())?;
                    Py::String(source.clone())
                } else {
                    ctx.charge_work(text.len(), Utf16::default())?;
                    Py::String(crate::python_value::py_text_from_utf16(text))
                }
            }
            Value::Array(items) => Py::Array(
                items
                    .iter()
                    .map(|item| self.python_schema_value(item, ctx))
                    .collect::<Result<_, _>>()?,
            ),
            Value::Object(items) => Py::Object(
                items
                    .iter()
                    .map(|(key, item)| {
                        let source_key =
                            self.python_source_keys.get(&(key as *const Utf16 as usize));
                        let key = if let Some(source_key) = source_key {
                            ctx.charge_work(source_key.len(), Utf16::default())?;
                            source_key.clone()
                        } else {
                            ctx.charge_work(key.len(), Utf16::default())?;
                            crate::python_value::py_text_from_utf16(key)
                        };
                        Ok((key, self.python_schema_value(item, ctx)?))
                    })
                    .collect::<Result<_, EngineError>>()?,
            ),
        })
    }
}

fn unavailable() -> EngineError {
    EngineError::new(
        "RESOURCE_PROFILE_UNAVAILABLE",
        Utf16::default(),
        "HardIsolated resource profile is unavailable",
    )
}

fn validate_local_reference_gate(
    value: &Value,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(path.len().saturating_add(1), Utf16::default())?;
    match value {
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                ctx.charge_work(path.len().saturating_add(22), Utf16::default())?;
                validate_local_reference_gate(
                    item,
                    &append_schema_path(path, &index.to_string()),
                    ctx,
                )?;
            }
        }
        Value::Object(members) => {
            for (key, item) in members {
                ctx.charge_work_u64(
                    path.len() as u64 + (key.len() as u64).saturating_mul(2) + 30,
                    Utf16::default(),
                )?;
                let child = append_schema_pointer(path, key);
                if key == &Utf16::from("$ref") || key == &Utf16::from("$dynamicRef") {
                    if !matches!(item, Value::String(reference) if reference.units().first() == Some(&(b'#' as u16)))
                    {
                        return Err(EngineError::new(
                            "SCHEMA_REF_UNRESOLVED",
                            child,
                            "Schema reference is not in the supplied resource set",
                        ));
                    }
                }
                validate_local_reference_gate(item, &child, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_schema_against_metaschema(
    schema: &Value,
    dialect: SchemaDialect,
    regex_profile: RegexProfile,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let source = include_str!("schema_metas.json");
    let meta_data = crate::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let metas = get(&meta_data, "metaschemas").ok_or_else(|| {
        EngineError::new(
            "SCHEMA_INTERNAL",
            Utf16::default(),
            "Pinned metaschema data is malformed",
        )
    })?;
    let meta_name = match dialect {
        SchemaDialect::Draft3 => "Draft3Validator",
        SchemaDialect::Draft4 => "Draft4Validator",
        SchemaDialect::Draft6 => "Draft6Validator",
        SchemaDialect::Draft7 => "Draft7Validator",
        SchemaDialect::Draft2019_09 => "Draft201909Validator",
        SchemaDialect::Draft2020_12 => "Draft202012Validator",
    };
    let meta_schema = get(metas, meta_name)
        .ok_or_else(|| {
            EngineError::new(
                "SCHEMA_INTERNAL",
                Utf16::default(),
                "Pinned metaschema is missing",
            )
        })?
        .clone();
    let resources = match get(&meta_data, "resources") {
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| {
                let id = get(item, "id").and_then(as_utf8).ok_or_else(|| {
                    EngineError::new(
                        "SCHEMA_INTERNAL",
                        Utf16::default(),
                        "Pinned metaschema resource has no id",
                    )
                })?;
                let value = get(item, "schema").ok_or_else(|| {
                    EngineError::new(
                        "SCHEMA_INTERNAL",
                        Utf16::default(),
                        "Pinned metaschema resource has no schema",
                    )
                })?;
                Ok((Utf16::from(id), value.clone()))
            })
            .collect::<Result<Vec<_>, EngineError>>()?,
        _ => {
            return Err(EngineError::new(
                "SCHEMA_INTERNAL",
                Utf16::default(),
                "Pinned metaschema resources are malformed",
            ))
        }
    };
    let meta = CompiledSchema {
        schema: meta_schema,
        resources: SchemaResources { entries: resources },
        dialect,
        strict: false,
        regex_profile,
        resolve_references_at_compile: false,
        python_text_origins: std::collections::BTreeMap::new(),
        python_member_keys: std::collections::BTreeMap::new(),
        python_source_strings: std::collections::BTreeMap::new(),
        python_source_keys: std::collections::BTreeMap::new(),
        python_exact_values: std::collections::BTreeMap::new(),
        python_reference_targets: std::collections::BTreeMap::new(),
        python_resource_roots: std::collections::BTreeMap::new(),
    };
    let errors = meta.validate_instance(schema, ctx)?;
    if let Some(error) = errors.first() {
        return Err(EngineError::new(
            "SCHEMA_INVALID",
            error.instance_path.clone(),
            error.message.clone(),
        ));
    }
    Ok(())
}

fn declared_dialect(schema: &Value) -> Option<SchemaDialect> {
    let id = as_utf8(get(schema, "$schema")?)?;
    match id.as_str() {
        "http://json-schema.org/draft-03/schema#" | "http://json-schema.org/draft-03/schema" => {
            Some(SchemaDialect::Draft3)
        }
        "http://json-schema.org/draft-04/schema#" | "http://json-schema.org/draft-04/schema" => {
            Some(SchemaDialect::Draft4)
        }
        "http://json-schema.org/draft-06/schema#" | "http://json-schema.org/draft-06/schema" => {
            Some(SchemaDialect::Draft6)
        }
        "http://json-schema.org/draft-07/schema#" | "http://json-schema.org/draft-07/schema" => {
            Some(SchemaDialect::Draft7)
        }
        "https://json-schema.org/draft/2019-09/schema"
        | "https://json-schema.org/draft/2019-09/schema#" => Some(SchemaDialect::Draft2019_09),
        "https://json-schema.org/draft/2020-12/schema"
        | "https://json-schema.org/draft/2020-12/schema#" => Some(SchemaDialect::Draft2020_12),
        _ => None,
    }
}
fn select_dialect(schema: &Value) -> Result<SchemaDialect, EngineError> {
    if get(schema, "$schema").is_none() {
        return Ok(SchemaDialect::Draft2020_12);
    }
    declared_dialect(schema).ok_or_else(|| {
        EngineError::new(
            "SCHEMA_DIALECT",
            Utf16::default(),
            "Unsupported JSON Schema dialect",
        )
    })
}
fn active_keywords(d: SchemaDialect) -> &'static [&'static str] {
    match d {
        SchemaDialect::Draft3 => &[
            "$ref",
            "additionalItems",
            "additionalProperties",
            "dependencies",
            "disallow",
            "divisibleBy",
            "enum",
            "extends",
            "format",
            "items",
            "maxItems",
            "maxLength",
            "maximum",
            "minItems",
            "minLength",
            "minimum",
            "pattern",
            "patternProperties",
            "properties",
            "type",
            "uniqueItems",
        ],
        SchemaDialect::Draft4 => &[
            "$ref",
            "additionalItems",
            "additionalProperties",
            "allOf",
            "anyOf",
            "dependencies",
            "enum",
            "format",
            "items",
            "maxItems",
            "maxLength",
            "maxProperties",
            "maximum",
            "minItems",
            "minLength",
            "minProperties",
            "minimum",
            "multipleOf",
            "not",
            "oneOf",
            "pattern",
            "patternProperties",
            "properties",
            "required",
            "type",
            "uniqueItems",
        ],
        SchemaDialect::Draft6 => &[
            "$ref",
            "additionalItems",
            "additionalProperties",
            "allOf",
            "anyOf",
            "const",
            "contains",
            "dependencies",
            "enum",
            "exclusiveMaximum",
            "exclusiveMinimum",
            "format",
            "items",
            "maxItems",
            "maxLength",
            "maxProperties",
            "maximum",
            "minItems",
            "minLength",
            "minProperties",
            "minimum",
            "multipleOf",
            "not",
            "oneOf",
            "pattern",
            "patternProperties",
            "properties",
            "propertyNames",
            "required",
            "type",
            "uniqueItems",
        ],
        SchemaDialect::Draft7 => &[
            "$ref",
            "additionalItems",
            "additionalProperties",
            "allOf",
            "anyOf",
            "const",
            "contains",
            "dependencies",
            "enum",
            "exclusiveMaximum",
            "exclusiveMinimum",
            "format",
            "if",
            "items",
            "maxItems",
            "maxLength",
            "maxProperties",
            "maximum",
            "minItems",
            "minLength",
            "minProperties",
            "minimum",
            "multipleOf",
            "not",
            "oneOf",
            "pattern",
            "patternProperties",
            "properties",
            "propertyNames",
            "required",
            "type",
            "uniqueItems",
        ],
        SchemaDialect::Draft2019_09 => &[
            "$recursiveRef",
            "$ref",
            "additionalItems",
            "additionalProperties",
            "allOf",
            "anyOf",
            "const",
            "contains",
            "dependentRequired",
            "dependentSchemas",
            "enum",
            "exclusiveMaximum",
            "exclusiveMinimum",
            "format",
            "if",
            "items",
            "maxItems",
            "maxLength",
            "maxProperties",
            "maximum",
            "minItems",
            "minLength",
            "minProperties",
            "minimum",
            "multipleOf",
            "not",
            "oneOf",
            "pattern",
            "patternProperties",
            "properties",
            "propertyNames",
            "required",
            "type",
            "then",
            "else",
            "unevaluatedItems",
            "unevaluatedProperties",
            "uniqueItems",
        ],
        SchemaDialect::Draft2020_12 => &[
            "$dynamicRef",
            "$ref",
            "additionalProperties",
            "allOf",
            "anyOf",
            "const",
            "contains",
            "dependentRequired",
            "dependentSchemas",
            "enum",
            "exclusiveMaximum",
            "exclusiveMinimum",
            "format",
            "if",
            "items",
            "maxItems",
            "maxLength",
            "maxProperties",
            "maximum",
            "minItems",
            "minLength",
            "minProperties",
            "minimum",
            "multipleOf",
            "not",
            "oneOf",
            "pattern",
            "patternProperties",
            "prefixItems",
            "properties",
            "propertyNames",
            "required",
            "type",
            "unevaluatedItems",
            "unevaluatedProperties",
            "uniqueItems",
        ],
    }
}

fn keywords(d: SchemaDialect) -> BTreeSet<&'static str> {
    let mut out = [
        "$schema",
        "$ref",
        "title",
        "description",
        "default",
        "type",
        "enum",
        "maximum",
        "minimum",
        "exclusiveMaximum",
        "exclusiveMinimum",
        "maxLength",
        "minLength",
        "pattern",
        "maxItems",
        "minItems",
        "uniqueItems",
        "required",
        "properties",
        "patternProperties",
        "additionalProperties",
        "items",
        "additionalItems",
        "format",
    ]
    .into_iter()
    .collect::<BTreeSet<_>>();
    if matches!(d, SchemaDialect::Draft3 | SchemaDialect::Draft4) {
        out.insert("id");
    } else {
        out.insert("$id");
    }
    if matches!(
        d,
        SchemaDialect::Draft3
            | SchemaDialect::Draft4
            | SchemaDialect::Draft6
            | SchemaDialect::Draft7
    ) {
        out.insert("dependencies");
    }
    if d != SchemaDialect::Draft3 {
        out.extend([
            "allOf",
            "anyOf",
            "oneOf",
            "not",
            "minProperties",
            "maxProperties",
        ]);
    }
    if matches!(
        d,
        SchemaDialect::Draft4 | SchemaDialect::Draft6 | SchemaDialect::Draft7
    ) {
        out.insert("definitions");
    }
    if d != SchemaDialect::Draft3 {
        out.insert("multipleOf");
    } else {
        out.insert("divisibleBy");
        out.extend(["extends", "disallow"]);
    }
    if matches!(
        d,
        SchemaDialect::Draft6
            | SchemaDialect::Draft7
            | SchemaDialect::Draft2019_09
            | SchemaDialect::Draft2020_12
    ) {
        out.extend(["const", "contains", "propertyNames"]);
    }
    if matches!(
        d,
        SchemaDialect::Draft7 | SchemaDialect::Draft2019_09 | SchemaDialect::Draft2020_12
    ) {
        out.extend([
            "if",
            "then",
            "else",
            "$comment",
            "examples",
            "readOnly",
            "writeOnly",
            "contentEncoding",
            "contentMediaType",
        ]);
    }
    if matches!(d, SchemaDialect::Draft2019_09 | SchemaDialect::Draft2020_12) {
        out.extend([
            "$defs",
            "dependentRequired",
            "dependentSchemas",
            "unevaluatedItems",
            "unevaluatedProperties",
            "minContains",
            "maxContains",
            "contentSchema",
            "$vocabulary",
            "$anchor",
        ]);
    }
    if d == SchemaDialect::Draft2019_09 {
        out.extend(["$recursiveAnchor", "$recursiveRef"]);
    }
    if d == SchemaDialect::Draft2020_12 {
        out.extend(["prefixItems", "$dynamicAnchor", "$dynamicRef", "deprecated"]);
    }
    out
}
fn schema_error(path: &Utf16, msg: &str) -> EngineError {
    EngineError::new("SCHEMA_INVALID", path.clone(), msg)
}
/// Copy a schema carrier while preserving distinct Python dictionary keys
/// that happen to project to the same UTF-16 sequence. Source-origin member
/// metadata disambiguates them in the shared Python-profile evaluator.
fn copy_schema_json(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    fn visit(
        value: &Value,
        path: &Utf16,
        depth: usize,
        count: &mut usize,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        ctx.charge_work(1, path.clone())?;
        *count = count.checked_add(1).ok_or_else(|| {
            EngineError::new("LIMIT", path.clone(), "Schema value count overflow")
        })?;
        ctx.check_tree_value_count(*count, path.clone())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "Schema nesting depth exceeded",
            ));
        }
        match value {
            Value::Null => Ok(Value::Null),
            Value::Bool(value) => Ok(Value::Bool(*value)),
            Value::Number(value) => Value::number(*value, path.clone()),
            Value::String(value) => {
                ctx.charge_work(value.len(), path.clone())?;
                Ok(Value::String(value.clone()))
            }
            Value::Array(items) => {
                ctx.charge_work(items.len(), path.clone())?;
                let mut copied = Vec::with_capacity(items.len());
                for (index, item) in items.iter().enumerate() {
                    copied.push(visit(
                        item,
                        &append_schema_pointer(path, &Utf16::from(index.to_string())),
                        depth + 1,
                        count,
                        ctx,
                    )?);
                }
                Ok(Value::Array(copied))
            }
            Value::Object(members) => {
                ctx.charge_work(members.len(), path.clone())?;
                let mut copied = Vec::with_capacity(members.len());
                for (key, value) in members {
                    ctx.charge_work(key.len(), path.clone())?;
                    copied.push((
                        key.clone(),
                        visit(
                            value,
                            &append_schema_pointer(path, key),
                            depth + 1,
                            count,
                            ctx,
                        )?,
                    ));
                }
                Ok(Value::Object(copied))
            }
        }
    }
    let mut count = 0;
    visit(value, &Utf16::from("#"), 0, &mut count, ctx)
}
fn schema_id(schema: &Value) -> Option<String> {
    as_utf8(get(schema, "$id").or_else(|| get(schema, "id"))?).filter(|id| !id.is_empty())
}
fn schema_origin_path(schema: &Value) -> Utf16 {
    let Some(id) = schema_id(schema) else {
        return Utf16::from("#");
    };
    Utf16::from(format!("{id}#"))
}
fn rebase_source_origins(origins: &mut crate::python_value::PythonSchemaOrigins, root: &Utf16) {
    let old = Utf16::from("#");
    let rebase = |path: Vec<u16>| {
        if path.starts_with(old.units()) {
            let mut units = root.units().to_vec();
            units.extend_from_slice(&path[old.len()..]);
            units
        } else {
            path
        }
    };
    origins.values = std::mem::take(&mut origins.values)
        .into_iter()
        .map(|(path, text)| (rebase(path), text))
        .collect();
    origins.members = std::mem::take(&mut origins.members)
        .into_iter()
        .map(|((path, index), text)| ((rebase(path), index), text))
        .collect();
}
fn percent_decode_fragment(fragment: &str) -> String {
    fn hex(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }
    let bytes = fragment.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%' && at + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[at + 1]), hex(bytes[at + 2])) {
                decoded.push(high * 16 + low);
                at += 3;
                continue;
            }
        }
        decoded.push(bytes[at]);
        at += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}
fn resolve_schema_uri(dialect: SchemaDialect, base: &str, reference: &str) -> Option<String> {
    if dialect == SchemaDialect::Draft2020_12 {
        return resolve_draft2020_uri(base, reference);
    }
    // The legacy profiles retain their historical relative-path joiner, but
    // an absolute `$id`/reference is already a complete URI and must not be
    // appended to the current scope as though it were a path.
    if url::Url::parse(reference).is_ok() {
        return Some(reference.to_owned());
    }
    resolve_relative_uri(base, reference)
}
fn resolve_draft2020_uri(base: &str, reference: &str) -> Option<String> {
    if let Ok(absolute) = url::Url::parse(reference) {
        return Some(absolute.to_string());
    }
    let base = url::Url::parse(base).ok()?;
    base.join(reference).ok().map(|joined| joined.to_string())
}
fn resolve_relative_uri(base: &str, reference: &str) -> Option<String> {
    let (scheme, rest) = base.split_once("://")?;
    let authority_end = rest.find('/').unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.is_empty() && scheme != "file" {
        return None;
    }
    let base_path = &rest[authority_end..];
    let joined = if reference.starts_with('/') {
        reference.to_owned()
    } else {
        let directory = base_path
            .rfind('/')
            .map(|index| &base_path[..=index])
            .unwrap_or("/");
        format!("{directory}{reference}")
    };
    let mut parts = Vec::new();
    for part in joined.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            _ => parts.push(part),
        }
    }
    let path = format!("/{}", parts.join("/"));
    Some(format!("{scheme}://{authority}{path}"))
}

/// Resolve a relative URI using only ASCII URI delimiters while preserving
/// Python source code points, including lone surrogates, in the URI payload.
fn resolve_relative_python_uri(base: &[u32], reference: &[u32]) -> Option<Vec<u32>> {
    // Port of the qualified CPython urllib.parse.urljoin grammar. Payload
    // codepoints remain opaque; only ASCII structural characters are parsed.
    const RELATIVE: &[&str] = &[
        "", "ftp", "http", "gopher", "nntp", "imap", "wais", "file", "https", "shttp", "mms",
        "prospero", "rtsp", "rtsps", "rtspu", "sftp", "svn", "svn+ssh", "ws", "wss",
    ];
    const NETLOC: &[&str] = &[
        "", "ftp", "http", "gopher", "nntp", "telnet", "imap", "wais", "file", "mms", "https",
        "shttp", "snews", "prospero", "rtsp", "rtsps", "rtspu", "rsync", "svn", "svn+ssh", "sftp",
        "nfs", "git", "git+ssh", "ws", "wss",
    ];
    const PARAMS: &[&str] = &[
        "", "ftp", "hdl", "prospero", "http", "imap", "https", "shttp", "rtsp", "rtsps", "rtspu",
        "sip", "sips", "mms", "sftp", "tel",
    ];
    fn in_set(points: &[u32], words: &[&str]) -> bool {
        words
            .iter()
            .any(|word| points.iter().copied().eq(word.bytes().map(u32::from)))
    }
    struct Parts {
        scheme: Vec<u32>,
        netloc: Vec<u32>,
        path: Vec<u32>,
        params: Vec<u32>,
        query: Vec<u32>,
        fragment: Vec<u32>,
    }
    fn parse(raw: &[u32], default_scheme: &[u32]) -> Parts {
        let start = raw
            .iter()
            .position(|point| *point > 0x20)
            .unwrap_or(raw.len());
        let cleaned: Vec<u32> = raw[start..]
            .iter()
            .copied()
            .filter(|point| !matches!(*point, 9 | 10 | 13))
            .collect();
        let mut remaining = cleaned.as_slice();
        let mut scheme = default_scheme.to_vec();
        if let Some(colon) = remaining.iter().position(|point| *point == b':' as u32) {
            if colon > 0
                && matches!(remaining[0], 65..=90 | 97..=122)
                && remaining[..colon]
                    .iter()
                    .all(|point| matches!(*point, 65..=90 | 97..=122 | 48..=57 | 43 | 45 | 46))
            {
                scheme = remaining[..colon]
                    .iter()
                    .map(|point| {
                        if (65..=90).contains(point) {
                            point + 32
                        } else {
                            *point
                        }
                    })
                    .collect();
                remaining = &remaining[colon + 1..];
            }
        }
        let netloc = if remaining.starts_with(&[47, 47]) {
            let end = remaining[2..]
                .iter()
                .position(|point| matches!(*point, 47 | 63 | 35))
                .map_or(remaining.len(), |i| i + 2);
            let netloc = remaining[2..end].to_vec();
            remaining = &remaining[end..];
            netloc
        } else {
            Vec::new()
        };
        let fragment = if let Some(index) = remaining.iter().position(|point| *point == 35) {
            let fragment = remaining[index + 1..].to_vec();
            remaining = &remaining[..index];
            fragment
        } else {
            Vec::new()
        };
        let query = if let Some(index) = remaining.iter().position(|point| *point == 63) {
            let query = remaining[index + 1..].to_vec();
            remaining = &remaining[..index];
            query
        } else {
            Vec::new()
        };
        let params = if in_set(&scheme, PARAMS) {
            let start = remaining
                .iter()
                .rposition(|point| *point == 47)
                .unwrap_or(0);
            if let Some(index) = remaining[start..]
                .iter()
                .position(|point| *point == 59)
                .map(|i| start + i)
            {
                let params = remaining[index + 1..].to_vec();
                remaining = &remaining[..index];
                params
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };
        Parts {
            scheme,
            netloc,
            path: remaining.to_vec(),
            params,
            query,
            fragment,
        }
    }
    fn unparse(parts: Parts) -> Vec<u32> {
        let mut path = parts.path;
        if !parts.params.is_empty() {
            path.push(59);
            path.extend(parts.params);
        }
        let mut out = Vec::new();
        if !parts.scheme.is_empty() {
            out.extend_from_slice(&parts.scheme);
            out.push(58);
        }
        if !parts.netloc.is_empty()
            || (!parts.scheme.is_empty() && in_set(&parts.scheme, NETLOC))
            || path.starts_with(&[47, 47])
        {
            out.extend_from_slice(&[47, 47]);
            out.extend(parts.netloc);
            if !path.is_empty() && path.first() != Some(&47) {
                out.push(47);
            }
        }
        out.extend(path);
        if !parts.query.is_empty() {
            out.push(63);
            out.extend(parts.query);
        }
        if !parts.fragment.is_empty() {
            out.push(35);
            out.extend(parts.fragment);
        }
        out
    }
    if base.is_empty() {
        return Some(reference.to_vec());
    }
    if reference.is_empty() {
        return Some(base.to_vec());
    }
    let base = parse(base, &[]);
    let mut target = parse(reference, &base.scheme);
    if target.scheme != base.scheme || !in_set(&target.scheme, RELATIVE) {
        return Some(reference.to_vec());
    }
    if in_set(&target.scheme, NETLOC) {
        if !target.netloc.is_empty() {
            return Some(unparse(target));
        }
        target.netloc = base.netloc;
    }
    if target.path.is_empty() && target.params.is_empty() {
        target.path = base.path;
        target.params = base.params;
        if target.query.is_empty() {
            target.query = base.query;
        }
        return Some(unparse(target));
    }
    let mut segments: Vec<&[u32]>;
    if target.path.first() == Some(&47) {
        segments = target.path.split(|point| *point == 47).collect();
    } else {
        segments = base.path.split(|point| *point == 47).collect();
        if segments.last().is_some_and(|part| !part.is_empty()) {
            segments.pop();
        }
        segments.extend(target.path.split(|point| *point == 47));
        let len = segments.len();
        // Python removes redundant empty interior segments only for a
        // relative path. Preserve absolute-path double slashes and trailing /.
        let mut index = 0;
        segments.retain(|part| {
            let keep = index == 0 || index + 1 == len || !part.is_empty();
            index += 1;
            keep
        });
    }
    let trailing_dot = segments
        .last()
        .is_some_and(|part| *part == [46] || *part == [46, 46]);
    let mut resolved: Vec<&[u32]> = Vec::new();
    for segment in segments {
        if segment == [46, 46] {
            resolved.pop();
        } else if segment != [46] {
            resolved.push(segment);
        }
    }
    if trailing_dot {
        resolved.push(&[]);
    }
    let mut path = Vec::new();
    for (index, segment) in resolved.iter().enumerate() {
        if index > 0 {
            path.push(47);
        }
        path.extend_from_slice(segment);
    }
    if path.is_empty() {
        path.push(47);
    }
    target.path = path;
    Some(unparse(target))
}

/// Locate a nested schema resource by its resolved identifier without fetching
/// anything. JSON Schema resources are immutable views into the admitted tree.
fn find_embedded_resource<'a>(
    root: &'a Value,
    target: &str,
    dialect: SchemaDialect,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Option<&'a Value>, EngineError> {
    fn visit<'a>(
        node: &'a Value,
        parent: &str,
        target: &str,
        dialect: SchemaDialect,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<Option<&'a Value>, EngineError> {
        ctx.charge_work(1, path.clone())?;
        match node {
            Value::Object(_) => {
                let own_id = schema_id(node);
                let effective = own_id.as_deref().map(|id| {
                    // URI parsing is bounded by metering both the inherited
                    // base and the authored identifier before resolution.
                    ctx.charge_work(parent.len().saturating_add(id.len()), path.clone())?;
                    let resolved = if dialect != SchemaDialect::Draft2020_12
                        && url::Url::parse(id).is_ok()
                    {
                        id.to_owned()
                    } else {
                        resolve_schema_uri(dialect, parent, id).unwrap_or_else(|| id.to_owned())
                    };
                    Ok(resolved)
                }).transpose()?;
                let base = effective.as_deref().unwrap_or(parent);
                if effective.as_deref() == Some(target) {
                    return Ok(Some(node));
                }
                for child in schema_child_values(node, dialect, ctx, path)? {
                    if let Some(found) = visit(child, base, target, dialect, ctx, path)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            Value::Array(items) => {
                for item in items {
                    if let Some(found) = visit(item, parent, target, dialect, ctx, path)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            _ => Ok(None),
        }
    }
    let root_id = schema_id(root).unwrap_or_default();
    visit(root, &root_id, target, dialect, ctx, path)
}

/// Draft 4 and Draft 6 used fragment-only `id`/`$id` values as named
/// identifiers before the dedicated `$anchor` keyword existed.
fn find_legacy_id_fragment<'a>(
    root: &'a Value,
    fragment: &str,
    dialect: SchemaDialect,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Option<&'a Value>, EngineError> {
    fn visit<'a>(
        node: &'a Value,
        fragment: &str,
        dialect: SchemaDialect,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<Option<&'a Value>, EngineError> {
        ctx.charge_work(1, path.clone())?;
        match node {
            Value::Object(members) => {
                let matches = ["$id", "id"].iter().any(|key| {
                    member(members, key)
                        .and_then(as_utf8)
                        .as_deref()
                        .is_some_and(|id| id.strip_prefix('#') == Some(fragment))
                });
                if matches {
                    return Ok(Some(node));
                }
                for value in schema_child_values(node, dialect, ctx, path)? {
                    if let Some(found) = visit(value, fragment, dialect, ctx, path)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            Value::Array(items) => {
                for item in items {
                    if let Some(found) = visit(item, fragment, dialect, ctx, path)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            _ => Ok(None),
        }
    }
    visit(root, fragment, dialect, ctx, path)
}

fn schema_child_values<'a>(
    schema: &'a Value,
    dialect: SchemaDialect,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Vec<&'a Value>, EngineError> {
    let Value::Object(members) = schema else {
        return Ok(Vec::new());
    };
    let mut capacity = 0usize;
    for (key, value) in members {
        let Ok(keyword) = key.to_utf8() else { continue };
        if !matches!(keyword.as_str(), "definitions" | "$defs")
            && !active_keywords(dialect).contains(&keyword.as_str())
        {
            continue;
        }
        let count = match (keyword.as_str(), value) {
            ("items", Value::Array(items))
            | ("allOf" | "anyOf" | "oneOf" | "extends", Value::Array(items)) => items.len(),
            (
                "properties" | "patternProperties" | "definitions" | "$defs" | "dependentSchemas",
                Value::Object(map),
            ) => map.len(),
            ("dependencies", Value::Object(map)) if dialect != SchemaDialect::Draft3 => map
                .iter()
                .filter(|(_, child)| !matches!(child, Value::Array(_)))
                .count(),
            ("type" | "disallow", Value::Object(_)) if dialect == SchemaDialect::Draft3 => 1,
            ("type" | "disallow", Value::Array(items)) if dialect == SchemaDialect::Draft3 => items
                .iter()
                .filter(|item| matches!(item, Value::Object(_)))
                .count(),
            (
                "additionalItems"
                | "additionalProperties"
                | "contains"
                | "not"
                | "if"
                | "then"
                | "else"
                | "propertyNames"
                | "unevaluatedItems"
                | "unevaluatedProperties",
                _,
            ) => 1,
            ("items", _) | ("extends", _) => 1,
            _ => 0,
        };
        capacity = capacity.saturating_add(count);
    }
    ctx.charge_work(members.len().saturating_add(capacity), path.clone())?;
    let mut children = Vec::with_capacity(capacity);
    for (key, value) in members {
        let Ok(keyword) = key.to_utf8() else { continue };
        // `definitions`/`$defs` are annotation-only containers for validation,
        // but their values are still schema resources and can be referenced.
        if !matches!(keyword.as_str(), "definitions" | "$defs")
            && !active_keywords(dialect).contains(&keyword.as_str())
        {
            continue;
        }
        match keyword.as_str() {
            "additionalItems"
            | "additionalProperties"
            | "contains"
            | "not"
            | "if"
            | "then"
            | "else"
            | "propertyNames"
            | "unevaluatedItems"
            | "unevaluatedProperties" => children.push(value),
            "items" => match value {
                Value::Array(items) => children.extend(items.iter()),
                _ => children.push(value),
            },
            "allOf" | "anyOf" | "oneOf" | "extends" => {
                if let Value::Array(items) = value {
                    children.extend(items.iter());
                } else if keyword == "extends" {
                    children.push(value);
                }
            }
            "properties" | "patternProperties" | "definitions" | "$defs" | "dependentSchemas" => {
                if let Value::Object(map) = value {
                    children.extend(map.iter().map(|(_, child)| child));
                }
            }
            "dependencies" if dialect != SchemaDialect::Draft3 => {
                if let Value::Object(map) = value {
                    children.extend(map.iter().filter_map(|(_, child)| match child {
                        Value::Array(_) => None,
                        _ => Some(child),
                    }));
                }
            }
            "type" | "disallow" if dialect == SchemaDialect::Draft3 => match value {
                Value::Object(_) => children.push(value),
                Value::Array(items) => {
                    children.extend(items.iter().filter(|item| matches!(item, Value::Object(_))));
                }
                _ => (),
            },
            _ => (),
        }
    }
    Ok(children)
}

fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter()
            .find(|(k, _)| k.to_utf8().ok().as_deref() == Some(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn member<'a>(m: &'a [(Utf16, Value)], key: &str) -> Option<&'a Value> {
    m.iter()
        .find(|(k, _)| k.to_utf8().ok().as_deref() == Some(key))
        .map(|(_, v)| v)
}
fn find_anchor<'a>(
    root: &'a Value,
    name: &str,
    dialect: SchemaDialect,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Option<&'a Value>, EngineError> {
    fn visit<'a>(
        node: &'a Value,
        name: &str,
        dialect: SchemaDialect,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<Option<&'a Value>, EngineError> {
        ctx.charge_work(1, path.clone())?;
        match node {
            Value::Object(members) => {
                let matches = ["$anchor", "$dynamicAnchor"]
                    .iter()
                    .any(|key| member(members, key).and_then(as_utf8).as_deref() == Some(name));
                if matches {
                    return Ok(Some(node));
                }
                for value in schema_child_values(node, dialect, ctx, path)? {
                    if let Some(found) = visit(value, name, dialect, ctx, path)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            Value::Array(items) => {
                for item in items {
                    if let Some(found) = visit(item, name, dialect, ctx, path)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            _ => Ok(None),
        }
    }
    visit(root, name, dialect, ctx, path)
}
fn as_utf8(v: &Value) -> Option<String> {
    if let Value::String(x) = v {
        x.to_utf8().ok()
    } else {
        None
    }
}
fn compile_regex(pattern: &Utf16) -> Result<regress::Regex, regress::Error> {
    let units = pattern.units();
    let mut codepoints = Vec::with_capacity(units.len());
    let mut index = 0;
    while index < units.len() {
        let first = units[index];
        if (0xd800..=0xdbff).contains(&first)
            && index + 1 < units.len()
            && (0xdc00..=0xdfff).contains(&units[index + 1])
        {
            let second = units[index + 1];
            codepoints.push(0x10000 + (((first as u32 - 0xd800) << 10) | (second as u32 - 0xdc00)));
            index += 2;
        } else {
            // Keep isolated surrogate code units as their JS code-point values;
            // regress' UTF-16 matcher handles the resulting code points.
            codepoints.push(first as u32);
            index += 1;
        }
    }
    regress::Regex::from_unicode(codepoints.into_iter(), "u")
}
fn as_usize(v: &Value) -> Option<usize> {
    if let Value::Number(n) = v {
        if n.fract() == 0.0 && *n >= 0.0 {
            Some(*n as usize)
        } else {
            None
        }
    } else {
        None
    }
}
fn validate_string_array(v: &Value, path: &Utf16, unique: bool) -> Result<(), EngineError> {
    let Value::Array(a) = v else {
        return Err(schema_error(path, "Expected an array of strings"));
    };
    let mut seen = BTreeSet::new();
    for x in a {
        let Value::String(s) = x else {
            return Err(schema_error(path, "Expected an array of strings"));
        };
        if unique && !seen.insert(s.units().to_vec()) {
            return Err(schema_error(path, "Array values must be unique"));
        }
    }
    Ok(())
}
fn validate_type_declaration(
    v: &Value,
    path: &Utf16,
    dialect: SchemaDialect,
) -> Result<(), EngineError> {
    let branches: Vec<&Value> = match v {
        Value::String(_) => vec![v],
        Value::Object(_) if dialect == SchemaDialect::Draft3 => vec![v],
        Value::Array(items) => items.iter().collect(),
        _ => return Err(schema_error(path, "type must be a string or array")),
    };
    let mut seen = BTreeSet::new();
    for branch in branches {
        if matches!(branch, Value::Object(_)) && dialect == SchemaDialect::Draft3 {
            continue;
        }
        let Value::String(name) = branch else {
            return Err(schema_error(path, "type array values must be strings"));
        };
        let name = name
            .to_utf8()
            .map_err(|_| schema_error(path, "Invalid type name"))?;
        if ![
            "null", "boolean", "object", "array", "number", "integer", "string",
        ]
        .contains(&name.as_str())
            || !seen.insert(name)
        {
            return Err(schema_error(path, "Invalid or duplicate type name"));
        }
    }
    Ok(())
}
fn type_matches<T: InstanceView>(rule: &Value, v: &T, dialect: SchemaDialect) -> bool {
    match rule {
        Value::Array(a) => a.iter().any(|t| type_matches(t, v, dialect)),
        Value::String(s) => match s.to_utf8().ok().as_deref() {
            Some("null") => v.kind() == InstanceKind::Null,
            Some("boolean") => v.kind() == InstanceKind::Bool,
            Some("object") => v.kind() == InstanceKind::Object,
            Some("array") => v.kind() == InstanceKind::Array,
            Some("number") => v.kind() == InstanceKind::Number,
            Some("integer") => v.number_value().is_some_and(|number| {
                if matches!(dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                    && matches!(number, InstanceNumber::PythonFloat(_))
                {
                    false
                } else {
                    number.is_integer()
                }
            }),
            Some("string") => v.kind() == InstanceKind::String,
            _ => true,
        },
        _ => true,
    }
}
fn type_label(rule: &Value) -> String {
    match rule {
        Value::String(x) => x.to_utf8().unwrap_or_default(),
        Value::Array(a) => a.iter().filter_map(as_utf8).collect::<Vec<_>>().join(","),
        _ => "valid".into(),
    }
}
fn canonical_equal<T: InstanceView>(
    a: &Value,
    b: &T,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    value_equals_instance(a, b, ctx)
}
fn is_multiple_of_source(
    value: InstanceNumber<'_>,
    divisor: f64,
    source_divisor: Option<&crate::python_value::PythonConsumerValue>,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<bool, EngineError> {
    use crate::python_value::PythonConsumerValue as Py;
    use num_traits::Zero;

    fn work_for_bigint(value: &num_bigint::BigInt) -> u64 {
        value.bits().div_ceil(8).saturating_add(1)
    }
    fn charge_path_and_work(
        ctx: &mut Context<'_>,
        amount: u64,
        path: &Utf16,
    ) -> Result<(), EngineError> {
        // Charge before cloning the source-derived path used to annotate any
        // subsequent budget failure.
        ctx.charge_work(path.len(), Utf16::default())?;
        ctx.charge_work_u64(amount, path.clone())
    }
    fn arithmetic_error(
        path: &Utf16,
        reason: &'static str,
        ctx: &mut Context<'_>,
    ) -> Result<EngineError, EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        Ok(
            EngineError::new("PYTHON_SCHEMA_ARITHMETIC", path.clone(), reason)
                .with_python_schema_terminal(crate::error::PythonSchemaTerminal::Arithmetic),
        )
    }
    fn division_work(left: u64, right: u64) -> u64 {
        left.saturating_mul(right.max(1))
            .saturating_add(left)
            .saturating_add(right)
    }
    fn float_ratio_work() -> u64 {
        // A finite f64 ratio is bounded by a 53-bit numerator and a 1074-bit
        // power-of-two denominator. Charge for both bounded BigInt shifts and
        // their backing storage before constructing either integer.
        2 * (1074u64.div_ceil(8) + 2)
    }
    fn float_ratio(value: f64) -> (num_bigint::BigInt, num_bigint::BigInt) {
        use num_bigint::BigInt;
        let bits = value.to_bits();
        let negative = bits >> 63 != 0;
        let exponent_bits = ((bits >> 52) & 0x7ff) as i32;
        let fraction = bits & ((1u64 << 52) - 1);
        let (mantissa, exponent) = if exponent_bits == 0 {
            (fraction, -1074)
        } else {
            (fraction | (1u64 << 52), exponent_bits - 1023 - 52)
        };
        let mut numerator = BigInt::from(mantissa);
        if negative {
            numerator = -numerator;
        }
        if exponent >= 0 {
            (numerator << exponent as usize, BigInt::from(1u8))
        } else {
            (numerator, BigInt::from(1u8) << (-exponent) as usize)
        }
    }

    // Consumer schemas retain the Python numeric kind of each divisor. Its
    // validator deliberately uses two different algorithms for int and float.
    match source_divisor {
        Some(Py::Integer(integer_divisor)) => {
            if integer_divisor.is_zero() {
                return Ok(false);
            }
            if let InstanceNumber::PythonInteger(integer_value) = value {
                let left = work_for_bigint(integer_value);
                let right = work_for_bigint(integer_divisor);
                charge_path_and_work(ctx, division_work(left, right), path)?;
                return Ok((integer_value % integer_divisor).is_zero());
            }
            charge_path_and_work(ctx, work_for_bigint(integer_divisor), path)?;
            let Some(float_divisor) = integer_divisor.to_f64().filter(|number| number.is_finite())
            else {
                return Err(arithmetic_error(path, "integer-to-float-overflow", ctx)?);
            };
            let float_value = match value {
                InstanceNumber::Core(number) => number,
                InstanceNumber::PythonFloat(bits) => f64::from_bits(bits),
                InstanceNumber::PythonInteger(_) => unreachable!(),
            };
            charge_path_and_work(ctx, 1, path)?;
            // Python's float % int path is fmod-like; only zero-ness is used
            // by jsonschema, and NaN is truthy (therefore invalid).
            Ok(float_value % float_divisor == 0.0)
        }
        Some(Py::Float(divisor_bits)) => {
            let float_divisor = f64::from_bits(*divisor_bits);
            if float_divisor == 0.0 {
                return Ok(false);
            }
            let (float_value, integer_instance) = match value {
                InstanceNumber::Core(number) => (number, None),
                InstanceNumber::PythonFloat(bits) => (f64::from_bits(bits), None),
                InstanceNumber::PythonInteger(integer) => {
                    charge_path_and_work(ctx, work_for_bigint(integer), path)?;
                    let Some(number) = integer.to_f64().filter(|number| number.is_finite()) else {
                        return Err(arithmetic_error(path, "integer-to-float-overflow", ctx)?);
                    };
                    (number, Some(integer))
                }
            };
            charge_path_and_work(ctx, 1, path)?;
            let quotient = float_value / float_divisor;
            if quotient.is_nan() {
                return Err(arithmetic_error(path, "nan-to-integer", ctx)?);
            }
            if quotient.is_finite() {
                return Ok(quotient.fract() == 0.0);
            }

            // jsonschema catches int(quotient)'s overflow and checks the exact
            // Fraction quotient. Non-finite instances fail during Fraction().
            if float_value.is_infinite() {
                return Err(arithmetic_error(path, "infinity-to-integer-ratio", ctx)?);
            }
            // Reserve the fixed f64-ratio work before shifts/BigInt allocation,
            // then reserve operand copies, products, and remainder division.
            charge_path_and_work(ctx, float_ratio_work(), path)?;
            let (instance_numerator, instance_denominator) = if let Some(integer) = integer_instance
            {
                let integer_bytes = work_for_bigint(integer);
                charge_path_and_work(ctx, integer_bytes, path)?;
                (integer.clone(), num_bigint::BigInt::from(1u8))
            } else {
                float_ratio(float_value)
            };
            let (divisor_numerator, divisor_denominator) = float_ratio(float_divisor);
            let instance_num_bytes = work_for_bigint(&instance_numerator);
            let instance_den_bytes = work_for_bigint(&instance_denominator);
            let divisor_num_bytes = work_for_bigint(&divisor_numerator);
            let divisor_den_bytes = work_for_bigint(&divisor_denominator);
            let numerator_bytes = instance_num_bytes.saturating_add(divisor_den_bytes);
            let denominator_bytes = instance_den_bytes.saturating_add(divisor_num_bytes);
            let cost = instance_num_bytes
                .saturating_add(instance_den_bytes)
                .saturating_add(divisor_num_bytes)
                .saturating_add(divisor_den_bytes)
                .saturating_add(instance_num_bytes.saturating_mul(divisor_den_bytes))
                .saturating_add(instance_den_bytes.saturating_mul(divisor_num_bytes))
                .saturating_add(division_work(numerator_bytes, denominator_bytes));
            charge_path_and_work(ctx, cost, path)?;
            let numerator = instance_numerator * divisor_denominator;
            let denominator = instance_denominator * divisor_numerator;
            if denominator.is_zero() {
                return Ok(false);
            }
            Ok((numerator % denominator).is_zero())
        }
        _ => {
            use num_traits::ToPrimitive;
            if divisor == 0.0 || !divisor.is_finite() {
                return Ok(false);
            }
            let number = match value {
                InstanceNumber::Core(value) => value,
                InstanceNumber::PythonInteger(value) => match value.to_f64() {
                    Some(value) => value,
                    None => return Ok(false),
                },
                InstanceNumber::PythonFloat(bits) => f64::from_bits(bits),
            };
            let quotient = number / divisor;
            Ok(quotient.is_finite() && quotient.fract() == 0.0)
        }
    }
}

fn bind_python_source_tree(
    source: &crate::python_value::PythonConsumerValue,
    target: &Value,
    strings: &mut std::collections::BTreeMap<usize, crate::python_value::PyText>,
    keys: &mut std::collections::BTreeMap<usize, crate::python_value::PyText>,
    exact: &mut std::collections::BTreeMap<
        usize,
        std::sync::Arc<crate::python_value::PythonConsumerValue>,
    >,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    use crate::python_value::PythonConsumerValue as Py;
    fn visit(
        source: &Py,
        target: &Value,
        literal: bool,
        strings: &mut std::collections::BTreeMap<usize, crate::python_value::PyText>,
        keys: &mut std::collections::BTreeMap<usize, crate::python_value::PyText>,
        exact: &mut std::collections::BTreeMap<usize, std::sync::Arc<Py>>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        if literal || matches!(source, Py::Integer(_) | Py::Float(_)) {
            let copied = source.snapshot_with_context(ctx)?;
            exact.insert(target as *const Value as usize, std::sync::Arc::new(copied));
        }
        match (source, target) {
            (Py::String(text), Value::String(units)) => {
                ctx.charge_work(text.len(), Utf16::default())?;
                strings.insert(units as *const Utf16 as usize, text.clone());
            }
            (Py::Array(source_items), Value::Array(target_items))
                if source_items.len() == target_items.len() =>
            {
                for (source_item, target_item) in source_items.iter().zip(target_items) {
                    visit(source_item, target_item, literal, strings, keys, exact, ctx)?;
                }
            }
            (Py::Object(source_items), Value::Object(target_items))
                if source_items.len() == target_items.len() =>
            {
                for ((source_key, source_item), (target_key, target_item)) in
                    source_items.iter().zip(target_items)
                {
                    ctx.charge_work(source_key.len(), Utf16::default())?;
                    keys.insert(target_key as *const Utf16 as usize, source_key.clone());
                    let key = source_key.codepoints();
                    let child_literal = literal
                        || (key
                            == [
                                b'c' as u32,
                                b'o' as u32,
                                b'n' as u32,
                                b's' as u32,
                                b't' as u32,
                            ])
                        || (key == [b'e' as u32, b'n' as u32, b'u' as u32, b'm' as u32]);
                    visit(
                        source_item,
                        target_item,
                        child_literal,
                        strings,
                        keys,
                        exact,
                        ctx,
                    )?;
                }
            }
            (Py::Null, Value::Null)
            | (Py::Bool(_), Value::Bool(_))
            | (Py::Integer(_), Value::Number(_))
            | (Py::Float(_), Value::Number(_)) => {}
            _ => {
                return Err(EngineError::new(
                    "SCHEMA_INVALID",
                    Utf16::default(),
                    "Python schema source projection changed its tree shape",
                ))
            }
        }
        Ok(())
    }
    visit(source, target, false, strings, keys, exact, ctx)
}

fn percent_decode_python_points(points: &[u32]) -> Vec<u32> {
    fn hex(point: u32) -> Option<u8> {
        match point {
            0x30..=0x39 => Some((point - 0x30) as u8),
            0x41..=0x46 => Some((point - 0x41 + 10) as u8),
            0x61..=0x66 => Some((point - 0x61 + 10) as u8),
            _ => None,
        }
    }
    let mut output = Vec::with_capacity(points.len());
    let mut at = 0;
    while at < points.len() {
        if points[at] == b'%' as u32 && at + 2 < points.len() {
            if hex(points[at + 1]).is_some() && hex(points[at + 2]).is_some() {
                let mut bytes = Vec::new();
                while at + 2 < points.len()
                    && points[at] == b'%' as u32
                    && hex(points[at + 1]).is_some()
                    && hex(points[at + 2]).is_some()
                {
                    bytes.push(hex(points[at + 1]).unwrap() * 16 + hex(points[at + 2]).unwrap());
                    at += 3;
                }
                if let Ok(text) = std::str::from_utf8(&bytes) {
                    output.extend(text.chars().map(u32::from));
                } else {
                    output.extend(bytes.into_iter().map(u32::from));
                }
                continue;
            }
        }
        output.push(points[at]);
        at += 1;
    }
    output
}

fn python_decimal_digit(point: u32) -> Option<u8> {
    const ZEROES: &[u32] = &[
        0x0030, 0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66,
        0x0ce6, 0x0d66, 0x0de6, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x1090, 0x17e0, 0x1810, 0x1946,
        0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0, 0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0,
        0xa9f0, 0xaa50, 0xabf0, 0xff10, 0x104a0, 0x10d30, 0x11066, 0x110f0, 0x11136, 0x111d0,
        0x112f0, 0x11450, 0x114d0, 0x11650, 0x116c0, 0x11730, 0x118e0, 0x11950, 0x11c50, 0x11d50,
        0x11da0, 0x16a60, 0x16ac0, 0x16b50, 0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6, 0x1e140,
        0x1e2f0, 0x1e4f0, 0x1e950, 0x1fbf0,
    ];
    ZEROES.iter().find_map(|zero| {
        (point >= *zero && point < zero.saturating_add(10)).then(|| (point - zero) as u8)
    })
}

fn python_int_whitespace(point: u32) -> bool {
    char::from_u32(point).is_some_and(char::is_whitespace)
}

/// Python's `int(token)` shape used by `referencing` when indexing a Sequence.
/// Magnitude saturates at `length + 1`, so arbitrarily long tokens never need
/// a BigInt allocation just to determine whether the index is in bounds.
fn parse_python_sequence_index(
    token: &[u32],
    length: usize,
    ctx: &mut Context<'_>,
) -> Result<Result<Option<usize>, ()>, EngineError> {
    ctx.charge_work(token.len(), Utf16::default())?;
    let mut start = 0;
    let mut end = token.len();
    while start < end && python_int_whitespace(token[start]) {
        start += 1;
    }
    while start < end && python_int_whitespace(token[end - 1]) {
        end -= 1;
    }
    let mut at = start;
    let negative = match token.get(at) {
        Some(0x2d) => {
            at += 1;
            true
        }
        Some(0x2b) => {
            at += 1;
            false
        }
        _ => false,
    };
    let limit = length.saturating_add(1) as u128;
    let mut magnitude = 0u128;
    let mut digit_count = 0usize;
    let mut previous_digit = false;
    while at < end {
        if let Some(digit) = python_decimal_digit(token[at]) {
            magnitude = magnitude
                .saturating_mul(10)
                .saturating_add(digit as u128)
                .min(limit);
            digit_count += 1;
            previous_digit = true;
            at += 1;
        } else if token[at] == b'_' as u32
            && previous_digit
            && at + 1 < end
            && python_decimal_digit(token[at + 1]).is_some()
        {
            previous_digit = false;
            at += 1;
        } else {
            return Ok(Err(()));
        }
    }
    if digit_count == 0 {
        return Ok(Err(()));
    }
    // CPython's configured conversion guard is part of this consumer profile.
    if digit_count > 4300 {
        return Ok(Err(()));
    }
    let magnitude = magnitude as usize;
    if negative {
        if magnitude == 0 {
            return Ok(Ok(Some(0)));
        }
        if magnitude > length {
            return Ok(Ok(None));
        }
        Ok(Ok(Some(length - magnitude)))
    } else if magnitude >= length {
        Ok(Ok(None))
    } else {
        Ok(Ok(Some(magnitude)))
    }
}

fn bind_python_reference_targets(
    source: &crate::python_value::PythonConsumerValue,
    target: &Value,
    resource: Option<usize>,
    supplied_resource_uri: Option<&crate::python_value::PyText>,
    dialect: SchemaDialect,
    references: &mut std::collections::BTreeMap<usize, PythonReferenceTarget>,
    resource_roots: &mut std::collections::BTreeMap<usize, PythonResourceLocator>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    use crate::python_value::PyText;
    use crate::python_value::PythonConsumerValue as Py;

    fn key_is(key: &PyText, expected: &str) -> bool {
        key.codepoints()
            .iter()
            .copied()
            .eq(expected.as_bytes().iter().map(|byte| *byte as u32))
    }

    fn source_id(
        source: &Py,
        dialect: SchemaDialect,
        ctx: &mut Context<'_>,
    ) -> Result<Option<PythonResourceUri>, EngineError> {
        let Py::Object(members) = source else {
            return Ok(None);
        };
        let legacy = matches!(
            dialect,
            SchemaDialect::Draft3
                | SchemaDialect::Draft4
                | SchemaDialect::Draft6
                | SchemaDialect::Draft7
        );
        let mut selected = None;
        let field = if matches!(dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4) {
            "id"
        } else {
            "$id"
        };
        for (key, value) in members {
            ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
            if legacy && key_is(key, "$ref") {
                return Ok(None);
            }
            if key_is(key, field) {
                if let Py::String(text) = value {
                    selected = Some(text);
                }
            }
        }
        let Some(text) = selected else {
            return Ok(None);
        };
        ctx.charge_work(text.len(), Utf16::default())?;
        let points = text.codepoints();
        if legacy && points.first() == Some(&(b'#' as u32)) {
            return Ok(None);
        }
        // referencing.Resource.id strips the accepted trailing empty fragment.
        let end = points
            .iter()
            .rposition(|point| *point != b'#' as u32)
            .map_or(0, |index| index + 1);
        Ok(Some(PythonResourceUri::from_points(&points[..end], ctx)?))
    }

    fn source_recursive_anchor(source: &Py, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
        let Py::Object(members) = source else {
            return Ok(false);
        };
        for (key, value) in members {
            ctx.charge_work(key.codepoints().len().saturating_add(1), Utf16::default())?;
            if key_is(key, "$recursiveAnchor") {
                return Ok(matches!(value, Py::Bool(true)));
            }
        }
        Ok(false)
    }

    fn is_resource_boundary(
        source: &Py,
        dialect: SchemaDialect,
        is_supplied_root: bool,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        if is_supplied_root {
            return Ok(true);
        }
        Ok(source_id(source, dialect, ctx)?.is_some())
    }

    fn at_indices<'a>(mut value: &'a Py, indices: &[usize]) -> Option<&'a Py> {
        for index in indices {
            value = match value {
                Py::Object(members) => &members.get(*index)?.1,
                Py::Array(items) => items.get(*index)?,
                _ => return None,
            };
        }
        Some(value)
    }

    fn source_anchor(
        node: &Py,
        name: &[u32],
        dialect: SchemaDialect,
        root: bool,
        indices: &mut Vec<usize>,
        ctx: &mut Context<'_>,
    ) -> Result<Option<Vec<usize>>, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        // An anchor belongs to its own recognized resource. Opaque objects
        // are never visited by schema_child_paths and cannot introduce one.
        if !root && source_id(node, dialect, ctx)?.is_some() {
            return Ok(None);
        }
        if let Py::Object(members) = node {
            let legacy = matches!(
                dialect,
                SchemaDialect::Draft3
                    | SchemaDialect::Draft4
                    | SchemaDialect::Draft6
                    | SchemaDialect::Draft7
            );
            let mut ref_sibling = false;
            let mut matched = false;
            for (key, value) in members {
                ctx.charge_work_u64(
                    (key.len().min(14) as u64 + 1).saturating_mul(4),
                    Utf16::default(),
                )?;
                if key_is(key, "$ref") {
                    ref_sibling = true;
                }
                let field = if matches!(dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4) {
                    "id"
                } else {
                    "$id"
                };
                let anchor_field = if legacy {
                    key_is(key, field)
                } else {
                    key_is(key, "$anchor")
                        || (dialect == SchemaDialect::Draft2020_12 && key_is(key, "$dynamicAnchor"))
                };
                if anchor_field {
                    if let Py::String(text) = value {
                        let points = text.codepoints();
                        let candidate = if legacy {
                            if points.first() != Some(&(b'#' as u32)) {
                                continue;
                            }
                            &points[1..]
                        } else {
                            points
                        };
                        ctx.charge_work_u64(
                            candidate.len().min(name.len()) as u64 + 1,
                            Utf16::default(),
                        )?;
                        matched |= candidate == name;
                    }
                }
            }
            if matched && !(legacy && ref_sibling) {
                ctx.charge_work(indices.len(), Utf16::default())?;
                return Ok(Some(indices.clone()));
            }
        }
        for child_path in schema_child_paths(node, dialect, ctx)? {
            ctx.charge_work_u64(
                (child_path.len() as u64).saturating_mul(2),
                Utf16::default(),
            )?;
            let child = at_indices(node, &child_path)
                .ok_or_else(|| schema_error(&Utf16::default(), "Python anchor source changed"))?;
            let old_len = indices.len();
            indices.extend_from_slice(&child_path);
            let found = source_anchor(child, name, dialect, false, indices, ctx)?;
            indices.truncate(old_len);
            if found.is_some() {
                return Ok(found);
            }
        }
        Ok(None)
    }

    fn source_pointer(
        resource_root: &Py,
        reference: &crate::python_value::PyText,
        dialect: SchemaDialect,
        recursive: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Option<(Vec<usize>, Option<PythonReferenceFailure>)>, EngineError> {
        // The native recursive applicator always calls lookup("#"), even
        // when the admitted keyword text contains a different fragment.
        let raw_points = if recursive {
            &[b'#' as u32][..]
        } else {
            reference.codepoints()
        };
        ctx.charge_work_u64(
            (raw_points.len() as u64).saturating_mul(4),
            Utf16::default(),
        )?;
        let points = percent_decode_python_points(raw_points);
        if points.first() != Some(&(b'#' as u32)) {
            return Ok(None);
        }
        if points.len() == 1 {
            return Ok(Some((Vec::new(), None)));
        }
        if points.get(1) != Some(&(b'/' as u32)) {
            let mut indices = Vec::new();
            return Ok(Some(
                match source_anchor(
                    resource_root,
                    &points[1..],
                    dialect,
                    true,
                    &mut indices,
                    ctx,
                )? {
                    Some(indices) => (indices, None),
                    None => (Vec::new(), Some(PythonReferenceFailure::Unresolved)),
                },
            ));
        }
        let mut current = resource_root;
        let mut indices = Vec::new();
        let mut failure = None;
        for raw in points[2..].split(|point| *point == b'/' as u32) {
            ctx.charge_work(raw.len(), Utf16::default())?;
            let mut part = Vec::with_capacity(raw.len());
            let mut at = 0;
            while at < raw.len() {
                if raw[at] == b'~' as u32 {
                    match raw.get(at + 1) {
                        Some(value) if *value == b'0' as u32 => part.push(b'~' as u32),
                        Some(value) if *value == b'1' as u32 => part.push(b'/' as u32),
                        _ => {
                            failure = Some(PythonReferenceFailure::Unresolved);
                            break;
                        }
                    }
                    at += 2;
                } else {
                    part.push(raw[at]);
                    at += 1;
                }
            }
            match current {
                Py::Object(members) => {
                    let mut found = None;
                    for (index, (key, value)) in members.iter().enumerate() {
                        ctx.charge_work_u64(
                            key.len().min(part.len()) as u64 + 1,
                            Utf16::default(),
                        )?;
                        if key.codepoints() == part.as_slice() {
                            found = Some((index, value));
                            break;
                        }
                    }
                    let Some((index, value)) = found else {
                        failure = Some(PythonReferenceFailure::Unresolved);
                        break;
                    };
                    ctx.charge_work(1, Utf16::default())?;
                    indices.push(index);
                    current = value;
                }
                Py::Array(items) => {
                    let index = match parse_python_sequence_index(&part, items.len(), ctx)? {
                        Ok(Some(index)) => index,
                        Ok(None) => {
                            failure = Some(PythonReferenceFailure::Unresolved);
                            break;
                        }
                        Err(()) => {
                            failure = Some(PythonReferenceFailure::InvalidArrayIndex);
                            break;
                        }
                    };
                    let Some(value) = items.get(index) else {
                        failure = Some(PythonReferenceFailure::Unresolved);
                        break;
                    };
                    current = value;
                    ctx.charge_work(1, Utf16::default())?;
                    indices.push(index);
                }
                _ => {
                    failure = Some(PythonReferenceFailure::InvalidTraversal);
                    break;
                }
            }
        }
        Ok(Some((indices, failure)))
    }
    fn visit(
        source: &Py,
        target: &Value,
        resource: Option<usize>,
        dialect: SchemaDialect,
        indices: &mut Vec<usize>,
        schema_position: bool,
        resource_root: &Py,
        resource_root_indices: &[usize],
        resource_uri: Option<&PythonResourceUri>,
        resource_recursive_anchor: bool,
        references: &mut std::collections::BTreeMap<usize, PythonReferenceTarget>,
        resource_roots: &mut std::collections::BTreeMap<usize, PythonResourceLocator>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        let boundary = if schema_position {
            is_resource_boundary(source, dialect, indices.is_empty(), ctx)?
        } else {
            false
        };
        let current_resource_indices = if boundary {
            ctx.charge_work(indices.len(), Utf16::default())?;
            Some(indices.clone())
        } else {
            None
        };
        let current_resource_root = if current_resource_indices.is_some() {
            source
        } else {
            resource_root
        };
        let current_resource_indices = current_resource_indices
            .as_deref()
            .unwrap_or(resource_root_indices);
        ctx.charge_work(current_resource_indices.len(), Utf16::default())?;
        let is_new_resource = schema_position && current_resource_indices != resource_root_indices;
        let current_uri_owned = if is_new_resource {
            if let Some(id) = source_id(source, dialect, ctx)? {
                let parent_len = resource_uri.map(|uri| uri.len()).unwrap_or(0);
                ctx.charge_work_u64(
                    id.len() as u64 * 4 + parent_len as u64 * 4 + 8,
                    Utf16::default(),
                )?;
                Some(if let Some(parent) = resource_uri {
                    parent.join(&id, ctx)?.unwrap_or(id)
                } else {
                    id
                })
            } else {
                None
            }
        } else {
            None
        };
        let current_uri = current_uri_owned.as_ref().or(resource_uri);
        let current_anchor = if is_new_resource {
            source_recursive_anchor(source, ctx)?
        } else {
            resource_recursive_anchor
        };
        if boundary {
            if let Some(uri) = current_uri {
                ctx.charge_work_u64(
                    uri.len() as u64
                        + current_resource_indices.len() as u64
                        + btree_index_lookup_work(resource_roots.len())
                        + 2,
                    Utf16::default(),
                )?;
                resource_roots.insert(
                    target as *const Value as usize,
                    PythonResourceLocator {
                        uri: uri.clone(),
                        resource,
                        root_indices: current_resource_indices.to_vec(),
                        recursive_anchor: current_anchor,
                    },
                );
            }
        }
        match (source, target) {
            (Py::Object(source_items), Value::Object(target_items))
                if source_items.len() == target_items.len() =>
            {
                for (_index, ((source_key, source_item), (_, target_item))) in
                    source_items.iter().zip(target_items).enumerate()
                {
                    ctx.charge_work_u64(
                        (source_key.len().min(14) as u64 + 1).saturating_mul(3),
                        Utf16::default(),
                    )?;
                    let is_reference =
                        ["$ref", "$dynamicRef", "$recursiveRef"]
                            .iter()
                            .any(|keyword| {
                                key_is(source_key, keyword)
                                    && active_keywords(dialect).contains(keyword)
                            });
                    if is_reference {
                        if let Py::String(reference) = source_item {
                            ctx.charge_work(reference.len(), Utf16::default())?;
                            if let Some((target_indices, failure)) = source_pointer(
                                current_resource_root,
                                reference,
                                dialect,
                                key_is(source_key, "$recursiveRef")
                                    && dialect == SchemaDialect::Draft2019_09,
                                ctx,
                            )? {
                                ctx.charge_work_u64(
                                    current_resource_indices.len() as u64
                                        + current_uri.map_or(0, |uri| uri.len() as u64)
                                        + btree_index_lookup_work(references.len())
                                        + 2,
                                    Utf16::default(),
                                )?;
                                references.insert(
                                    target_item as *const Value as usize,
                                    PythonReferenceTarget {
                                        resource,
                                        resource_root_indices: current_resource_indices.to_vec(),
                                        source_resource_uri: current_uri.cloned(),
                                        source_resource_recursive_anchor: current_anchor,
                                        indices: target_indices,
                                        failure,
                                    },
                                );
                            }
                        }
                    }
                }
                let schema_paths = if schema_position {
                    schema_child_paths(source, dialect, ctx)?
                } else {
                    Vec::new()
                };
                for child_path in &schema_paths {
                    ctx.charge_work_u64(
                        (child_path.len() as u64).saturating_mul(2),
                        Utf16::default(),
                    )?;
                    let source_child = at_indices(source, &child_path).ok_or_else(|| {
                        EngineError::new(
                            "SCHEMA_INVALID",
                            Utf16::default(),
                            "Python reference source projection changed its tree shape",
                        )
                    })?;
                    let target_child = at_value_indices(target, &child_path).ok_or_else(|| {
                        EngineError::new(
                            "SCHEMA_INVALID",
                            Utf16::default(),
                            "Python reference source projection changed its tree shape",
                        )
                    })?;
                    let old_len = indices.len();
                    ctx.charge_work(child_path.len(), Utf16::default())?;
                    indices.extend_from_slice(&child_path);
                    visit(
                        source_child,
                        target_child,
                        resource,
                        dialect,
                        indices,
                        true,
                        current_resource_root,
                        current_resource_indices,
                        current_uri,
                        current_anchor,
                        references,
                        resource_roots,
                        ctx,
                    )?;
                    indices.truncate(old_len);
                }
                ctx.charge_work_u64(
                    source_items.len() as u64 + schema_paths.len() as u64 + 1,
                    Utf16::default(),
                )?;
                let mut covered_members = vec![false; source_items.len()];
                for path in &schema_paths {
                    if let Some(index) = path.first() {
                        covered_members[*index] = true;
                    }
                }
                for child_path in immediate_child_paths(source, ctx)? {
                    ctx.charge_work(1, Utf16::default())?;
                    if child_path
                        .first()
                        .is_some_and(|index| covered_members[*index])
                    {
                        continue;
                    }
                    ctx.charge_work_u64(
                        (child_path.len() as u64).saturating_mul(2),
                        Utf16::default(),
                    )?;
                    let source_child = at_indices(source, &child_path).ok_or_else(|| {
                        EngineError::new(
                            "SCHEMA_INVALID",
                            Utf16::default(),
                            "Python reference source projection changed its tree shape",
                        )
                    })?;
                    let target_child = at_value_indices(target, &child_path).ok_or_else(|| {
                        EngineError::new(
                            "SCHEMA_INVALID",
                            Utf16::default(),
                            "Python reference source projection changed its tree shape",
                        )
                    })?;
                    let old_len = indices.len();
                    ctx.charge_work(child_path.len(), Utf16::default())?;
                    indices.extend_from_slice(&child_path);
                    visit(
                        source_child,
                        target_child,
                        resource,
                        dialect,
                        indices,
                        false,
                        current_resource_root,
                        current_resource_indices,
                        current_uri,
                        current_anchor,
                        references,
                        resource_roots,
                        ctx,
                    )?;
                    indices.truncate(old_len);
                }
            }
            (Py::Array(source_items), Value::Array(target_items))
                if source_items.len() == target_items.len() =>
            {
                for (index, (source_child, target_child)) in
                    source_items.iter().zip(target_items).enumerate()
                {
                    ctx.charge_work(1, Utf16::default())?;
                    indices.push(index);
                    visit(
                        source_child,
                        target_child,
                        resource,
                        dialect,
                        indices,
                        false,
                        resource_root,
                        resource_root_indices,
                        resource_uri,
                        resource_recursive_anchor,
                        references,
                        resource_roots,
                        ctx,
                    )?;
                    indices.pop();
                }
            }
            (Py::Null, Value::Null)
            | (Py::Bool(_), Value::Bool(_))
            | (Py::Integer(_), Value::Number(_))
            | (Py::Float(_), Value::Number(_))
            | (Py::String(_), Value::String(_)) => {}
            _ => {
                return Err(EngineError::new(
                    "SCHEMA_INVALID",
                    Utf16::default(),
                    "Python reference source projection changed its tree shape",
                ))
            }
        }
        Ok(())
    }

    fn at_value_indices<'a>(mut value: &'a Value, indices: &[usize]) -> Option<&'a Value> {
        for index in indices {
            value = match value {
                Value::Object(members) => &members.get(*index)?.1,
                Value::Array(items) => items.get(*index)?,
                _ => return None,
            };
        }
        Some(value)
    }

    fn immediate_child_paths(
        schema: &Py,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Vec<usize>>, EngineError> {
        let mut result = Vec::new();
        match schema {
            Py::Object(members) => {
                for (member_index, (_, value)) in members.iter().enumerate() {
                    if matches!(value, Py::Object(_) | Py::Array(_)) {
                        ctx.charge_work(2, Utf16::default())?;
                        result.push(vec![member_index]);
                    }
                }
            }
            Py::Array(items) => {
                for index in 0..items.len() {
                    ctx.charge_work(1, Utf16::default())?;
                    result.push(vec![index]);
                }
            }
            _ => {}
        }
        Ok(result)
    }

    fn schema_child_paths(
        schema: &Py,
        dialect: SchemaDialect,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Vec<usize>>, EngineError> {
        let Py::Object(members) = schema else {
            return Ok(Vec::new());
        };
        let mut result = Vec::new();
        for (member_index, (key, value)) in members.iter().enumerate() {
            ctx.charge_work_u64(
                (key.len().min(24) as u64 + 1).saturating_mul(28),
                Utf16::default(),
            )?;
            let keyword = [
                "items",
                "additionalItems",
                "contains",
                "contentSchema",
                "prefixItems",
                "properties",
                "patternProperties",
                "additionalProperties",
                "dependencies",
                "dependentSchemas",
                "propertyNames",
                "allOf",
                "anyOf",
                "oneOf",
                "not",
                "if",
                "then",
                "else",
                "extends",
                "type",
                "disallow",
                "definitions",
                "$defs",
                "unevaluatedItems",
                "unevaluatedProperties",
            ]
            .iter()
            .copied()
            .find(|candidate| key_is(key, candidate));
            let Some(keyword) = keyword else { continue };
            let recognized = match keyword {
                "definitions"
                | "properties"
                | "patternProperties"
                | "items"
                | "additionalItems"
                | "additionalProperties" => true,
                "$defs"
                | "dependentSchemas"
                | "contentSchema"
                | "unevaluatedItems"
                | "unevaluatedProperties" => matches!(
                    dialect,
                    SchemaDialect::Draft2019_09 | SchemaDialect::Draft2020_12
                ),
                "prefixItems" => dialect == SchemaDialect::Draft2020_12,
                "dependencies" => matches!(
                    dialect,
                    SchemaDialect::Draft3
                        | SchemaDialect::Draft4
                        | SchemaDialect::Draft6
                        | SchemaDialect::Draft7
                ),
                "extends" => dialect == SchemaDialect::Draft3,
                "allOf" | "anyOf" | "oneOf" | "not" => dialect != SchemaDialect::Draft3,
                "contains" | "propertyNames" => {
                    !matches!(dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                }
                "if" | "then" | "else" => matches!(
                    dialect,
                    SchemaDialect::Draft7
                        | SchemaDialect::Draft2019_09
                        | SchemaDialect::Draft2020_12
                ),
                _ => false,
            };
            if !recognized
                || (keyword == "additionalItems" && dialect == SchemaDialect::Draft2020_12)
            {
                continue;
            }
            if matches!(dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                && matches!(keyword, "additionalItems" | "additionalProperties")
                && !matches!(value, Py::Object(_))
            {
                continue;
            }
            match (keyword, value) {
                ("items", Py::Array(items))
                | ("allOf" | "anyOf" | "oneOf" | "extends" | "prefixItems", Py::Array(items)) => {
                    for item_index in 0..items.len() {
                        ctx.charge_work(3, Utf16::default())?;
                        result.push(vec![member_index, item_index]);
                    }
                }
                (
                    "properties" | "patternProperties" | "definitions" | "$defs"
                    | "dependentSchemas",
                    Py::Object(children),
                ) => {
                    for child_index in 0..children.len() {
                        ctx.charge_work(3, Utf16::default())?;
                        result.push(vec![member_index, child_index]);
                    }
                }
                ("dependencies", Py::Object(children)) => {
                    if children
                        .first()
                        .is_some_and(|(_, child)| matches!(child, Py::Object(_)))
                    {
                        for child_index in 0..children.len() {
                            ctx.charge_work(3, Utf16::default())?;
                            result.push(vec![member_index, child_index]);
                        }
                    }
                }
                ("type" | "disallow", Py::Object(_)) if dialect == SchemaDialect::Draft3 => {
                    ctx.charge_work(2, Utf16::default())?;
                    result.push(vec![member_index]);
                }
                ("type" | "disallow", Py::Array(items)) if dialect == SchemaDialect::Draft3 => {
                    for (child_index, child) in items.iter().enumerate() {
                        if matches!(child, Py::Object(_)) {
                            ctx.charge_work(3, Utf16::default())?;
                            result.push(vec![member_index, child_index]);
                        }
                    }
                }
                (
                    "additionalItems"
                    | "additionalProperties"
                    | "contains"
                    | "contentSchema"
                    | "not"
                    | "if"
                    | "then"
                    | "else"
                    | "propertyNames"
                    | "unevaluatedItems"
                    | "unevaluatedProperties",
                    _,
                )
                | ("items", _)
                | ("extends", _) => {
                    ctx.charge_work(2, Utf16::default())?;
                    result.push(vec![member_index]);
                }
                _ => {}
            }
        }
        Ok(result)
    }

    let mut indices = Vec::new();
    let supplied_uri = if let Some(uri) = supplied_resource_uri {
        Some(PythonResourceUri::from_points(uri.codepoints(), ctx)?)
    } else {
        None
    };
    let root_uri = source_id(source, dialect, ctx)?.or(supplied_uri);
    let root_anchor = source_recursive_anchor(source, ctx)?;
    visit(
        source,
        target,
        resource,
        dialect,
        &mut indices,
        true,
        source,
        &[],
        root_uri.as_ref(),
        root_anchor,
        references,
        resource_roots,
        ctx,
    )
}

fn object(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn rebase_reference_errors(
    errors: &mut [StructuralError],
    reference_root: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for error in errors {
        if error
            .python_error
            .as_ref()
            .is_some_and(|metadata| metadata.validator.is_none())
        {
            continue;
        }
        if let Some(relative) = error
            .schema_path
            .units()
            .strip_prefix(reference_root.units())
        {
            ctx.charge_work_u64(
                (error.schema_path.len() as u64).saturating_add(1),
                Utf16::default(),
            )?;
            error.schema_path = Utf16::new(relative.to_vec());
        }
    }
    Ok(())
}
fn prefix_reference_errors(
    errors: &mut [StructuralError],
    reference_keyword_path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for error in errors {
        if error
            .python_error
            .as_ref()
            .is_some_and(|metadata| metadata.validator.is_none())
        {
            continue;
        }
        let relative = error
            .schema_path
            .units()
            .strip_prefix(&[b'#' as u16])
            .unwrap_or(error.schema_path.units());
        ctx.charge_work_u64(
            (reference_keyword_path.len() as u64)
                .saturating_add(relative.len() as u64)
                .saturating_add(1),
            Utf16::default(),
        )?;
        let mut path = reference_keyword_path.units().to_vec();
        path.extend_from_slice(relative);
        error.schema_path = Utf16::new(path);
    }
    Ok(())
}
fn adjust_direct_false_schema_errors(
    errors: &mut [StructuralError],
    display_instance_path: &Utf16,
    physical_instance_path: &Utf16,
    display_schema_path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for error in errors {
        if !error
            .python_error
            .as_ref()
            .is_some_and(|metadata| metadata.validator.is_none())
        {
            continue;
        }
        ctx.charge_work_u64(
            (display_instance_path.len() as u64)
                .saturating_add(physical_instance_path.len() as u64)
                .saturating_add(display_schema_path.len() as u64),
            Utf16::default(),
        )?;
        error.instance_path = display_instance_path.clone();
        error.python_physical_instance_path = Some(physical_instance_path.clone());
        error.schema_path = display_schema_path.clone();
    }
    Ok(())
}
fn push_ctx_precharged(
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    kw: &str,
    params: Value,
    message: Utf16,
) {
    out.push(StructuralError {
        instance_path: ip.clone(),
        python_source_path: false,
        schema_path: sp.clone(),
        keyword: kw.into(),
        params,
        message,
        compiler_property_name: None,
        python_params: None,
        python_error: None,
        python_physical_instance_path: None,
        python_instance_override: None,
    });
}

fn push_ctx_copy_value(
    ctx: &mut Context<'_>,
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    kw: &str,
    param_key: &str,
    source: &Value,
    message: &str,
) -> Result<(), EngineError> {
    let fixed = (ip.len() as u64)
        .saturating_add(sp.len() as u64)
        .saturating_add(kw.len() as u64)
        .saturating_add(message.encode_utf16().count() as u64)
        .saturating_add(2)
        .saturating_add(param_key.encode_utf16().count() as u64)
        .saturating_add(1);
    ctx.charge_work_u64(fixed, Utf16::default())?;
    meter_value_copy(source, ctx)?;
    let params = object(vec![(param_key, source.clone())]);
    push_ctx_precharged(out, ip, sp, kw, params, Utf16::from(message));
    Ok(())
}

fn push_required_ctx(
    ctx: &mut Context<'_>,
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    missing_property: &Utf16,
    message_name: &Utf16,
) -> Result<(), EngineError> {
    const PREFIX: &str = "must have required property '";
    let prefix_len = PREFIX.encode_utf16().count();
    let fixed = (ip.len() as u64)
        .saturating_add(sp.len() as u64)
        .saturating_add("required".len() as u64)
        .saturating_add(prefix_len as u64)
        .saturating_add(message_name.len() as u64)
        .saturating_add(1)
        .saturating_add(2)
        .saturating_add("missingProperty".len() as u64)
        .saturating_add(1);
    ctx.charge_work_u64(fixed, Utf16::default())?;
    ctx.charge_work(missing_property.len(), Utf16::default())?;
    let mut message = Vec::with_capacity(
        prefix_len
            .saturating_add(message_name.len())
            .saturating_add(1),
    );
    message.extend(PREFIX.encode_utf16());
    message.extend(message_name.units());
    message.push(0x27);
    let params = object(vec![(
        "missingProperty",
        Value::String(missing_property.clone()),
    )]);
    push_ctx_precharged(out, ip, sp, "required", params, Utf16::new(message));
    Ok(())
}

fn push_ctx_pattern_value(
    ctx: &mut Context<'_>,
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    source: &Value,
    pattern: &Utf16,
) -> Result<(), EngineError> {
    const PREFIX: &str = "must match pattern \"";
    let prefix_len = PREFIX.encode_utf16().count();
    let fixed = (ip.len() as u64)
        .saturating_add(sp.len() as u64)
        .saturating_add("pattern".len() as u64)
        .saturating_add(prefix_len as u64)
        .saturating_add(pattern.len() as u64)
        .saturating_add(1)
        .saturating_add(2)
        .saturating_add("pattern".len() as u64)
        .saturating_add(1);
    ctx.charge_work_u64(fixed, Utf16::default())?;
    meter_value_copy(source, ctx)?;
    let mut message =
        Vec::with_capacity(prefix_len.saturating_add(pattern.len()).saturating_add(1));
    message.extend(PREFIX.encode_utf16());
    message.extend(pattern.units());
    message.push(0x22);
    let params = object(vec![("pattern", source.clone())]);
    push_ctx_precharged(out, ip, sp, "pattern", params, Utf16::new(message));
    Ok(())
}

fn push_ctx(
    ctx: &mut Context<'_>,
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    kw: &str,
    params: Value,
    msg: &str,
) -> Result<(), EngineError> {
    let path_work = (ip.len() as u64).saturating_add(sp.len() as u64);
    let text_work = (kw.len() as u64).saturating_add(msg.len() as u64);
    ctx.charge_work_u64(
        path_work.saturating_add(text_work).saturating_add(1),
        Utf16::default(),
    )?;
    meter_value_copy(&params, ctx)?;
    out.push(StructuralError {
        instance_path: ip.clone(),
        python_source_path: false,
        schema_path: sp.clone(),
        keyword: kw.into(),
        params,
        message: Utf16::from(msg),
        compiler_property_name: None,
        python_params: None,
        python_error: None,
        python_physical_instance_path: None,
        python_instance_override: None,
    });
    Ok(())
}
fn precharge_string_diagnostic(
    ctx: &mut Context<'_>,
    ip: &Utf16,
    sp: &Utf16,
    keyword: &str,
    message_units: usize,
    params: &[(&str, &Utf16)],
) -> Result<(), EngineError> {
    let mut work = (ip.len() as u64)
        .saturating_add(sp.len() as u64)
        .saturating_add(keyword.encode_utf16().count() as u64)
        .saturating_add(message_units as u64)
        .saturating_add(1); // params object node
    for (key, value) in params {
        work = work
            .saturating_add(key.encode_utf16().count() as u64)
            .saturating_add(1) // string value node
            .saturating_add(value.len() as u64);
    }
    ctx.charge_work_u64(work, Utf16::default())
}

fn push_units_ctx_after_precharge(
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    kw: &str,
    params: Value,
    message: Utf16,
) {
    out.push(StructuralError {
        instance_path: ip.clone(),
        python_source_path: false,
        schema_path: sp.clone(),
        keyword: kw.into(),
        params,
        message,
        compiler_property_name: None,
        python_params: None,
        python_error: None,
        python_physical_instance_path: None,
        python_instance_override: None,
    });
}

fn meter_value_copy(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::String(text) => ctx.charge_work(text.len(), Utf16::default())?,
        Value::Array(items) => {
            for item in items {
                meter_value_copy(item, ctx)?;
            }
        }
        Value::Object(items) => {
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                meter_value_copy(item, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn bound_error_ctx(
    ctx: &mut Context<'_>,
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    kw: &str,
    rule: &Value,
    n: usize,
    unit: &str,
) -> Result<(), EngineError> {
    let Some(bound) = as_usize(rule) else {
        return Ok(());
    };
    let min = kw.starts_with("min");
    if (min && n < bound) || (!min && n > bound) {
        ctx.charge_work_u64(
            (ip.len() as u64)
                .saturating_add(sp.len() as u64)
                .saturating_add(kw.len() as u64)
                .saturating_add(unit.len() as u64)
                .saturating_add(64),
            Utf16::default(),
        )?;
        let msg = if min {
            format!("must NOT have fewer than {bound} {unit}")
        } else {
            format!("must NOT have more than {bound} {unit}")
        };
        push_ctx(
            ctx,
            out,
            ip,
            sp,
            kw,
            object(vec![("limit", Value::Number(bound as f64))]),
            &msg,
        )?;
    }
    Ok(())
}
fn unescape_pointer(v: &str) -> Vec<u16> {
    v.replace("~1", "/")
        .replace("~0", "~")
        .encode_utf16()
        .collect()
}

/// Draft 3's legacy `Resource.pointer` enters subresources only through these
/// keyword families. Its boolean-reference TypeError occurs while descending
/// such a boundary; a direct reference to a root boolean remains an ordinary
/// false-schema validation error.
fn draft3_reference_crosses_subresource(
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let units = path.units();
    ctx.charge_work_u64((units.len() as u64).saturating_mul(1 + 6), Utf16::default())?;
    let fragment = units
        .iter()
        .position(|unit| *unit == b'#' as u16)
        .map(|index| &units[index + 1..])
        .unwrap_or(units);
    const SUBRESOURCES: &[&str] = &[
        "additionalItems",
        "additionalProperties",
        "extends",
        "definitions",
        "patternProperties",
        "properties",
    ];
    for raw in fragment.split(|unit| *unit == b'/' as u16) {
        let mut decoded = Vec::with_capacity(raw.len());
        if raw.starts_with(&[b'~' as u16, b'p' as u16]) && (raw.len() - 2) % 6 == 0 {
            let mut valid = true;
            for chunk in raw[2..].chunks_exact(6) {
                let mut point = 0u32;
                for unit in chunk {
                    let Some(digit) = (match unit {
                        0x30..=0x39 => Some((unit - 0x30) as u32),
                        0x61..=0x66 => Some((unit - 0x61 + 10) as u32),
                        _ => None,
                    }) else {
                        valid = false;
                        break;
                    };
                    point = (point << 4) | digit;
                }
                if !valid || point > 0x10ffff {
                    valid = false;
                    break;
                }
                if point <= 0xffff {
                    decoded.push(point as u16);
                } else {
                    // No Draft 3 subresource keyword contains a supplementary
                    // code point, so a sentinel is sufficient for comparison.
                    decoded.push(0xffff);
                }
            }
            if !valid {
                continue;
            }
        } else {
            let mut at = 0;
            while at < raw.len() {
                if raw[at] == b'~' as u16 {
                    match raw.get(at + 1) {
                        Some(0x30) => decoded.push(b'~' as u16),
                        Some(0x31) => decoded.push(b'/' as u16),
                        _ => decoded.push(raw[at]),
                    }
                    at += if matches!(raw.get(at + 1), Some(0x30 | 0x31)) {
                        2
                    } else {
                        1
                    };
                } else {
                    decoded.push(raw[at]);
                    at += 1;
                }
            }
        }
        if SUBRESOURCES
            .iter()
            .any(|key| key.encode_utf16().eq(decoded.iter().copied()))
        {
            return Ok(true);
        }
    }
    Ok(false)
}
fn append_marked_python_path(path: &Utf16, text: &crate::python_value::PyText) -> Utf16 {
    let mut units = path.units().to_vec();
    if units.last() != Some(&(b'/' as u16)) {
        units.push(b'/' as u16);
    }
    // `~p` is not a valid JSON Pointer escape, so it cannot collide with an
    // ordinary key (whose tilde is emitted as `~0`). Fixed-width hex retains
    // every Python code point, including explicit surrogate pairs.
    units.extend([b'~' as u16, b'p' as u16]);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for point in text.codepoints() {
        for shift in [20, 16, 12, 8, 4, 0] {
            units.push(HEX[((point >> shift) & 0xf) as usize] as u16);
        }
    }
    Utf16::new(units)
}

fn marked_python_path_work(path: &Utf16, text: &crate::python_value::PyText) -> u64 {
    (path.len() as u64)
        .saturating_add(u64::from(path.units().last() != Some(&(b'/' as u16))))
        .saturating_add(2) // marker `~p`
        .saturating_add((text.len() as u64).saturating_mul(6)) // fixed-width hex code points
}
/// Conservative comparison bound for B-tree lookup. String-key maps compare
/// up to `key_units` per visited entry; pointer-key maps use the node bound.
fn btree_index_lookup_work(entries: usize) -> u64 {
    if entries == 0 {
        return 1;
    }
    let mut levels = 0u64;
    let mut capacity = entries as u64;
    while capacity > 1 {
        capacity = capacity.div_ceil(2);
        levels += 1;
    }
    11u64
        .saturating_mul(levels.saturating_add(1))
        .min(entries as u64)
        .saturating_add(1)
}

fn btree_lookup_work(entries: usize, key_units: usize) -> u64 {
    btree_index_lookup_work(entries).saturating_mul(key_units as u64)
}

fn append_schema_path(p: &Utf16, s: &str) -> Utf16 {
    let mut u = p.units().to_vec();
    if u.last() != Some(&0x2f) {
        u.push(0x2f);
    }
    u.extend(s.encode_utf16());
    Utf16::new(u)
}
fn append_schema_pointer(p: &Utf16, segment: &Utf16) -> Utf16 {
    let mut units = p.units().to_vec();
    if units.last() != Some(&0x2f) {
        units.push(0x2f);
    }
    for unit in segment.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            value => units.push(*value),
        }
    }
    Utf16::new(units)
}
fn append_instance_path(p: &Utf16, s: &Utf16) -> Utf16 {
    let mut u = p.units().to_vec();
    u.push(0x2f);
    for c in s.units() {
        match c {
            0x7e => u.extend([0x7e, 0x30]),
            0x2f => u.extend([0x7e, 0x31]),
            x => u.push(*x),
        }
    }
    Utf16::new(u)
}

#[cfg(test)]
mod python_resource_work_tests {
    use super::*;
    use crate::context::WorkMeter;

    #[test]
    fn native_uri_operation_families_match_frozen_cpython_profiles() {
        let receipt: serde_json::Value = serde_json::from_str(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-uri-operations-predecessor.json")).unwrap();
        let cases = receipt["uriOperations"].as_array().unwrap();
        assert_eq!(cases.len(), 140);
        let points = |value: &serde_json::Value| {
            value
                .as_array()
                .unwrap()
                .iter()
                .map(|point| point.as_u64().unwrap() as u32)
                .collect::<Vec<_>>()
        };
        for (index, case) in cases.iter().enumerate() {
            let base = PythonResourceUri(points(&case["base"]));
            let reference = PythonResourceUri(points(&case["reference"]));
            let result = base
                .join(&reference, &mut Context::ordinary())
                .unwrap()
                .unwrap();
            assert_eq!(
                result.points(),
                points(&case["result"]),
                "native URI operation {index}"
            );
        }
    }

    #[test]
    fn native_uri_common_prefix_work_is_admitted_before_comparison() {
        let mut left = vec![0xd800; 50_000];
        left.push(0x10000);
        let mut right = left.clone();
        *right.last_mut().unwrap() = 0xd800;
        let left = PythonResourceUri(left);
        let right = PythonResourceUri(right);
        let mut observed = 0;
        let mut meter = |work: usize| {
            observed = work;
            Err(EngineError::new(
                "DENIED_URI_COMPARE",
                Utf16::default(),
                "denied",
            ))
        };
        let mut meter: &mut WorkMeter<'_> = &mut meter;
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert_eq!(
            left.same(&right, &mut ctx).unwrap_err().code,
            "DENIED_URI_COMPARE"
        );
        assert_eq!(observed, 50_002);
        assert!(!left.same(&right, &mut Context::ordinary()).unwrap());
    }

    #[test]
    fn native_uri_join_admits_all_input_work_before_owned_buffers() {
        let base = PythonResourceUri(
            "https://example.test/root.json"
                .chars()
                .map(u32::from)
                .collect(),
        );
        let relative = PythonResourceUri(vec![0xd800; 50_000]);
        let mut observed = 0;
        let mut meter = |work: usize| {
            observed = work;
            Err(EngineError::new(
                "DENIED_URI_JOIN",
                Utf16::default(),
                "denied",
            ))
        };
        let mut meter: &mut WorkMeter<'_> = &mut meter;
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert_eq!(
            base.join(&relative, &mut ctx).unwrap_err().code,
            "DENIED_URI_JOIN"
        );
        assert!(observed >= (base.len() + relative.len()) * 10);
    }
}


#[cfg(test)]
mod static_reference_resolution_tests {
    use super::*;

    fn value(source: &str) -> Value {
        crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn compile(schema: &str, resources: Vec<(&str, &str)>) -> Result<CompiledSchema, EngineError> {
        let entries = resources
            .into_iter()
            .map(|(uri, schema)| (Utf16::from(uri), value(schema)))
            .collect();
        CompiledSchema::compile_consumer(
            &value(schema),
            &SchemaResources { entries },
            false,
            &mut Context::ordinary(),
        )
    }

    #[test]
    fn nested_ids_set_reference_scope_and_annotations_do_not() {
        let result = compile(
            r#"{"$id":"https://example.test/root/","$defs":{"nested":{"$id":"sub/","$ref":"target.json"}},"examples":[{"$id":"https://example.test/fake/","$ref":"missing.json"}]}"#,
            vec![("https://example.test/root/sub/target.json", "true")],
        );
        assert!(result.is_ok(), "{result:?}");

        let missing = compile(
            r#"{"$id":"https://example.test/root/","$defs":{"nested":{"$id":"sub/","$ref":"missing.json"}}}"#,
            vec![],
        );
        assert_eq!(missing.unwrap_err().code, "SCHEMA_REF_UNRESOLVED");
    }

    #[test]
    fn retrieved_relative_root_id_is_resolved_once_and_keeps_its_directory() {
        let result = compile(
            r#"{"$id":"https://example.test/main.json","$ref":"https://example.test/root.json"}"#,
            vec![
                (
                    "https://example.test/root.json",
                    r#"{"$id":"sub/","$ref":"target.json"}"#,
                ),
                ("https://example.test/sub/target.json", "true"),
            ],
        );
        assert!(result.is_ok(), "{result:?}");
    }

    #[test]
    fn legacy_absolute_root_and_nested_ids_are_not_joined_as_relative_paths() {
        let root = value(
            r##"{"$schema":"http://json-schema.org/draft-07/schema#","$id":"https://example.test/root.json","definitions":{"target":{"type":"integer"}},"$ref":"#/definitions/target"}"##,
        );
        let compiled = CompiledSchema::compile_consumer(
            &root,
            &SchemaResources { entries: vec![] },
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(compiled
            .validate(&value("1"), &mut Context::ordinary())
            .unwrap()
            .is_empty());

        let nested = value(
            r##"{"$schema":"http://json-schema.org/draft-07/schema#","$id":"https://example.test/root.json","properties":{"x":{"$id":"https://example.test/child.json","definitions":{"target":{"type":"integer"}},"$ref":"#/definitions/target"}}}"##,
        );
        assert!(CompiledSchema::compile_consumer(
            &nested,
            &SchemaResources { entries: vec![] },
            false,
            &mut Context::ordinary(),
        )
        .is_ok());
    }

    #[test]
    fn reference_resolution_handles_directory_bases_and_urn_local_pointers() {
        assert_eq!(
            resolve_draft2020_uri("https://example.test/folder/", "child.json").as_deref(),
            Some("https://example.test/folder/child.json")
        );
        assert_eq!(
            resolve_draft2020_uri("https://example.test/a/b/root.json", "../child.json").as_deref(),
            Some("https://example.test/a/child.json")
        );
        assert!(compile(
            r##"{"$id":"urn:example:root","$defs":{"target":{"type":"string"}},"$ref":"#/$defs/target"}"##,
            vec![],
        )
        .is_ok());
    }

    #[test]
    fn then_else_are_schema_positions_and_cycles_are_bounded() {
        let schema = r#"{"$id":"https://example.test/root","if":{},"then":{"$ref":"https://example.test/then"},"else":{"$ref":"https://example.test/else"}}"#;
        assert!(compile(
            schema,
            vec![
                ("https://example.test/then", "true"),
                ("https://example.test/else", "false"),
            ],
        )
        .is_ok());
        let missing_else = compile(
            schema,
            vec![("https://example.test/then", "true")],
        );
        assert_eq!(missing_else.unwrap_err().code, "SCHEMA_REF_UNRESOLVED");
        assert!(compile(r##"{"$id":"https://example.test/cycle","$ref":"#"}"##, vec![]).is_ok());
    }

    #[test]
    fn conflicting_resource_uris_remain_explicit_errors() {
        let error = compile(
            r#"{"$id":"https://example.test/root","$ref":"https://example.test/shared"}"#,
            vec![
                ("https://example.test/shared", "true"),
                ("https://example.test/shared", "false"),
            ],
        )
        .unwrap_err();
        assert_eq!(error.code, "SCHEMA_ID_CONFLICT");
    }

    #[test]
    fn static_and_dynamic_refs_resolve_anchors_in_schema_positions() {
        let schema = r##"{"$id":"https://example.test/root","$defs":{"target":{"$anchor":"plain","type":"integer"}},"$ref":"#plain"}"##;
        let compiled = compile(schema, vec![]).unwrap();
        assert!(compiled
            .validate(&value("1"), &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(!compiled
            .validate(&value("\"no\""), &mut Context::ordinary())
            .unwrap()
            .is_empty());

        let dynamic_fallback = r##"{"$id":"https://example.test/root","$defs":{"target":{"$anchor":"plain","type":"integer"}},"$dynamicRef":"#plain"}"##;
        assert!(compile(dynamic_fallback, vec![]).is_ok());
    }
}
