import {test, expect} from "bun:test";
import {compose, corpus, identity, inspectValue, projectRead, queryUse, type ProjectInput} from "./model";

const base: ProjectInput = {subject: "Alice", subjectTrusted: true, factsComplete: true,
  owner: "A", grant: true, forbid: false,
  assignments: [{staff: "Alice", project: "A", active: true}, {staff: "Alice", project: "B", active: false}]};

test("qualified identities do not collapse labels @covers US-079-AC2", () => {
  expect(identity({documentId: "one", moduleId: "m", elementId: "Staff"})).not.toBe(
    identity({documentId: "two", moduleId: "m", elementId: "Staff"}));
  expect(identity({documentId: "a/b", moduleId: "c", elementId: "d"})).not.toBe(
    identity({documentId: "a", moduleId: "b/c", elementId: "d"}));
});
test("active assignment authorizes only owning Project @covers US-079-AC5", () => {
  expect(projectRead(base)).toBe("permit");
  expect(projectRead({...base, owner: "B"})).toBe("deny");
  expect(projectRead({...base, owner: null})).toBe("deny");
  expect(projectRead({...base, assignments: []})).toBe("deny");
});
test("mandatory restriction survives broad grant @covers US-079-AC4", () => {
  expect(projectRead({...base, owner: "B", grant: true})).toBe("deny");
  expect(projectRead({...base, forbid: true})).toBe("deny");
  expect(projectRead({...base, grant: false})).toBe("deny");
});
test("incomplete and untrusted facts refuse @covers US-079-AC6", () => {
  expect(projectRead({...base, factsComplete: false})).toBe("indeterminate");
  expect(projectRead({...base, subjectTrusted: false})).toBe("indeterminate");
  expect(projectRead({...base, subject: ""})).toBe("indeterminate");
  expect(projectRead({...base, assignments: [{staff: "Alice", project: "A", active: "true"}]})).toBe("indeterminate");
});
test("unknown condition cannot be omitted @covers US-079-AC6", () => {
  expect(compose([{effect: "permit", truth: "T"}, {effect: "forbid", truth: "U"}]).decision).toBe("indeterminate");
});
test("false permits impose no masks @covers US-079-AC7", () => {
  const result = compose([{effect: "permit", truth: "T", disclosure: {salary: {kind: "original"}}},
    {effect: "permit", truth: "F", disclosure: {salary: {kind: "withheld"}}}], ["salary"]);
  expect(result).toEqual({decision: "permit", disclosure: {salary: {kind: "original"}}});
});
test("protected field has no implicit original @covers US-079-AC7", () => {
  expect(compose([{effect: "permit", truth: "T"}], ["salary"]).decision).toBe("indeterminate");
});
test("withholding dominates and conflicting transforms refuse @covers US-079-AC7", () => {
  const original = {effect: "permit", truth: "T", disclosure: {salary: {kind: "original"}}} as const;
  const transformed = {effect: "permit", truth: "T", disclosure: {salary: {kind: "transformed", type: "string", value: "redacted"}}} as const;
  expect(compose([original, transformed], ["salary"]).disclosure.salary).toEqual(transformed.disclosure.salary);
  expect(compose([transformed, {effect: "permit", truth: "T", disclosure: {salary: {kind: "withheld"}}}], ["salary"]).disclosure.salary).toEqual({kind: "withheld"});
  expect(compose([transformed, {effect: "permit", truth: "T", disclosure: {salary: {kind: "transformed", type: "string", value: "other"}}}], ["salary"]).decision).toBe("conflict");
});
test("null absence and withholding remain distinct @covers US-079-AC7", () => {
  expect(inspectValue({note: null}, "note", {kind: "original"})).toEqual({disposition: "original", value: null});
  expect(inspectValue({}, "note", {kind: "original"})).toEqual({disposition: "absent"});
  expect(inspectValue({salary: 100}, "salary", {kind: "withheld"})).toEqual({disposition: "withheld"});
});
test("query use needs explicit authorization @covers US-079-AC8", () => {
  expect(queryUse({kind: "withheld"}, "disclosed", false)).toBe(false);
  expect(queryUse({kind: "original"}, "original-authorized", false)).toBe(false);
  expect(queryUse({kind: "original"}, "original-authorized", true)).toBe(true);
  expect(queryUse({kind: "original"}, "prohibited", true)).toBe(false);
});
test("removing assignment removes permission @covers US-057-AC3", () => {
  expect(projectRead({...base, assignments: [{staff: "Alice", project: "A", active: false}]})).toBe("deny");
});
test("finite exhaustive oracle agreement @covers US-079-AC4 @covers US-079-AC5", () => {
  expect(corpus()).toEqual({cases: 10368, mismatches: 0});
});

test("three permit masks are permutation invariant @covers US-079-AC7", () => {
  const rules = [
    {effect: "permit", truth: "T", disclosure: {salary: {kind: "transformed", type: "string", value: "a"}}},
    {effect: "permit", truth: "T", disclosure: {salary: {kind: "transformed", type: "string", value: "b"}}},
    {effect: "permit", truth: "T", disclosure: {salary: {kind: "withheld"}}}
  ] as const;
  for (const [a,b,c] of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    expect(compose([rules[a!]!,rules[b!]!,rules[c!]!], ["salary"])).toEqual({decision: "permit", disclosure: {salary: {kind: "withheld"}}});
  }
});

test("untyped Boolean inputs cannot grant @covers US-079-AC6", () => {
  expect(projectRead({...base, grant: "false"} as unknown as ProjectInput)).toBe("indeterminate");
  expect(projectRead({...base, forbid: undefined} as unknown as ProjectInput)).toBe("indeterminate");
});
