// SPDX-License-Identifier: MIT OR Apache-2.0
export interface ProjectionIssue {
  path: string;
  code: string;
  classification: 'representation-change' | 'not-enforced' | 'unsupported' | 'annotation-only';
  detail: string;
  retainedInSource: true;
}
