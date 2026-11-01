// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {lookupMedicalTerminology,projectCdcMortality,projectDicomMetadata,projectMedicalFhir} from '../../src/index-node-v4';

test('V4 Rust medical projections retain selected source views and exact terminology identity',()=>{
 const raw='{"resourceType":"Claim","id":"claim-1","status":"active","patient":{"reference":"Patient/p1"},"item":[{"sequence":1,"net":{"value":9007199254740993.0100,"currency":"USD"},"future":{"kept":true}}],"future":{"native":true}}';
 const fhir=projectMedicalFhir([{source_id:'source-1',text:raw}],'hospital');
 expect(fhir.resources?.[0]?.resource_json).toBe(raw);
 expect(fhir.claim_lines?.[0]?.net_amount).toBe('9007199254740993.0100');
 expect(fhir.claim_lines?.[0]?.line_json).toContain('"future":{"kept":true}');
 expect(fhir.resource_references?.[0]?.native_reference).toBe('Patient/p1');
 expect(()=>projectMedicalFhir([{source_id:'source-1',text:raw}],'bad::namespace')).toThrow('Invalid source namespace');

 const cdc=projectCdcMortality('[{"year":"2024","state":"AA","cause_name":"Example","_113_cause_name":"Example cause","deaths":"12","aadr":"1.2","future":"retained"}]','cdc-2024');
 expect(cdc[0]?.count).toBe('12');expect(cdc[0]?.population_denominator).toBeNull();expect(cdc[0]?.native_json).toContain('"future":"retained"');
 expect(()=>projectCdcMortality('[{"year":"2024"}]','cdc-2024')).toThrow('Expected nonempty native string');

 const dicom='{"0020000D":{"vr":"UI","Value":["2.25.1"]},"0020000E":{"vr":"UI","Value":["2.25.2"]},"00080018":{"vr":"UI","Value":["2.25.3"]},"00080016":{"vr":"UI","Value":["2.25.4"]},"00080060":{"vr":"CS","Value":["CT"]},"00111010":{"vr":"LO","Value":["private"]}}';
 const image=projectDicomMetadata(dicom,'dicom-1');
 expect(image.instances?.[0]?.study_uid).toBe('2.25.1');expect(image.attributes?.some(a=>a.tag==='00111010')).toBe(true);
 expect(()=>projectDicomMetadata(dicom.replace('"vr":"LO"','"vr":"lo"'),'dicom-1')).toThrow('Invalid DICOM VR spelling');

 const query={system:'urn:test',release:'2026',code:'A'};
 const terms=lookupMedicalTerminology(query,[{...query,display:'Alpha',future:{kept:true}},{system:'urn:test',release:'2025',code:'A'}]);
 expect(terms.status).toBe('matched');expect(terms.matches[0]?.future).toEqual({kept:true});
 expect(lookupMedicalTerminology(query).status).toBe('source-unavailable');
 expect(()=>lookupMedicalTerminology({...query,code:''},[])).toThrow('Exact terminology identity required');
});
