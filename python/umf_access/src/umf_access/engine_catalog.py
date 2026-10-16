"""Inert engine catalogs; native admission and compilation equality stay owned.

A valid wrapper conveys source/type custody only. It never grants read or action
permission, selects an engine connection, or interprets engine storage SQL.
"""
from __future__ import annotations
from dataclasses import dataclass
from collections.abc import Mapping
from typing import Any,TypeVar
import hashlib
from pydantic import BaseModel
from .reviewed import CatalogRead,ReadBuildError,_fields,_generation,_compatible_outputs
from .native_program import canonical_json,program_json,ProgramBuildError
P=TypeVar('P',bound=BaseModel);R=TypeVar('R',bound=BaseModel)
@dataclass(frozen=True)
class EngineRead(CatalogRead[P,R]):
    @classmethod
    def build(cls,compiler:Any,request:Mapping[str,Any],*,parameters:type[P],result:type[R],method:str)->EngineRead[P,R]:
        compile_method=getattr(compiler,'compile_engine_read_json',None)
        if not callable(compile_method):raise ReadBuildError('WEFT_BLOCKED: original engine catalog compiler required')
        original=compile_method(canonical_json({'version':'weft.engine-read/0.1','compiler':method,'request':dict(request)}))
        program=program_json(original)
        if program.get('status')!='compiled':raise ProgramBuildError(original)
        wrapper={'version':'umf.engine-catalog/0.1','programJson':original,'parameters':_fields(parameters),'outputs':_fields(result),'stageOne':_generation(parameters,result)}
        wrapper['catalogDigest']=hashlib.sha256(canonical_json(wrapper).encode()).hexdigest()
        entry=cls(canonical_json(wrapper),parameters,result);entry.artifact();return entry
    def originals(self)->str:
        self.artifact()
        return program_json(self.artifact_json)['programJson']
    def artifact(self)->dict[str,Any]:
        wrapper=program_json(self.artifact_json)
        if set(wrapper)!={'version','programJson','parameters','outputs','stageOne','catalogDigest'} or wrapper['version']!='umf.engine-catalog/0.1':raise ReadBuildError('closed engine catalog required')
        digest=wrapper.pop('catalogDigest')
        if digest!=hashlib.sha256(canonical_json(wrapper).encode()).hexdigest():raise ReadBuildError('engine catalog digest differs')
        if wrapper['stageOne']!=_generation(self.parameters,self.result):raise ReadBuildError('CATALOG_STALE: engine loaded generation differs')
        if wrapper['parameters']!=_fields(self.parameters) or wrapper['outputs']!=_fields(self.result):raise ReadBuildError('engine model signature differs')
        original=wrapper['programJson']
        if type(original)is not str or len(original.encode())>4_194_304:raise ReadBuildError('bounded original engine program required')
        program=program_json(original)
        if program.get('version')!='weft.engine-read/0.1' or program.get('status')!='compiled':raise ReadBuildError('original compiled engine program required')
        structural=dict(program);pin=structural.pop('structuralDigest',None)
        if pin!={'owner':'weft-runtime-engine-read','version':'0.1','sha256':hashlib.sha256(canonical_json(structural).encode()).hexdigest()}:raise ReadBuildError('original engine compiler digest differs')
        if not _compatible_outputs(program.get('outputs'),wrapper['outputs']):raise ReadBuildError('engine output types differ from generated view')
        declared={p['name']:p for p in wrapper['parameters']};native=program['request']['parameters']
        if set(declared)!=set(native) or any(native[n]['family']!=p['carrier'] or p['nullable'] for n,p in declared.items()):raise ReadBuildError('engine parameter signatures differ')
        return program
