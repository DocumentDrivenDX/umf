//! Source-owned SEC submission and Company Facts projections.
use crate::native_json::{NativeJsonNode, NativeJsonTree};
use crate::{Context, EngineError, Utf16};

pub fn parse_native(input: &[u16]) -> Result<NativeJsonTree, EngineError> {
    let mut context = Context::ordinary();
    NativeJsonTree::parse_json(input, &mut context).map_err(normalize_duplicate_preview)
}

fn normalize_duplicate_preview(mut error: EngineError) -> EngineError {
    let Ok(message) = error.message.to_utf8() else {
        return error;
    };
    if !message.starts_with("Map keys must be unique at line ") {
        return error;
    }
    let Some((header, body)) = message.split_once("\n\n") else {
        return error;
    };
    let Some((excerpt, tail)) = body.split_once('\n') else {
        return error;
    };
    let units: Vec<u16> = excerpt.encode_utf16().collect();
    if units.len() <= 80 {
        return error;
    }
    let Some(caret) = tail.find('^') else {
        return error;
    };
    let offset = caret;
    let (clipped, clipped_caret) = if offset < 39 {
        let mut clipped = units[..79].to_vec();
        clipped.push(0x2026);
        (clipped, offset)
    } else if units.len().saturating_sub(offset) <= 40 {
        let start = units.len() - 79;
        let mut clipped = vec![0x2026];
        clipped.extend_from_slice(&units[start..]);
        (clipped, 1 + offset - start)
    } else {
        let start = offset - 39;
        let end = (offset + 39).min(units.len());
        let mut clipped = vec![0x2026];
        clipped.extend_from_slice(&units[start..end]);
        clipped.push(0x2026);
        (clipped, 40)
    };
    let excerpt = String::from_utf16_lossy(&clipped);
    let caret_line = format!("{}^\n", " ".repeat(clipped_caret));
    error.message = Utf16::from(format!("{header}\n\n{excerpt}\n{caret_line}"));
    error
}

pub fn member<'a>(node: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    let NativeJsonNode::Object(members) = node else {
        return None;
    };
    let key = Utf16::from(name);
    members
        .iter()
        .find(|(candidate, _)| candidate == &key)
        .map(|(_, value)| value)
}

pub fn render_native(node: &NativeJsonNode) -> String {
    let mut out = String::new();
    write_node(node, &mut out);
    out
}

fn write_quoted(value: &Utf16, out: &mut String) {
    use std::char::decode_utf16;
    out.push('"');
    let units = value.units();
    let mut i = 0;
    while i < units.len() {
        let u = units[i];
        match u {
            0x22 => out.push_str("\\\""),
            0x5c => out.push_str("\\\\"),
            0x08 => out.push_str("\\b"),
            0x09 => out.push_str("\\t"),
            0x0a => out.push_str("\\n"),
            0x0c => out.push_str("\\f"),
            0x0d => out.push_str("\\r"),
            0x00..=0x1f => out.push_str(&format!("\\u{u:04x}")),
            0xd800..=0xdbff if i + 1 < units.len() && (0xdc00..=0xdfff).contains(&units[i + 1]) => {
                if let Some(ch) = decode_utf16([u, units[i + 1]]).next().and_then(Result::ok) {
                    out.push(ch);
                }
                i += 1;
            }
            0xd800..=0xdfff => out.push_str(&format!("\\u{u:04x}")),
            _ => out.push(char::from_u32(u as u32).expect("non-surrogate BMP unit")),
        }
        i += 1;
    }
    out.push('"');
}

fn write_node(node: &NativeJsonNode, out: &mut String) {
    use NativeJsonNode as N;
    match node {
        N::Null => out.push_str("null"),
        N::Boolean(true) => out.push_str("true"),
        N::Boolean(false) => out.push_str("false"),
        N::Number(token) => out.push_str(token),
        N::String(s) => write_quoted(s, out),
        N::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_node(item, out);
            }
            out.push(']');
        }
        N::Object(members) => {
            out.push('{');
            for (i, (key, value)) in members.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_quoted(key, out);
                out.push(':');
                write_node(value, out);
            }
            out.push('}');
        }
    }
}

/// JavaScript JSON Pointer escaping, operating on UTF-16 without normalization.
pub fn pointer_child(parent: &Utf16, segment: &Utf16) -> Utf16 {
    let mut units = parent.units().to_vec();
    units.push(b'/' as u16);
    for &unit in segment.units() {
        match unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            _ => units.push(unit),
        }
    }
    Utf16::new(units)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectionError {
    pub name: String,
    pub code: Option<String>,
    pub path: Option<String>,
    pub message: String,
}
impl ProjectionError {
    fn ordinary(message: impl Into<String>) -> Self {
        Self {
            name: "Error".into(),
            code: None,
            path: None,
            message: message.into(),
        }
    }
    fn engine(error: EngineError) -> Self {
        Self {
            name: "UmfError".into(),
            code: Some(error.code),
            path: Some(error.path.to_utf8().unwrap_or_default()),
            message: error.message.to_utf8().unwrap_or_default(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum OutputValue {
    Text(Utf16),
    Null,
}
#[derive(Clone, Debug, Eq, PartialEq)]
struct OrderedRow(Vec<(&'static str, OutputValue)>);
type Row = OrderedRow;
#[derive(Clone, Debug, Eq, PartialEq)]
struct SecSubmissionsResponse {
    companies: Vec<OrderedRow>,
    identifiers: Vec<OrderedRow>,
    filings: Vec<OrderedRow>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
struct SecCompanyFactsResponse(Vec<OrderedRow>);
/// Explicit prototype ceiling: 32 Mi UTF-16 units, matching UMF's aggregate
/// text maximum. This is a deliberate admission change versus the TS source.
pub const MAX_PROJECTION_OUTPUT_UTF16: usize = 32 * 1024 * 1024;

#[derive(Default)]
struct OutputBudget(usize);
impl OutputBudget {
    /// Count prospective units without short-circuiting validation. This is
    /// deliberately saturating: overflow means “over the limit”, not wraparound.
    fn tally(&mut self, units: usize) {
        self.0 = self.0.saturating_add(units);
    }
}
fn output_limit_error() -> ProjectionError {
    ProjectionError {
        name: "UmfError".into(),
        code: Some("LIMIT".into()),
        path: Some(String::new()),
        message: "SEC projection output limit exceeded".into(),
    }
}
fn quoted_utf16_units(value: &Utf16) -> usize {
    let mut n = 2; // surrounding quotes
    let units = value.units();
    let mut i = 0;
    while i < units.len() {
        n += match units[i] {
            0x22 | 0x5c | 0x08 | 0x09 | 0x0a | 0x0c | 0x0d => 2,
            0x00..=0x1f => 6,
            0xd800..=0xdbff if i + 1 < units.len() && (0xdc00..=0xdfff).contains(&units[i + 1]) => {
                i += 1;
                2
            }
            0xd800..=0xdfff => 6,
            _ => 1,
        };
        i += 1;
    }
    n
}
fn row_output_units(row: &Row) -> usize {
    let mut n = 2; // braces
    for (i, (name, value)) in row.0.iter().enumerate() {
        if i > 0 {
            n += 1;
        }
        n += quoted_utf16_units(&Utf16::from(*name)) + 1;
        n += match value {
            OutputValue::Text(v) => quoted_utf16_units(v),
            OutputValue::Null => 4,
        };
    }
    n
}
fn admit_row(budget: &mut OutputBudget, row: &Row, comma: bool) -> Result<(), ProjectionError> {
    budget.tally(row_output_units(row).saturating_add(usize::from(comma)));
    Ok(())
}
fn check_output_budget(budget: &OutputBudget) -> Result<(), ProjectionError> {
    if budget.0 > MAX_PROJECTION_OUTPUT_UTF16 {
        Err(output_limit_error())
    } else {
        Ok(())
    }
}

struct OrderedJsonWriter {
    text: String,
    units: usize,
    limit: usize,
}
impl OrderedJsonWriter {
    fn new() -> Self {
        Self::with_limit(MAX_PROJECTION_OUTPUT_UTF16)
    }
    fn with_limit(limit: usize) -> Self {
        Self {
            text: String::new(),
            units: 0,
            limit,
        }
    }
    fn admit(&mut self, units: usize) -> Result<(), ProjectionError> {
        let next = self
            .units
            .checked_add(units)
            .ok_or_else(output_limit_error)?;
        if next > self.limit {
            return Err(output_limit_error());
        }
        self.units = next;
        Ok(())
    }
    fn raw(&mut self, value: &str) -> Result<(), ProjectionError> {
        self.admit(value.encode_utf16().count())?;
        self.text.push_str(value);
        Ok(())
    }
    fn quoted(&mut self, value: &Utf16) -> Result<(), ProjectionError> {
        self.admit(quoted_utf16_units(value))?;
        write_quoted(value, &mut self.text);
        Ok(())
    }
    fn row(&mut self, row: &OrderedRow) -> Result<(), ProjectionError> {
        self.raw("{")?;
        for (i, (name, value)) in row.0.iter().enumerate() {
            if i > 0 {
                self.raw(",")?;
            }
            self.quoted(&Utf16::from(*name))?;
            self.raw(":")?;
            match value {
                OutputValue::Text(text) => self.quoted(text)?,
                OutputValue::Null => self.raw("null")?,
            }
        }
        self.raw("}")
    }
    fn rows(&mut self, rows: &[OrderedRow]) -> Result<(), ProjectionError> {
        self.raw("[")?;
        for (i, row) in rows.iter().enumerate() {
            if i > 0 {
                self.raw(",")?;
            }
            self.row(row)?;
        }
        self.raw("]")
    }
    fn submissions(&mut self, response: &SecSubmissionsResponse) -> Result<(), ProjectionError> {
        self.raw("{\"companies\":")?;
        self.rows(&response.companies)?;
        self.raw(",\"identifiers\":")?;
        self.rows(&response.identifiers)?;
        self.raw(",\"filings\":")?;
        self.rows(&response.filings)?;
        self.raw("}")
    }
    fn company_facts(&mut self, response: &SecCompanyFactsResponse) -> Result<(), ProjectionError> {
        self.rows(&response.0)
    }
    fn finish(self) -> String {
        self.text
    }
}
fn push_text(row: &mut Row, name: &'static str, value: impl Into<Utf16>) {
    row.0.push((name, OutputValue::Text(value.into())));
}
fn push_optional(row: &mut Row, name: &'static str, value: Option<Utf16>) {
    row.0.push((
        name,
        value.map(OutputValue::Text).unwrap_or(OutputValue::Null),
    ));
}
fn node_object<'a>(
    node: Option<&'a NativeJsonNode>,
) -> Result<&'a [(Utf16, NativeJsonNode)], ProjectionError> {
    match node {
        Some(NativeJsonNode::Object(fields)) => Ok(fields),
        _ => Err(ProjectionError::ordinary("Expected SEC object")),
    }
}
fn node_array<'a>(
    node: Option<&'a NativeJsonNode>,
) -> Result<&'a [NativeJsonNode], ProjectionError> {
    match node {
        Some(NativeJsonNode::Array(items)) => Ok(items),
        _ => Err(ProjectionError::ordinary("Expected SEC array")),
    }
}
fn node_text(
    node: Option<&NativeJsonNode>,
    required: bool,
) -> Result<Option<Utf16>, ProjectionError> {
    match node {
        None if !required => Ok(None),
        Some(NativeJsonNode::Null) if !required => Ok(None),
        Some(NativeJsonNode::String(s)) if !required || !s.is_empty() => Ok(Some(s.clone())),
        _ => Err(ProjectionError::ordinary("Expected SEC string")),
    }
}
fn node_token(node: Option<&NativeJsonNode>) -> Result<Option<String>, ProjectionError> {
    match node {
        None | Some(NativeJsonNode::Null) => Ok(None),
        Some(NativeJsonNode::Number(token)) => Ok(Some(token.clone())),
        _ => Err(ProjectionError::ordinary("Expected SEC numeric token")),
    }
}
fn has_own(fields: &[(Utf16, NativeJsonNode)], name: &str) -> bool {
    let key = Utf16::from(name);
    fields.iter().any(|(k, _)| k == &key)
}
fn node_from_fields(fields: Vec<(Utf16, NativeJsonNode)>) -> NativeJsonNode {
    NativeJsonNode::Object(fields)
}
fn digit_cik(cik: &str) -> bool {
    !cik.is_empty()
        && cik.len() <= 10
        && cik.bytes().all(|b| b.is_ascii_digit())
        && cik.bytes().any(|b| b != b'0')
}
fn identity(root: &NativeJsonNode, source_id: &[u16]) -> Result<String, ProjectionError> {
    let _ = node_object(Some(root))?;
    if source_id.is_empty() || source_id.len() > 1024 {
        return Err(ProjectionError::ordinary("Invalid SEC source identity"));
    }
    let cik_node = member(root, "cik");
    let cik = match cik_node {
        Some(NativeJsonNode::String(s)) => s.to_utf8().ok(),
        Some(NativeJsonNode::Number(token)) => Some(token.clone()),
        _ => None,
    }
    .filter(|s| digit_cik(s))
    .ok_or_else(|| ProjectionError::ordinary("Invalid SEC CIK"))?;
    Ok(format!("{:0>10}", cik))
}
fn tuple_key(parts: &[&Utf16]) -> Utf16 {
    let mut out = String::from("[");
    for (i, part) in parts.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        write_quoted(part, &mut out);
    }
    out.push(']');
    Utf16::from(out)
}
fn source_path_id(source_id: &[u16], field: &str, ordinal: usize) -> Utf16 {
    tuple_key(&[
        &Utf16::new(source_id.to_vec()),
        &Utf16::from(field),
        &Utf16::from(ordinal.to_string()),
    ])
}
fn is_accession(value: &Utf16) -> bool {
    let Ok(s) = value.to_utf8() else { return false };
    let b = s.as_bytes();
    b.len() == 20
        && b[0..10].iter().all(u8::is_ascii_digit)
        && b[10] == b'-'
        && b[11..13].iter().all(u8::is_ascii_digit)
        && b[13] == b'-'
        && b[14..20].iter().all(u8::is_ascii_digit)
}
fn is_date_shape(value: &Utf16) -> bool {
    let Ok(s) = value.to_utf8() else { return false };
    let b = s.as_bytes();
    b.len() == 10
        && b[0..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[7] == b'-'
        && b[8..10].iter().all(u8::is_ascii_digit)
}
fn safe_primary(value: &Utf16) -> bool {
    let units = value.units();
    if units.first() == Some(&(b'/' as u16))
        || units
            .iter()
            .any(|u| matches!(*u, 0x5c | 0x3f | 0x23 | 0x3a))
    {
        return false;
    }
    let mut start = 0;
    for end in (0..=units.len()).filter(|&i| i == units.len() || units[i] == b'/' as u16) {
        let segment = &units[start..end];
        if segment.is_empty() || segment == [b'.' as u16] || segment == [b'.' as u16, b'.' as u16] {
            return false;
        }
        start = end + 1;
    }
    true
}

/// Source-owned SEC submissions projection; no fetch or filesystem access.
pub fn project_sec_submissions(
    input: &[u16],
    source_id: &[u16],
) -> Result<String, ProjectionError> {
    let _ = project_sec_submissions_pass(input, source_id, false)?;
    project_sec_submissions_pass(input, source_id, true)
}

fn project_sec_submissions_pass(
    input: &[u16],
    source_id: &[u16],
    materialize: bool,
) -> Result<String, ProjectionError> {
    let tree = parse_native(input).map_err(ProjectionError::engine)?;
    let root = tree.root();
    let cik = identity(root, source_id)?;
    let name = node_text(member(root, "name"), true)?.expect("required text");
    let companies = vec![OrderedRow(vec![
        ("id", OutputValue::Text(Utf16::from(cik.as_str()))),
        ("name", OutputValue::Text(name)),
        (
            "source_id",
            OutputValue::Text(Utf16::new(source_id.to_vec())),
        ),
    ])];
    let mut output_budget = OutputBudget::default();
    output_budget.tally(r#"{"companies":[],"identifiers":[],"filings":[]}"#.encode_utf16().count());
    for (i, company) in companies.iter().enumerate() {
        admit_row(&mut output_budget, company, i > 0)?;
    }
    let mut identifiers = Vec::<Row>::new();
    let mut identifier_count = 0usize;
    let mut id = OrderedRow(Vec::new());
    push_text(
        &mut id,
        "id",
        tuple_key(&[&Utf16::new(source_id.to_vec()), &Utf16::from("cik")]),
    );
    push_text(&mut id, "company_id", cik.as_str());
    push_text(&mut id, "scheme", "SEC-CIK");
    push_text(&mut id, "native_value", cik.as_str());
    push_text(&mut id, "source_id", Utf16::new(source_id.to_vec()));
    admit_row(&mut output_budget, &id, false)?;
    identifier_count += 1;
    if materialize {
        identifiers.push(id);
    }
    for field in ["tickers", "exchanges"] {
        if let Some(values) = member(root, field) {
            for (i, value) in node_array(Some(values))?.iter().enumerate() {
                let value = node_text(Some(value), true)?.expect("required text");
                let mut row = OrderedRow(Vec::new());
                push_text(&mut row, "id", source_path_id(source_id, field, i));
                push_text(&mut row, "company_id", cik.as_str());
                push_text(&mut row, "scheme", field);
                push_text(&mut row, "native_value", value);
                push_text(&mut row, "source_id", Utf16::new(source_id.to_vec()));
                admit_row(&mut output_budget, &row, identifier_count > 0)?;
                identifier_count += 1;
                if materialize {
                    identifiers.push(row);
                }
            }
        }
    }
    let filings_obj = member(root, "filings");
    let recent_node = filings_obj.and_then(|filings| member(filings, "recent"));
    let recent = node_object(recent_node)?;
    let required = [
        "accessionNumber",
        "filingDate",
        "reportDate",
        "form",
        "primaryDocument",
        "items",
    ];
    for column in required {
        if !has_own(recent, column) {
            return Err(ProjectionError::ordinary(format!(
                "Missing SEC recent column: {column}"
            )));
        }
    }
    let mut columns: Vec<(&Utf16, &[NativeJsonNode])> = Vec::with_capacity(recent.len());
    for (name, node) in recent {
        columns.push((name, node_array(Some(node))?));
    }
    let count = node_array(member(
        &NativeJsonNode::Object(recent.to_vec()),
        "accessionNumber",
    ))?
    .len();
    if columns.iter().any(|(_, values)| values.len() != count) {
        return Err(ProjectionError::ordinary("Unequal SEC recent arrays"));
    }
    let mut used = std::collections::HashSet::<Utf16>::new();
    let mut filings = Vec::<Row>::new();
    let mut filing_count = 0usize;
    for i in 0..count {
        let native = node_from_fields(
            columns
                .iter()
                .map(|(name, values)| ((*name).clone(), values[i].clone()))
                .collect(),
        );
        let accession =
            node_text(member(&native, "accessionNumber"), true)?.expect("required accession");
        if !is_accession(&accession) || !used.insert(accession.clone()) {
            return Err(ProjectionError::ordinary(
                "Invalid or duplicate SEC accession",
            ));
        }
        let primary = node_text(member(&native, "primaryDocument"), false)?;
        if primary.as_ref().is_some_and(|p| !safe_primary(p)) {
            return Err(ProjectionError::ordinary("Unsafe SEC primary document"));
        }
        let filing_date = node_text(member(&native, "filingDate"), true)?.expect("required date");
        if !is_date_shape(&filing_date) {
            return Err(ProjectionError::ordinary("Invalid SEC filing date"));
        }
        let form = node_text(member(&native, "form"), true)?.expect("required form");
        let report_date = node_text(member(&native, "reportDate"), false)?;
        let items = node_text(member(&native, "items"), false)?;
        let accession_s = accession.to_utf8().expect("validated accession");
        let primary_url = primary.as_ref().map(|p| {
            let path_cik = cik.trim_start_matches('0');
            let prefix = Utf16::from(format!(
                "https://www.sec.gov/Archives/edgar/data/{path_cik}/{}/",
                accession_s.replace('-', "")
            ));
            let mut units = prefix.into_units();
            units.extend_from_slice(p.units());
            Utf16::new(units)
        });
        let mut row = OrderedRow(Vec::new());
        push_text(
            &mut row,
            "id",
            tuple_key(&[&Utf16::from(cik.as_str()), &accession]),
        );
        push_text(&mut row, "company_id", cik.as_str());
        push_text(&mut row, "snapshot_id", Utf16::new(source_id.to_vec()));
        push_text(&mut row, "accession", accession);
        push_text(&mut row, "filing_date", filing_date);
        push_optional(&mut row, "report_date", report_date);
        push_text(&mut row, "form", form);
        push_optional(&mut row, "items", items);
        push_optional(&mut row, "primary_document", primary.clone());
        push_optional(&mut row, "primary_url", primary_url.map(Utf16::from));
        push_text(&mut row, "native_path", format!("/filings/recent/{i}"));
        push_text(&mut row, "native_json", render_native(&native));
        admit_row(&mut output_budget, &row, filing_count > 0)?;
        filing_count += 1;
        if materialize {
            filings.push(row);
        }
    }
    check_output_budget(&output_budget)?;
    if !materialize {
        return Ok(String::new());
    }
    let response = SecSubmissionsResponse {
        companies,
        identifiers,
        filings,
    };
    let mut out = OrderedJsonWriter::new();
    out.submissions(&response)?;
    debug_assert_eq!(output_budget.0, out.units, "projection size accounting");
    let out = out.finish();
    Ok(out)
}

/// Source-owned entity-wide SEC Company Facts projection.
pub fn project_sec_company_facts(
    input: &[u16],
    source_id: &[u16],
) -> Result<String, ProjectionError> {
    let _ = project_sec_company_facts_pass(input, source_id, false)?;
    project_sec_company_facts_pass(input, source_id, true)
}

fn project_sec_company_facts_pass(
    input: &[u16],
    source_id: &[u16],
    materialize: bool,
) -> Result<String, ProjectionError> {
    let tree = parse_native(input).map_err(ProjectionError::engine)?;
    let root = tree.root();
    let cik = identity(root, source_id)?;
    let facts = node_object(member(root, "facts"))?;
    let mut rows = Vec::<Row>::new();
    let mut row_count = 0usize;
    let mut output_budget = OutputBudget::default();
    output_budget.tally(2); // []
    for (taxonomy, concepts_node) in facts {
        let concepts = node_object(Some(concepts_node))?;
        for (concept, definition_node) in concepts {
            let definition = node_object(Some(definition_node))?;
            let concept_native = NativeJsonNode::Object(
                definition
                    .iter()
                    .filter(|(name, _)| name != &Utf16::from("units"))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect(),
            );
            let concept_json = render_native(&concept_native);
            let units_node = member(definition_node, "units");
            for (unit, observations_node) in node_object(units_node)? {
                for (ordinal, observation) in
                    node_array(Some(observations_node))?.iter().enumerate()
                {
                    let _ = node_object(Some(observation))?;
                    let val_node = member(observation, "val");
                    let value = node_token(val_node)?;
                    let state = if val_node.is_none() {
                        "absent"
                    } else if matches!(val_node, Some(NativeJsonNode::Null)) {
                        "null"
                    } else {
                        "present"
                    };
                    let path = pointer_child(
                        &pointer_child(
                            &pointer_child(
                                &pointer_child(
                                    &pointer_child(&Utf16::from("/facts"), taxonomy),
                                    concept,
                                ),
                                &unit_name_for_units(),
                            ),
                            unit,
                        ),
                        &Utf16::from(ordinal.to_string()),
                    );
                    let mut row = OrderedRow(Vec::new());
                    push_text(
                        &mut row,
                        "id",
                        tuple_key(&[
                            &Utf16::new(source_id.to_vec()),
                            taxonomy,
                            concept,
                            unit,
                            &Utf16::from(ordinal.to_string()),
                        ]),
                    );
                    push_text(&mut row, "company_id", cik.as_str());
                    push_text(&mut row, "snapshot_id", Utf16::new(source_id.to_vec()));
                    push_text(&mut row, "taxonomy", taxonomy.clone());
                    push_text(&mut row, "concept", concept.clone());
                    push_text(&mut row, "unit", unit.clone());
                    push_text(&mut row, "ordinal", ordinal.to_string());
                    push_optional(&mut row, "value", value.map(Utf16::from));
                    push_text(&mut row, "value_state", state);
                    push_optional(
                        &mut row,
                        "start_date",
                        node_text(member(observation, "start"), false)?,
                    );
                    push_optional(
                        &mut row,
                        "end_date",
                        node_text(member(observation, "end"), false)?,
                    );
                    push_optional(
                        &mut row,
                        "accession",
                        node_text(member(observation, "accn"), false)?,
                    );
                    push_optional(
                        &mut row,
                        "filed_date",
                        node_text(member(observation, "filed"), false)?,
                    );
                    push_optional(
                        &mut row,
                        "form",
                        node_text(member(observation, "form"), false)?,
                    );
                    push_optional(
                        &mut row,
                        "fiscal_year",
                        node_token(member(observation, "fy"))?.map(Utf16::from),
                    );
                    push_optional(
                        &mut row,
                        "fiscal_period",
                        node_text(member(observation, "fp"), false)?,
                    );
                    push_optional(
                        &mut row,
                        "frame",
                        node_text(member(observation, "frame"), false)?,
                    );
                    push_text(&mut row, "native_path", path);
                    push_text(&mut row, "native_json", render_native(observation));
                    push_text(&mut row, "concept_json", concept_json.clone());
                    admit_row(&mut output_budget, &row, row_count > 0)?;
                    row_count += 1;
                    if materialize {
                        rows.push(row);
                    }
                }
            }
        }
    }
    check_output_budget(&output_budget)?;
    if !materialize {
        return Ok(String::new());
    }
    let response = SecCompanyFactsResponse(rows);
    let mut out = OrderedJsonWriter::new();
    out.company_facts(&response)?;
    debug_assert_eq!(output_budget.0, out.units, "projection size accounting");
    Ok(out.finish())
}
fn unit_name_for_units() -> Utf16 {
    Utf16::from("units")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_json::NativeJsonNode as N;

    fn units(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }

    #[test]
    fn preserves_large_decimal_lexeme_and_property_order_in_fragment() {
        let tree = parse_native(&units(r#"{"z":1,"10":9007199254740993.0100,"2":2}"#)).unwrap();
        assert_eq!(
            render_native(tree.root()),
            r#"{"2":2,"10":9007199254740993.0100,"z":1}"#
        );
        let N::Number(token) = member(tree.root(), "10").unwrap() else {
            panic!()
        };
        assert_eq!(token, "9007199254740993.0100");
    }

    #[test]
    fn retains_escaped_lone_surrogate_for_native_json_rendering() {
        let tree = parse_native(&units(r#"{"x":"\ud800"}"#)).unwrap();
        assert_eq!(render_native(tree.root()), r#"{"x":"\ud800"}"#);
    }

    #[test]
    fn pointer_escapes_tilde_before_slash_and_keeps_utf16() {
        let got = pointer_child(&Utf16::from("/facts"), &Utf16::from("A/B~C"));
        assert_eq!(got.to_utf8().unwrap(), "/facts/A~1B~0C");
    }

    #[test]
    fn duplicate_member_is_refused_by_shared_parser() {
        assert!(parse_native(&units(r#"{"cik":"1","cik":"2"}"#)).is_err());
    }

    #[test]
    fn output_budget_accepts_cap_and_refuses_cap_plus_one() {
        let mut below = OutputBudget(MAX_PROJECTION_OUTPUT_UTF16 - 1);
        below.tally(1);
        assert_eq!(below.0, MAX_PROJECTION_OUTPUT_UTF16);
        assert!(check_output_budget(&below).is_ok());
        let mut at = OutputBudget(MAX_PROJECTION_OUTPUT_UTF16);
        at.tally(0);
        assert!(check_output_budget(&at).is_ok());
        let mut above = OutputBudget(MAX_PROJECTION_OUTPUT_UTF16 - 1);
        above.tally(2);
        let error = check_output_budget(&above).unwrap_err();
        assert_eq!(error.name, "UmfError");
        assert_eq!(error.code.as_deref(), Some("LIMIT"));
        assert_eq!(error.path.as_deref(), Some(""));
        assert_eq!(error.message, "SEC projection output limit exceeded");
        assert_eq!(above.0, MAX_PROJECTION_OUTPUT_UTF16 + 1);
    }

    #[test]
    fn many_row_commas_are_included_in_projection_preflight_budget() {
        let row = OrderedRow(vec![("x", OutputValue::Text(Utf16::from("")))]);
        let row_units = row_output_units(&row);
        let count = 4_096usize;
        let mut without_commas = OutputBudget(MAX_PROJECTION_OUTPUT_UTF16 - row_units * count);
        let mut with_commas = OutputBudget(MAX_PROJECTION_OUTPUT_UTF16 - row_units * count);
        for i in 0..count {
            admit_row(&mut without_commas, &row, false).unwrap();
            admit_row(&mut with_commas, &row, i > 0).unwrap();
        }
        assert_eq!(without_commas.0, MAX_PROJECTION_OUTPUT_UTF16);
        assert!(check_output_budget(&without_commas).is_ok());
        assert_eq!(with_commas.0, MAX_PROJECTION_OUTPUT_UTF16 + count - 1);
        assert_eq!(
            check_output_budget(&with_commas)
                .unwrap_err()
                .code
                .as_deref(),
            Some("LIMIT")
        );
    }

    #[test]
    fn late_malformed_observation_precedes_output_limit_error() {
        // Every valid observation repeats the large concept_json string in
        // its projected row. The prefix exceeds 32 Mi UTF-16 units; a later
        // malformed observation must still win by predecessor validation order.
        let padding = "x".repeat(40_000);
        let mut raw = format!(
            "{{\"cik\":\"1\",\"facts\":{{\"t\":{{\"C\":{{\"label\":\"{padding}\",\"units\":{{\"USD\":["
        );
        for i in 0..900 {
            if i != 0 {
                raw.push(',');
            }
            raw.push_str("{\"val\":0}");
        }
        raw.push_str(",null]}}}}}");
        let error = project_sec_company_facts(&units(&raw), &units("probe")).unwrap_err();
        assert_eq!(error.name, "Error");
        assert_eq!(error.message, "Expected SEC object");
    }

    #[test]
    fn valid_over_limit_projection_returns_limit_after_validation() {
        let padding = "x".repeat(40_000);
        let mut raw = format!(
            "{{\"cik\":\"1\",\"facts\":{{\"t\":{{\"C\":{{\"label\":\"{padding}\",\"units\":{{\"USD\":["
        );
        for i in 0..900 {
            if i != 0 {
                raw.push(',');
            }
            raw.push_str("{\"val\":0}");
        }
        raw.push_str("]}}}}}");
        let error = project_sec_company_facts(&units(&raw), &units("probe")).unwrap_err();
        assert_eq!(error.name, "UmfError");
        assert_eq!(error.code.as_deref(), Some("LIMIT"));
        assert_eq!(error.path.as_deref(), Some(""));
        assert_eq!(error.message, "SEC projection output limit exceeded");
    }

    #[test]
    fn complete_projection_accepts_cap_minus_one_and_cap_then_refuses_cap_plus_one() {
        const COUNT: usize = 900;
        fn input_for(label_units: usize, extra_units: usize) -> Vec<u16> {
            let mut raw = format!(
                "{{\"cik\":\"1\",\"facts\":{{\"t\":{{\"C\":{{\"label\":\"{}\",\"units\":{{\"USD\":[",
                "x".repeat(label_units)
            );
            for i in 0..COUNT {
                if i > 0 {
                    raw.push(',');
                }
                if i + 1 == COUNT {
                    raw.push_str(&format!(
                        "{{\"val\":0,\"extra\":\"{}\"}}",
                        "y".repeat(extra_units)
                    ));
                } else {
                    raw.push_str("{\"val\":0}");
                }
            }
            raw.push_str("]}}}}}");
            raw.encode_utf16().collect()
        }
        let source = units("cap-boundary");
        let base = project_sec_company_facts(&input_for(0, 0), &source)
            .unwrap()
            .encode_utf16()
            .count();
        let label_units = (MAX_PROJECTION_OUTPUT_UTF16 - 1 - base) / COUNT;
        let remainder = MAX_PROJECTION_OUTPUT_UTF16 - 1 - base - COUNT * label_units;
        for (offset, expected) in [
            (0, MAX_PROJECTION_OUTPUT_UTF16 - 1),
            (1, MAX_PROJECTION_OUTPUT_UTF16),
        ] {
            let output =
                project_sec_company_facts(&input_for(label_units, remainder + offset), &source)
                    .unwrap();
            assert_eq!(output.encode_utf16().count(), expected);
        }
        let error =
            project_sec_company_facts(&input_for(label_units, remainder + 2), &source).unwrap_err();
        assert_eq!(error.code.as_deref(), Some("LIMIT"));
        assert_eq!(error.path.as_deref(), Some(""));
        assert_eq!(error.message, "SEC projection output limit exceeded");
    }

    #[test]
    fn ordered_serializer_enforces_cap_minus_one_cap_and_cap_plus_one() {
        let payload = "x".repeat(MAX_PROJECTION_OUTPUT_UTF16);
        let mut below = OrderedJsonWriter::new();
        below
            .raw(&payload[..MAX_PROJECTION_OUTPUT_UTF16 - 1])
            .unwrap();
        assert_eq!(below.units, MAX_PROJECTION_OUTPUT_UTF16 - 1);
        assert_eq!(
            below.finish().encode_utf16().count(),
            MAX_PROJECTION_OUTPUT_UTF16 - 1
        );

        let mut exact = OrderedJsonWriter::new();
        exact.raw(&payload).unwrap();
        assert_eq!(exact.units, MAX_PROJECTION_OUTPUT_UTF16);
        let text = exact.finish();
        assert_eq!(text.encode_utf16().count(), MAX_PROJECTION_OUTPUT_UTF16);

        let mut over = OrderedJsonWriter::new();
        over.raw(&payload).unwrap();
        let error = over.raw("x").unwrap_err();
        assert_eq!(error.name, "UmfError");
        assert_eq!(error.code.as_deref(), Some("LIMIT"));
        assert_eq!(error.path.as_deref(), Some(""));
        assert_eq!(error.message, "SEC projection output limit exceeded");
        assert_eq!(over.units, MAX_PROJECTION_OUTPUT_UTF16);
    }

    #[test]
    fn output_escaping_budget_counts_utf16_units_exactly() {
        assert_eq!(quoted_utf16_units(&Utf16::from("é")), 3);
        assert_eq!(quoted_utf16_units(&Utf16::new(vec![0xd800])), 8);
        assert_eq!(quoted_utf16_units(&Utf16::new(vec![0xd83d, 0xde00])), 4);
        assert_eq!(quoted_utf16_units(&Utf16::from("\n")), 4);
    }
}

#[cfg(test)]
mod differential_tests {
    use super::*;
    use serde_json::{json, Value as Json};
    use sha2::{Digest, Sha256};

    fn vector_file() -> Json {
        serde_json::from_str(include_str!(
            "../testdata/domain_pack_sec/predecessor-vectors.json"
        ))
        .unwrap()
    }
    fn input(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }
    fn compare_case(case: &Json, operation: &str) {
        let text = case["input"].as_str().unwrap();
        let source = case["sourceId"].as_str().unwrap();
        let actual = match operation {
            "submissions" => project_sec_submissions(&input(text), &input(source)),
            "companyFacts" => project_sec_company_facts(&input(text), &input(source)),
            _ => unreachable!(),
        };
        let expected = &case["expected"];
        match (actual, expected["ok"].as_bool().unwrap()) {
            (Ok(output), true) => assert_eq!(
                serde_json::from_str::<Json>(&output).unwrap(),
                expected["value"],
                "{}",
                case["id"]
            ),
            (Err(error), false) => {
                assert_eq!(
                    error.name,
                    expected["error"]["name"].as_str().unwrap(),
                    "{}",
                    case["id"]
                );
                assert_eq!(
                    error.message,
                    expected["error"]["message"].as_str().unwrap(),
                    "{}",
                    case["id"]
                );
            }
            (Ok(output), false) => panic!("{} unexpectedly succeeded: {output}", case["id"]),
            (Err(error), true) => panic!("{} unexpectedly refused: {}", case["id"], error.message),
        }
    }

    #[test]
    fn all_frozen_predecessor_vectors_match() {
        let vectors = vector_file();
        for case in vectors["submissions"].as_array().unwrap() {
            compare_case(case, "submissions");
        }
        for case in vectors["companyFacts"].as_array().unwrap() {
            compare_case(case, "companyFacts");
        }
    }

    fn admission_file() -> Json {
        serde_json::from_str(include_str!(
            "../testdata/domain_pack_sec/admission-vectors.json"
        ))
        .unwrap()
    }
    fn assert_engine_error(actual: Result<String, ProjectionError>, expected: &Json, label: &str) {
        let Err(error) = actual else {
            panic!("{label}: unexpectedly succeeded")
        };
        assert_eq!(
            error.name,
            expected["name"].as_str().unwrap(),
            "{label} name"
        );
        assert_eq!(
            error.code.as_deref(),
            expected["code"].as_str(),
            "{label} code"
        );
        assert_eq!(
            error.path.as_deref(),
            expected["path"].as_str(),
            "{label} path"
        );
        assert_eq!(
            error.message,
            expected["message"].as_str().unwrap(),
            "{label} message"
        );
    }

    #[test]
    fn captured_duplicate_and_malformed_admission_errors_match() {
        let cases = admission_file();
        for case in cases["malformed"].as_array().unwrap() {
            let raw = case["input"].as_str().unwrap();
            assert_engine_error(
                project_sec_submissions(&input(raw), &input("probe")),
                &case["submissions"]["error"],
                case["id"].as_str().unwrap(),
            );
            assert_engine_error(
                project_sec_company_facts(&input(raw), &input("probe")),
                &case["companyFacts"]["error"],
                case["id"].as_str().unwrap(),
            );
        }
    }

    #[test]
    fn parse_and_root_errors_precede_invalid_source_identity() {
        for operation in ["submissions", "companyFacts"] {
            let call = |raw: &str| match operation {
                "submissions" => project_sec_submissions(&input(raw), &[]),
                _ => project_sec_company_facts(&input(raw), &[]),
            };
            let malformed = call("{").unwrap_err();
            assert_eq!(malformed.name, "UmfError", "{operation} malformed JSON");
            assert_ne!(malformed.message, "Invalid SEC source identity");

            let non_object = call("[]").unwrap_err();
            assert_eq!(non_object.name, "Error", "{operation} root shape");
            assert_eq!(
                non_object.message, "Expected SEC object",
                "{operation} root shape"
            );
        }
    }

    #[test]
    fn isolated_surrogates_and_integer_key_order_match_wire_capture() {
        let cases = admission_file();
        for case in cases["surrogates"].as_array().unwrap() {
            let raw = case["input"].as_str().unwrap();
            let actual = if case["operation"] == "facts" {
                project_sec_company_facts(&input(raw), &input("probe"))
            } else {
                project_sec_submissions(&input(raw), &input("probe"))
            }
            .unwrap();
            assert_eq!(
                actual,
                case["result"]["wire"].as_str().unwrap(),
                "{}",
                case["id"]
            );
        }
        let raw_surrogate = &cases["rawSurrogate"];
        let units = raw_surrogate["inputUnits"]
            .as_array()
            .unwrap()
            .iter()
            .map(|u| u.as_u64().unwrap() as u16)
            .collect::<Vec<_>>();
        let actual = project_sec_submissions(&units, &input("probe")).unwrap();
        assert_eq!(actual, raw_surrogate["result"]["wire"].as_str().unwrap());
        let integer = &cases["integerKeys"];
        let actual: Json = serde_json::from_str(
            &project_sec_company_facts(&input(integer["input"].as_str().unwrap()), &input("probe"))
                .unwrap(),
        )
        .unwrap();
        let expected = serde_json::from_str::<Json>(
            serde_json::to_string(&integer["result"]["value"])
                .unwrap()
                .as_str(),
        )
        .unwrap();
        assert_eq!(actual, expected);
        let rows = actual.as_array().unwrap();
        assert_eq!(
            rows.iter()
                .map(|r| r["taxonomy"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec!["2", "10", "z"]
        );
    }

    #[test]
    fn text_value_and_depth_limits_match_typescript_boundaries() {
        let prefix = "{\"cik\":\"1\",\"facts\":{},\"padding\":\"";
        let suffix = "\"}";
        let prefix_units = prefix.encode_utf16().count();
        let suffix_units = suffix.encode_utf16().count();
        let exact_len = 4_000_000 - prefix_units - suffix_units;
        let exact = format!("{prefix}{}{suffix}", "x".repeat(exact_len));
        assert_eq!(exact.encode_utf16().count(), 4_000_000);
        let success = project_sec_company_facts(&input(&exact), &input("probe")).unwrap();
        assert_eq!(success, "[]");
        let over = format!("{exact} ");
        assert_eq!(over.encode_utf16().count(), 4_000_001);
        assert_engine_error(
            project_sec_company_facts(&input(&over), &input("probe")),
            &json!({"name":"UmfError","code":"LIMIT","path":"","message":"Native JSON exceeds text limit"}),
            "text-limit-plus-one",
        );

        for (observation_count, should_pass) in [(49_996, true), (49_997, false)] {
            let mut raw =
                String::from("{\"cik\":\"1\",\"facts\":{\"t\":{\"C\":{\"units\":{\"USD\":[");
            for i in 0..observation_count {
                if i > 0 {
                    raw.push(',');
                }
                raw.push_str("{\"val\":0}");
            }
            raw.push_str("]},\"unknown\":null}}}}");
            let got = project_sec_company_facts(&input(&raw), &input("probe"));
            if should_pass {
                assert_eq!(
                    serde_json::from_str::<Json>(&got.unwrap())
                        .unwrap()
                        .as_array()
                        .unwrap()
                        .len(),
                    observation_count
                );
            } else {
                assert_engine_error(
                    got,
                    &json!({"name":"UmfError","code":"LIMIT","path":"","message":"Native JSON structural limit exceeded"}),
                    "value-limit-plus-two",
                );
            }
        }
        for (array_depth, should_pass) in [(127, true), (128, false)] {
            let mut raw = String::from("{\"cik\":\"1\",\"facts\":{},\"padding\":");
            raw.push_str(&"[".repeat(array_depth));
            raw.push_str("null");
            raw.push_str(&"]".repeat(array_depth));
            raw.push('}');
            let got = project_sec_company_facts(&input(&raw), &input("probe"));
            if should_pass {
                assert_eq!(got.unwrap(), "[]");
            } else {
                assert_engine_error(
                    got,
                    &json!({"name":"UmfError","code":"LIMIT","path":"","message":"Native JSON structural limit exceeded"}),
                    "depth-limit-plus-one",
                );
            }
        }
    }

    #[test]
    fn independent_pinned_fixture_assertions_pass() {
        let sub_raw = include_str!("../../../spec/domain-packs/public-company-intelligence/sources/scoped-submissions-0000004962.json").as_bytes().to_vec();
        let facts_raw = include_str!("../../../spec/domain-packs/public-company-intelligence/sources/scoped-companyfacts-0000004962.json").as_bytes().to_vec();
        let sub_text = String::from_utf8(sub_raw.clone()).unwrap();
        let facts_text = String::from_utf8(facts_raw.clone()).unwrap();
        let sub_hash = format!("{:x}", Sha256::digest(&sub_raw));
        let facts_hash = format!("{:x}", Sha256::digest(&facts_raw));
        assert_eq!(
            sub_hash,
            "3fd08f1e186117f2bdbef85d8ec3be74f908414818332de92d92d5152cb8bd65"
        );
        assert_eq!(
            facts_hash,
            "ca5aae9506442a20cbe660225c7de4a85558ce9078196130368a33edc715e3bd"
        );
        let sub: Json = serde_json::from_slice(&sub_raw).unwrap();
        let facts: Json = serde_json::from_slice(&facts_raw).unwrap();
        let sub_result: Json = serde_json::from_str(
            &project_sec_submissions(&input(&sub_text), &input("pinned/submissions-4962")).unwrap(),
        )
        .unwrap();
        let facts_result: Json = serde_json::from_str(
            &project_sec_company_facts(&input(&facts_text), &input("pinned/facts-4962")).unwrap(),
        )
        .unwrap();
        assert_eq!(sub_result["companies"][0]["name"], sub["name"]);
        assert_eq!(
            sub_result["companies"][0]["id"],
            format!("{:0>10}", sub["cik"].as_str().unwrap())
        );
        assert_eq!(
            sub_result["filings"].as_array().unwrap().len(),
            sub["filings"]["recent"]["accessionNumber"]
                .as_array()
                .unwrap()
                .len()
        );
        let observation_count: usize = facts["facts"]
            .as_object()
            .unwrap()
            .values()
            .map(|concepts| {
                concepts
                    .as_object()
                    .unwrap()
                    .values()
                    .map(|definition| {
                        definition["units"]
                            .as_object()
                            .unwrap()
                            .values()
                            .map(|items| items.as_array().unwrap().len())
                            .sum::<usize>()
                    })
                    .sum::<usize>()
            })
            .sum();
        assert_eq!(observation_count, 144);
        assert_eq!(facts_result.as_array().unwrap().len(), observation_count);
        let pinned: Json = serde_json::from_str(include_str!(
            "../testdata/domain_pack_sec/pinned-fixture-assertions.json"
        ))
        .unwrap();
        assert!(pinned["assertions"]
            .as_array()
            .unwrap()
            .iter()
            .all(|a| a["pass"] == json!(true)));
    }
}
