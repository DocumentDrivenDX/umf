"""JSON and YAML 1.2 readers preserving UMF's portable numeric profile."""

import json
import math
from decimal import Decimal
from io import StringIO

from ruamel.yaml import YAML
from ruamel.yaml.nodes import MappingNode, ScalarNode, SequenceNode

from .json import MAX_DEPTH, MAX_TEXT_LENGTH, MAX_VALUES, copy_json
from .models import Document


def _float(text):
    number = float(text)
    if not math.isfinite(number) or Decimal(text) != Decimal(str(number)):
        raise ValueError("NUMBER: parsing would change the decimal value")
    return number


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("DUPLICATE_KEY: duplicate mapping key")
        result[key] = value
    return result


def _int(text):
    if text == "-0":
        raise ValueError("NUMBER: negative zero is outside the profile")
    return int(text)


def read_json_value(text: str, format: str = "json"):
    if len(text) > MAX_TEXT_LENGTH:
        raise ValueError("LIMIT: source text exceeds limit")
    if format == "json":
        value = json.loads(
            text,
            parse_float=_float,
            parse_int=_int,
            object_pairs_hook=_pairs,
            parse_constant=lambda token: (_ for _ in ()).throw(
                ValueError(f"NUMBER: {token}")
            ),
        )
    elif format == "yaml":
        yaml = YAML(typ="safe", pure=True)
        yaml.version = (1, 2)
        yaml.allow_duplicate_keys = False
        # Inspect events before composition so aliases cannot form recursive graphs.
        for event in yaml.parse(text):
            if event.__class__.__name__ == "AliasEvent":
                raise ValueError("ALIAS: YAML aliases are outside the profile")
            if getattr(event, "tag", None) is not None:
                raise ValueError("TAG: explicit YAML tags are outside the profile")
            if getattr(event, "version", None) not in (None, (1, 2)):
                raise ValueError("SYNTAX: only YAML 1.2 is supported")
        node = yaml.compose(text)

        count = 0

        def convert(item, depth=0):
            nonlocal count
            count += 1
            if count > MAX_VALUES or depth > MAX_DEPTH:
                raise ValueError("LIMIT: source structural limit exceeded")
            if item is None:
                return None
            if isinstance(item, MappingNode):
                pairs = []
                for key, child in item.value:
                    if (
                        not isinstance(key, ScalarNode)
                        or key.tag != "tag:yaml.org,2002:str"
                    ):
                        raise ValueError("KEY: mappings require string keys")
                    pairs.append((key.value, convert(child, depth + 1)))
                return _pairs(pairs)
            if isinstance(item, SequenceNode):
                return [convert(child, depth + 1) for child in item.value]
            if item.tag == "tag:yaml.org,2002:float":
                return _float(item.value.replace("_", ""))
            if item.tag == "tag:yaml.org,2002:int":
                spelling = item.value.replace("_", "")
                sign = -1 if spelling.startswith("-") else 1
                token = spelling.lstrip("+-")
                radix = (
                    16
                    if token.startswith("0x")
                    else 8
                    if token.startswith("0o")
                    else 10
                )
                if spelling.startswith("-") and int(token, radix) == 0:
                    raise ValueError("NUMBER: negative zero is outside the profile")
                return sign * int(token, radix)
            if item.tag == "tag:yaml.org,2002:bool":
                return item.value.lower() == "true"
            if item.tag == "tag:yaml.org,2002:null":
                return None
            # ruamel's implicit timestamp resolver is broader than the UMF YAML
            # core schema: untagged dates are strings, never datetime objects.
            if item.tag == "tag:yaml.org,2002:timestamp":
                return item.value
            if item.tag != "tag:yaml.org,2002:str":
                raise ValueError("TAG: unsupported YAML value")
            return item.value

        value = convert(node)
    else:
        raise ValueError("Format must be json or yaml")
    return copy_json(value)


def write_json_value(value, format: str = "json") -> str:
    data = copy_json(value)
    if format == "json":
        text = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    elif format == "yaml":
        yaml = YAML(typ="safe", pure=True)
        yaml.version = (1, 2)
        yaml.default_flow_style = False
        yaml.allow_unicode = True
        stream = StringIO()
        yaml.dump(data, stream)
        text = stream.getvalue()
    else:
        raise ValueError("Format must be json or yaml")
    if len(text) > MAX_TEXT_LENGTH:
        raise ValueError("LIMIT: serialized text exceeds limit")
    return text


def read_document(text: str, format: str = "json") -> Document:
    return Document.model_validate(read_json_value(text, format))


def write_document(document: Document, format: str = "json") -> str:
    return write_json_value(document.checked_copy().to_dict(), format)
