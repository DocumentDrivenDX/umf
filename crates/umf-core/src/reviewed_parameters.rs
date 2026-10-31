//! Scanner for the legacy reviewed-read DB-API placeholder transport.
//!
//! This scans compiler-produced SQL only; it is not a SQL parser or lowering
//! implementation. CPython supplies code points and Unicode `isalnum`
//! decisions so spans and version-specific E-string behavior remain native.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    UnterminatedComment,
    UnterminatedQuote,
    UnterminatedDollarQuote,
    InvalidInput,
    Protocol,
    Allocation,
}

impl Error {
    pub fn python_code(self) -> Option<&'static str> {
        match self {
            Self::UnterminatedComment => Some("unterminated_comment"),
            Self::UnterminatedQuote => Some("unterminated_quote"),
            Self::UnterminatedDollarQuote => Some("unterminated_dollar_quote"),
            Self::InvalidInput | Self::Protocol | Self::Allocation => None,
        }
    }

    pub fn python_message(self) -> Option<&'static str> {
        match self {
            Self::UnterminatedComment => Some("unterminated compiler SQL comment"),
            Self::UnterminatedQuote => Some("unterminated compiler SQL quote"),
            Self::UnterminatedDollarQuote => Some("unterminated compiler SQL dollar quote"),
            Self::InvalidInput | Self::Protocol | Self::Allocation => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Event {
    NeedPythonIsAlnum {
        index: usize,
    },
    Placeholder {
        start: usize,
        end: usize,
        digits: String,
    },
    Done,
}

#[derive(Debug, Clone, Copy)]
struct PendingQuote {
    opening: usize,
    alnum_index: usize,
}

#[derive(Debug)]
pub struct Scanner {
    codepoints: Vec<u32>,
    state: State,
}

#[derive(Debug, Default)]
struct State {
    cursor: usize,
    pending_quote: Option<PendingQuote>,
}

impl Scanner {
    pub fn new(codepoints: Vec<u32>) -> Result<Self, Error> {
        if codepoints.iter().any(|cp| *cp > 0x10_FFFF) {
            return Err(Error::InvalidInput);
        }
        Ok(Self {
            codepoints,
            state: State::default(),
        })
    }

    /// Return one event. Python must convert placeholder digits before calling
    /// again, and answer an alnum request before scanning resumes.
    pub fn next(&mut self, python_isalnum: Option<bool>) -> Result<Event, Error> {
        self.state.next(&self.codepoints, python_isalnum)
    }
}

impl State {
    fn next(&mut self, codepoints: &[u32], python_isalnum: Option<bool>) -> Result<Event, Error> {
        if let Some(pending) = self.pending_quote.take() {
            let isalnum = python_isalnum.ok_or(Error::Protocol)?;
            let escaped = !isalnum && codepoints[pending.alnum_index] != b'_' as u32;
            self.cursor = pending.opening + 1;
            self.skip_quoted(codepoints, b'\'' as u32, escaped)?;
        } else if python_isalnum.is_some() {
            return Err(Error::Protocol);
        }

        while self.cursor < codepoints.len() {
            let i = self.cursor;
            let cp = codepoints[i];
            if cp == b'-' as u32 && at(codepoints, i + 1) == Some(b'-' as u32) {
                self.cursor = i + 2;
                while self.cursor < codepoints.len() && codepoints[self.cursor] != b'\n' as u32 {
                    self.cursor += 1;
                }
                if self.cursor < codepoints.len() {
                    self.cursor += 1;
                }
                continue;
            }
            if cp == b'/' as u32 && at(codepoints, i + 1) == Some(b'*' as u32) {
                self.skip_block_comment(codepoints)?;
                continue;
            }
            if cp == b'\'' as u32 || cp == b'"' as u32 {
                let e_quote = cp == b'\'' as u32
                    && i > 0
                    && matches!(codepoints[i - 1], x if x == b'E' as u32 || x == b'e' as u32);
                if e_quote {
                    if i < 2 {
                        self.cursor = i + 1;
                        self.skip_quoted(codepoints, cp, true)?;
                    } else {
                        let prior = i - 2;
                        if codepoints[prior] == b'_' as u32 {
                            self.cursor = i + 1;
                            self.skip_quoted(codepoints, cp, false)?;
                        } else {
                            self.pending_quote = Some(PendingQuote {
                                opening: i,
                                alnum_index: prior,
                            });
                            return Ok(Event::NeedPythonIsAlnum { index: prior });
                        }
                    }
                } else {
                    self.cursor = i + 1;
                    self.skip_quoted(codepoints, cp, false)?;
                }
                continue;
            }
            if cp == b'$' as u32 {
                if let Some(end) = dollar_delimiter_end(codepoints, i) {
                    let delimiter = &codepoints[i..end];
                    if let Some(close) = find_subslice(codepoints, end, delimiter) {
                        self.cursor = close + delimiter.len();
                    } else {
                        return Err(Error::UnterminatedDollarQuote);
                    }
                    continue;
                }
                if i + 1 < codepoints.len()
                    && (b'1' as u32..=b'9' as u32).contains(&codepoints[i + 1])
                {
                    let mut end = i + 2;
                    while end < codepoints.len()
                        && (b'0' as u32..=b'9' as u32).contains(&codepoints[end])
                    {
                        end += 1;
                    }
                    let digits = ordinal_digits(&codepoints[i + 1..end])?;
                    self.cursor = end;
                    return Ok(Event::Placeholder {
                        start: i,
                        end,
                        digits,
                    });
                }
            }
            self.cursor += 1;
        }
        Ok(Event::Done)
    }

    fn skip_block_comment(&mut self, cps: &[u32]) -> Result<(), Error> {
        let mut depth = 1usize;
        self.cursor += 2;
        while depth > 0 && self.cursor < cps.len() {
            if at(cps, self.cursor) == Some(b'/' as u32)
                && at(cps, self.cursor + 1) == Some(b'*' as u32)
            {
                depth += 1;
                self.cursor += 2;
            } else if at(cps, self.cursor) == Some(b'*' as u32)
                && at(cps, self.cursor + 1) == Some(b'/' as u32)
            {
                depth -= 1;
                self.cursor += 2;
            } else {
                self.cursor += 1;
            }
        }
        if depth > 0 {
            Err(Error::UnterminatedComment)
        } else {
            Ok(())
        }
    }

    fn skip_quoted(&mut self, cps: &[u32], quote: u32, escapes: bool) -> Result<(), Error> {
        while self.cursor < cps.len() {
            let cp = cps[self.cursor];
            if escapes && cp == b'\\' as u32 {
                self.cursor += 2;
            } else if cp == quote {
                if at(cps, self.cursor + 1) == Some(quote) {
                    self.cursor += 2;
                } else {
                    self.cursor += 1;
                    return Ok(());
                }
            } else {
                self.cursor += 1;
            }
        }
        Err(Error::UnterminatedQuote)
    }
}

fn ordinal_digits(codepoints: &[u32]) -> Result<String, Error> {
    let mut digits = String::new();
    reserve_ordinal_digits(&mut digits, codepoints.len())?;
    for cp in codepoints {
        digits.push(char::from_u32(*cp).ok_or(Error::InvalidInput)?);
    }
    Ok(digits)
}

fn reserve_ordinal_digits(digits: &mut String, additional: usize) -> Result<(), Error> {
    digits
        .try_reserve_exact(additional)
        .map_err(|_| Error::Allocation)
}

fn at(cps: &[u32], index: usize) -> Option<u32> {
    cps.get(index).copied()
}
fn alpha(cp: u32) -> bool {
    (b'A' as u32..=b'Z' as u32).contains(&cp) || (b'a' as u32..=b'z' as u32).contains(&cp)
}
fn digit(cp: u32) -> bool {
    (b'0' as u32..=b'9' as u32).contains(&cp)
}
fn dollar_delimiter_end(cps: &[u32], start: usize) -> Option<usize> {
    if at(cps, start) != Some(b'$' as u32) {
        return None;
    }
    let mut i = start + 1;
    if at(cps, i) == Some(b'$' as u32) {
        return Some(i + 1);
    }
    let first = at(cps, i)?;
    if !alpha(first) && first != b'_' as u32 {
        return None;
    }
    i += 1;
    while let Some(cp) = at(cps, i) {
        if alpha(cp) || digit(cp) || cp == b'_' as u32 {
            i += 1;
        } else {
            break;
        }
    }
    (at(cps, i) == Some(b'$' as u32)).then_some(i + 1)
}
fn find_subslice(haystack: &[u32], start: usize, needle: &[u32]) -> Option<usize> {
    if needle.is_empty() || start > haystack.len() {
        return None;
    }
    haystack[start..]
        .windows(needle.len())
        .position(|window| window == needle)
        .map(|offset| start + offset)
}

#[cfg(test)]
mod tests {
    use super::{Error, Event, Scanner, reserve_ordinal_digits};
    fn cps(s: &str) -> Vec<u32> {
        s.chars().map(u32::from).collect()
    }
    #[test]
    fn codepoint_spans_preserve_surrogate_elements() {
        for cps in [
            vec![0xD800u32, b'$' as u32, b'1' as u32],
            vec![0xD83Du32, 0xDE00u32, b'$' as u32, b'1' as u32],
        ] {
            let mut s = Scanner::new(cps.clone()).unwrap();
            let e = s.next(None).unwrap();
            assert_eq!(
                e,
                Event::Placeholder {
                    start: cps.len() - 2,
                    end: cps.len(),
                    digits: "1".into()
                }
            );
        }
    }
    #[test]
    fn asks_host_for_alnum_and_keeps_python_in_control() {
        let cps = cps("ᲉE'foo\\' $1'bar' $2 'tail'");
        let mut s = Scanner::new(cps.clone()).unwrap();
        assert_eq!(s.next(None).unwrap(), Event::NeedPythonIsAlnum { index: 0 });
        assert_eq!(
            s.next(Some(true)).unwrap(),
            Event::Placeholder {
                start: 9,
                end: 11,
                digits: "1".into()
            }
        );
        assert_eq!(
            s.next(None).unwrap(),
            Event::Placeholder {
                start: 17,
                end: 19,
                digits: "2".into()
            }
        );
        assert_eq!(s.next(None).unwrap(), Event::Done);
        let mut s = Scanner::new(cps).unwrap();
        assert_eq!(s.next(None).unwrap(), Event::NeedPythonIsAlnum { index: 0 });
        assert_eq!(s.next(Some(false)), Err(Error::UnterminatedQuote));
    }
    #[test]
    fn skips_comments_quotes_and_tagged_dollar_text() {
        let input = cps("$1 /* $2 /* $3 */ */ -- $4\n'$5''still quote' \"$6\" $tag$ $7 $tag$ $8");
        let mut scanner = Scanner::new(input).unwrap();
        assert_eq!(
            scanner.next(None).unwrap(),
            Event::Placeholder {
                start: 0,
                end: 2,
                digits: "1".into()
            }
        );
        assert_eq!(
            scanner.next(None).unwrap(),
            Event::Placeholder {
                start: 65,
                end: 67,
                digits: "8".into()
            }
        );
        assert_eq!(scanner.next(None).unwrap(), Event::Done);
    }
    #[test]
    fn lexical_refusals_match_predecessor_categories() {
        for (input, error) in [
            ("/* nested /*", Error::UnterminatedComment),
            ("'open", Error::UnterminatedQuote),
            ("$tag$open", Error::UnterminatedDollarQuote),
        ] {
            let mut scanner = Scanner::new(cps(input)).unwrap();
            assert_eq!(scanner.next(None), Err(error));
        }
    }
    #[test]
    fn returns_ordinal_digits_without_parsing_and_suspends_before_next_error() {
        let input = cps(&format!("${} 'open", "1".repeat(4_301)));
        let mut scanner = Scanner::new(input).unwrap();
        assert_eq!(
            scanner.next(None),
            Ok(Event::Placeholder {
                start: 0,
                end: 4_302,
                digits: "1".repeat(4_301),
            })
        );
        assert_eq!(scanner.next(None), Err(Error::UnterminatedQuote));
    }
    #[test]
    fn scanner_owns_immutable_input_and_validates_once() {
        let mut caller_buffer = cps("$1");
        let mut scanner = Scanner::new(caller_buffer.clone()).unwrap();
        caller_buffer[1] = b'9' as u32;
        assert_eq!(
            scanner.next(None).unwrap(),
            Event::Placeholder {
                start: 0,
                end: 2,
                digits: "1".into()
            }
        );
        assert!(matches!(
            Scanner::new(vec![0x11_0000]),
            Err(Error::InvalidInput)
        ));
    }
    #[test]
    fn ordinal_reservation_failure_has_allocation_error_category() {
        assert_eq!(
            reserve_ordinal_digits(&mut String::new(), usize::MAX),
            Err(Error::Allocation)
        );
    }
}
