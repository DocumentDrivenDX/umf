// SPDX-License-Identifier: MIT OR Apache-2.0
/** Compare observed native effects and coordinator history with independent static expectations. */
export interface ExpectedProviderFact {
  ticket: string;
  status: string;
  provider?: string;
  tenant?: string;
  storeEpoch?: string;
  actionRevision?: string;
  originalTicket?: string;
  key?: string;
  gatewayClosed?: boolean;
  attemptsTerminal?: boolean;
  attemptCount?: number;
  outcomeCount?: number;
  entity?: { key: string; status: string };
  /** Definitive whole-ticket noncommit with no tx/1 terminal business outcome. */
  noEffect?: boolean;
  firstCause?: string;
  /** The expected provider ticket must remain visible in coordinator pending history. */
  pending?: boolean;
}

export interface ProviderObservation {
  ticket: string;
  status: string;
  provider?: string;
  tenant?: string;
  storeEpoch?: string;
  actionRevision?: string;
  originalTicket?: string;
  key?: string;
  gatewayClosed?: boolean;
  attemptsTerminal?: boolean;
  attemptCount?: number;
  outcomeCount?: number;
  entityStatus?: string;
  entityKey?: string;
  finalDisposition?: unknown;
  custodyMismatch?: string;
  firstCause?: string;
  source: 'native-action-outcome' | 'native-provider-ticket' | 'coordinator-only';
}

export interface HistoryObservation {
  ticket: string;
  status: string;
  pending?: boolean;
  firstCause?: string;
}

export interface HistoryCheck {
  ticket: string;
  passed: boolean;
  checks: string[];
  failures: string[];
}

export function verifyIndependentHistory(
  expected: ExpectedProviderFact[],
  history: HistoryObservation[],
  providers: ProviderObservation[],
) {
  const expectedTicketCounts = new Map<string, number>();
  for (const fact of expected) expectedTicketCounts.set(fact.ticket, (expectedTicketCounts.get(fact.ticket) ?? 0) + 1);
  const expectedTickets = new Set(expected.map((fact) => fact.ticket));
  const checks: HistoryCheck[] = expected.map((fact) => {
    const failures: string[] = [];
    const passedChecks: string[] = [];
    const events = history.filter((item) => item.ticket === fact.ticket);
    const outcomes = providers.filter((item) => item.ticket === fact.ticket);

    if ((expectedTicketCounts.get(fact.ticket) ?? 0) !== 1) failures.push('duplicate expected provider ticket identity');

    if (events.length === 0) failures.push(fact.pending ? 'expected pending ticket is absent from history' : 'missing coordinator history event');
    else if (events.length !== 1) failures.push('duplicate coordinator history event');
    else {
      const event = events[0]!;
      if (event.status !== fact.status) failures.push('coordinator result status differs from fixture expectation');
      else passedChecks.push('coordinator result status matches fixture expectation');
      if (fact.pending && event.pending !== true) failures.push('expected pending ticket is not retained in coordinator history');
      if (fact.firstCause !== undefined && event.firstCause !== fact.firstCause) failures.push('coordinator first cause differs from fixture expectation');
      else if (fact.firstCause !== undefined) passedChecks.push('coordinator first cause matches fixture expectation');
    }

    if (outcomes.length === 0) failures.push('no independently queried native provider fact');
    else if (outcomes.length !== 1) failures.push('duplicate native provider outcome or effect');
    else {
      const outcome = outcomes[0]!;
      if (outcome.custodyMismatch) failures.push(outcome.custodyMismatch);
      for (const field of ['provider','tenant','storeEpoch','actionRevision','originalTicket','key'] as const) {
        if (fact[field] !== undefined && outcome[field] !== fact[field]) failures.push(`native provider ${field} differs from fixture expectation`);
      }
      if (fact.pending && outcome.source === 'native-provider-ticket') {
        if (outcome.status !== 'pending') failures.push('provider ticket is not independently pending');
        if (outcome.gatewayClosed !== false) failures.push('pending provider ticket was reported closed');
        if (outcome.attemptsTerminal !== false) failures.push('pending provider attempt was reported terminal');
        if (outcome.outcomeCount !== 0) failures.push('pending provider ticket has an unexpected native outcome');
        else passedChecks.push('native provider custody confirms pending with no effect outcome');
      } else if (fact.noEffect) {
        if (outcome.source !== 'native-provider-ticket') failures.push('definitive noncommit lacks independent gateway custody');
        if (outcome.status !== fact.status) failures.push('provider final disposition differs from fixture expectation');
        if (outcome.gatewayClosed !== true) failures.push('whole provider ticket is not durably closed');
        if (outcome.attemptsTerminal !== true) failures.push('provider still has a nonterminal native attempt');
        if (!Number.isInteger(outcome.attemptCount) || outcome.attemptCount!<0) failures.push('provider native attempt roster was not independently counted');
        if (fact.attemptCount !== undefined && outcome.attemptCount !== fact.attemptCount) failures.push('native attempt cardinality differs from fixture expectation');
        if (outcome.outcomeCount !== 0) failures.push('native business outcome exists for expected noncommit');
        if (fact.entity && (outcome.entityStatus !== fact.entity.status || outcome.entityKey !== fact.entity.key)) failures.push('native entity changed despite expected noncommit');
        if (!outcome.finalDisposition || typeof outcome.finalDisposition !== 'object') failures.push('whole-ticket final disposition was not retained');
        else if ((outcome.finalDisposition as any).status !== fact.status) failures.push('whole-ticket final disposition contradicts expected noncommit');
        else passedChecks.push('closed provider ticket proves whole-invocation noncommit with zero business outcome');
      } else if (outcome.source !== 'native-action-outcome') failures.push('no independently queried native action outcome');
      else {
        if (outcome.status !== fact.status) failures.push('provider outcome differs from fixture expectation');
        else passedChecks.push('native action outcome matches fixture expectation');
        if (fact.gatewayClosed !== undefined && outcome.gatewayClosed !== fact.gatewayClosed) failures.push('provider gateway closure differs from fixture expectation');
        if (fact.attemptsTerminal !== undefined && outcome.attemptsTerminal !== fact.attemptsTerminal) failures.push('provider attempt finality differs from fixture expectation');
        if (fact.attemptCount !== undefined && outcome.attemptCount !== fact.attemptCount) failures.push('native attempt cardinality differs from fixture expectation');
        if (fact.outcomeCount !== undefined && outcome.outcomeCount !== fact.outcomeCount) failures.push('native outcome cardinality differs from fixture expectation');
        if (fact.entity && outcome.entityStatus !== fact.entity.status) failures.push('native entity state differs from fixture expectation');
        else if (fact.entity) passedChecks.push('native entity state matches fixture expectation');
        if (fact.entity && outcome.entityKey !== fact.entity.key) failures.push('native action resolved an unrelated entity');
        else if (fact.entity) passedChecks.push('native action resolved the expected entity');
        if (fact.firstCause !== undefined && outcome.firstCause !== fact.firstCause) failures.push('native provider first cause differs from fixture expectation');
      }
    }

    return { ticket: fact.ticket, passed: failures.length === 0, checks: passedChecks, failures };
  });

  for (const item of history) {
    if (!expectedTickets.has(item.ticket)) checks.push({
      ticket: item.ticket,
      passed: false,
      checks: [],
      failures: ['unexpected coordinator history ticket'],
    });
  }
  for (const item of providers) {
    if (!expectedTickets.has(item.ticket)) checks.push({
      ticket: item.ticket,
      passed: false,
      checks: [],
      failures: ['unexpected native provider ticket or effect'],
    });
  }

  return {
    profile: 'umf.saga.native-history-oracle/1',
    cases: checks.length,
    passed: checks.filter((item) => item.passed).length,
    checks,
  };
}
