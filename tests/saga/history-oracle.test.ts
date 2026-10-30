// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {verifyIndependentHistory, type ExpectedProviderFact, type HistoryObservation, type ProviderObservation} from './history-oracle';

const expected:ExpectedProviderFact[]=[
 {ticket:'reserve-ticket',status:'committed',provider:'provider-a',tenant:'tenant-a',storeEpoch:'epoch-a',actionRevision:'r1',originalTicket:'reserve-ticket',key:'provider-a:reserve:order-a',gatewayClosed:true,attemptsTerminal:true,outcomeCount:1,entity:{key:'order-a',status:'reserved'}},
 {ticket:'allocate-ticket',status:'rejected',provider:'provider-b',tenant:'tenant-a',storeEpoch:'epoch-b',actionRevision:'r2',originalTicket:'allocate-ticket',key:'provider-b:allocate:order-a',gatewayClosed:true,attemptsTerminal:true,outcomeCount:1,entity:{key:'order-a',status:'reserved'},firstCause:'ALLOCATION_REJECTED'},
 {ticket:'release-ticket',status:'committed',provider:'provider-a',tenant:'tenant-a',storeEpoch:'epoch-a',actionRevision:'r1',originalTicket:'release-ticket',key:'provider-a:release:order-a',gatewayClosed:true,attemptsTerminal:true,outcomeCount:1,entity:{key:'order-a',status:'released'}},
 {ticket:'pending-ticket',status:'pending',pending:true},
];
const history:HistoryObservation[]=[
 {ticket:'reserve-ticket',status:'committed'},
 {ticket:'allocate-ticket',status:'rejected',firstCause:'ALLOCATION_REJECTED'},
 {ticket:'release-ticket',status:'committed'},
 {ticket:'pending-ticket',status:'pending',pending:true},
];
const providers:ProviderObservation[]=[
 {ticket:'reserve-ticket',status:'committed',provider:'provider-a',tenant:'tenant-a',storeEpoch:'epoch-a',actionRevision:'r1',originalTicket:'reserve-ticket',key:'provider-a:reserve:order-a',gatewayClosed:true,attemptsTerminal:true,outcomeCount:1,entityKey:'order-a',entityStatus:'reserved',source:'native-action-outcome'},
 {ticket:'allocate-ticket',status:'rejected',provider:'provider-b',tenant:'tenant-a',storeEpoch:'epoch-b',actionRevision:'r2',originalTicket:'allocate-ticket',key:'provider-b:allocate:order-a',gatewayClosed:true,attemptsTerminal:true,outcomeCount:1,entityKey:'order-a',entityStatus:'reserved',firstCause:'ALLOCATION_REJECTED',source:'native-action-outcome'},
 {ticket:'release-ticket',status:'committed',provider:'provider-a',tenant:'tenant-a',storeEpoch:'epoch-a',actionRevision:'r1',originalTicket:'release-ticket',key:'provider-a:release:order-a',gatewayClosed:true,attemptsTerminal:true,outcomeCount:1,entityKey:'order-a',entityStatus:'released',source:'native-action-outcome'},
 {ticket:'pending-ticket',status:'pending',source:'native-action-outcome'},
];

test('independent history oracle accepts complete fixture-bound provider facts',()=>{
 const result=verifyIndependentHistory(expected,history,providers);
 expect(result.passed).toBe(4);expect(result.cases).toBe(4);
});

test('a coordinator self-report cannot replace a missing native provider commit',()=>{
 const withoutCommit=providers.filter(item=>item.ticket!=='reserve-ticket');
 const result=verifyIndependentHistory(expected,history,withoutCommit);
 expect(result.passed).toBe(3);
 expect(result.checks[0]!.failures).toContain('no independently queried native action outcome');
 const coordinatorOnly:ProviderObservation[]=[{ticket:'reserve-ticket',status:'committed',entityKey:'order-a',entityStatus:'reserved',source:'coordinator-only'}];
 expect(verifyIndependentHistory(expected.slice(0,1),history.slice(0,1),coordinatorOnly).checks[0]!.failures).toContain('no independently queried native action outcome');
});

test('the oracle rejects invented commits and duplicate effects',()=>{
 const invented=providers.map(item=>item.ticket==='allocate-ticket'?{...item,status:'committed'}:item);
 expect(verifyIndependentHistory(expected,history,invented).checks[1]!.failures).toContain('provider outcome differs from fixture expectation');
 const duplicate=[...providers,providers[0]!];
 expect(verifyIndependentHistory(expected,history,duplicate).checks[0]!.failures).toContain('duplicate native provider outcome or effect');
});

test('entity identity and the first failure cause are fixture-bound',()=>{
 const unrelated=providers.map(item=>item.ticket==='reserve-ticket'?{...item,entityKey:'other-order'}:item);
 expect(verifyIndependentHistory(expected,history,unrelated).checks[0]!.failures).toContain('native action resolved an unrelated entity');
 const changedCause=providers.map(item=>item.ticket==='allocate-ticket'?{...item,firstCause:'LATER_FAILURE'}:item);
 expect(verifyIndependentHistory(expected,history,changedCause).checks[1]!.failures).toContain('native provider first cause differs from fixture expectation');
});

test('provider, tenant, epoch, revision, exact key, ticket, and finality are independently bound',()=>{
 const wrongProvider=providers.map(item=>item.ticket==='reserve-ticket'?{...item,provider:'provider-other'}:item);
 expect(verifyIndependentHistory(expected,history,wrongProvider).checks[0]!.failures).toContain('native provider provider differs from fixture expectation');
 const wrongEpoch=providers.map(item=>item.ticket==='reserve-ticket'?{...item,storeEpoch:'new-epoch'}:item);
 expect(verifyIndependentHistory(expected,history,wrongEpoch).checks[0]!.failures).toContain('native provider storeEpoch differs from fixture expectation');
 const liveAttempt=providers.map(item=>item.ticket==='reserve-ticket'?{...item,attemptsTerminal:false}:item);
 expect(verifyIndependentHistory(expected,history,liveAttempt).checks[0]!.failures).toContain('provider attempt finality differs from fixture expectation');
});

test('pending tickets must remain represented and unexpected resolutions fail',()=>{
 const missingPending=history.filter(item=>item.ticket!=='pending-ticket');
 expect(verifyIndependentHistory(expected,missingPending,providers).checks[3]!.failures).toContain('expected pending ticket is absent from history');
 const notPending=history.map(item=>item.ticket==='pending-ticket'?{...item,pending:false}:item);
 expect(verifyIndependentHistory(expected,notPending,providers).checks[3]!.failures).toContain('expected pending ticket is not retained in coordinator history');
 const unrelated=[...providers,{ticket:'unrelated-ticket',status:'committed',source:'native-action-outcome' as const}];
 expect(verifyIndependentHistory(expected,history,unrelated).checks.at(-1)!.failures).toContain('unexpected native provider ticket or effect');
});
