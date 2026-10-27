use napi::{Env, JsBoolean, JsFunction, JsObject, JsString, JsUnknown, Result, ValueType};
use napi_derive::napi;
use umf_core::{serialization::{read_typescript_json_value, Format}, Context, Value};

#[napi(js_name = "readJsonValueRawHostImproved")]
pub fn read_json_value_raw_host_improved(
    env: Env,
    source: JsUnknown,
    format_json: JsBoolean,
    over_limit: JsFunction,
    json_preflight: JsFunction,
    read_length: JsFunction,
    create_null_object: JsFunction,
    is_falsy: JsFunction,
) -> Result<JsObject> {
    let too_long: JsBoolean = over_limit.call(None, &[&source])?.try_into()?;
    if too_long.get_value()? {
        return outcome_error(env, "UmfError", "LIMIT", "", "Source text exceeds limit");
    }

    if format_json.get_value()? {
        let parsed: JsBoolean = json_preflight.call(None, &[&source])?.try_into()?;
        if !parsed.get_value()? {
            return outcome_error(env, "UmfError", "SYNTAX", "", "Invalid JSON syntax");
        }
    }

    // parseDocument observes source.length after JSON.parse has performed any
    // explicit-JSON ToPrimitive operation. Keep this read on the host.
    let _: JsUnknown = read_length.call(None, &[&source])?;
    let source_type = source.get_type()?;
    let json = format_json.get_value()?;
    let mut context = Context::ordinary();

    let value = if source_type == ValueType::String {
        let text: JsString = source.try_into()?;
        let mut units = text.into_utf16()?.as_slice().to_vec();
        if units.last() == Some(&0) { units.pop(); }
        read_typescript_json_value(&units, Some(if json { Format::Json } else { Format::Yaml }), &mut context)
    } else {
        // yaml's parser sees empty input for any falsey non-string. Ask the
        // host for ToBoolean so NaN, signed zero and 0n follow JS semantics.
        let falsy: JsBoolean = is_falsy.call(None, &[&source])?.try_into()?;
        if falsy.get_value()? {
            read_typescript_json_value(&[], Some(Format::Yaml), &mut context)
        } else {
            return outcome_error(env, "TypeError", "", "", "source is not a string");
        }
    };

    match value {
        Ok(value) => {
            let mut result = env.create_object()?;
            result.set_named_property("ok", true)?;
            result.set_named_property("value", value_to_js(env, value, &create_null_object)?)?;
            Ok(result)
        }
        Err(error) => outcome_error(env, "UmfError", &error.code, &error.path.to_utf8().unwrap_or_default(), &error.message.to_utf8().unwrap_or_default()),
    }
}

fn outcome_error(env: Env, name: &str, code: &str, path: &str, message: &str) -> Result<JsObject> {
    let mut result = env.create_object()?;
    result.set_named_property("ok", false)?;
    result.set_named_property("name", name)?;
    result.set_named_property("code", code)?;
    result.set_named_property("path", path)?;
    result.set_named_property("message", message)?;
    Ok(result)
}

fn value_to_js(env: Env, value: Value, create_null_object: &JsFunction) -> Result<JsUnknown> {
    match value {
        Value::Null => Ok(env.get_null()?.into_unknown()),
        Value::Bool(value) => Ok(env.get_boolean(value)?.into_unknown()),
        Value::Number(value) => Ok(env.create_double(value)?.into_unknown()),
        Value::String(value) => Ok(env.create_string_utf16(value.units())?.into_unknown()),
        Value::Array(values) => {
            let mut output: JsObject = env.create_array_with_length(values.len())?;
            for (index, value) in values.into_iter().enumerate() {
                output.set_element(index as u32, value_to_js(env, value, create_null_object)?)?;
            }
            Ok(output.into_unknown())
        }
        Value::Object(values) => {
            let mut output: JsObject = create_null_object.call(None, &[] as &[JsUnknown])?.try_into()?;
            for (key, value) in values {
                let key = env.create_string_utf16(key.units())?;
                output.set_property(key, value_to_js(env, value, create_null_object)?)?;
            }
            Ok(output.into_unknown())
        }
    }
}
