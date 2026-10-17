"""Closed original relationship-Key output transport; no SQL or native discovery."""
from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from types import GenericAlias
from typing import cast

from pydantic import BaseModel

from .codec_support import validate_graph
from .dsl import RelatedKeys
from .types import CodecError, StrictModel

_INTEGER = re.compile(r"(?:0|-[1-9][0-9]*|[1-9][0-9]*)\Z")
_DECIMAL = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\Z")


def key_descriptor(key_model: type[StrictModel]) -> dict[str, object]:
    identity = getattr(key_model, "KEY_IDENTITY", None)
    source = getattr(key_model, "UMF_SOURCE", None)
    fields = getattr(key_model, "UMF_FIELDS", None)
    if not getattr(key_model, "UMF_KEY", False) or identity is None or source is None or type(fields) is not tuple or not fields:
        raise CodecError("original generated relationship Key required")
    if dict(identity) != {"documentId": source.document_id, "coreVersion": source.core_version, "module": identity["module"], "element": identity["element"], "key": identity["key"]}:
        raise CodecError("relationship Key source differs")
    if tuple(name for _, _, name in fields) != tuple(key_model.model_fields):
        raise CodecError("relationship Key component inventory differs")
    components = []
    for module, element, name in fields:
        annotation = key_model.model_fields[name].annotation
        carrier = next((name for typ, name in ((str,"string"),(int,"integer"),(Decimal,"decimal"),(bool,"boolean")) if annotation is typ), None)
        if carrier is None:
            raise CodecError("original relationship Key carrier profile is unsupported")
        components.append({"field":{"module":module,"element":element},"carrier":carrier,"nullable":False})
    return {"module":identity["module"],"record":identity["element"],"key":identity["key"],"components":components}


def validate_decoder(decoder: object, key_model: type[StrictModel]) -> dict[str, object]:
    if type(decoder) is not dict:
        raise CodecError("closed original related-Key decoder required")
    profile=decoder.get("profile")
    common={"profile","bound","relationship","key"}
    expected=common | {"target","representation","modelPins"} if profile in ("ashlar-related-keys-string/0.1","truss-related-keys/0.1") else common
    if set(decoder)!=expected or profile not in ("pg-related-keys-json/0.1","ashlar-related-keys-string/0.1","truss-related-keys/0.1") or type(decoder["bound"]) is not int or not 1 <= decoder["bound"] <= 1000:
        raise CodecError("related-Key output bound/profile differs")
    relation = decoder["relationship"]
    if type(relation) is not dict or set(relation) != {"module","id","direction"} or any(type(relation[name]) is not str or not relation[name] for name in ("module","id")) or relation["direction"] not in ("forward","inverse"):
        raise CodecError("original directed relationship identity required")
    descriptor=key_descriptor(key_model)
    declared_key=decoder["key"]
    components=declared_key.get("components") if type(declared_key) is dict else None
    if declared_key != descriptor or type(components) is not list or any(type(c) is not dict or c.get("nullable") is not False for c in components):
        raise CodecError("original relationship Key descriptor differs from generated class")
    if profile in ("ashlar-related-keys-string/0.1","truss-related-keys/0.1"):
        _engine_metadata(decoder,key_model,descriptor)
    return cast(dict[str,object],decoder)


def _engine_metadata(decoder: dict[str,object], key_model: type[StrictModel], descriptor: dict[str,object]) -> None:
    """Validate original metadata only; native engine values stay engine-owned."""
    source=getattr(key_model,"UMF_SOURCE",None)
    pins=decoder["modelPins"]
    if type(pins) is not list or not pins:
        raise CodecError("original engine model pins required")
    by_document: dict[str,dict[str,object]]={}
    for pin in pins:
        if type(pin) is not dict or set(pin)!={"documentId","revision","sha256","umfVersion"} or any(type(pin[name]) is not str or not pin[name] for name in pin) or re.fullmatch(r"[0-9a-f]{64}",pin["sha256"]) is None or pin["documentId"] in by_document:
            raise CodecError("closed distinct original engine model pins required")
        by_document[pin["documentId"]]=pin
    if source is None or source.document_id not in by_document:
        raise CodecError("generated relationship Key source is not pinned by engine")
    pin=by_document[source.document_id]
    if pin["sha256"]!=source.document_sha256 or pin["umfVersion"]!=source.core_version:
        raise CodecError("engine exact source bytes differ from generated relationship Key")
    identity={"documentId":source.document_id,"revision":pin["revision"]}
    target={**identity,"module":descriptor["module"],"element":descriptor["record"]}
    if decoder["target"]!=target:
        raise CodecError("original engine target differs from generated relationship Key")
    representation=decoder["representation"]
    relation=cast(dict[str,object],decoder["relationship"])
    if type(representation) is not dict or set(representation)!={"kind","bound","relationship","key"} or representation["kind"]!="relatedKeys" or representation["bound"]!=decoder["bound"] or type(representation["bound"]) is not int or representation["relationship"]!={**identity,"module":relation["module"],"relationship":relation["id"]}:
        raise CodecError("original engine related representation differs")
    key=representation["key"]
    components=cast(list[dict[str,object]],descriptor["components"])
    fields=[{**identity,**cast(dict[str,object],c["field"])} for c in components]
    if type(key) is not dict or set(key)!={"id","fields","types"} or key["id"]!=descriptor["key"] or key["fields"]!=fields or type(key["types"]) is not list or len(key["types"])!=len(components):
        raise CodecError("original engine relationship Key identity or component inventory differs")
    if decoder["profile"]=="ashlar-related-keys-string/0.1":
        types=[{"family":"string","facets":{},"nullable":False} for _ in components]
        if any(c["carrier"]!="string" for c in components) or any(type(t) is not dict or t.get("nullable") is not False for t in key["types"]) or key["types"]!=types:
            raise CodecError("original Ashlar required String-Key profile differs")
    elif any(not _truss_component_type(t,c["carrier"]) for t,c in zip(key["types"],components,strict=True)):
        raise CodecError("original Truss non-temporal related-Key profile differs")


def _truss_component_type(value: object, carrier: object) -> bool:
    """Original Truss ordinary query decoder subset, not a native value decoder."""
    if type(value) is not dict or set(value)!={"family","facets","nullable"} or value["family"]!=carrier or value["nullable"] is not False or type(value["facets"]) is not dict:
        return False
    facets=value["facets"]
    if carrier in ("string","boolean"):
        return facets=={}
    if carrier=="integer":
        if not facets:return True
        width=facets.get("integerWidth")
        return set(facets)=={"integerWidth"} and type(width) is dict and set(width)=={"bits","signed"} and type(width["bits"]) is int and width["bits"]==64 and width["signed"] is True
    return carrier=="decimal" and set(facets)=={"precision","scale"} and type(facets["precision"]) is int and type(facets["scale"]) is int and (facets["precision"],facets["scale"]) in ((18,4),(18,2),(12,2))


def _object(pairs: list[tuple[str, object]]) -> dict[str,object]:
    result: dict[str, object] = {}
    for key,value in pairs:
        if key in result:
            raise CodecError("duplicate related-Key JSON member")
        result[key]=value
    return result


def _number(_: str) -> object:
    raise CodecError("related-Key numeric values require exact string tokens")


def decode_related_keys(value: object, decoder: object, key_model: type[StrictModel]) -> RelatedKeys[StrictModel]:
    metadata = validate_decoder(decoder,key_model)
    if metadata["profile"] != "pg-related-keys-json/0.1":
        raise CodecError("original engine related values require their owner adapter")
    if type(value) is not str:
        raise CodecError("related-Key native JSON text required")
    try:
        payload=json.loads(value,object_pairs_hook=_object,parse_int=_number,parse_float=_number,parse_constant=_number)
    except (ValueError,TypeError):
        raise CodecError("invalid related-Key JSON text") from None
    if type(payload) is not dict or set(payload) != {"items","truncated"} or type(payload["items"]) is not list or type(payload["truncated"]) is not bool:
        raise CodecError("closed related-Key JSON payload required")
    items=payload["items"];bound=cast(int,metadata["bound"])
    if len(items)>bound or payload["truncated"] and len(items)!=bound:
        raise CodecError("related-Key truncation/bound differs")
    descriptor=key_descriptor(key_model)
    components=cast(list[dict[str,object]],descriptor["components"])
    fields=cast(tuple[tuple[str,str,str],...],getattr(key_model,"UMF_FIELDS",None))
    result: list[StrictModel]=[]
    previous: tuple[object,...] | None=None
    for item in items:
        if type(item) is not list or len(item)!=len(components):
            raise CodecError("related-Key component inventory differs")
        values: list[object]=[]
        for token,component in zip(item,components,strict=True):
            carrier=component["carrier"]
            decoded: object
            if carrier=="boolean":
                if type(token) is not bool:raise CodecError("Boolean related-Key token required")
                decoded=token
            elif type(token) is not str:
                raise CodecError("exact related-Key string token required")
            elif carrier=="string":decoded=token
            elif carrier=="integer":
                if not _INTEGER.fullmatch(token):raise CodecError("canonical Integer related-Key token required")
                decoded=int(Decimal(token))
            else:
                if not _DECIMAL.fullmatch(token):raise CodecError("exact finite Decimal related-Key token required")
                try:decoded=Decimal(token)
                except InvalidOperation:raise CodecError("exact finite Decimal related-Key token required") from None
                if not decoded.is_finite():raise CodecError("exact finite Decimal related-Key token required")
            values.append(decoded)
        key=validate_graph(key_model,{name:value for (_,_,name),value in zip(fields,values,strict=True)})
        normalized=tuple(getattr(key,name) for _,_,name in fields)
        if previous is not None and not _ascending(previous,normalized,components):
            raise CodecError("related-Key native ordering or uniqueness differs")
        previous=normalized;result.append(key)
    return RelatedKeys(tuple(result),payload["truncated"])


def _ascending(left: tuple[object,...], right: tuple[object,...], components: list[dict[str,object]]) -> bool:
    for before,after,component in zip(left,right,components,strict=True):
        if before==after:
            continue
        carrier=component["carrier"]
        if carrier=="string":return cast(str,before)<cast(str,after)
        if carrier=="boolean":return cast(bool,before)<cast(bool,after)
        if carrier=="integer":return cast(int,before)<cast(int,after)
        return cast(Decimal,before)<cast(Decimal,after)
    return False


def transport_spec(model: type[BaseModel]) -> tuple[str, type[StrictModel], dict[str, object], type[BaseModel]] | None:
    raw = getattr(model, "UMF_RELATED_OUTPUT", None)
    if raw is None:
        return None
    if type(raw) is not tuple or len(raw) != 4:
        raise CodecError("closed related-Key transport metadata required")
    name, key_model, decoder_json, row_model = raw
    if type(name) is not str or name not in model.model_fields or type(decoder_json) is not str or not isinstance(key_model, type) or not issubclass(key_model, StrictModel) or not isinstance(row_model, type) or not issubclass(row_model, BaseModel):
        raise CodecError("original related-Key transport classes required")
    decoder = validate_decoder(json.loads(decoder_json), key_model)
    return name, key_model, decoder, row_model


def make_related_result_model(
    name: str,
    row_model: type[BaseModel],
    key_model: type[StrictModel],
    output_name: str,
    decoder: dict[str, object],
    source_record: type[BaseModel],
) -> type[StrictModel]:
    """Inert stage-two metadata copies exact row validators, never subclasses it."""
    from copy import copy

    from pydantic import create_model

    validate_decoder(decoder, key_model)
    if output_name in row_model.model_fields or not output_name or "\x00" in output_name:
        raise CodecError("distinct safe related-Key output name required")
    source = getattr(source_record, "UMF_SOURCE", None)
    if source is None or getattr(key_model, "UMF_SOURCE", None) != source:
        raise CodecError("relationship Key and row source generations differ")
    definitions: dict[str, tuple[object, object]] = {
        field_name: (field.annotation, copy(field))
        for field_name, field in row_model.model_fields.items()
    }
    definitions[output_name] = (GenericAlias(RelatedKeys, (key_model,)), ...)
    result = create_model(name, __base__=StrictModel, **definitions)
    for attribute in ("UMF_BUNDLE_INPUT_DIGEST", "UMF_RUNTIME_ABI"):
        value = getattr(row_model, attribute, None)
        if value is None:
            raise CodecError("original row generation metadata required")
        type.__setattr__(result, attribute, value)
    type.__setattr__(result, "UMF_SOURCE", source)
    type.__setattr__(result, "UMF_RELATED_OUTPUT", (output_name, key_model, json.dumps(decoder, sort_keys=True, separators=(",", ":")), row_model))
    return result
