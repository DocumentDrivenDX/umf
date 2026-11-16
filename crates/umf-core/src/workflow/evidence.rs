// SPDX-License-Identifier: MIT OR Apache-2.0
use super::{fail, CompiledWorkflow, WorkflowError};

pub const EVIDENCE_PROFILE: &str = "umf.workflow.evidence/1";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvidenceKind {
    StaticCheck,
    BoundedModelCheck,
    Differential,
    MutationControl,
    RuntimeRun,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EvidenceOutcome {
    Passed,
    Failed { counterexample: String },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Evidence {
    pub property: String,
    pub kind: EvidenceKind,
    pub tool: String,
    pub tool_version: String,
    pub definition_digest: String,
    pub profile: String,
    pub bounds: String,
    pub assumptions: Vec<String>,
    pub outcome: EvidenceOutcome,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvidenceStatus<'a> {
    Current(&'a EvidenceOutcome),
    Stale(&'a EvidenceOutcome),
}

impl Evidence {
    pub fn assess(&self, workflow: &CompiledWorkflow) -> Result<EvidenceStatus<'_>, WorkflowError> {
        for (path, value) in [
            ("/property", &self.property),
            ("/tool", &self.tool),
            ("/toolVersion", &self.tool_version),
            ("/profile", &self.profile),
            ("/bounds", &self.bounds),
        ] {
            if value.trim().is_empty() {
                return Err(fail("EVIDENCE", path, "scope metadata must be explicit"));
            }
        }
        let is_lower_hex = |byte: u8| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte);
        if self.definition_digest.len() != 64 || !self.definition_digest.bytes().all(is_lower_hex) {
            return Err(fail(
                "EVIDENCE",
                "/definitionDigest",
                "expected lowercase SHA-256",
            ));
        }
        if let EvidenceOutcome::Failed { counterexample } = &self.outcome {
            if counterexample.trim().is_empty() {
                return Err(fail(
                    "EVIDENCE",
                    "/outcome/counterexample",
                    "failed evidence requires a finding",
                ));
            }
        }
        if self.definition_digest != workflow.lowered_digest() || self.profile != workflow.profile()
        {
            return Ok(EvidenceStatus::Stale(&self.outcome));
        }
        Ok(EvidenceStatus::Current(&self.outcome))
    }
}
