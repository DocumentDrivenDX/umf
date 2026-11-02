// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {getDashboardDefinition,inspectDashboard,readDashboardDocument,writeDashboardDocument} from '../../src/index-node-v4';
import type {Document} from '../../src/model/types';

const source=await Bun.file('fixtures/dashboard/marketing-campaign.json').text();

test('Dashboard V4 routes document read, inspection, and selected definition access through Rust',()=>{
 const document=readDashboardDocument(source,'json');
 expect(inspectDashboard(document).valid).toBe(true);
 expect(inspectDashboard(document).diagnostics.some(item=>item.code==='DASHBOARD_EXPRESSION_OPAQUE')).toBe(true);
 const roundtrip=readDashboardDocument(writeDashboardDocument(document,'json'),'json');
 expect(roundtrip).toEqual(document);
 const selected=getDashboardDefinition(document,'filters','filter-channel') as {kind:string;targets:unknown[]};
 expect(selected.kind).toBe('filter');
 expect(selected.targets).toHaveLength(2);
});

test('Dashboard V4 refuses an invalid page order before writing',()=>{
 const document=readDashboardDocument(source,'json') as Document;
 const dashboard=document.extensions!['umf.dashboard'] as {pages:string[]};
 dashboard.pages.pop();
 expect(inspectDashboard(document).valid).toBe(false);
 expect(()=>writeDashboardDocument(document,'json')).toThrow();
});
