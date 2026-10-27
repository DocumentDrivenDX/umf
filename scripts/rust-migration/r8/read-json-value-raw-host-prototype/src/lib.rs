use napi::{Env, Error, JsBoolean, JsFunction, JsString, JsUnknown, Result, Status, ValueType};
use napi_derive::napi;

/// Prototype Rust/N-API implementation of the observable readJsonValue source
/// admission prefix. Tiny host callbacks perform the actual JS property and
/// relational operations so native exceptions and coercion stay host-owned.
#[napi(js_name = "admitReadJsonValueSource")]
pub fn admit_read_json_value_source(
    env: Env,
    source: JsUnknown,
    over_limit: JsFunction,
    read_length: JsFunction,
) -> Result<String> {
    let source_type = source.get_type()?;
    let too_long = over_limit.call(None, &[&source])?;
    let too_long: JsBoolean = too_long.try_into()?;
    if too_long.get_value()? {
        return Err(Error::new(Status::GenericFailure, "LIMIT: Source text exceeds limit"));
    }

    // This second host read matches the parser's first `length` observation
    // before it rejects a non-string source; it is observable for Proxies.
    let _parser_length = read_length.call(None, &[&source])?;
    if source_type != ValueType::String {
        env.throw_type_error("source is not a string", None)?;
        return Err(Error::new(Status::PendingException, "source is not a string"));
    }

    let text: JsString = source.try_into()?;
    let units = text.into_utf16()?.as_slice().to_vec();
    let units = units.strip_suffix(&[0]).unwrap_or(&units);
    String::from_utf16(units).map_err(|_| Error::from_reason("invalid UTF-16 source"))
}
