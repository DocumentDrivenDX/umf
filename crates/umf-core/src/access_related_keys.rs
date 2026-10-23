// SPDX-License-Identifier: MIT OR Apache-2.0
//! Iterative, code-point-preserving parser for the PostgreSQL related-Key JSON
//! payload. This module deliberately stops at JSON parsing: metadata admission,
//! the closed payload shape, component conversion and Key construction remain
//! Python-owned.
//!
//! The input and decoded string values are Unicode code-point sequences rather
//! than Rust `str`s. This preserves Python strings containing lone surrogates.
//! The flat node arena also makes parsing, traversal, and destruction safe for
//! deeply nested values without a native-stack recursion limit.

use std::collections::HashSet;

/// Selects the diagnostic wording profile of the frozen CPython predecessor.
/// The 3.14 profile differs for an object trailing comma. The 3.11/3.14 depth
/// divergence is intentionally not reproduced: this parser is iterative and
/// does not impose a new nesting limit.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DiagnosticProfile {
    Cpython311,
    Cpython314,
}

/// JSON data type stored in the parser's flat arena.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum JsonNodeKind {
    Null,
    Bool(bool),
    String(Vec<u32>),
    Array(Vec<usize>),
    Object(Vec<(Vec<u32>, usize)>),
}

/// One node in a [`ParsedJson`] arena. Child indices always refer to nodes in
/// the same arena; object member order is retained.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct JsonNode {
    pub kind: JsonNodeKind,
}

/// Parsed JSON, including every unknown member and nested value, represented
/// without recursive ownership.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParsedJson {
    nodes: Vec<JsonNode>,
    root: usize,
}

impl ParsedJson {
    pub fn root(&self) -> usize {
        self.root
    }

    pub fn node(&self, index: usize) -> Option<&JsonNode> {
        self.nodes.get(index)
    }

    pub fn nodes(&self) -> &[JsonNode] {
        &self.nodes
    }
}

/// Why the parser refused the input. `offset` is a zero-based Unicode code
/// point offset into the original Python string.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParseFailure {
    pub kind: ParseFailureKind,
    pub offset: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ParseFailureKind {
    DuplicateDecodedMember,
    NumericToken,
    Malformed(&'static str),
}

impl ParseFailure {
    /// Diagnostic text corresponding to the frozen parser hooks. A Python
    /// facade should collapse every failure to its established CodecError;
    /// this detail exists for the bridge and focused compatibility probes.
    pub fn diagnostic(&self, profile: DiagnosticProfile, input: &[u32]) -> String {
        match &self.kind {
            ParseFailureKind::DuplicateDecodedMember => {
                "duplicate related-Key JSON member".to_owned()
            }
            ParseFailureKind::NumericToken => {
                "related-Key numeric values require exact string tokens".to_owned()
            }
            ParseFailureKind::Malformed(reason) => {
                let reason = match (*reason, profile) {
                    ("trailing comma in object", DiagnosticProfile::Cpython311) => {
                        "Expecting property name enclosed in double quotes"
                    }
                    ("trailing comma in object", DiagnosticProfile::Cpython314) => {
                        "Illegal trailing comma before end of object"
                    }
                    ("trailing comma in array", DiagnosticProfile::Cpython311) => "Expecting value",
                    ("trailing comma in array", DiagnosticProfile::Cpython314) => {
                        "Illegal trailing comma before end of array"
                    }
                    (reason, _) => reason,
                };
                let offset = self.offset;
                let (line, column) = line_column(input, offset);
                format!("{reason}: line {line} column {column} (char {offset})")
            }
        }
    }
}

/// Parse exact Python code points using JSON syntax, rejecting all numeric
/// values and duplicate decoded object names at their CPython hook stages.
pub fn parse_related_key_json(
    input: &[u32],
    profile: DiagnosticProfile,
) -> Result<ParsedJson, ParseFailure> {
    Parser::new(input, profile).parse()
}

#[derive(Debug)]
enum FrameKind {
    Array {
        values: Vec<usize>,
        state: ArrayState,
    },
    Object {
        pairs: Vec<(Vec<u32>, usize)>,
        state: ObjectState,
        key: Option<Vec<u32>>,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ArrayState {
    FirstOrEnd,
    ValueAfterComma,
    CommaOrEnd,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ObjectState {
    FirstKeyOrEnd,
    KeyAfterComma,
    Colon,
    Value,
    CommaOrEnd,
}

#[derive(Debug)]
struct Frame {
    node: usize,
    kind: FrameKind,
    comma_offset: Option<usize>,
}

enum StartedValue {
    Scalar(JsonNodeKind),
    Container(Frame),
}

struct Parser<'a> {
    input: &'a [u32],
    profile: DiagnosticProfile,
    at: usize,
    nodes: Vec<JsonNode>,
    stack: Vec<Frame>,
    root: Option<usize>,
}

impl<'a> Parser<'a> {
    fn new(input: &'a [u32], profile: DiagnosticProfile) -> Self {
        Self {
            input,
            profile,
            at: 0,
            nodes: Vec::new(),
            stack: Vec::new(),
            root: None,
        }
    }

    fn parse(mut self) -> Result<ParsedJson, ParseFailure> {
        self.skip_ws();
        let start = self.start_value()?;
        self.accept_started(start);

        while !self.stack.is_empty() {
            let frame_index = self.stack.len() - 1;
            let action = match &self.stack[frame_index].kind {
                FrameKind::Array { state, .. } => match state {
                    ArrayState::FirstOrEnd => Action::ArrayFirst,
                    ArrayState::ValueAfterComma => Action::ArrayAfterComma,
                    ArrayState::CommaOrEnd => Action::ArrayComma,
                },
                FrameKind::Object { state, .. } => match state {
                    ObjectState::FirstKeyOrEnd => Action::ObjectFirstKey,
                    ObjectState::KeyAfterComma => Action::ObjectAfterComma,
                    ObjectState::Colon => Action::ObjectColon,
                    ObjectState::Value => Action::ObjectValue,
                    ObjectState::CommaOrEnd => Action::ObjectComma,
                },
            };
            match action {
                Action::ArrayFirst => {
                    self.skip_ws();
                    if self.take(b']' as u32) {
                        self.finish_container()?;
                    } else {
                        self.set_array_state(frame_index, ArrayState::CommaOrEnd);
                        let value = self.start_value()?;
                        self.accept_started(value);
                    }
                }
                Action::ArrayAfterComma => {
                    self.skip_ws();
                    if self.peek() == Some(b']' as u32) {
                        if self.profile == DiagnosticProfile::Cpython314 {
                            let comma = self.stack[frame_index].comma_offset.unwrap_or(self.at);
                            return self.malformed_at("trailing comma in array", comma);
                        }
                        return self.malformed("Expecting value");
                    }
                    self.set_array_state(frame_index, ArrayState::CommaOrEnd);
                    let value = self.start_value()?;
                    self.accept_started(value);
                }
                Action::ArrayComma => {
                    self.skip_ws();
                    if self.take(b']' as u32) {
                        self.finish_container()?;
                    } else if self.take(b',' as u32) {
                        self.set_array_state(frame_index, ArrayState::ValueAfterComma);
                        self.stack[frame_index].comma_offset = Some(self.at - 1);
                    } else {
                        return self.malformed("Expecting ',' delimiter");
                    }
                }
                Action::ObjectFirstKey => {
                    self.skip_ws();
                    if self.take(b'}' as u32) {
                        self.finish_container()?;
                    } else {
                        self.read_object_key(frame_index, false)?;
                    }
                }
                Action::ObjectAfterComma => {
                    self.skip_ws();
                    if self.peek() == Some(b'}' as u32) {
                        if self.profile == DiagnosticProfile::Cpython314 {
                            let comma = self.stack[frame_index].comma_offset.unwrap_or(self.at);
                            return self.malformed_at("trailing comma in object", comma);
                        }
                        return self.malformed("trailing comma in object");
                    }
                    self.read_object_key(frame_index, true)?;
                }
                Action::ObjectColon => {
                    self.skip_ws();
                    if !self.take(b':' as u32) {
                        return self.malformed("Expecting ':' delimiter");
                    }
                    self.set_object_state(frame_index, ObjectState::Value);
                }
                Action::ObjectValue => {
                    self.skip_ws();
                    self.set_object_state(frame_index, ObjectState::CommaOrEnd);
                    let value = self.start_value()?;
                    self.accept_started(value);
                }
                Action::ObjectComma => {
                    self.skip_ws();
                    if self.take(b'}' as u32) {
                        self.finish_container()?;
                    } else if self.take(b',' as u32) {
                        self.set_object_state(frame_index, ObjectState::KeyAfterComma);
                        self.stack[frame_index].comma_offset = Some(self.at - 1);
                    } else {
                        return self.malformed("Expecting ',' delimiter");
                    }
                }
            }
        }

        let root = self.root.expect("a JSON value was started");
        self.skip_ws();
        if self.at != self.input.len() {
            return self.malformed("Extra data");
        }
        Ok(ParsedJson {
            nodes: self.nodes,
            root,
        })
    }

    fn start_value(&mut self) -> Result<StartedValue, ParseFailure> {
        let Some(ch) = self.peek() else {
            return self.malformed("Expecting value");
        };
        match ch {
            x if x == b'{' as u32 => {
                self.at += 1;
                let node = self.add_node(JsonNodeKind::Object(Vec::new()));
                Ok(StartedValue::Container(Frame {
                    node,
                    kind: FrameKind::Object {
                        pairs: Vec::new(),
                        state: ObjectState::FirstKeyOrEnd,
                        key: None,
                    },
                    comma_offset: None,
                }))
            }
            x if x == b'[' as u32 => {
                self.at += 1;
                let node = self.add_node(JsonNodeKind::Array(Vec::new()));
                Ok(StartedValue::Container(Frame {
                    node,
                    kind: FrameKind::Array {
                        values: Vec::new(),
                        state: ArrayState::FirstOrEnd,
                    },
                    comma_offset: None,
                }))
            }
            x if x == b'"' as u32 => Ok(StartedValue::Scalar(JsonNodeKind::String(self.string()?))),
            x if x == b't' as u32 => {
                self.literal(&[b't' as u32, b'r' as u32, b'u' as u32, b'e' as u32])?;
                Ok(StartedValue::Scalar(JsonNodeKind::Bool(true)))
            }
            x if x == b'f' as u32 => {
                self.literal(&[
                    b'f' as u32,
                    b'a' as u32,
                    b'l' as u32,
                    b's' as u32,
                    b'e' as u32,
                ])?;
                Ok(StartedValue::Scalar(JsonNodeKind::Bool(false)))
            }
            x if x == b'n' as u32 => {
                self.literal(&[b'n' as u32, b'u' as u32, b'l' as u32, b'l' as u32])?;
                Ok(StartedValue::Scalar(JsonNodeKind::Null))
            }
            x if x == b'-' as u32 || is_digit(x) => self.number(),
            x if x == b'N' as u32 || x == b'I' as u32 => self.constant(),
            _ => self.malformed("Expecting value"),
        }
    }

    fn number(&mut self) -> Result<StartedValue, ParseFailure> {
        let start = self.at;
        if self.input.get(start..start + 9)
            == Some(&[
                b'-' as u32,
                b'I' as u32,
                b'n' as u32,
                b'f' as u32,
                b'i' as u32,
                b'n' as u32,
                b'i' as u32,
                b't' as u32,
                b'y' as u32,
            ])
        {
            self.at += 9;
            return Err(ParseFailure {
                kind: ParseFailureKind::NumericToken,
                offset: start,
            });
        }
        let first_digit = if self.peek() == Some(b'-' as u32) {
            self.input.get(start + 1).copied()
        } else {
            self.peek()
        };
        if !first_digit.is_some_and(is_digit) {
            return self.malformed_at("Expecting value", start);
        }
        Err(ParseFailure {
            kind: ParseFailureKind::NumericToken,
            offset: start,
        })
    }

    fn constant(&mut self) -> Result<StartedValue, ParseFailure> {
        let start = self.at;
        if self.input.get(self.at..self.at + 3) == Some(&[b'N' as u32, b'a' as u32, b'N' as u32]) {
            self.at += 3;
        } else if self.input.get(self.at..self.at + 8)
            == Some(&[
                b'I' as u32,
                b'n' as u32,
                b'f' as u32,
                b'i' as u32,
                b'n' as u32,
                b'i' as u32,
                b't' as u32,
                b'y' as u32,
            ])
        {
            self.at += 8;
        } else if self.input.get(self.at..self.at + 9)
            == Some(&[
                b'-' as u32,
                b'I' as u32,
                b'n' as u32,
                b'f' as u32,
                b'i' as u32,
                b'n' as u32,
                b'i' as u32,
                b't' as u32,
                b'y' as u32,
            ])
        {
            self.at += 9;
        } else {
            return self.malformed("Expecting value");
        }
        Err(ParseFailure {
            kind: ParseFailureKind::NumericToken,
            offset: start,
        })
    }

    fn string(&mut self) -> Result<Vec<u32>, ParseFailure> {
        let quote = b'"' as u32;
        debug_assert_eq!(self.peek(), Some(quote));
        let opening_quote = self.at;
        self.at += 1;
        let mut out = Vec::new();
        loop {
            let Some(ch) = self.peek() else {
                return self.malformed_at("Unterminated string starting at", opening_quote);
            };
            self.at += 1;
            match ch {
                x if x == quote => return Ok(out),
                x if x == b'\\' as u32 => {
                    let escape_offset = self.at - 1;
                    let Some(esc) = self.peek() else {
                        return self.malformed_at("Unterminated string starting at", opening_quote);
                    };
                    self.at += 1;
                    match esc {
                        x if x == b'"' as u32 => out.push(b'"' as u32),
                        x if x == b'\\' as u32 => out.push(b'\\' as u32),
                        x if x == b'/' as u32 => out.push(b'/' as u32),
                        x if x == b'b' as u32 => out.push(0x08),
                        x if x == b'f' as u32 => out.push(0x0c),
                        x if x == b'n' as u32 => out.push(0x0a),
                        x if x == b'r' as u32 => out.push(0x0d),
                        x if x == b't' as u32 => out.push(0x09),
                        x if x == b'u' as u32 => {
                            let escape_offset = self.at - 1;
                            let first = self.hex_quad(escape_offset)?;
                            if self.at == self.input.len()
                                && self.profile == DiagnosticProfile::Cpython311
                            {
                                return self.malformed_at("Invalid \\uXXXX escape", escape_offset);
                            }
                            if (0xd800..=0xdbff).contains(&first)
                                && self.input.get(self.at..self.at + 2)
                                    == Some(&[b'\\' as u32, b'u' as u32])
                            {
                                let saved = self.at;
                                self.at += 2;
                                match self.hex_quad(saved + 1) {
                                    Ok(low) if (0xdc00..=0xdfff).contains(&low) => {
                                        if self.at == self.input.len()
                                            && self.profile == DiagnosticProfile::Cpython311
                                        {
                                            return self
                                                .malformed_at("Invalid \\uXXXX escape", saved + 1);
                                        }
                                        out.push(
                                            0x10000 + ((first - 0xd800) << 10) + (low - 0xdc00),
                                        );
                                    }
                                    _ => {
                                        self.at = saved;
                                        out.push(first);
                                    }
                                }
                            } else {
                                out.push(first);
                            }
                        }
                        _ => return self.malformed_at("Invalid \\escape", escape_offset),
                    }
                }
                x if x < 0x20 => {
                    return self.malformed_at("Invalid control character at", self.at - 1)
                }
                _ => out.push(ch),
            }
        }
    }

    fn hex_quad(&mut self, escape_offset: usize) -> Result<u32, ParseFailure> {
        let start = self.at;
        if self.input.len().saturating_sub(self.at) < 4 {
            return self.malformed_at("Invalid \\uXXXX escape", escape_offset);
        }
        let mut value = 0;
        for _ in 0..4 {
            let ch = self.input[self.at];
            let Some(digit) = hex(ch) else {
                return self.malformed_at("Invalid \\uXXXX escape", escape_offset);
            };
            value = (value << 4) | digit;
            self.at += 1;
        }
        if self.at <= start {
            unreachable!();
        }
        Ok(value)
    }

    fn literal(&mut self, token: &[u32]) -> Result<(), ParseFailure> {
        let start = self.at;
        if self.input.get(start..start + token.len()) == Some(token) {
            self.at += token.len();
            Ok(())
        } else {
            self.malformed("Expecting value")
        }
    }

    fn read_object_key(
        &mut self,
        frame_index: usize,
        _after_comma: bool,
    ) -> Result<(), ParseFailure> {
        if self.peek() != Some(b'"' as u32) {
            return self.malformed("Expecting property name enclosed in double quotes");
        }
        let key = self.string()?;
        let FrameKind::Object {
            state, key: slot, ..
        } = &mut self.stack[frame_index].kind
        else {
            unreachable!()
        };
        *slot = Some(key);
        *state = ObjectState::Colon;
        Ok(())
    }

    fn accept_started(&mut self, value: StartedValue) {
        match value {
            StartedValue::Scalar(kind) => {
                let idx = self.add_node(kind);
                self.attach(idx);
            }
            StartedValue::Container(frame) => self.stack.push(frame),
        }
    }

    fn attach(&mut self, value: usize) {
        let Some(parent) = self.stack.last_mut() else {
            self.root = Some(value);
            return;
        };
        match &mut parent.kind {
            FrameKind::Array { values, .. } => values.push(value),
            FrameKind::Object { pairs, key, .. } => {
                pairs.push((key.take().expect("object key"), value))
            }
        }
    }

    fn finish_container(&mut self) -> Result<(), ParseFailure> {
        let frame = self.stack.pop().expect("container frame");
        let kind = match frame.kind {
            FrameKind::Array { values, .. } => JsonNodeKind::Array(values),
            FrameKind::Object { pairs, .. } => {
                // CPython's object_pairs_hook runs after all member values and
                // nested hooks have completed, in insertion order.
                let mut seen: HashSet<&[u32]> = HashSet::with_capacity(pairs.len());
                for (name, _) in &pairs {
                    if !seen.insert(name.as_slice()) {
                        return Err(ParseFailure {
                            kind: ParseFailureKind::DuplicateDecodedMember,
                            offset: self.at,
                        });
                    }
                }
                JsonNodeKind::Object(pairs)
            }
        };
        self.nodes[frame.node].kind = kind;
        self.attach(frame.node);
        Ok(())
    }

    fn set_array_state(&mut self, index: usize, next: ArrayState) {
        if let FrameKind::Array { state, .. } = &mut self.stack[index].kind {
            *state = next;
        }
    }
    fn set_object_state(&mut self, index: usize, next: ObjectState) {
        if let FrameKind::Object { state, .. } = &mut self.stack[index].kind {
            *state = next;
        }
    }
    fn add_node(&mut self, kind: JsonNodeKind) -> usize {
        let index = self.nodes.len();
        self.nodes.push(JsonNode { kind });
        index
    }
    fn skip_ws(&mut self) {
        while self
            .peek()
            .is_some_and(|ch| matches!(ch, 0x20 | 0x09 | 0x0a | 0x0d))
        {
            self.at += 1;
        }
    }
    fn peek(&self) -> Option<u32> {
        self.input.get(self.at).copied()
    }
    fn take(&mut self, expected: u32) -> bool {
        if self.peek() == Some(expected) {
            self.at += 1;
            true
        } else {
            false
        }
    }
    fn malformed<T>(&self, reason: &'static str) -> Result<T, ParseFailure> {
        Err(ParseFailure {
            kind: ParseFailureKind::Malformed(reason),
            offset: self.at,
        })
    }
    fn malformed_at<T>(&self, reason: &'static str, offset: usize) -> Result<T, ParseFailure> {
        Err(ParseFailure {
            kind: ParseFailureKind::Malformed(reason),
            offset,
        })
    }
}

#[derive(Clone, Copy)]
enum Action {
    ArrayFirst,
    ArrayAfterComma,
    ArrayComma,
    ObjectFirstKey,
    ObjectAfterComma,
    ObjectColon,
    ObjectValue,
    ObjectComma,
}

fn is_digit(ch: u32) -> bool {
    (b'0' as u32..=b'9' as u32).contains(&ch)
}
fn hex(ch: u32) -> Option<u32> {
    match ch {
        x if (b'0' as u32..=b'9' as u32).contains(&x) => Some(x - b'0' as u32),
        x if (b'a' as u32..=b'f' as u32).contains(&x) => Some(x - b'a' as u32 + 10),
        x if (b'A' as u32..=b'F' as u32).contains(&x) => Some(x - b'A' as u32 + 10),
        _ => None,
    }
}
fn line_column(input: &[u32], offset: usize) -> (usize, usize) {
    let upto = offset.min(input.len());
    let line = 1 + input[..upto].iter().filter(|&&ch| ch == 0x0a).count();
    let column = match input[..upto].iter().rposition(|&ch| ch == 0x0a) {
        Some(last_lf) => upto - last_lf,
        None => upto + 1,
    };
    (line, column)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(text: &str) -> Result<ParsedJson, ParseFailure> {
        parse_related_key_json(
            &text.chars().map(u32::from).collect::<Vec<_>>(),
            DiagnosticProfile::Cpython311,
        )
    }
    fn object(json: &ParsedJson, index: usize) -> &[(Vec<u32>, usize)] {
        match &json.node(index).unwrap().kind {
            JsonNodeKind::Object(fields) => fields,
            other => panic!("expected object, got {other:?}"),
        }
    }

    #[test]
    fn preserves_unknown_tree_and_object_member_order() {
        let value =
            parse(r#"{"items":[],"truncated":false,"future":{"x":[null,true,"z"]}}"#).unwrap();
        let root = object(&value, value.root());
        assert_eq!(
            root.iter().map(|(k, _)| k.clone()).collect::<Vec<_>>(),
            ["items", "truncated", "future"].map(|s| s.chars().map(u32::from).collect::<Vec<_>>())
        );
        assert!(value.nodes().len() >= 7);
    }

    #[test]
    fn decoded_duplicate_is_checked_when_its_object_completes() {
        let failure = parse(r#"{"x":{"a":"one","\u0061":true},"later":NaN}"#).unwrap_err();
        assert_eq!(failure.kind, ParseFailureKind::DuplicateDecodedMember);
        assert_eq!(
            failure.diagnostic(DiagnosticProfile::Cpython311, &[]),
            "duplicate related-Key JSON member"
        );
    }

    #[test]
    fn numeric_hook_precedes_duplicate_hook_for_same_object() {
        let failure = parse(r#"{"a":1,"a":2}"#).unwrap_err();
        assert_eq!(failure.kind, ParseFailureKind::NumericToken);
    }

    #[test]
    fn malformed_syntax_is_reported_before_an_unfinished_object_hook() {
        let failure = parse(r#"{"a":true,"a": false,"b":}"#).unwrap_err();
        assert!(matches!(failure.kind, ParseFailureKind::Malformed(_)));
    }

    #[test]
    fn escaped_pairs_combine_but_raw_surrogates_remain_codepoints() {
        let text = [
            b'"' as u32,
            b'\\' as u32,
            b'u' as u32,
            0xd83d,
            0xde00,
            b'"' as u32,
        ];
        // This is an invalid hex escape because the source itself contains raw
        // surrogate points; valid JSON escapes are six ASCII code points.
        assert!(parse_related_key_json(&text, DiagnosticProfile::Cpython311).is_err());
        let escaped: Vec<u32> = r#""\uD83D\uDE00\uD800""#.chars().map(u32::from).collect();
        let parsed = parse_related_key_json(&escaped, DiagnosticProfile::Cpython311).unwrap();
        assert_eq!(
            parsed.node(parsed.root()).unwrap().kind,
            JsonNodeKind::String(vec![0x1f600, 0xd800])
        );
        let raw = vec![b'"' as u32, 0xd83d, 0xde00, 0xd800, b'"' as u32];
        let parsed = parse_related_key_json(&raw, DiagnosticProfile::Cpython311).unwrap();
        assert_eq!(
            parsed.node(parsed.root()).unwrap().kind,
            JsonNodeKind::String(vec![0xd83d, 0xde00, 0xd800])
        );
    }

    #[test]
    fn rejects_integer_float_exponent_and_nonfinite_tokens_anywhere() {
        for source in [
            "0",
            "[1.5]",
            "{\"x\":-2e4}",
            "[NaN]",
            "{\"x\":Infinity}",
            "[-Infinity]",
        ] {
            assert_eq!(
                parse(source).unwrap_err().kind,
                ParseFailureKind::NumericToken,
                "{source}"
            );
        }
    }

    #[test]
    fn deeply_nested_input_uses_flat_arena_and_no_parser_recursion() {
        let depth = 20_000;
        let mut input = Vec::with_capacity(depth * 2 + 1);
        input.extend(std::iter::repeat(b'[' as u32).take(depth));
        input.extend("null".chars().map(u32::from));
        input.extend(std::iter::repeat(b']' as u32).take(depth));
        let parsed = parse_related_key_json(&input, DiagnosticProfile::Cpython314).unwrap();
        assert_eq!(parsed.nodes().len(), depth + 1);
        drop(parsed);
    }

    #[test]
    fn trailing_comma_diagnostics_are_versioned() {
        let source = r#"{"items":[],"truncated":false,}"#;
        let codepoints = source.chars().map(u32::from).collect::<Vec<_>>();
        let failure =
            parse_related_key_json(&codepoints, DiagnosticProfile::Cpython311).unwrap_err();
        assert_eq!(
            failure.diagnostic(DiagnosticProfile::Cpython311, &codepoints),
            "Expecting property name enclosed in double quotes: line 1 column 31 (char 30)"
        );
        let failure_314 =
            parse_related_key_json(&codepoints, DiagnosticProfile::Cpython314).unwrap_err();
        assert_eq!(
            failure_314.diagnostic(DiagnosticProfile::Cpython314, &codepoints),
            "Illegal trailing comma before end of object: line 1 column 30 (char 29)"
        );
    }

    #[test]
    fn numeric_hooks_fire_on_valid_prefixes_before_malformed_suffixes() {
        for source in ["01", "1.", "1e", "-01"] {
            let failure = parse(source).unwrap_err();
            assert_eq!(failure.kind, ParseFailureKind::NumericToken, "{source}");
            assert_eq!(failure.offset, 0, "{source}");
        }
    }

    #[test]
    fn malformed_value_and_string_offsets_match_cpython() {
        let bare_minus = parse("-").unwrap_err();
        assert_eq!(bare_minus.offset, 0);
        assert_eq!(
            bare_minus.diagnostic(DiagnosticProfile::Cpython311, &['-' as u32]),
            "Expecting value: line 1 column 1 (char 0)"
        );

        let terminal_backslash = vec![
            b'"' as u32,
            b'a' as u32,
            b'b' as u32,
            b'c' as u32,
            b'\\' as u32,
        ];
        let failure =
            parse_related_key_json(&terminal_backslash, DiagnosticProfile::Cpython311).unwrap_err();
        assert_eq!(
            failure.diagnostic(DiagnosticProfile::Cpython311, &terminal_backslash),
            "Unterminated string starting at: line 1 column 1 (char 0)"
        );

        let unclosed = r#""abc"#.chars().map(u32::from).collect::<Vec<_>>();
        let failure = parse_related_key_json(&unclosed, DiagnosticProfile::Cpython314).unwrap_err();
        assert_eq!(
            failure.diagnostic(DiagnosticProfile::Cpython314, &unclosed),
            "Unterminated string starting at: line 1 column 1 (char 0)"
        );

        let control = vec![b'"' as u32, b'a' as u32, 0x0a, b'b' as u32, b'"' as u32];
        let failure = parse_related_key_json(&control, DiagnosticProfile::Cpython311).unwrap_err();
        assert_eq!(
            failure.diagnostic(DiagnosticProfile::Cpython311, &control),
            "Invalid control character at: line 1 column 3 (char 2)"
        );

        let invalid_escape = r#""\x""#.chars().map(u32::from).collect::<Vec<_>>();
        let failure =
            parse_related_key_json(&invalid_escape, DiagnosticProfile::Cpython311).unwrap_err();
        assert_eq!(
            failure.diagnostic(DiagnosticProfile::Cpython311, &invalid_escape),
            "Invalid \\escape: line 1 column 2 (char 1)"
        );

        let escaped_but_unterminated = r#""\u1234"#.chars().map(u32::from).collect::<Vec<_>>();
        let failure =
            parse_related_key_json(&escaped_but_unterminated, DiagnosticProfile::Cpython311)
                .unwrap_err();
        assert_eq!(
            failure.diagnostic(DiagnosticProfile::Cpython311, &escaped_but_unterminated),
            "Invalid \\uXXXX escape: line 1 column 3 (char 2)"
        );
        let failure =
            parse_related_key_json(&escaped_but_unterminated, DiagnosticProfile::Cpython314)
                .unwrap_err();
        assert_eq!(
            failure.diagnostic(DiagnosticProfile::Cpython314, &escaped_but_unterminated),
            "Unterminated string starting at: line 1 column 1 (char 0)"
        );
    }

    #[test]
    fn cpython314_trailing_commas_report_comma_even_with_whitespace() {
        for (source, expected) in [
            (
                "[true,]",
                "Illegal trailing comma before end of array: line 1 column 6 (char 5)",
            ),
            (
                "{\"x\":true, }",
                "Illegal trailing comma before end of object: line 1 column 10 (char 9)",
            ),
            (
                "{\"x\":true,\n}",
                "Illegal trailing comma before end of object: line 1 column 10 (char 9)",
            ),
        ] {
            let input = source.chars().map(u32::from).collect::<Vec<_>>();
            let failure =
                parse_related_key_json(&input, DiagnosticProfile::Cpython314).unwrap_err();
            assert_eq!(
                failure.diagnostic(DiagnosticProfile::Cpython314, &input),
                expected,
                "{source}"
            );
        }
        let input = "[true,]".chars().map(u32::from).collect::<Vec<_>>();
        let failure = parse_related_key_json(&input, DiagnosticProfile::Cpython311).unwrap_err();
        assert_eq!(
            failure.diagnostic(DiagnosticProfile::Cpython311, &input),
            "Expecting value: line 1 column 7 (char 6)"
        );
    }
}
