import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'bun:test';
import {AVRO_CANDIDATE_PROFILE, createAvroCandidateEditor} from '../index.js';

const fixture = JSON.parse(readFileSync(new URL('../../../../fixtures/avro/candidate-edits.json', import.meta.url), 'utf8'));

describe('opt-in Avro candidate editor', () => {
  test('keeps the source and replacement JSON text exact in a detached report', () => {
    const source = fixture.cases[3].result.source;
    const report = createAvroCandidateEditor().proposeNodeEdit(source, '/fields/2/default', '9223372036854775807');
    expect(AVRO_CANDIDATE_PROFILE).toBe('umf-r5-avro-candidate/0.1.0');
    expect(report.profile).toBe(AVRO_CANDIDATE_PROFILE);
    expect(report.status).toBe('candidate');
    expect(report.source).toEqual(source);
    expect(report.document).not.toBe(source);
    expect(report.edit.replacement).toEqual({kind: 'number', value: '9223372036854775807'});
    expect(report.admission).toMatchObject({source: {valid: true}, candidate: {valid: true}});
    expect(report).not.toHaveProperty('validation');
  }, 60_000);

  test('selects a dependency by artifact ID and separates inspection errors', () => {
    const source = fixture.cases[4].result.source;
    const report = createAvroCandidateEditor().proposeNodeEdit(source, '/scale', '3', 'money.avsc');
    expect(report.edit.dependencyId).toBe('money.avsc');
    expect(report.nativeInspection).toHaveProperty('source');
    expect(report.nativeInspection).toHaveProperty('candidate');
    expect(report.admission.candidate.valid).toBe(true);
  }, 60_000);

  test('forwards host work controls and refuses malformed target before replacement parsing', () => {
    const source = fixture.cases[3].result.source;
    let charged = 0;
    const editor = createAvroCandidateEditor({controls: {meter(amount) { charged += amount; }}});
    expect(editor.proposeNodeEdit(source, '/fields/2/default', '1').status).toBe('candidate');
    expect(charged).toBeGreaterThan(0);
    const controlled = createAvroCandidateEditor({controls: {maxWork: 0}});
    expect(() => controlled.proposeNodeEdit(source, '/fields/2/default', '1')).toThrow(/Host work budget exceeded/);
    expect(() => editor.proposeNodeEdit(source, '/missing', 'not-json')).toThrow();
  }, 60_000);
});
