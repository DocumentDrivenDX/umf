//! Browser UTF-16 transport for CONTRACT-059 SEC projection profile 2.0.0.
use js_sys::Uint16Array;
use umf_core::domain_pack_sec::{self, ProjectionError};
use wasm_bindgen::prelude::*;
const INPUT_LIMIT: usize=4_000_000; const SOURCE_LIMIT:usize=1_024;
fn quote_json(value:&str,out:&mut String){out.push('"');for ch in value.chars(){match ch{'"'=>out.push_str("\\\""),'\\'=>out.push_str("\\\\"),'\u{08}'=>out.push_str("\\b"),'\u{09}'=>out.push_str("\\t"),'\u{0a}'=>out.push_str("\\n"),'\u{0c}'=>out.push_str("\\f"),'\u{0d}'=>out.push_str("\\r"),c if c<='\u{1f}'=>out.push_str(&format!("\\u{:04x}",c as u32)),c=>out.push(c)}}out.push('"')}
fn response_wire(result:Result<String,ProjectionError>)->String{match result{Ok(json)=>{let mut out=String::with_capacity(json.len()+22);out.push_str("{\"ok\":true,\"value\":");out.push_str(&json);out.push('}');out},Err(e)=>{let mut out=String::from("{\"ok\":false,\"error\":{\"name\":");quote_json(&e.name,&mut out);out.push_str(",\"code\":");if let Some(v)=&e.code{quote_json(v,&mut out)}else{out.push_str("null")}out.push_str(",\"path\":");if let Some(v)=&e.path{quote_json(v,&mut out)}else{out.push_str("null")}out.push_str(",\"message\":");quote_json(&e.message,&mut out);out.push_str("}}");out}}}
fn limit_wire(message:&str)->String{response_wire(Err(ProjectionError{name:"UmfError".into(),code:Some("LIMIT".into()),path:Some(String::new()),message:message.into()}))}
fn dispatch(input:&Uint16Array,source:&Uint16Array,project:fn(&[u16],&[u16])->Result<String,ProjectionError>)->String{let n=input.length() as usize;if n>INPUT_LIMIT{return limit_wire("Native JSON exceeds text limit")}let input=input.to_vec();let source=if source.length()>0&&(source.length() as usize)<=SOURCE_LIMIT{source.to_vec()}else{Vec::new()};response_wire(project(&input,&source))}
#[wasm_bindgen(js_name="projectSecSubmissionsUtf16Wire")]
pub fn project_sec_submissions_utf16_wire(input:Uint16Array,source_id:Uint16Array)->String{dispatch(&input,&source_id,domain_pack_sec::project_sec_submissions)}
#[wasm_bindgen(js_name="projectSecCompanyFactsUtf16Wire")]
pub fn project_sec_company_facts_utf16_wire(input:Uint16Array,source_id:Uint16Array)->String{dispatch(&input,&source_id,domain_pack_sec::project_sec_company_facts)}
