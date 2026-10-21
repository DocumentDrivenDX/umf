# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compare installed/embedded Python row_scope output to the TS corpus oracle."""
import argparse
import json
from pathlib import Path
from umf_codegen import normalize_row_scope

parser=argparse.ArgumentParser()
parser.add_argument('--corpus',type=Path,required=True)
args=parser.parse_args()
corpus=json.loads(args.corpus.read_text())
for case in corpus:
    actual=normalize_row_scope(case['input'],context=case['context'])
    if actual!=case['expected']:
        raise AssertionError({'case':case['id'],'expected':case['expected'],'actual':actual})
print(json.dumps({'status':'passed','cases':len(corpus),'ids':[case['id'] for case in corpus]}))
