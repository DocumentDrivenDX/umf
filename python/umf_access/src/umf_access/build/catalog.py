"""Capture explicit trusted Python modules and publish deterministic stage-two files.

Only the build tool imports declarations and Weft. Runtime code contains inert
catalog artifacts and explicit model references; it never imports declarations.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import importlib.metadata
import inspect
import json
import keyword
import os
import re
import shutil
import sys
import tempfile
from dataclasses import replace
from pathlib import Path
from types import UnionType
from typing import Any, Union, cast, get_args, get_origin

from pydantic import MISSING, create_model

from ..capture import ProjectionRef, capture
from ..codec_support import make_projection_model
from ..dsl import FieldRef, Node, RecordRef, render_logical
from ..native_program import NativeProgram, program_json
from ..reviewed import ReadCompiler, ReviewedSQL
from ..types import RUNTIME_IDENTITY, ActionRef, StrictModel
from .commands import emit_command
from .search import emit_search

OWNED=("queries.py","_umf/catalog.json","_umf/catalog-manifest.json","_umf/privileges.json")

class CatalogBuildError(ValueError): pass

def _json(value: object) -> str:
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False)

def _sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()

def _read(path: Path) -> bytes:
    if path.is_symlink() or not path.is_file() or path.stat().st_size>33_554_432:
        raise CatalogBuildError("ordinary bounded source file required")
    return path.read_bytes()

def _type(annotation: object, package: str) -> str:
    from decimal import Decimal

    from ..types import Vector
    if annotation==Vector:return "Vector"
    from datetime import date, datetime
    if annotation in (str,int,bool,bytes,float): return annotation.__name__
    if annotation is type(None): return "None"
    if annotation is MISSING: return "MISSING"
    if annotation is Decimal: return "Decimal"
    if annotation in (date,datetime): raise CatalogBuildError("temporal catalog qualification held")
    origin=get_origin(annotation)
    if origin in (UnionType,Union):
        return " | ".join(_type(a,package) for a in get_args(annotation))
    if isinstance(annotation,type) and issubclass(annotation,StrictModel) and annotation.__module__ in (package+".keys",package+".models"):
        return annotation.__name__
    raise CatalogBuildError("unsupported catalog signature carrier")


def _without_missing(annotation: object) -> object:
    args=get_args(annotation)
    if not args or MISSING not in args: return annotation
    parts=[a for a in args if a is not MISSING]
    result=parts[0]
    for part in parts[1:]: result=result | part
    return result


def resolve_configuration(configuration: dict[str,Any], root: Path) -> tuple[dict[str,Any],dict[str,Any]]:
    """Resolve only explicitly named local files, before importing declarations.

    Compact inline configurations retain their experimental profile. The full
    profile additionally pins the installed compiler and original UMF sources.
    """
    root=root.resolve()
    compact={'package','modules','targets'}
    if set(configuration) not in (compact,compact|{'weft','umf'}):
        raise CatalogBuildError('unknown or missing catalog configuration member')
    resolved=json.loads(_json(configuration));provenance:dict[str,Any]={'configuration':configuration,'sources':[]}
    if 'weft' not in configuration:
        provenance['profile']='experimental-inline/0.1'
        return resolved,provenance
    pin=configuration['weft']
    if type(pin) is not dict or set(pin)!={'distribution','version'} or pin['distribution']!='weft-sql' or type(pin['version']) is not str:
        raise CatalogBuildError('explicit Weft distribution/version required')
    if importlib.metadata.version(pin['distribution'])!=pin['version']:
        raise CatalogBuildError('WEFT_BLOCKED: installed compiler version differs from configuration')
    provenance.update(profile='source-pinned/0.1',weft=pin)
    def source(descriptor: Any) -> bytes:
        if type(descriptor) is not dict or set(descriptor)!={'path','sha256'} or type(descriptor['path']) is not str:
            raise CatalogBuildError('explicit local path and SHA-256 source required')
        relative=Path(descriptor['path'])
        if relative.is_absolute() or '..' in relative.parts:raise CatalogBuildError('source must be inside the explicit build root')
        path=root/relative
        if any(p.is_symlink() for p in (path,*path.parents)) or not path.resolve().is_relative_to(root.resolve()):
            raise CatalogBuildError('source symlinks or root escape refused')
        data=_read(path)
        if _sha(data)!=descriptor['sha256']:raise CatalogBuildError('pinned source bytes differ')
        provenance['sources'].append(descriptor)
        return data
    umf=configuration['umf']
    if type(umf) is not dict or set(umf)!={'documents'} or type(umf['documents']) is not list or not 1<=len(umf['documents'])<=64:
        raise CatalogBuildError('explicit bounded UMF document inventory required')
    originals=[source(d).decode('utf-8') for d in umf['documents']]
    if len(set(originals))!=len(originals):raise CatalogBuildError('duplicate original document source')
    for target in resolved['targets']:
        if 'bindingSource' in target:
            if 'binding' in target:raise CatalogBuildError('duplicate binding source')
            target['binding']=program_json(source(target.pop('bindingSource')).decode('utf-8'))
        if target.get('binding',{}).get('modelJson') not in originals:
            raise CatalogBuildError('binding model must equal one complete original pinned document')
    return resolved,provenance


def compile_catalog(configuration: dict[str,Any], root: Path, compiler: ReadCompiler) -> dict[str,bytes]:
    configuration,configuration_provenance=resolve_configuration(configuration,root)
    package=configuration.get('package')
    if type(package) is not str or not re.fullmatch(r'[a-z][a-z0-9_]*',package) or keyword.iskeyword(package):
        raise CatalogBuildError("explicit generated package required")
    package_root=root/package
    manifest=json.loads(_read(package_root/'_umf/manifest.json'))
    if manifest['runtimeAbi']!={'distribution':RUNTIME_IDENTITY[0],'version':RUNTIME_IDENTITY[1],'abi':RUNTIME_IDENTITY[2]}:
        raise CatalogBuildError("CATALOG_STALE: stage-one runtime ABI differs")
    for item in manifest['inventory']:
        relative=Path(item['path'])
        if relative.is_absolute() or '..' in relative.parts or relative.parts[0]!=package:
            raise CatalogBuildError("unsafe stage-one inventory")
        if _sha(_read(root/relative))!=item['sha256']:
            raise CatalogBuildError("stage-one source drift")
    modules=configuration.get('modules');targets=configuration.get('targets')
    if not isinstance(modules,list) or not modules or len(set(modules))!=len(modules) or not isinstance(targets,list) or not targets:
        raise CatalogBuildError("explicit ordered declaration modules and targets required")
    if len(modules)>64 or len(targets)>32 or len({t['id'] for t in targets})!=len(targets):
        raise CatalogBuildError("catalog bound or duplicate target")
    sys.path.insert(0,str(root))
    generated=importlib.import_module(package)
    imported_digest=getattr(importlib.import_module(package+'.keys'),'BUNDLE_INPUT_DIGEST',None)
    if imported_digest!=manifest['inputDigest']:
        raise CatalogBuildError("CATALOG_STALE: mixed loaded generation")
    models: dict[str,Any]={v.__name__:v for v in vars(generated).values() if isinstance(v,type) and issubclass(v,StrictModel)}
    records={(m.objects.ref.module,m.objects.ref.element):m for m in models.values() if hasattr(m,'objects')}
    provenance=[];declarations=[];names=set()
    for name in modules:
        if type(name) is not str or not all(re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*',part) and not keyword.iskeyword(part) for part in name.split('.')):
            raise CatalogBuildError("explicit absolute Python module names required")
        module=importlib.import_module(name)
        source=Path(inspect.getfile(module)).resolve()
        provenance.append({'module':name,'path':str(source),'sha256':_sha(_read(source))})
        for symbol,function in vars(module).items():
            if callable(function) and getattr(function,'__module__',None)==name and getattr(function,'__umf_kind__',None) in ('query','command'):
                if symbol in names: raise CatalogBuildError("duplicate public catalog name")
                names.add(symbol);declarations.append((symbol,capture(function)))
    if (not declarations and not any(t.get('nativeActions') for t in targets)) or len(declarations)>1000: raise CatalogBuildError("bounded declarations required")
    lines=['# Generated stage-two catalog. Regenerate; do not edit.','from __future__ import annotations',
           'from datetime import timedelta','from decimal import Decimal',
           'from typing import ClassVar, cast, overload, TypeVar','from collections.abc import Awaitable, Generator, AsyncGenerator',
           'from pydantic import MISSING','from umf_access.types import StrictModel',
           'from umf_access.reviewed import CatalogRead','from umf_access.pages import ReadPage, ReadContinuation','from umf_access.dsl import Page, Continuation',
           'from umf_access.protocols import ReadTarget, AsyncReadTarget',
           'from umf_access.catalog import Argument, ReadPlan, ReadVariant, TargetPin, run_query, run_stream',
           'from umf_access.codec_support import make_projection_model','from .models import *','from .keys import *','']
    lines.extend(['from umf_access.commands import BulkTarget, CommandVariant, CommandPlan', 'from umf_access.native_program import NativeProgram', "_PlanT = TypeVar('_PlanT')", ''])
    lines.extend(['from umf_access.search_catalog import SearchPlan, SearchVariant, SearchEntry, SearchTarget, AsyncSearchTarget','from umf_access.dsl import SearchResult, Fusion','from umf_access.types import Vector',''])
    entries=[]
    native_programs=[]
    action_module=importlib.import_module(package+'.actions') if any(s['role']=='action-ref' for s in manifest['symbols']) else None
    action_refs=[a for a in vars(action_module).values() if isinstance(a,ActionRef)] if action_module else []
    action_requests={}
    for target in targets:
        if set(target)-{'id','kind','backendId','backendVersion','targetProfile','binding','platform','nativeActions','security','roleMappings','sessionPrincipal','maxItems','vectorBindings','snapshots'}:
            raise CatalogBuildError('unknown target configuration member')
        requests=target.get('nativeActions')
        if requests is None:
            requests=[]
            for reference in action_refs:
                if not all(key in target for key in ('security','roleMappings','sessionPrincipal')):
                    raise CatalogBuildError('WEFT_BLOCKED: selected actions require original target security, role mappings and principal profile')
                action_source=reference.source
                if action_source is None:raise CatalogBuildError('original selected action source required')
                requests.append({'version':'weft.native-action/0.1','target':{'postgresql':'postgresql18','lakebase':'lakebase18'}.get(target['kind']),'binding':target['binding'],'source':{'documentId':action_source.document_id,'coreVersion':action_source.core_version,'module':action_source.module,'action':action_source.action,'documentSha256':action_source.document_sha256,'actionPointer':action_source.action_pointer,'invocation':{'id':action_source.invocation_id,'version':action_source.invocation_version}},'security':target['security'],'roleMappings':target['roleMappings'],'sessionPrincipal':target['sessionPrincipal']})
        if {(r['source']['module'],r['source']['action']) for r in requests}!={(a.module,a.action) for a in action_refs} or len(requests)!=len(action_refs):
            raise CatalogBuildError('every selected action must compile once for each raw target')
        for action_request in requests:
            if action_request['binding']!=target['binding'] or action_request['target']!={'postgresql':'postgresql18','lakebase':'lakebase18'}.get(target['kind']):
                raise CatalogBuildError('native action target/binding differs')
            original=action_request['source']
            action_module=importlib.import_module(package+'.actions')
            selected_actions=[a for a in vars(action_module).values() if getattr(a,'source',None) is not None and a.source.document_sha256==original['documentSha256'] and a.module==original['module'] and a.action==original['action']]
            if len(selected_actions)!=1:raise CatalogBuildError('native action is outside selected stage-one generation')
            program=NativeProgram.build(compiler,action_request,bundle_input_digest=manifest['inputDigest'])
            native_programs.append((target['id'],program))
            action_requests[(target['id'],original['module'],original['action'])]=action_request
            entries.append({'name':original['action'],'kind':'native-action','targetId':target['id'],'artifact':json.loads(program.original_json),'bundleInputDigest':manifest['inputDigest']})
    if native_programs:
        lines.append('from umf_access.native_program import NativeProgram')
        lines.append('from .actions import *')
        lines.append('NATIVE_ACTION_PROGRAMS = ('+', '.join('('+repr(target_id)+', NativeProgram('+repr(program.original_json)+', '+repr(program.statements_json)+', '+repr(program.bundle_input_digest)+'))' for target_id,program in native_programs)+',)')
    for number,(name,declaration) in enumerate(declarations):
        if declaration.kind=='command':
            command_ref=cast(RecordRef,declaration.variants[0].node.args[0])
            command_record=records[(command_ref.module,command_ref.element)]
            command_lines,command_entries=emit_command(compiler,declaration,command_record,targets,action_requests,action_refs,manifest,number,name,package,_type)
            lines.extend(command_lines);entries.extend(command_entries)
            continue
        first=declaration.variants[0];node=first.node;terminal=node.op;steps=cast(tuple[Node,...],node.args[1])
        record_ref=cast(RecordRef,node.args[0]);record=records[(record_ref.module,record_ref.element)]
        projection=next((cast(ProjectionRef,s.args[0]) for s in steps if s.op=='into'),None)
        selected=cast(tuple[FieldRef,...] | None,next((s.args for s in steps if s.op=='select'),None))
        cursor_name=str(cast(Node,node.args[3]).args[0]) if terminal=='page' else None
        cursor_key=None
        if cursor_name:
            cursor_parameter=next(p for p in declaration.parameters if p.name==cursor_name)
            cursor_key=next(a for a in get_args(cursor_parameter.carrier) if isinstance(a,type) and issubclass(a,StrictModel))
        cursor_key_name=cursor_key.__name__ if cursor_key is not None else "object"
        key_components: tuple[tuple[str,int],...]=()
        tuple_names: tuple[str,...]=()
        nullable_fields: tuple[str,...]=()
        if projection is not None:
            result=models[projection.name];result_expr=result.__name__;return_type=result.__name__
            projection_fields=projection.fields;projection_names=projection.names
        elif terminal=='count':
            result=create_model('_Count',__base__=StrictModel,count=(int,...));result_expr=f'_Q{number}Result';return_type='int';projection_fields=();projection_names=()
            lines.extend([f'class {result_expr}(StrictModel):','    count: int',''])
        else:
            refs=selected if selected is not None else tuple(getattr(record.c,n).ref for n in record.model_fields)
            if terminal=='exists': refs=record.objects.ref.key
            owner_fields=[]
            for ordinal,ref in enumerate(refs):
                owner=records[(ref.module,ref.element)]
                field=next(n for n in owner.model_fields if getattr(owner.c,n).ref==ref)
                alias=f'_col_{ordinal}' if selected is not None or terminal=='exists' else field
                owner_fields.append((alias,owner,field))
            if selected is None and terminal!='exists': result=record;result_expr=record.__name__;return_type=record.__name__
            else:
                # Field names must be public Pydantic identifiers; preserve tuple order independently.
                owner_fields=[(a.removeprefix('_'),o,f) for a,o,f in owner_fields]
                nullable_fields=tuple(a for a,o,_ in owner_fields if o is not record)
                result=make_projection_model(f'_Q{number}Result',tuple(owner_fields),nullable_fields=nullable_fields);result_expr=f'_Q{number}Result'
                args=', '.join(f'({a!r}, {o.__name__}, {f!r})' for a,o,f in owner_fields)
                lines.append(f'{result_expr} = make_projection_model({result_expr!r}, ({args},), nullable_fields={nullable_fields!r})')
                tuple_names=tuple(a for a,_,_ in owner_fields) if terminal!='exists' else ()
                return_type='tuple['+', '.join((_type(o.model_fields[f].annotation,package)+(' | None' if a in nullable_fields else '')) for a,o,f in owner_fields)+']' if terminal!='exists' else 'bool'
            projection_fields=tuple(refs);projection_names=tuple(a for a,_,_ in owner_fields)
        item_return_type=return_type
        if terminal in ('all','group_count'): return_type='list['+return_type+']'
        elif terminal=='first': return_type+=' | None'
        elif terminal=='page': return_type='Page['+return_type+', '+cursor_key_name+']'
        elif terminal=='search_top':return_type='SearchResult['+return_type+']'
        argument_code=[];signature=[];argument_names=[]
        for parameter in declaration.parameters:
            annotation='Continuation['+cursor_key_name+'] | None' if parameter.name==cursor_name else _type(parameter.carrier,package)
            signature.append(f'{parameter.name}: {annotation}'+(' = MISSING' if parameter.optional else ''))
            argument_names.append(parameter.name)
            key=next((a for a in (get_args(parameter.carrier) or (parameter.carrier,)) if isinstance(a,type) and issubclass(a,StrictModel)),None)
            argument_code.append(f'Argument({parameter.name!r}, {annotation}, {parameter.optional!r}, {key.__name__ if key else "None"})')
        if terminal=='search_top':
            key_module=importlib.import_module(package+'.keys')
            key_models={n:v for n,v in vars(key_module).items() if isinstance(v,type) and issubclass(v,StrictModel) and hasattr(v,'KEY_IDENTITY')}
            search_lines,search_entries=emit_search(compiler,declaration,record,targets,manifest,number,name,result_expr,projection_fields,projection_names,tuple_names,signature,argument_code,argument_names,return_type,key_models)
            lines.extend(search_lines);entries.extend(search_entries)
            continue
        variants=[]
        for vi,variant in enumerate(declaration.variants):
            parameters: dict[str,Any]={};paths: list[tuple[str,str,str | None]]=[];parameter_lines: list[str]=[]
            for parameter in declaration.parameters:
                if parameter.name==cursor_name or parameter.optional and parameter.name not in variant.presence: continue
                carrier=_without_missing(parameter.carrier)
                if parameter.key_components:
                    key=next(a for a in (get_args(carrier) or (carrier,)) if isinstance(a,type) and issubclass(a,StrictModel))
                    for component in parameter.key_components:
                        flat=parameter.name+'__'+component
                        parameters[flat]=(key.model_fields[component].annotation,...);paths.append((flat,parameter.name,component));parameter_lines.append(f'    {flat}: {_type(key.model_fields[component].annotation,package)}')
                else:
                    parameters[parameter.name]=(carrier,...);paths.append((parameter.name,parameter.name,None));parameter_lines.append(f'    {parameter.name}: {_type(carrier,package)}')
            params_name=f'_Q{number}P{vi}'
            params=create_model(params_name,__base__=StrictModel,**parameters)
            type.__setattr__(params,'UMF_BUNDLE_INPUT_DIGEST',manifest['inputDigest'])
            type.__setattr__(params,'UMF_RUNTIME_ABI',RUNTIME_IDENTITY)
            lines.extend([f'class {params_name}(StrictModel):',*(parameter_lines or ['    pass']),f'    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = {manifest["inputDigest"]!r}',f'    UMF_RUNTIME_ABI: ClassVar[tuple[str,str,str]] = {RUNTIME_IDENTITY!r}',''])
            # Every variant carries identical projections; only explicit presence changes predicates.
            current=variant
            if projection is None and terminal!='count':
                current=replace(variant,node=Node(node.op,(variant.node.args[0],tuple(s for s in cast(tuple[Node,...],variant.node.args[1]) if s.op!='select')+(Node('into',(ProjectionRef(package+'.models',result.__name__,projection_fields,projection_names),)),),*variant.node.args[2:])))
            for target in targets:
                kind=target['kind'];profile={'postgresql':'postgresql18','lakebase':'lakebase18','spark-delta':'spark-delta4'}.get(kind)
                if profile is None: raise CatalogBuildError('WEFT_BLOCKED: target has no admitted read compiler')
                binding=target['binding'];logical=render_logical(current,binding=binding)
                if terminal=='count': logical=logical.replace('SELECT COUNT(*) FROM','SELECT COUNT(*) AS "count" FROM',1)
                compiled=ReviewedSQL(logical,params,result,1000,keyset=terminal=='page').build(compiler,target=profile,binding=binding,snapshots=target.get('snapshots'))
                context=_json({'inputDigest':manifest['inputDigest'],'entryName':name,'presence':variant.presence,'targetId':target['id'],'configurationSha256':_sha(_json(configuration).encode())})
                compiled=replace(compiled,context_json=context)
                if cursor_key is not None:
                    ordering=json.loads(compiled.artifact_json).get('cursorOrdering')
                    if not isinstance(ordering,list): raise CatalogBuildError('WEFT_BLOCKED: complete ordering provenance required')
                    components=[]
                    for key_field in cursor_key.model_fields:
                        logical=getattr(record.c,key_field).ref.logical_name
                        matches=[i for i,item in enumerate(ordering) if item['table']==[record.objects.ref.logical_namespace,record.objects.ref.logical_name] and item['field']==logical]
                        if len(matches)!=1: raise CatalogBuildError('WEFT_BLOCKED: exact selected Key absent from ordering')
                        components.append((key_field,matches[0]))
                    key_components=tuple(components)
                digest=_sha(_json(binding).encode());platform=tuple((p['name'],tuple(str(v) for v in p['versions'])) for p in target['platform'])
                pin=(kind,target['backendId'],target['backendVersion'],target['targetProfile'],digest,platform)
                variants.append(f'ReadVariant({variant.presence!r}, TargetPin{pin!r}, CatalogRead({compiled.artifact_json!r}, {params_name}, {result_expr}, {context!r}), {tuple(paths)!r})')
                entries.append({'name':name,'kind':'query','targetId':target['id'],'presence':variant.presence,'artifact':json.loads(compiled.artifact_json),'pin':pin,'parameters':paths})
        plan=f'_Q{number}'
        argument_tuple='('+', '.join(argument_code)+(',' if argument_code else '')+')'
        lines.extend([f'{plan} = ReadPlan({name!r}, {terminal!r}, {argument_tuple}, ({", ".join(variants)},), {tuple_names!r}, {cursor_name!r}, {cursor_key.__name__ if cursor_key else "None"}, {key_components!r})',''])
        arguments='{'+', '.join(repr(n)+': '+n for n in argument_names)+'}'
        # Required parameters precede optional parameters without changing declaration binding.
        ordered=[s for s in signature if ' = MISSING' not in s]+[s for s in signature if ' = MISSING' in s]
        tail=', *, '+', '.join(ordered+['timeout: timedelta | None = None'])
        for target_type,returned in [('ReadTarget',return_type),('AsyncReadTarget','Awaitable['+return_type+']')]:
            lines.extend(['@overload',f'def {name}(target: {target_type}{tail}) -> {returned}: ...'])
        combined=f'{return_type} | Awaitable[{return_type}]'
        lines.extend([f'def {name}(target: ReadTarget | AsyncReadTarget{tail}) -> {combined}:',f'    return cast({combined}, run_query({plan}, target, {arguments}, timeout=timeout))',''])
        if terminal=='page':
            item_type=item_return_type
            stream_tail=', *, '+', '.join(ordered+['max_rows: int','timeout: timedelta | None = None'])
            for target_type,returned in [('ReadTarget',f'Generator[{item_type},None,None]'),('AsyncReadTarget',f'AsyncGenerator[{item_type},None]')]:
                lines.extend(['@overload',f'def {name}_stream(target: {target_type}{stream_tail}) -> {returned}: ...'])
            lines.extend([f'def {name}_stream(target: ReadTarget | AsyncReadTarget{stream_tail}) -> Generator[{item_type},None,None] | AsyncGenerator[{item_type},None]:',f'    return cast(Generator[{item_type},None,None] | AsyncGenerator[{item_type},None], run_stream({plan},target,{arguments},max_rows=max_rows,timeout=timeout))',''])
    catalog={'contract':'umf-access-catalog/0.1','inputDigest':manifest['inputDigest'],'runtimeAbi':manifest['runtimeAbi'],'modules':provenance,'configuration':configuration,'buildProvenance':configuration_provenance,'entries':entries}
    outputs={'queries.py':('\n'.join(lines)+'\n').encode(),'_umf/catalog.json':(_json(catalog)+'\n').encode(),
             '_umf/privileges.json':(_json({'contract':'umf-access-privileges/0.1','targets':[{'id':t['id'],'entries':[{'name':e['name'],'kind':e['kind'],'referencedTables':e['artifact'].get('referencedTables'),'nativeObligations':e['artifact'].get('obligations')} for e in entries if e['targetId']==t['id']],'catalog':['pg_catalog shape/role/key observations']} for t in targets]})+'\n').encode()}
    stage={'contract':'umf-access-catalog/0.1','inputDigest':manifest['inputDigest'],'runtimeAbi':manifest['runtimeAbi'],'inventory':[{'path':name,'sha256':_sha(data)} for name,data in sorted(outputs.items())]}
    outputs['_umf/catalog-manifest.json']=(_json(stage)+'\n').encode()
    return outputs


def publish_catalog(root: Path, package: str, outputs: dict[str,bytes], *, check: bool = False) -> None:
    destination=root/package
    previous=destination/'_umf/catalog-manifest.json'
    if previous.exists():
        inventory=json.loads(_read(previous))['inventory']
        if any(item['path'] not in OWNED or _sha(_read(destination/item['path']))!=item['sha256'] for item in inventory):
            raise CatalogBuildError('catalog hand edit or unsafe inventory')
    elif any((destination/path).exists() for path in OWNED):
        raise CatalogBuildError('unowned existing catalog output')
    if check:
        if any(not (destination/name).is_file() or _read(destination/name)!=data for name,data in outputs.items()):
            raise CatalogBuildError('CATALOG_STALE: regenerated bytes differ')
        return
    if set(outputs)!=set(OWNED) or destination.is_symlink(): raise CatalogBuildError('exact owned stage-two paths required')
    for path in destination.rglob('*'):
        if path.is_symlink(): raise CatalogBuildError('package symlinks refuse publication')
    stage=Path(tempfile.mkdtemp(prefix='.umf-catalog-',dir=root));candidate=stage/package;backup=stage/'original'
    try:
        shutil.copytree(destination,candidate)
        for name,data in outputs.items():
            path=candidate/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
        os.replace(destination,backup)
        try: os.replace(candidate,destination)
        except BaseException:
            os.replace(backup,destination)
            raise
    finally: shutil.rmtree(stage)


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('operation',choices=['catalog']);parser.add_argument('--config',type=Path,required=True);parser.add_argument('--root',type=Path,default=Path.cwd());parser.add_argument('--check',action='store_true');args=parser.parse_args()
    try:
        weft=cast(ReadCompiler,importlib.import_module("weft"))
        root=args.root.resolve();config=program_json(_read(args.config).decode('utf-8'));outputs=compile_catalog(config,root,weft);publish_catalog(root,config['package'],outputs,check=args.check)
        print(_json({'status':'pass','files':list(OWNED)}));return 0
    except (ValueError,KeyError,TypeError) as error:
        print(_json({'status':'refused','reason':str(error)}),file=sys.stderr);return 1

if __name__=='__main__':raise SystemExit(main())
