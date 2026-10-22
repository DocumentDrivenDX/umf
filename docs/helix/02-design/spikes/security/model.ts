/** Bounded executable meaning spike; no public UMF API or native compiler. */
export type Truth = "T" | "F" | "U";
export type Decision = "permit" | "deny" | "indeterminate" | "conflict";
export type Ref = {documentId: string; moduleId: string; elementId: string};
export const identity = (ref: Ref): string => JSON.stringify([ref.documentId, ref.moduleId, ref.elementId]);
export type Disposition = {kind: "original"} | {kind: "withheld"} |
  {kind: "transformed"; type: "string" | "boolean"; value: string | boolean};
export type Rule = {effect: "permit" | "require" | "forbid"; truth: Truth;
  disclosure?: Record<string, Disposition>};
export type Result = {decision: Decision; disclosure: Record<string, Disposition>};

export function compose(rules: readonly Rule[], protectedFields: readonly string[] = []): Result {
  const refuse = (decision: Decision): Result => ({decision, disclosure: {}});
  if (rules.some(r => r.truth === "U")) return refuse("indeterminate");
  if (!rules.some(r => r.effect === "permit" && r.truth === "T") ||
      rules.some(r => r.effect === "require" && r.truth !== "T") ||
      rules.some(r => r.effect === "forbid" && r.truth === "T")) return refuse("deny");
  const disclosure: Record<string, Disposition> = Object.create(null);
  const fieldRules = new Map<string, Disposition[]>();
  for (const rule of rules) {
    if (rule.effect !== "permit" || rule.truth !== "T") continue;
    for (const [field, value] of Object.entries(rule.disclosure ?? {})) {
      const values = fieldRules.get(field) ?? [];
      values.push(value); fieldRules.set(field, values);
    }
  }
  for (const field of protectedFields) if (!fieldRules.has(field)) return refuse("indeterminate");
  for (const [field, values] of fieldRules) {
    if (values.some(v => v.kind === "withheld")) {disclosure[field] = {kind: "withheld"}; continue;}
    const transforms = values.filter(v => v.kind === "transformed");
    if (transforms.some(v => typeof v.value !== v.type)) return refuse("indeterminate");
    if (new Set(transforms.map(v => JSON.stringify([v.type, v.value]))).size > 1) return refuse("conflict");
    disclosure[field] = transforms[0] ?? {kind: "original"};
  }
  return {decision: "permit", disclosure};
}

export type ProjectInput = {
  subject: string; subjectTrusted: boolean; factsComplete: boolean;
  owner: string | null; grant: boolean; forbid: boolean;
  assignments: readonly {staff: string; project: string; active: unknown}[];
};
export function projectRead(input: ProjectInput): Decision {
  if (typeof input.grant !== "boolean" || typeof input.forbid !== "boolean" ||
      typeof input.subjectTrusted !== "boolean" || typeof input.factsComplete !== "boolean" ||
      typeof input.subject !== "string" || (input.owner !== null && typeof input.owner !== "string") ||
      !input.subjectTrusted || !input.factsComplete || !input.subject ||
      input.assignments.length > 10000 || input.assignments.some(a =>
        !a.staff || !a.project || typeof a.active !== "boolean")) return "indeterminate";
  const membership = input.owner !== null && input.assignments.some(a =>
    a.staff === input.subject && a.project === input.owner && a.active === true);
  return compose([{effect: "permit", truth: input.grant ? "T" : "F"},
    {effect: "require", truth: membership ? "T" : "F"},
    {effect: "forbid", truth: input.forbid ? "T" : "F"}]).decision;
}

export function inspectValue(bag: Record<string, unknown>, field: string,
                             disposition: Disposition): unknown {
  if (disposition.kind === "withheld") return {disposition: "withheld"};
  if (disposition.kind === "transformed") return {disposition: "transformed", value: disposition.value};
  return Object.hasOwn(bag, field) ? {disposition: "original", value: bag[field]} : {disposition: "absent"};
}

export function queryUse(disposition: Disposition, mode: "disclosed" | "original-authorized" | "prohibited",
                         originalPermission: boolean): boolean {
  return mode === "original-authorized" ? originalPermission :
    mode === "disclosed" && disposition.kind !== "withheld";
}

/** Exhaustive finite population, independently calculated matrix lookup oracle. */
export function corpus(): {cases: number; mismatches: number} {
  let cases = 0, mismatches = 0;
  for (let bits = 0; bits < 16; bits++) {
    const matrix = [[!!(bits & 1), !!(bits & 2)], [!!(bits & 4), !!(bits & 8)]];
    const assignments = matrix.flatMap((row, s) => row.map((active, p) =>
      ({staff: String(s), project: String(p), active})));
    for (let o0 = -1; o0 < 2; o0++) for (let o1 = -1; o1 < 2; o1++) for (let o2 = -1; o2 < 2; o2++) {
      for (let s = 0; s < 2; s++) for (const owner of [o0, o1, o2]) {
        for (const grant of [false, true]) for (const forbid of [false, true]) {
          const expected = grant && !forbid && owner >= 0 && matrix[s]![owner] ? "permit" : "deny";
          const observed = projectRead({subject: String(s), subjectTrusted: true, factsComplete: true,
            owner: owner < 0 ? null : String(owner), grant, forbid, assignments});
          cases++; if (observed !== expected) mismatches++;
        }
      }
    }
  }
  return {cases, mismatches};
}
