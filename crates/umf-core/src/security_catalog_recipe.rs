// SPDX-License-Identifier: MIT OR Apache-2.0
//! The private catalog's pure recipe profiles and shared literal ledger.

use num_bigint::BigInt;

use crate::{
    Context, EngineError, Utf16, Value,
    gregorian_date::{GREGORIAN_DATE_PROFILE, parse_gregorian_date, truncate_gregorian_date},
    security_functions::inspect_candidate_literal,
    serialization::stringify_compact,
};

fn failure(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn invalid(message: &str) -> EngineError {
    failure("PROTECTION_FUNCTION", message)
}

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

fn required<'a>(value: &'a Value, name: &str) -> Result<&'a Value, EngineError> {
    member(value, name).ok_or_else(|| invalid("Required recipe member missing"))
}

fn array(value: &Value) -> &[Value] {
    match value {
        Value::Array(values) => values,
        _ => &[],
    }
}

fn text(value: &Value) -> Result<&Utf16, EngineError> {
    match value {
        Value::String(value) => Ok(value),
        _ => Err(invalid("Recipe text required")),
    }
}

fn label(value: &Value, name: &str) -> Result<String, EngineError> {
    text(required(value, name)?)?
        .to_utf8()
        .map_err(|_| invalid("Invalid recipe label"))
}

fn number(value: &Value) -> Option<usize> {
    match value {
        Value::Number(value)
            if *value >= 0.0 && *value <= 9_007_199_254_740_991.0 && value.fract() == 0.0 =>
        {
            Some(*value as usize)
        }
        _ => None,
    }
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (name.into(), value))
            .collect(),
    )
}

fn tagged(key: &str, token: impl Into<Utf16>) -> Value {
    object(vec![(key, Value::String(token.into()))])
}

struct Ledger {
    work: usize,
    text: usize,
    work_limit: usize,
    text_limit: usize,
}

impl Ledger {
    fn step(&mut self, units: usize) -> Result<(), EngineError> {
        self.work = self.work.saturating_add(units);
        if self.work > self.work_limit {
            return Err(failure(
                "PROTECTION_LITERAL_BOUND",
                "resource-exhausted: literal work exceeds100000 units",
            ));
        }
        Ok(())
    }

    fn typed(
        &mut self,
        location: &Location<'_>,
        value: &Value,
        identity: bool,
    ) -> Result<Value, EngineError> {
        let remaining = self.work_limit - self.work;
        let mut charged = 0usize;
        let mut meter = |units| {
            charged += units;
            if charged > remaining {
                return Err(failure(
                    "PROTECTION_LITERAL_BOUND",
                    "resource-exhausted: literal work budget exceeded",
                ));
            }
            Ok(())
        };
        let mut context = Context::ordinary().with_host_control(&mut meter);
        let receipt = inspect_candidate_literal(
            location.document,
            location.reference,
            value,
            identity,
            self.text_limit - self.text,
            &mut context,
        )?;
        self.step(context.charged_work() as usize)?;
        self.text += number(required(&receipt, "textUnits")?)
            .ok_or_else(|| invalid("Invalid literal receipt"))?;
        Ok(required(&receipt, "identity")?.clone())
    }

    fn bounded(&mut self, value: &Value) -> Result<(), EngineError> {
        let error = || {
            failure(
                "PROTECTION_FUNCTION_BOUND",
                "resource-exhausted: literal text exceeds4096 units",
            )
        };
        let mut pending = vec![value];
        let mut units = 0;
        while let Some(value) = pending.pop() {
            self.step(1)?;
            match value {
                Value::String(value) => units += value.units().len(),
                Value::Object(fields) => {
                    for (key, value) in fields {
                        units += key.units().len();
                        pending.push(value);
                    }
                }
                Value::Array(values) => {
                    for (index, value) in values.iter().enumerate() {
                        units += index.to_string().len();
                        pending.push(value);
                    }
                }
                _ => {}
            }
            if units > 4096 {
                return Err(error());
            }
        }
        if stringify_compact(value)?.units().len() > 4096 {
            return Err(error());
        }
        Ok(())
    }

    fn checked(
        &mut self,
        location: &Location<'_>,
        value: &Value,
        date: bool,
    ) -> Result<(), EngineError> {
        self.bounded(value)?;
        if !date {
            return self.typed(location, value, false).map(|_| ());
        }
        location.date()?;
        if matches!(value, Value::Null) {
            return if label(location.field, "nullability")? == "absent-allowed" {
                Ok(())
            } else {
                Err(invalid("Null is outside required Gregorian date domain"))
            };
        }
        let Value::Object(fields) = value else {
            return Err(invalid("Exact date literal required"));
        };
        if fields.len() != 1 {
            return Err(invalid("Exact date literal required"));
        }
        parse_gregorian_date(required(value, "date")?).map_err(|error| invalid(error.message()))?;
        Ok(())
    }

    fn coefficient(
        &mut self,
        location: &Location<'_>,
        value: &Value,
    ) -> Result<BigInt, EngineError> {
        let identity = self.typed(location, value, true)?;
        let identity = text(&identity)?
            .to_utf8()
            .map_err(|_| invalid("Invalid numeric identity"))?;
        let (_, token) = identity
            .split_once(':')
            .ok_or_else(|| invalid("Invalid numeric identity"))?;
        self.step(token.len())?;
        token
            .parse()
            .map_err(|_| invalid("Invalid numeric identity"))
    }
}

struct Location<'a> {
    document: &'a Value,
    field: &'a Value,
    reference: &'a Value,
    family: String,
}

impl<'a> Location<'a> {
    fn resolve(closure: &'a Value, reference: &'a Value) -> Result<Self, EngineError> {
        let by_id = |value: &Value, name: &str| member(value, "id") == member(reference, name);
        let missing = || invalid("Exact qualified Field missing");
        let document = array(required(closure, "documents")?)
            .iter()
            .filter_map(|entry| member(entry, "document"))
            .find(|document| by_id(document, "documentId"))
            .ok_or_else(missing)?;
        let module = array(required(document, "modules")?)
            .iter()
            .find(|module| by_id(module, "moduleId"))
            .ok_or_else(missing)?;
        let field = array(required(module, "elements")?)
            .iter()
            .find(|field| by_id(field, "elementId"))
            .ok_or_else(missing)?;
        if label(field, "kind")? != "field"
            || label(field, "cardinality")? != "one"
            || !matches!(
                label(field, "nullability")?.as_str(),
                "required" | "absent-allowed"
            )
            || member(field, "itemType").is_some()
            || member(field, "references").is_some_and(|references| !array(references).is_empty())
        {
            return Err(invalid(
                "Explicit scalar-one Field with known value/nullability semantics required",
            ));
        }
        let family = label(field, "scalarType")?;
        let location = Self {
            document,
            field,
            reference,
            family,
        };
        if location.family == "decimal" {
            let precision = member(field, "facets")
                .and_then(|facets| member(facets, "precision"))
                .and_then(number);
            let scale = location.scale();
            if !matches!((precision, scale), (Some(precision), Some(scale)) if precision > 0 && scale <= precision)
            {
                return Err(invalid(
                    "Decimal value domain requires explicit precision/scale",
                ));
            }
        }
        Ok(location)
    }

    fn scale(&self) -> Option<usize> {
        member(self.field, "facets")
            .and_then(|facets| member(facets, "scale"))
            .and_then(number)
    }

    fn date(&self) -> Result<(), EngineError> {
        if self.family != "date"
            || matches!(member(self.field, "facets"), Some(Value::Object(fields)) if !fields.is_empty())
            || member(self.field, "allowedValues").is_some()
            || member(self.field, "default").is_some()
        {
            return Err(invalid(
                "Exact Gregorian date profile Field required; no refinements/defaults",
            ));
        }
        Ok(())
    }
}

fn core_family(family: &str) -> bool {
    matches!(
        family,
        "boolean" | "integer" | "decimal" | "string" | "binary"
    )
}

struct Argument<'a> {
    name: String,
    value: &'a Value,
    location: Location<'a>,
}

enum Recipe<'a> {
    Constant(&'a Value),
    Null,
    Date(&'a Value),
    Bucket {
        origin: BigInt,
        width: BigInt,
    },
    Prefix(usize),
    Mask {
        prefix: usize,
        suffix: usize,
        fixed: Option<usize>,
        padding: &'a Utf16,
    },
}

fn count(ledger: &mut Ledger, argument: &Argument<'_>) -> Result<usize, EngineError> {
    let value = ledger.coefficient(&argument.location, argument.value)?;
    usize::try_from(value)
        .ok()
        .filter(|count| *count <= 4096)
        .ok_or_else(|| invalid(&format!("Count {} outside0..4096", argument.name)))
}

fn recipe_result(
    recipe: Recipe<'_>,
    source: &Location<'_>,
    output: &Location<'_>,
    input: &Value,
    ledger: &mut Ledger,
) -> Result<Value, EngineError> {
    if let Recipe::Constant(value) = recipe {
        return Ok(value.clone());
    }
    if matches!(recipe, Recipe::Null) || matches!(input, Value::Null) {
        return Ok(Value::Null);
    }
    match recipe {
        Recipe::Date(unit) => {
            let value = truncate_gregorian_date(required(input, "date")?, unit)
                .map_err(|error| invalid(error.message()))?;
            Ok(tagged("date", value))
        }
        Recipe::Bucket { origin, width } => {
            let value = ledger.coefficient(source, input)?;
            let text_cost =
                value.to_string().len() + origin.to_string().len() + width.to_string().len();
            ledger.step(text_cost * 4)?;
            let delta = value - &origin;
            let mut quotient = &delta / &width;
            if &delta % &width < BigInt::from(0) {
                quotient -= 1;
            }
            let token = (origin + quotient * width).to_string();
            let value = match output.family.as_str() {
                "integer" => tagged("integerToken", token),
                _ => match source.scale().unwrap_or(0) {
                    0 => tagged("decimalToken", token),
                    scale => tagged("decimalToken", format!("{token}e-{scale}")),
                },
            };
            Ok(value)
        }
        Recipe::Prefix(_) | Recipe::Mask { .. } => {
            let value = text(required(input, "string")?)?;
            let mut spans = vec![0];
            for (i, unit) in value.units().iter().enumerate() {
                if !(i > 0
                    && (0xdc00..=0xdfff).contains(unit)
                    && (0xd800..=0xdbff).contains(&value.units()[i - 1]))
                {
                    spans.push(i);
                }
            }
            spans.remove(0);
            spans.push(value.units().len());
            let length = spans.len() - 1;
            ledger.step(length)?;
            match recipe {
                Recipe::Prefix(count) => Ok(tagged(
                    "string",
                    Utf16::new(value.units()[..spans[count.min(length)]].to_vec()),
                )),
                Recipe::Mask {
                    prefix,
                    suffix,
                    fixed,
                    padding,
                } => {
                    let start = prefix.min(length);
                    let end = suffix.min(length - start);
                    let middle = fixed.unwrap_or(length - start - end);
                    let prefix = &value.units()[..spans[start]];
                    let suffix = &value.units()[spans[length - end]..];
                    let escaped = |units: &[u16]| -> Result<usize, EngineError> {
                        Ok(
                            stringify_compact(&Value::String(Utf16::new(units.to_vec())))?
                                .units()
                                .len()
                                - 2,
                        )
                    };
                    let encoded = 13
                        + escaped(prefix)?
                        + escaped(suffix)?
                        + escaped(padding.units())? * middle;
                    if encoded > 4096 {
                        return Err(failure(
                            "PROTECTION_FUNCTION_BOUND",
                            "resource-exhausted: string output exceeds4096 canonical UTF-16 units",
                        ));
                    }
                    ledger.step(encoded)?;
                    let mut output = prefix.to_vec();
                    for _ in 0..middle {
                        output.extend_from_slice(padding.units());
                    }
                    output.extend_from_slice(suffix);
                    Ok(tagged("string", Utf16::new(output)))
                }
                _ => unreachable!(),
            }
        }
        _ => unreachable!(),
    }
}

pub fn catalog_recipe(input: &Value) -> Result<Value, EngineError> {
    let limit = |name| -> Result<usize, EngineError> {
        number(required(input, name)?)
            .filter(|value| *value <= 100_000)
            .ok_or_else(|| invalid("Invalid recipe budget"))
    };
    let mut ledger = Ledger {
        work: 0,
        text: 0,
        work_limit: limit("workLimit")?,
        text_limit: limit("textLimit")?,
    };
    let closure = required(input, "closure")?;
    let transform = required(input, "transform")?;
    let operation = format!(
        "{}/{}",
        label(transform, "kind")?,
        label(transform, "function")?
    );
    let expected: &[&str] = match operation.as_str() {
        "mask/constant" => &["value"],
        "mask/null-out" => &[],
        "mask/partial" => &["prefix", "suffix", "padding", "unit"],
        "mask/fixed-length-redact" => &["length", "padding", "unit"],
        "generalize/prefix-only" => &["length", "unit"],
        "generalize/range-bucket" => &["width", "origin"],
        "generalize/truncate-date" => &["calendar", "unit"],
        _ => {
            return Err(invalid(
                "Transform has no qualified pure reference recipe; native/keyed/vault code is never executed",
            ));
        }
    };
    if label(transform, "determinism")? != "deterministic"
        || label(transform, "reversibility")? != "none"
    {
        return Err(invalid(
            "Pure reference function requires deterministic/non-reversing declaration",
        ));
    }
    let from = Location::resolve(closure, required(transform, "inputDomain")?)?;
    let to = Location::resolve(closure, required(transform, "outputDomain")?)?;
    let date = operation == "generalize/truncate-date";
    if !date && (!core_family(&from.family) || !core_family(&to.family)) {
        return Err(invalid(
            "No selected value profile for temporal/float input or output",
        ));
    }
    let mut arguments = Vec::new();
    for argument in array(required(transform, "parameters")?) {
        let location = Location::resolve(closure, required(argument, "field")?)?;
        if !core_family(&location.family) {
            return Err(invalid("No selected core value semantics for parameter"));
        }
        arguments.push(Argument {
            name: label(argument, "name")?,
            value: required(argument, "value")?,
            location,
        });
    }
    if arguments.len() != expected.len()
        || expected
            .iter()
            .any(|name| !arguments.iter().any(|arg| arg.name == *name))
    {
        return Err(invalid(
            "Exact function-specific parameter-name set required",
        ));
    }
    let argument = |name: &str, family: &str| {
        arguments
            .iter()
            .find(|argument| argument.name == name && argument.location.family == family)
            .ok_or_else(|| invalid(&format!("Parameter {name} requires {family} domain")))
    };
    let string_argument = |name| required(argument(name, "string")?.value, "string");
    let recipe = match operation.as_str() {
        "mask/constant" => {
            let value = arguments[0].value;
            ledger.checked(&to, value, false)?;
            Recipe::Constant(value)
        }
        "mask/null-out" => {
            ledger.checked(&to, &Value::Null, false)?;
            Recipe::Null
        }
        "generalize/truncate-date" => {
            from.date()?;
            to.date()?;
            if text(string_argument("calendar")?)? != &Utf16::from(GREGORIAN_DATE_PROFILE) {
                return Err(invalid(
                    "Exact Gregorian date operation profile must be explicitly selected",
                ));
            }
            let unit = string_argument("unit")?;
            if !matches!(
                text(unit)?.to_utf8().as_deref(),
                Ok("year" | "quarter" | "month" | "day")
            ) {
                return Err(invalid("Unsupported Gregorian date truncation unit"));
            }
            Recipe::Date(unit)
        }
        "generalize/range-bucket" => {
            if !matches!(from.family.as_str(), "integer" | "decimal") || to.family != from.family {
                return Err(invalid(
                    "Bucket input/output must share exact numeric family",
                ));
            }
            let width = argument("width", &from.family)?;
            let origin = argument("origin", &from.family)?;
            if from.family == "decimal"
                && [width.location.scale(), origin.location.scale(), to.scale()]
                    .iter()
                    .any(|scale| *scale != from.scale())
            {
                return Err(invalid(
                    "Bucket operands/output must share input decimal scale",
                ));
            }
            let width = ledger.coefficient(&width.location, width.value)?;
            let origin = ledger.coefficient(&origin.location, origin.value)?;
            if width <= BigInt::from(0) {
                return Err(invalid("Bucket width must be positive"));
            }
            Recipe::Bucket { origin, width }
        }
        _ => {
            if from.family != "string" || to.family != "string" {
                return Err(invalid(
                    "String reference function requires string input/output",
                ));
            }
            if text(string_argument("unit")?)? != &Utf16::from("unicode-scalar") {
                return Err(invalid("Explicit unicode-scalar unit required"));
            }
            if operation == "generalize/prefix-only" {
                Recipe::Prefix(count(&mut ledger, argument("length", "integer")?)?)
            } else {
                let (prefix, suffix, fixed) = if operation == "mask/partial" {
                    (
                        count(&mut ledger, argument("prefix", "integer")?)?,
                        count(&mut ledger, argument("suffix", "integer")?)?,
                        None,
                    )
                } else {
                    (
                        0,
                        0,
                        Some(count(&mut ledger, argument("length", "integer")?)?),
                    )
                };
                let padding = text(string_argument("padding")?)?;
                if char::decode_utf16(padding.units().iter().copied()).count() != 1 {
                    return Err(invalid("Padding must be exactly one Unicode scalar"));
                }
                Recipe::Mask {
                    prefix,
                    suffix,
                    fixed,
                    padding,
                }
            }
        }
    };
    let value = if let Some(value) = member(input, "value") {
        ledger.checked(&from, value, date)?;
        if !matches!(recipe, Recipe::Constant(_) | Recipe::Null) && matches!(value, Value::Null) {
            ledger.checked(&to, &Value::Null, date)?;
        }
        let result = recipe_result(recipe, &from, &to, value, &mut ledger)?;
        ledger.checked(&to, &result, date)?;
        result
    } else {
        Value::Null
    };
    Ok(object(vec![
        ("inputDomain", from.reference.clone()),
        ("outputDomain", to.reference.clone()),
        (
            "valueProfile",
            if date {
                Value::String(GREGORIAN_DATE_PROFILE.into())
            } else {
                Value::Null
            },
        ),
        ("value", value),
        ("workUnits", Value::Number(ledger.work as f64)),
        ("textUnits", Value::Number(ledger.text as f64)),
    ]))
}
