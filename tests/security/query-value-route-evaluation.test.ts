import {test,expect} from 'bun:test';
import {runQueryValueRouteEvaluationCorpus} from './query-value-route-evaluation-corpus';
test('original rule truth activates conditional source routes without caller guards or permission',()=>{for(const c of runQueryValueRouteEvaluationCorpus().checks)expect(c.observed,c.id).toEqual(c.expected);});
