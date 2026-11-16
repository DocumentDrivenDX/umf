// SPDX-License-Identifier: MIT OR Apache-2.0
//! Offline workflow interchange and deterministic preparation for a consumer.

mod evidence;
mod predicates;
mod routing;
mod run_state;
mod transitions;

pub use evidence::{
    Evidence, EvidenceKind, EvidenceOutcome, EvidenceStatus, EVIDENCE_PROFILE, EVIDENCE_SCHEMA,
};
pub use predicates::{GuardMatch, Record, Scalar};
pub use run_state::SetDecision;
pub use transitions::{
    Admission, Candidate, EffectAwait, EffectDecision, EffectInvocation, EffectObservation,
    EffectResolution, Enrollment, Event, History, Intervention, InterventionKind, RegisterWait,
    Replay, RetryIdentity, SuppressionWrite, WaitDecision, WaitRegistration,
};

use std::{error::Error, fmt, sync::OnceLock};

use serde_json::Value as Json;
use sha2::{Digest, Sha256};

use crate::{
    exact_duration::{DurationUnit, ExactDuration},
    native_json::{NativeJsonNode, NativeJsonTree},
    rfc3339_exact_instant::{parse_rfc3339_exact_instant, Rfc3339ExactInstant},
    schema::{CompiledSchema, SchemaResources},
    serialization::{read_json_value, Format},
    Context, Utf16, Value,
};

pub const PROFILE: &str = "umf.workflow/1";
pub const CORRELATED_PROFILE: &str = "umf.workflow.correlated/1";
const SCHEMA: &str = include_str!("../../../../spec/extensions/workflow/workflow-1.schema.json");

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Finding {
    pub code: &'static str,
    pub path: String,
    pub message: String,
}

#[derive(Clone, Debug)]
pub struct WorkflowError(pub Vec<Finding>);

impl fmt::Display for WorkflowError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (index, finding) in self.0.iter().enumerate() {
            if index != 0 {
                writeln!(f)?;
            }
            write!(f, "{} {}: {}", finding.code, finding.path, finding.message)?;
        }
        Ok(())
    }
}
impl Error for WorkflowError {}

pub struct Inspection {
    source: Vec<u8>,
    tree: NativeJsonTree,
    unchecked: Vec<Finding>,
}

impl Inspection {
    pub fn source(&self) -> &[u8] {
        &self.source
    }

    pub fn tree(&self) -> &NativeJsonTree {
        &self.tree
    }

    pub fn unchecked(&self) -> &[Finding] {
        &self.unchecked
    }
}

/// Compiled data is held privately so unchecked interchange values cannot be
/// used in portable transition operations.
pub struct CompiledWorkflow {
    source: Vec<u8>,
    definition: Json,
    digest: String,
    lowered: Vec<u8>,
    lowered_digest: String,
}

impl CompiledWorkflow {
    pub fn source(&self) -> &[u8] {
        &self.source
    }

    pub fn lowered_source(&self) -> &[u8] {
        &self.lowered
    }

    pub fn lowered_digest(&self) -> &str {
        &self.lowered_digest
    }

    pub fn digest(&self) -> &str {
        &self.digest
    }

    pub fn profile(&self) -> &str {
        text(&self.definition["profile"])
    }

    pub fn id(&self) -> &str {
        text(&self.definition["id"])
    }

    pub fn version(&self) -> &str {
        text(&self.definition["version"])
    }

    pub fn entry(&self) -> &str {
        text(&self.definition["entry"])
    }
}

/// Executable workflow profiles supported by the typed Rust entry point.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WorkflowProfile {
    Base,
    Correlated,
}

impl WorkflowProfile {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Base => PROFILE,
            Self::Correlated => CORRELATED_PROFILE,
        }
    }
}

/// Inspect exact source bytes with the standard resource limits.
pub fn inspect_source(bytes: &[u8]) -> Result<Inspection, WorkflowError> {
    inspect(bytes, &mut Context::ordinary())
}

/// Compile exact source bytes with the standard resource limits.
pub fn compile_source(
    bytes: &[u8],
    profile: WorkflowProfile,
) -> Result<CompiledWorkflow, WorkflowError> {
    compile(bytes, profile.as_str(), &mut Context::ordinary())
}

pub fn inspect(bytes: &[u8], ctx: &mut Context<'_>) -> Result<Inspection, WorkflowError> {
    let (tree, _, unchecked) = admit(bytes, ctx)?;
    Ok(Inspection {
        source: bytes.to_vec(),
        tree,
        unchecked,
    })
}

/// Compile the exact original bytes against the caller-selected profile.
pub fn compile(
    bytes: &[u8],
    profile: &str,
    ctx: &mut Context<'_>,
) -> Result<CompiledWorkflow, WorkflowError> {
    if !matches!(profile, PROFILE | CORRELATED_PROFILE) {
        return Err(fail("PROFILE", "/profile", "unsupported compile profile"));
    }
    let (_, definition, unchecked) = admit(bytes, ctx)?;
    if definition["profile"] != profile {
        return Err(fail(
            "PROFILE",
            "/profile",
            "source profile differs from selected compile profile",
        ));
    }
    if !unchecked.is_empty() {
        return Err(WorkflowError(unchecked));
    }
    let mut lowered = definition.clone();
    lowered
        .as_object_mut()
        .expect("validated definition object")
        .remove("edges");
    let lowered = serde_json::to_vec(&lower(&lowered)?).expect("workflow lowering produces JSON");
    Ok(CompiledWorkflow {
        lowered_digest: digest(&lowered),
        lowered,
        source: bytes.to_vec(),
        definition,
        digest: digest(bytes),
    })
}

fn admit(
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<(NativeJsonTree, Json, Vec<Finding>), WorkflowError> {
    if bytes.len() > ctx.limits().max_text_units {
        return Err(fail("SOURCE", "", "definition exceeds source byte limit"));
    }
    let source = std::str::from_utf8(bytes)
        .map_err(|_| fail("SOURCE", "", "definition must be UTF-8 JSON"))?;
    let tree = NativeJsonTree::parse_json(&source.encode_utf16().collect::<Vec<_>>(), ctx)
        .map_err(|error| fail("SOURCE", "", error.to_string()))?;
    let definition = validation_view(tree.root())?;
    static VALIDATOR: OnceLock<CompiledSchema> = OnceLock::new();
    let validator = VALIDATOR.get_or_init(|| {
        let mut context = Context::ordinary();
        let schema = read_json_value(
            &SCHEMA.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut context,
        )
        .expect("bundled workflow schema JSON");
        CompiledSchema::compile(&schema, &SchemaResources::default(), &mut context)
            .expect("bundled workflow schema")
    });
    let mut unchecked = Vec::new();
    let mut invalid = Vec::new();
    let errors = validator
        .validate_codegen_errors(&schema_view(&definition), ctx)
        .map_err(|error| fail("SHAPE", "", error.to_string()))?;
    for error in errors {
        let path = error.instance_path.to_utf8().expect("UTF-8 workflow path");
        if error.keyword == "additionalProperties" {
            if let Value::Object(params) = &error.params {
                if let Some((_, Value::String(member))) = params
                    .iter()
                    .find(|(key, _)| key == &Utf16::from("additionalProperty"))
                {
                    unchecked.push(finding(
                        "UNKNOWN_MEMBER",
                        member_path(&path, &unicode(member)?),
                        "member is outside this profile",
                    ));
                    continue;
                }
            }
        }
        // The constraint from the selected branch is already reported. The
        // schema uses if only to select a shape and has no else constraints.
        if error.keyword != "if" {
            invalid.push(finding(
                "SHAPE",
                path,
                error.message.to_utf8().expect("UTF-8 shape finding"),
            ));
        }
    }
    if !invalid.is_empty() {
        return Err(WorkflowError(invalid));
    }
    routing::validate(&definition)?;
    Ok((tree, definition, unchecked))
}

/// No recognized workflow field admits a JSON number. The validation view only
/// carries its type. The independent native tree retains the complete lexeme.
fn validation_view(node: &NativeJsonNode) -> Result<Json, WorkflowError> {
    match node {
        NativeJsonNode::Null => Ok(Json::Null),
        NativeJsonNode::Boolean(value) => Ok(Json::Bool(*value)),
        NativeJsonNode::Number(_) => Ok(Json::from(0)),
        NativeJsonNode::String(value) => Ok(Json::String(unicode(value)?)),
        NativeJsonNode::Array(items) => items.iter().map(validation_view).collect(),
        NativeJsonNode::Object(members) => members
            .iter()
            .map(|(key, value)| Ok((unicode(key)?, validation_view(value)?)))
            .collect::<Result<serde_json::Map<_, _>, _>>()
            .map(Json::Object),
    }
}

fn schema_view(value: &Json) -> Value {
    match value {
        Json::Null => Value::Null,
        Json::Bool(value) => Value::Bool(*value),
        Json::Number(_) => Value::Number(0.0),
        Json::String(value) => Value::string_utf8(value),
        Json::Array(items) => Value::Array(items.iter().map(schema_view).collect()),
        Json::Object(members) => Value::Object(
            members
                .iter()
                .map(|(key, value)| (Utf16::from_utf8(key), schema_view(value)))
                .collect(),
        ),
    }
}

fn unicode(value: &Utf16) -> Result<String, WorkflowError> {
    value
        .to_utf8()
        .map_err(|_| fail("SOURCE", "", "unpaired surrogate"))
}

fn text(value: &Json) -> &str {
    value.as_str().expect("validated workflow text")
}

fn items(value: &Json) -> &[Json] {
    value.as_array().expect("validated workflow array")
}

fn find<'a>(values: &'a Json, id: &str) -> Option<&'a Json> {
    items(values).iter().find(|value| text(&value["id"]) == id)
}

fn duration(value: &Json, path: &str) -> Result<ExactDuration, WorkflowError> {
    let result = if value["kind"] == "elapsed" {
        let token = text(&value["text"]);
        let unsigned = token.strip_prefix('-').unwrap_or(token);
        if unsigned.starts_with('P')
            && !unsigned.starts_with("PT")
            && unsigned.ends_with(['D', 'W'])
        {
            return Err(fail("DURATION", path, "lower day and week spellings to count with fixed-day or fixed-week, or use PT hours"));
        }
        ExactDuration::parse(token)
    } else {
        let unit = match text(&value["unit"]) {
            "ns" => DurationUnit::Nanosecond,
            "us" => DurationUnit::Microsecond,
            "ms" => DurationUnit::Millisecond,
            "s" => DurationUnit::Second,
            "min" => DurationUnit::Minute,
            "h" => DurationUnit::Hour,
            "fixed-day" => DurationUnit::FixedDay,
            "fixed-week" => DurationUnit::FixedWeek,
            _ => unreachable!("validated workflow unit"),
        };
        ExactDuration::from_count(text(&value["count"]), unit)
    };
    result.map_err(|error| fail("DURATION", path, error.to_string()))
}

fn nonnegative_duration(value: &Json, path: &str) -> Result<ExactDuration, WorkflowError> {
    let parsed = duration(value, path)?;
    if parsed.nanoseconds() < 0 {
        return Err(fail("DURATION", path, "elapsed span must be nonnegative"));
    }
    Ok(parsed)
}

fn instant(token: &str, path: &str) -> Result<Rfc3339ExactInstant, WorkflowError> {
    parse_rfc3339_exact_instant(&crate::Value::string_utf8(token))
        .map_err(|error| fail("INSTANT", path, error.to_string()))
}

fn lower(value: &Json) -> Result<Json, WorkflowError> {
    match value {
        Json::Array(items) => items.iter().map(lower).collect(),
        Json::Object(members) => {
            if matches!(value["kind"].as_str(), Some("elapsed" | "count")) {
                return Ok(serde_json::json!({
                    "count": duration(value, "")?.canonical_nanoseconds(), "kind": "count", "unit": "ns"
                }));
            }
            let sorted: std::collections::BTreeMap<_, _> = members.iter().collect();
            sorted
                .into_iter()
                .map(|(key, value)| Ok((key.clone(), lower(value)?)))
                .collect::<Result<serde_json::Map<_, _>, _>>()
                .map(Json::Object)
        }
        _ => Ok(value.clone()),
    }
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn member_path(path: &str, member: &str) -> String {
    format!("{path}/{}", member.replace('~', "~0").replace('/', "~1"))
}

fn finding(code: &'static str, path: impl Into<String>, message: impl Into<String>) -> Finding {
    Finding {
        code,
        path: path.into(),
        message: message.into(),
    }
}

fn fail(code: &'static str, path: impl Into<String>, message: impl Into<String>) -> WorkflowError {
    WorkflowError(vec![finding(code, path, message)])
}
