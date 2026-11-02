//! Node/Bun UTF-16 transport for CONTRACT-059 SEC projection profile 2.0.0.
use napi::{bindgen_prelude::Buffer, Error, JsString, JsUnknown, Result as NapiResult, Status, ValueType};
use napi_derive::napi;
use umf_core::domain_pack_sec::{self, ProjectionError};

const INPUT_LIMIT: usize = 4_000_000;
const SOURCE_LIMIT: usize = 1_024;

fn quote_json(value: &str, out: &mut String) {
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""), '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"), '\u{09}' => out.push_str("\\t"),
            '\u{0a}' => out.push_str("\\n"), '\u{0c}' => out.push_str("\\f"), '\u{0d}' => out.push_str("\\r"),
            c if c <= '\u{1f}' => out.push_str(&format!("\\u{:04x}", c as u32)), c => out.push(c),
        }
    }
    out.push('"');
}
fn error_wire(error: &ProjectionError) -> String {
    let mut out = String::from("{\"ok\":false,\"error\":{\"name\":"); quote_json(&error.name, &mut out);
    out.push_str(",\"code\":"); if let Some(v)=&error.code { quote_json(v,&mut out) } else { out.push_str("null") }
    out.push_str(",\"path\":"); if let Some(v)=&error.path { quote_json(v,&mut out) } else { out.push_str("null") }
    out.push_str(",\"message\":"); quote_json(&error.message,&mut out); out.push_str("}}"); out
}
fn response_wire(result: Result<String, ProjectionError>) -> String {
    match result { Ok(json) => { let mut out=String::with_capacity(json.len()+22); out.push_str("{\"ok\":true,\"value\":"); out.push_str(&json); out.push('}'); out }, Err(e)=>error_wire(&e) }
}
fn wire_error(code:&str,message:&str)->String { response_wire(Err(ProjectionError{name:"UmfError".into(),code:Some(code.into()),path:Some(String::new()),message:message.into()})) }
fn utf16le(bytes:&[u8])->Option<Vec<u16>> { if bytes.len()%2!=0 { return None } Some(bytes.chunks_exact(2).map(|b|u16::from_le_bytes([b[0],b[1]])).collect()) }
fn dispatch(input_le:&[u8],source_id_le:&[u8],project:fn(&[u16],&[u16])->Result<String,ProjectionError>)->String {
    if input_le.len()%2!=0 { return wire_error("UTF16_WIRE","Malformed UTF-16 input buffer") }
    if input_le.len()/2>INPUT_LIMIT { return wire_error("LIMIT","Native JSON exceeds text limit") }
    let input=utf16le(input_le).expect("even UTF-16 byte length checked");
    // Check the caller-owned buffer before copying its units. Oversized and
    // malformed source IDs remain an ordinary identity refusal in core, after
    // JSON parsing, matching the predecessor's error order.
    let source=if source_id_le.len()>0 && source_id_le.len()%2==0 && source_id_le.len()/2<=SOURCE_LIMIT {
        utf16le(source_id_le).expect("even bounded source length checked")
    } else { Vec::new() };
    response_wire(project(&input,&source))
}
#[napi(js_name="projectSecSubmissionsUtf16Wire")]
pub fn project_sec_submissions_utf16_wire(input_le:Buffer,source_id_le:Buffer)->String { dispatch(input_le.as_ref(),source_id_le.as_ref(),domain_pack_sec::project_sec_submissions) }
#[napi(js_name="projectSecCompanyFactsUtf16Wire")]
pub fn project_sec_company_facts_utf16_wire(input_le:Buffer,source_id_le:Buffer)->String { dispatch(input_le.as_ref(),source_id_le.as_ref(),domain_pack_sec::project_sec_company_facts) }

/// N-API's UTF-16 conversion includes a terminator; remove only its final sentinel.
#[allow(dead_code)]
fn napi_string_units(value:JsUnknown)->NapiResult<Vec<u16>> {
    if value.get_type()?!=ValueType::String { return Err(Error::new(Status::InvalidArg,"input must be JSON text")) }
    let value:JsString=unsafe{value.cast()}; let mut units=value.into_utf16()?.as_slice().to_vec();
    if units.last()==Some(&0) { units.pop(); } Ok(units)
}

#[cfg(test)] mod tests { use super::*;
    #[test] fn utf16le_keeps_embedded_nul_and_lone_surrogate(){assert_eq!(utf16le(&[0,0,0,0xd8]).unwrap(),vec![0,0xd800]);}
    #[test] fn wire_preserves_raw_json_value(){assert_eq!(response_wire(Ok("[1]".into())),"{\"ok\":true,\"value\":[1]}");}
}
