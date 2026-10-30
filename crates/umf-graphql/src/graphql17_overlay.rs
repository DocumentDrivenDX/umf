//! Bounded lexical compatibility overlay for GraphQL.js 17 additions that
//! Apollo Compiler 1.33.1 does not model. It never interprets strings/comments.
use serde_json::{json, Value};

#[derive(Clone, Debug)]
pub struct Token {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub depth: usize,
    pub paren_depth: usize,
    pub bracket_depth: usize,
}
#[derive(Clone, Copy, Debug)]
pub enum OverlayKind {
    DirectiveExtension,
    DirectiveDefinitionApplications,
}
#[derive(Clone, Debug)]
pub struct Overlay {
    pub kind: OverlayKind,
    pub start: usize,
    pub end: usize,
    pub raw: String,
    pub anchor: usize,
    pub name: String,
}
#[derive(Clone, Debug)]
pub struct Scan {
    pub masked: String,
    pub overlays: Vec<Overlay>,
    pub tokens: Vec<Token>,
}

pub fn scan_and_mask(source: &str, max_tokens: usize) -> Result<Scan, String> {
    scan_and_mask_metered(source, max_tokens, 128)
}
pub fn scan_and_mask_with_limits(
    source: &str,
    max_tokens: usize,
    max_depth: usize,
) -> Result<Scan, String> {
    scan_and_mask_metered(source, max_tokens, max_depth)
}
fn scan_and_mask_metered(
    source: &str,
    max_tokens: usize,
    max_depth: usize,
) -> Result<Scan, String> {
    let tokens = lex(source, max_tokens, max_depth)?;
    let mut replacements = Vec::<(usize, usize, Overlay)>::new();
    let mut i = 0;
    while i < tokens.len() {
        if top_level(&tokens[i]) && seq(&tokens, i, &["extend", "directive", "@"]) {
            let start = i;
            let end = statement_end(&tokens, i, source.len());
            let at = tokens
                .get(i + 3)
                .ok_or("missing directive extension name")?;
            let overlay = Overlay {
                kind: OverlayKind::DirectiveExtension,
                start: tokens[start].start,
                end,
                raw: source[tokens[start].start..end].to_owned(),
                anchor: tokens[start].start,
                name: tokens[i + 3].text.clone(),
            };
            if at.text.is_empty() {
                return Err("invalid directive extension".into());
            }
            replacements.push((overlay.start, overlay.end, overlay));
            i = next_token(&tokens, end);
            continue;
        }
        if top_level(&tokens[i])
            && tokens[i].text == "directive"
            && tokens.get(i + 1).is_some_and(|t| t.text == "@")
        {
            let boundary = declaration_boundary(&tokens, i + 2);
            if let Some(on) =
                ((i + 2)..boundary).find(|&j| top_level(&tokens[j]) && tokens[j].text == "on")
            {
                if let Some(app) =
                    ((on + 1)..boundary).find(|&j| top_level(&tokens[j]) && tokens[j].text == "@")
                {
                    let end = directive_apps_end(&tokens, app, source.len());
                    let overlay = Overlay {
                        kind: OverlayKind::DirectiveDefinitionApplications,
                        start: tokens[app].start,
                        end,
                        raw: source[tokens[app].start..end].to_owned(),
                        anchor: tokens[i].start,
                        name: tokens[i + 2].text.clone(),
                    };
                    replacements.push((overlay.start, overlay.end, overlay));
                    i = next_token(&tokens, end);
                    continue;
                }
            }
        }
        i += 1;
    }
    let mut bytes = source.as_bytes().to_vec();
    let overlays = replacements.iter().map(|x| x.2.clone()).collect::<Vec<_>>();
    for (start, end, _) in replacements {
        for b in &mut bytes[start..end] {
            if *b != b'\n' && *b != b'\r' {
                *b = b' ';
            }
        }
    }
    let masked = String::from_utf8(bytes).map_err(|_| "masking changed UTF-8 validity")?;
    Ok(Scan {
        masked,
        overlays,
        tokens,
    })
}
fn top_level(t: &Token) -> bool {
    t.depth == 0 && t.paren_depth == 0 && t.bracket_depth == 0
}
fn seq(t: &[Token], i: usize, w: &[&str]) -> bool {
    w.iter()
        .enumerate()
        .all(|(n, s)| t.get(i + n).is_some_and(|x| x.text == *s))
}
fn next_token(t: &[Token], end: usize) -> usize {
    t.iter().position(|x| x.start >= end).unwrap_or(t.len())
}
fn statement_end(t: &[Token], i: usize, source_len: usize) -> usize {
    let mut j = i + 1;
    let mut parens = 0i32;
    while j < t.len() {
        let x = t[j].text.as_str();
        if top_level(&t[j]) && j > i + 1 && parens == 0 && top_start(t, j) {
            break;
        }
        if x == "(" {
            parens += 1
        } else if x == ")" {
            parens -= 1
        }
        j += 1;
    }
    if j < t.len() {
        t[j].start
    } else {
        source_len
    }
}
fn top_start(t: &[Token], i: usize) -> bool {
    if i > 0
        && matches!(
            t[i - 1].text.as_str(),
            "@" | "extend"
                | "schema"
                | "scalar"
                | "type"
                | "interface"
                | "union"
                | "enum"
                | "input"
                | "directive"
        )
    {
        return false;
    }
    matches!(
        t[i].text.as_str(),
        "schema"
            | "scalar"
            | "type"
            | "interface"
            | "union"
            | "enum"
            | "input"
            | "directive"
            | "extend"
    )
}
fn directive_apps_end(t: &[Token], i: usize, source_len: usize) -> usize {
    let mut j = i;
    let mut parens = 0i32;
    while j < t.len() {
        let x = t[j].text.as_str();
        if top_level(&t[j]) && j > i && parens == 0 && top_start(t, j) {
            break;
        }
        if x == "(" {
            parens += 1
        } else if x == ")" {
            parens -= 1
        }
        j += 1;
    }
    if j < t.len() {
        t[j].start
    } else {
        source_len
    }
}
fn lex(s: &str, limit: usize, max_depth: usize) -> Result<Vec<Token>, String> {
    let b = s.as_bytes();
    let mut i = 0;
    let mut out = Vec::new();
    let mut depth = 0usize;
    let mut parens = 0usize;
    let mut brackets = 0usize;
    while i < b.len() {
        if b[i].is_ascii_whitespace() || b[i] == b',' {
            i += 1;
            continue;
        }
        if b[i] == b'#' {
            while i < b.len() && b[i] != b'\n' && b[i] != b'\r' {
                i += 1
            }
            continue;
        }
        let start = i;
        if b[i] == b'"' {
            if s[i..].starts_with("\"\"\"") {
                i += 3;
                while i + 2 < b.len() {
                    if s[i..].starts_with("\\\"\"\"") {
                        i += 4;
                        continue;
                    }
                    if s[i..].starts_with("\"\"\"") {
                        break;
                    }
                    i += s[i..].chars().next().unwrap().len_utf8()
                }
                if i + 2 >= b.len() {
                    return Err("unterminated block string".into());
                }
                i += 3
            } else {
                i += 1;
                while i < b.len() {
                    if b[i] == b'\\' {
                        i += 1;
                        if i < b.len() {
                            i += s[i..].chars().next().unwrap().len_utf8()
                        }
                    } else if b[i] == b'"' {
                        i += 1;
                        break;
                    } else {
                        i += s[i..].chars().next().unwrap().len_utf8()
                    }
                }
            }
        } else if b[i].is_ascii_alphanumeric() || b[i] == b'_' || b[i] >= 128 {
            i += s[i..].chars().next().unwrap().len_utf8();
            while i < b.len() {
                let c = s[i..].chars().next().unwrap();
                if c.is_alphanumeric() || c == '_' {
                    i += c.len_utf8()
                } else {
                    break;
                }
            }
        } else {
            i += 1
        }
        let text = s[start..i].to_owned();
        if text == "}" {
            depth = depth.saturating_sub(1)
        }
        if text == ")" {
            parens = parens.saturating_sub(1)
        }
        if text == "]" {
            brackets = brackets.saturating_sub(1)
        }
        out.push(Token {
            text,
            start,
            end: i,
            depth,
            paren_depth: parens,
            bracket_depth: brackets,
        });
        if out.len() > limit {
            return Err("GraphQL token limit exceeded".into());
        }
        match out.last().unwrap().text.as_str() {
            "{" => depth += 1,
            "(" => parens += 1,
            "[" => brackets += 1,
            _ => {}
        }
        if depth.saturating_add(parens).saturating_add(brackets) > max_depth {
            return Err("GraphQL nesting depth limit exceeded".into());
        }
    }
    Ok(out)
}
fn declaration_boundary(tokens: &[Token], from: usize) -> usize {
    (from..tokens.len())
        .find(|&j| top_level(&tokens[j]) && top_start(tokens, j))
        .unwrap_or(tokens.len())
}

/// Reparse an overlay directive list in a synthetic scalar declaration using
/// Apollo's standard grammar, then return only its location-free Directive nodes.
pub fn parse_overlay_directives(raw: &str) -> Result<Vec<Value>, String> {
    let source = format!("scalar __UmfOverlay {raw}");
    let ast = crate::apollo_mapper::parse_sdl(&source)?;
    let defs = ast
        .get("definitions")
        .and_then(Value::as_array)
        .ok_or("overlay parse returned no definitions")?;
    Ok(defs
        .first()
        .and_then(|x| x.get("directives"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

pub fn directive_extension_node(raw: &str) -> Result<Value, String> {
    let mut i = 0;
    let b = raw.as_bytes();
    while i < b.len() && !b[i].is_ascii_whitespace() {
        i += 1
    }
    while i < b.len() && b[i].is_ascii_whitespace() {
        i += 1
    }
    if !raw[i..].starts_with("directive") {
        return Err("expected extend directive".into());
    }
    i += "directive".len();
    while i < b.len() && b[i].is_ascii_whitespace() {
        i += 1
    }
    if b.get(i) != Some(&b'@') {
        return Err("expected @ directive name".into());
    }
    i += 1;
    let start = i;
    while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'_') {
        i += 1
    }
    let name = &raw[start..i];
    let directives = parse_overlay_directives(&raw[i..])?;
    Ok(
        json!({"kind":"DirectiveExtension","name":{"kind":"Name","value":name},"directives":directives}),
    )
}

/// Parse the Apollo-compatible masked document, then reinsert extension nodes
/// and directive-definition applications in original declaration order.
pub fn parse_with_overlay(source: &str, max_tokens: usize) -> Result<(Value, Scan), String> {
    let scan = scan_and_mask(source, max_tokens)?;
    parse_scan(source, scan)
}
pub fn parse_with_overlay_limits(
    source: &str,
    max_tokens: usize,
    max_depth: usize,
) -> Result<(Value, Scan), String> {
    let scan = scan_and_mask_with_limits(source, max_tokens, max_depth)?;
    parse_scan(source, scan)
}
fn parse_scan(source: &str, scan: Scan) -> Result<(Value, Scan), String> {
    let mut doc = crate::apollo_mapper::parse_sdl(&scan.masked)?;
    let base = doc
        .get_mut("definitions")
        .and_then(Value::as_array_mut)
        .ok_or("parsed document has no definitions")?;
    let mut defs = std::mem::take(base);
    // Locate declaration starts from the unmasked lexical stream. Native
    // directive-definition applications anchor to their owning definition even
    // though their byte range occurs later in that declaration.
    let starts = declaration_starts(&scan.tokens);
    let mut merged = Vec::new();
    let mut base_index = 0usize;
    for pos in starts {
        if let Some(extension) = scan
            .overlays
            .iter()
            .find(|o| matches!(o.kind, OverlayKind::DirectiveExtension) && o.anchor == pos)
        {
            merged.push(directive_extension_node(&extension.raw)?);
            continue;
        }
        let masked_out = scan.overlays.iter().any(|o| {
            matches!(o.kind, OverlayKind::DirectiveExtension) && o.start <= pos && pos < o.end
        });
        if masked_out {
            continue;
        }
        if base_index < defs.len() {
            let mut node = defs[base_index].clone();
            base_index += 1;
            if let Some(app) = scan.overlays.iter().find(|o| {
                matches!(o.kind, OverlayKind::DirectiveDefinitionApplications) && o.anchor == pos
            }) {
                let ds = parse_overlay_directives(&app.raw)?;
                let obj = node
                    .as_object_mut()
                    .ok_or("definition AST node is not object")?;
                let existing = obj.entry("directives").or_insert_with(|| json!([]));
                existing
                    .as_array_mut()
                    .ok_or("directive list is not array")?
                    .extend(ds);
            }
            merged.push(node);
        }
    }
    if base_index != defs.len() {
        return Err("Could not align SDL declaration tokens with Apollo AST".into());
    }
    if merged.is_empty() {
        return Err("SDL document must contain at least one definition".into());
    }
    *doc.get_mut("definitions")
        .and_then(Value::as_array_mut)
        .unwrap() = merged;
    Ok((doc, scan))
}
fn declaration_starts(tokens: &[Token]) -> Vec<usize> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        if top_level(&tokens[i]) && top_start(tokens, i) {
            out.push(tokens[i].start);
            if tokens[i].text == "extend" {
                i += 2;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// Schema-mode interpretation starts with Apollo's complete standards-based
/// validation of the normalized SDL, then applies OneOf's GraphQL 2025 rules to
/// the retained authored AST. Fragment mode intentionally skips composition.
pub fn validate_profile(source: &str, ast: &Value, mode: &str) -> Vec<String> {
    validate_profile_with_limits(source, ast, mode, 1_000_000, 128)
}
pub fn validate_profile_with_limit(
    source: &str,
    ast: &Value,
    mode: &str,
    max_tokens: usize,
) -> Vec<String> {
    validate_profile_with_limits(source, ast, mode, max_tokens, 128)
}
pub fn validate_profile_with_limits(
    source: &str,
    ast: &Value,
    mode: &str,
    max_tokens: usize,
    max_depth: usize,
) -> Vec<String> {
    if mode == "fragment" {
        return Vec::new();
    }
    let normalized = match scan_and_mask_with_limits(source, max_tokens, max_depth) {
        Ok(x) => x.masked,
        Err(e) => return vec![e],
    };
    let mut errors = crate::apollo_mapper::validate_schema(&normalized)
        .err()
        .unwrap_or_default();
    if let Some(defs) = ast.get("definitions").and_then(Value::as_array) {
        for d in defs {
            if d.get("kind").and_then(Value::as_str) != Some("InputObjectTypeDefinition") {
                continue;
            }
            let one_of = d
                .get("directives")
                .and_then(Value::as_array)
                .is_some_and(|ds| {
                    ds.iter().any(|x| {
                        x.get("name")
                            .and_then(|n| n.get("value"))
                            .and_then(Value::as_str)
                            == Some("oneOf")
                    })
                });
            if !one_of {
                continue;
            }
            if let Some(fields) = d.get("fields").and_then(Value::as_array) {
                for f in fields {
                    let name = f
                        .get("name")
                        .and_then(|n| n.get("value"))
                        .and_then(Value::as_str)
                        .unwrap_or("<unknown>");
                    let non_null = f
                        .get("type")
                        .and_then(Value::get("kind"))
                        .and_then(Value::as_str)
                        == Some("NonNullType");
                    if non_null {
                        errors.push(format!("@oneOf input field {name} must be nullable"));
                    }
                    if !f.get("defaultValue").is_none() {
                        errors.push(format!(
                            "@oneOf input field {name} must not define a default value"
                        ));
                    }
                }
            }
        }
    }
    errors
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn directive_definition_apps_stop_before_following_type_definition() {
        let src = "directive @flag on FIELD_DEFINITION\ntype Query { x: String @flag }";
        let scan = scan_and_mask(src, 1000).unwrap();
        assert_eq!(scan.overlays.len(), 0);
        assert!(scan.masked.contains("type Query { x: String @flag }"));
        let (ast, _) = parse_with_overlay(src, 1000).unwrap();
        let defs = ast["definitions"].as_array().unwrap();
        assert_eq!(defs.len(), 2);
        assert_eq!(defs[1]["fields"][0]["directives"][0]["name"]["value"], "flag");
        let with_extension =
            "directive @flag on FIELD_DEFINITION @tag\ntype Query { x: String @flag }";
        let scan = scan_and_mask(with_extension, 1000).unwrap();
        assert_eq!(scan.overlays.len(), 1);
        assert_eq!(scan.overlays[0].raw, "@tag");
        assert!(scan.masked.contains("type Query { x: String @flag }"));
        let (ast, _) = parse_with_overlay(with_extension, 1000).unwrap();
        assert_eq!(
            ast["definitions"][0]["directives"][0]["name"]["value"],
            "tag"
        );
        assert_eq!(
            ast["definitions"][1]["fields"][0]["directives"][0]["name"]["value"],
            "flag"
        );
    }

    #[test]
    fn declaration_keywords_are_not_reclassified_inside_names() {
        let source = "type type { x: String }\ndirective @type on FIELD_DEFINITION\nextend directive @type @tag\ntype Query { y: String }";
        let (ast, scan) = parse_with_overlay(source, 1000).unwrap();
        assert_eq!(scan.overlays.len(), 1);
        assert_eq!(scan.overlays[0].raw, "extend directive @type @tag");
        let definitions = ast["definitions"].as_array().unwrap();
        assert_eq!(definitions.len(), 4);
        assert_eq!(definitions[0]["name"]["value"], "type");
        assert_eq!(definitions[1]["name"]["value"], "type");
        assert_eq!(definitions[2]["kind"], "DirectiveExtension");
        assert_eq!(definitions[2]["name"]["value"], "type");
        assert_eq!(definitions[3]["name"]["value"], "Query");
    }
}
