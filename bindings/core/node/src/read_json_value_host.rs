// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private opt-in raw-host adapter for ordinary readJsonValue.
use napi::{Env, JsFunction, JsString, ValueType};
use napi_derive::napi;
use umf_core::{Context, Utf16};

struct Host { env: Env, dispatcher: JsFunction, raw: u32, format: u32, bad_frame: bool }

impl Host {
    fn call(&mut self, op: &str, offset: usize, count: usize) -> Result<String, u64> {
        let request = format!("{{\"op\":\"{op}\",\"raw\":{},\"format\":{},\"offset\":{offset},\"count\":{count}}}", self.raw, self.format);
        let result = (|| {
            let arg = self.env.create_string(&request)?;
            let out = self.dispatcher.call(None, &[arg.into_unknown()])?;
            if out.get_type()? != ValueType::String { return Err(napi::Error::from_reason("invalid dispatcher reply type")); }
            let out: JsString = unsafe { out.cast() };
            let max = if op == "chunk" { 50 * 1024 } else { 1024 };
            if out.utf8_len()? > max { return Err(napi::Error::from_reason("oversized dispatcher reply")); }
            let out = out.into_utf8()?;
            out.as_str().map(str::to_owned).map_err(|_| napi::Error::from_reason("invalid dispatcher reply"))
        })();
        match result { Ok(s) => Ok(s), Err(_) => { self.bad_frame = true; Err(u64::MAX) } }
    }
    fn reply(&mut self, op: &str, offset: usize, count: usize) -> Result<String, u64> {
        let s = self.call(op, offset, count)?;
        if let Some(t) = s.strip_prefix("throw:") {
            return match t.parse::<u64>() { Ok(token) if token != u64::MAX => Err(token), _ => { self.bad_frame = true; Err(u64::MAX) } };
        }
        Ok(s)
    }
    fn malformed(&mut self) -> u64 { self.bad_frame = true; u64::MAX }
}

impl umf_core::read_json_value_host::ReadJsonValueHost for Host {
    fn raw_length_greater_than(&mut self, limit: usize) -> Result<bool, u64> {
        match self.reply("limit", 0, limit)?.as_str() { "true" => Ok(true), "false" => Ok(false), _ => Err(self.malformed()) }
    }
    fn select_format(&mut self) -> Result<umf_core::serialization::Format, u64> {
        match self.reply("format", 0, 0)?.as_str() {
            "json" => Ok(umf_core::serialization::Format::Json),
            "yaml" => Ok(umf_core::serialization::Format::Yaml), _ => Err(self.malformed()),
        }
    }
    fn json_preflight(&mut self) -> Result<(), u64> {
        if self.reply("preflight", 0, 0)? == "ok" { Ok(()) } else { Err(self.malformed()) }
    }
    fn observe_second_length(&mut self) -> Result<(), u64> {
        if self.reply("length", 0, 0)? == "ok" { Ok(()) } else { Err(self.malformed()) }
    }
    fn source_kind(&mut self) -> Result<umf_core::read_json_value_host::SourceKind, u64> {
        let s = self.reply("kind", 0, 0)?;
        if s == "falsy" { return Ok(umf_core::read_json_value_host::SourceKind::FalsyNonString); }
        if s == "truthy" { return Ok(umf_core::read_json_value_host::SourceKind::TruthyNonString); }
        let n = match s.strip_prefix("string:").and_then(|n| n.parse().ok()) { Some(n) => n, None => return Err(self.malformed()) };
        Ok(umf_core::read_json_value_host::SourceKind::PrimitiveString { utf16_units: n })
    }
    fn read_utf16_chunk(&mut self, offset: usize, maximum_units: usize) -> Result<umf_core::read_json_value_host::Utf16Chunk, u64> {
        let s = self.reply("chunk", offset, maximum_units)?;
        let parsed = if s.is_empty() { Ok(Vec::new()) } else { s.split(',').map(str::parse::<u16>).collect::<Result<Vec<_>,_>>() };
        let units = match parsed { Ok(u) if !u.is_empty() && u.len() <= maximum_units => u, _ => return Err(self.malformed()) };
        Ok(umf_core::read_json_value_host::Utf16Chunk { offset, units })
    }
}

/// Private test-only entry. The dispatcher retains raw values and exact thrown
/// objects in its invocation-local table. Its string framing is private and
/// bounded, but the Context does not meter N-API frame conversion.
#[napi(js_name = "executeReadJsonValueRawHostPrivate")]
pub fn execute_read_json_value_raw_host_private(env: Env, raw: u32, format: u32, dispatcher: JsFunction) -> String {
    let mut host = Host { env, dispatcher, raw, format, bad_frame: false };
    let mut ctx = Context::ordinary();
    let result = umf_core::read_json_value_host::execute_with_context(&mut host, &mut ctx);
    if host.bad_frame { return error_frame("PROTOCOL", &Utf16::default(), &Utf16::from("Invalid host dispatcher frame")); }
    match result {
        Ok(value) => match umf_core_wire::encode(&value, &mut ctx) { Ok(w) => format!("ok:{w}"), Err(e) => error_frame(&e.code, &e.path, &e.message) },
        Err(umf_core::read_json_value_host::AcquisitionFailure::HostThrow(token)) => format!("throw:{token}"),
        Err(umf_core::read_json_value_host::AcquisitionFailure::ParserTypeError) => "typeerror".into(),
        Err(umf_core::read_json_value_host::AcquisitionFailure::Engine(e)) => error_frame(&e.code, &e.path, &e.message),
    }
}

fn error_frame(code: &str, path: &Utf16, message: &Utf16) -> String {
    fn units(s: &[u16]) -> String { s.iter().map(u16::to_string).collect::<Vec<_>>().join(",") }
    format!("error:{code}:{}:{}:{}", units(code.encode_utf16().collect::<Vec<_>>().as_slice()), units(path.units()), units(message.units()))
}
