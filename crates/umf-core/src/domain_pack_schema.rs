//! Opt-in CONTRACT-052 canonical domain-pack schema resource.
//!
//! This is an embedded immutable snapshot of the TypeScript-generated canonical
//! resource. It deliberately exposes no filesystem, fetching, or pack execution.

use crate::{error::EngineError, value::Utf16};

const DOMAIN_PACK_SCHEMA_1_0_0: &str = include_str!("../../../spec/extensions/domain-pack/schema.json");

/// Return the canonical schema JSON for a supported domain-pack schema version.
/// Callers must parse/copy the returned bytes before exposing a mutable value.
pub fn domain_pack_schema_json(version: &str) -> Result<&'static str, EngineError> {
    match version {
        "1.0.0" => Ok(DOMAIN_PACK_SCHEMA_1_0_0),
        _ => Err(EngineError::new(
            "DOMAIN_PACK_SCHEMA_VERSION",
            Utf16::from("/version"),
            "Unsupported domain-pack schema version",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v1_resource_is_standalone_draft_2020_12_schema() {
        let resource: serde_json::Value = serde_json::from_str(domain_pack_schema_json("1.0.0").unwrap()).unwrap();
        assert_eq!(resource["$schema"], "https://json-schema.org/draft/2020-12/schema");
        assert_eq!(resource["$id"], "urn:umf:domain-pack:1.0.0");
        assert_eq!(resource["required"][0], "id");
        assert_eq!(resource["required"][1], "version");
        assert_eq!(resource["required"][2], "domain_types");
    }

    #[test]
    fn unknown_versions_refuse() {
        let error = domain_pack_schema_json("2.0.0").unwrap_err();
        assert_eq!(error.code, "DOMAIN_PACK_SCHEMA_VERSION");
    }
}
