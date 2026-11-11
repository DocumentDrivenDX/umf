#!/usr/bin/env python3
"""Pure stage timeout arithmetic for one hosted job; never executes native work."""
import argparse
import json
import math
import os
from pathlib import Path
import time

# This is an earlier qualification deadline, not a larger runtime allowance.
# First step records the same host monotonic origin. 10 minutes of the existing
# 60-minute job cap remain for failed-stage upload/owned cleanup, not extra work.
WORK_SECONDS=3000
MAX_MINUTES={'producer':15,'compile':30,'install':3,'cost':7,'rust':5,'saga':3,'lanes':7}

def allowance(start,now,stage):
    if stage not in MAX_MINUTES or not all(type(v) in (int,float) and math.isfinite(v) for v in (start,now)) or start<0 or now<start:
        raise ValueError('Invalid stage clock/selection')
    remaining=WORK_SECONDS-(now-start)
    minutes=min(MAX_MINUTES[stage],math.floor(remaining/60))
    if minutes<1:raise ValueError('Qualification deadline exhausted; retain partial proofs without another stage')
    return {'stage':stage,'minutes':minutes,'elapsedSeconds':now-start,'workDeadlineSeconds':WORK_SECONDS,'jobCapMinutes':60,'extraWorkGranted':False}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--stage',choices=tuple(MAX_MINUTES),required=True);args=parser.parse_args()
    if os.environ.get('GITHUB_ACTIONS')!='true':raise ValueError('Only the selected hosted job may bind a stage')
    failure=None
    try:
        record=allowance(float(os.environ['INSPECTOR_JOB_MONOTONIC_START']),time.monotonic(),args.stage)
        record['status']='admitted'
    except ValueError as error:
        failure=error
        record={'stage':args.stage,'status':'refused','error':str(error),'workDeadlineSeconds':WORK_SECONDS,'jobCapMinutes':60,'extraWorkGranted':False}
    record.update(source=os.environ['EXPECTED_SOURCE'],run=os.environ['GITHUB_RUN_ID'],attempt=os.environ['GITHUB_RUN_ATTEMPT'])
    path=Path(os.environ['BATCH_OUT'])/('stage-budget-'+args.stage+'.json')
    with path.open('x') as output:json.dump(record,output,indent=2);output.write('\n')
    if failure is not None:raise failure
    with Path(os.environ['GITHUB_OUTPUT']).open('a') as output:output.write('minutes='+str(record['minutes'])+'\n')

if __name__=='__main__':main()
