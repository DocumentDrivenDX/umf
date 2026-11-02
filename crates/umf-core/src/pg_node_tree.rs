//! Bounded reader for the PostgreSQL 17.4 pg_node_tree subset used by CHECKs.
//! This deliberately is not a general server-version-independent node codec.
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PgValue {
    Atom(String),
    List(Vec<PgValue>),
    Node(PgNode),
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PgNode {
    pub tag: String,
    pub fields: BTreeMap<String, PgValue>,
}

fn tokens(source: &str) -> Option<Vec<String>> {
    if source.len() > 1_000_000 {
        return None;
    }
    let mut out = Vec::new();
    let mut word = String::new();
    for ch in source.chars() {
        if ch.is_whitespace() {
            if !word.is_empty() {
                out.push(std::mem::take(&mut word));
            }
        } else if "{}()[]".contains(ch) {
            if !word.is_empty() {
                out.push(std::mem::take(&mut word));
            }
            out.push(ch.to_string());
        } else {
            word.push(ch);
            if word.len() > 1024 {
                return None;
            }
        }
    }
    if !word.is_empty() {
        out.push(word)
    }
    if out.len() > 100_000 {
        return None;
    }
    Some(out)
}
struct Reader {
    tokens: Vec<String>,
    at: usize,
    nodes: usize,
}
impl Reader {
    fn value(&mut self, depth: usize) -> Option<PgValue> {
        if depth > 64 {
            return None;
        }
        self.nodes += 1;
        if self.nodes > 100_000 {
            return None;
        }
        match self.tokens.get(self.at)?.as_str() {
            "{" => {
                self.at += 1;
                let tag = self.tokens.get(self.at)?.clone();
                self.at += 1;
                if !tag.chars().next()?.is_ascii_uppercase()
                    || !tag
                        .bytes()
                        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == b'_')
                {
                    return None;
                }
                let mut fields = BTreeMap::new();
                while self.tokens.get(self.at)? != "}" {
                    let key = self.tokens.get(self.at)?.strip_prefix(':')?.to_owned();
                    self.at += 1;
                    if key.is_empty() || fields.contains_key(&key) {
                        return None;
                    }
                    let mut value = self.value(depth + 1)?;
                    // PostgreSQL prints by-value constants as a scalar width
                    // followed by a bracketed Datum byte array, e.g.
                    // `:constvalue 4 [ 2 0 0 0 ... ]`. Treat that pair as one
                    // structured value for the bounded constant decoder.
                    if key == "constvalue" && self.tokens.get(self.at).is_some_and(|t| t == "[") {
                        let PgValue::List(bytes) = self.value(depth + 1)? else {
                            return None;
                        };
                        value = PgValue::List(vec![value, PgValue::List(bytes)]);
                    }
                    fields.insert(key, value);
                }
                self.at += 1;
                Some(PgValue::Node(PgNode { tag, fields }))
            }
            "(" | "[" => {
                let close = if self.tokens[self.at] == "(" {
                    ")"
                } else {
                    "]"
                };
                self.at += 1;
                let mut items = Vec::new();
                while self.tokens.get(self.at)? != close {
                    items.push(self.value(depth + 1)?);
                    if items.len() > 100_000 {
                        return None;
                    }
                }
                self.at += 1;
                Some(PgValue::List(items))
            }
            "}" | ")" | "]" => None,
            _ => {
                let atom = self.tokens[self.at].clone();
                self.at += 1;
                if atom.starts_with(':') {
                    None
                } else {
                    Some(PgValue::Atom(atom))
                }
            }
        }
    }
}
pub fn parse(source: &str) -> Option<PgNode> {
    let mut reader = Reader {
        tokens: tokens(source)?,
        at: 0,
        nodes: 0,
    };
    let PgValue::Node(node) = reader.value(0)? else {
        return None;
    };
    (reader.at == reader.tokens.len()).then_some(node)
}

pub fn decode_constant(node: &PgNode) -> Option<(String, String)> {
    if node.tag != "CONST" || node.fields.len() != 8 {
        return None;
    }
    let atom = |name: &str| match node.fields.get(name)? {
        PgValue::Atom(v) => Some(v.as_str()),
        _ => None,
    };
    if atom("consttypmod")? != "-1"
        || atom("constcollid")? != "0"
        || atom("constisnull")? != "false"
        || atom("location")? != "-1"
    {
        return None;
    }
    let PgValue::List(datum) = node.fields.get("constvalue")? else {
        return None;
    };
    if datum.len() != 2 {
        return None;
    }
    let (PgValue::Atom(len), PgValue::List(bytes)) = (&datum[0], &datum[1]) else {
        return None;
    };
    let len: usize = len.parse().ok()?;
    let mut raw = Vec::with_capacity(bytes.len());
    for b in bytes {
        let PgValue::Atom(b) = b else { return None };
        let n: u8 = b.parse().ok()?;
        raw.push(n)
    }
    let ty = atom("consttype")?;
    if let Some(width) = match ty {
        "21" => Some(2),
        "23" => Some(4),
        "20" => Some(8),
        _ => None,
    } {
        if atom("constbyval")? != "true"
            || atom("constlen")? != width.to_string()
            || len != width
            || raw.len() != 8
        {
            return None;
        }
        let value = match width {
            2 => i16::from_le_bytes(raw[0..2].try_into().ok()?).to_string(),
            4 => i32::from_le_bytes(raw[0..4].try_into().ok()?).to_string(),
            _ => i64::from_le_bytes(raw[0..8].try_into().ok()?).to_string(),
        };
        return Some((ty.to_owned(), value));
    }
    if ty != "1700"
        || atom("constbyval")? != "false"
        || atom("constlen")? != "-1"
        || len != raw.len()
        || raw.len() < 6
        || raw.len() % 2 != 0
    {
        return None;
    }
    let u16at = |at: usize| u16::from_le_bytes([raw[at], raw[at + 1]]);
    if u32::from_le_bytes(raw[0..4].try_into().ok()?) as usize != raw.len() * 4 {
        return None;
    }
    let header = u16at(4);
    let flag = header & 0xc000;
    if flag == 0xc000 {
        return None;
    }
    let short = flag == 0x8000;
    let start = if short { 6 } else { 8 };
    if raw.len() < start {
        return None;
    }
    let negative = if short {
        header & 0x2000 != 0
    } else {
        flag == 0x4000
    };
    let weight = if short {
        ((header & 0x3f) as i32) - if header & 0x40 != 0 { 64 } else { 0 }
    } else {
        i16::from_le_bytes(raw[6..8].try_into().ok()?) as i32
    };
    let scale = if short {
        ((header & 0x1f80) >> 7) as i32
    } else {
        (header & 0x3fff) as i32
    };
    let mut digits = Vec::new();
    for at in (start..raw.len()).step_by(2) {
        let d = u16at(at);
        if d > 9999 {
            return None;
        }
        digits.push(d as u32)
    }
    if digits.is_empty()
        || digits[0] == 0
        || digits.last() == Some(&0)
        || weight.abs() > 1000
        || digits.len() > 1000
    {
        return None;
    }
    let mut rawdigits = String::new();
    for d in digits {
        rawdigits.push_str(&format!("{d:04}"))
    }
    let point = (weight + 1) * 4;
    let mut value = if point <= 0 {
        format!("0.{}{}", "0".repeat((-point) as usize), rawdigits)
    } else if point as usize >= rawdigits.len() {
        format!(
            "{}{}",
            rawdigits,
            "0".repeat(point as usize - rawdigits.len())
        )
    } else {
        format!(
            "{}.{}",
            &rawdigits[..point as usize],
            &rawdigits[point as usize..]
        )
    };
    value = trim_decimal(value);
    let fraction = value.split('.').nth(1).map_or(0, |v| v.len());
    if fraction > scale as usize {
        return None;
    }
    if negative && value != "0" {
        value.insert(0, '-')
    }
    Some((ty.to_owned(), value))
}
pub fn atom(value: Option<&PgValue>) -> Option<&str> {
    match value {
        Some(PgValue::Atom(value)) => Some(value),
        _ => None,
    }
}
pub fn list(value: Option<&PgValue>) -> Option<&[PgValue]> {
    match value {
        Some(PgValue::List(values)) => Some(values),
        _ => None,
    }
}
pub fn child(value: Option<&PgValue>) -> Option<&PgNode> {
    match value {
        Some(PgValue::Node(node)) => Some(node),
        _ => None,
    }
}
pub fn closed(node: &PgNode, tag: &str, fields: &[&str]) -> bool {
    node.tag == tag
        && node.fields.len() == fields.len()
        && node.fields.keys().all(|key| fields.contains(&key.as_str()))
}
fn trim_decimal(value: String) -> String {
    let value = if let Some((whole, fraction)) = value.split_once('.') {
        let fraction = fraction.trim_end_matches('0');
        if fraction.is_empty() {
            whole.to_owned()
        } else {
            format!("{whole}.{fraction}")
        }
    } else {
        value
    };
    let value = if value.starts_with('0') && value.len() > 1 && !value.starts_with("0.") {
        value.trim_start_matches('0').to_owned()
    } else {
        value
    };
    if value.is_empty() {
        "0".to_owned()
    } else {
        value
    }
}
