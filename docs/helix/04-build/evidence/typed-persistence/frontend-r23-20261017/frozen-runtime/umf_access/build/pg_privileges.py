"""Review-only, source-gated PG18.6 fixed read-runtime privilege evidence.

This module neither connects to PostgreSQL nor applies grant statements.
Compiler programs and other target/version profiles retain independent custody.
"""

from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path
from typing import Any

# Derived from the retained native resolver/revocation packet, never a host flag.
_EVIDENCE: dict[str, Any] = json.loads(r"""{
  "version": "umf.sdk-pg-runtime-advisory/0.1",
  "evidence": {
    "packet": "docs/helix/04-build/evidence/typed-persistence/postgres-runtime-privilege-native-r13-20261017",
    "inventorySha256": "2e906e3e0ebdff3ae609045622f688338766c5b6df62e2eb3b9fd610cb738eca",
    "sdkSourceCommit": "a623b1fb553b1816f47cdd335d4c90b12b456acb",
    "sdkWheelSha256": "ce2943e7e8a838103888198b26c5dae07e9afe94b6eb66906642737271086705",
    "testedRuntimeSourceSha256": "1d32b92015cfb3eacf5f2caa08f152a60d1c6bc99508895f4da856642ba76010",
    "serverVersion": 180006,
    "python": "3.14.8",
    "psycopg": "3.3.6",
    "libpqVersion": 180006,
    "weftWheelSha256": "d1d1e3831f3490e0cce90bc6404834982df9ab1e4f15a72f6cc81eca6d191f7e",
    "actualFixedSelectVariants": 16,
    "functionRevokeControls": 163,
    "metadataRelationControls": 14
  },
  "fixedSql": {
    "_ROLE": {
      "sha256": "2e5f6cbb0fbdd9a25756cf2427fafd55c2578c1e03499a6d287d0981d5aa9fe6",
      "sourceLines": [
        89
      ]
    },
    "_TABLE": {
      "sha256": "2c0f17ae15c2fba1c085d832dbffd8300e93fda505f38db36e70c1fe47eeb0d7",
      "sourceLines": [
        91
      ]
    },
    "_COLUMNS": {
      "sha256": "f72756ea19e874a864df94d7fca92f5199a58aa8e2212240b0c2acddb779b33b",
      "sourceLines": [
        97
      ]
    },
    "_KEYS": {
      "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
      "sourceLines": [
        103
      ]
    },
    "_SHAPE": {
      "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
      "sourceLines": [
        137
      ]
    },
    "_RESOLUTION": {
      "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
      "sourceLines": [
        185
      ]
    },
    "inline-a24f29197f6a": {
      "sha256": "a24f29197f6a349ae81e10693b97a062195fa5027ed2976e3758fb2e03392849",
      "sourceLines": [
        75,
        800
      ]
    },
    "inline-6f0a092bfd47": {
      "sha256": "6f0a092bfd47e34756c8981defc3c5eb684025a0c60dfbe4ac5d3d6fb894c068",
      "sourceLines": [
        618
      ]
    },
    "inline-365ce44eecfd": {
      "sha256": "365ce44eecfd313c769f71d7aeba48e43087273d4c1cb2d263b259b976d96241",
      "sourceLines": [
        496
      ]
    },
    "inline-79424d69b495": {
      "sha256": "79424d69b495c9e84fbf10c55e320e5ba12278a37887509b1515009832186e9e",
      "sourceLines": [
        614
      ]
    },
    "inline-2af4424f8a1d": {
      "sha256": "2af4424f8a1dfa5f936e67d66123d29dbe99ae91a322dfeecc0b63ce818a8657",
      "sourceLines": [
        1086,
        957,
        766,
        853
      ]
    },
    "inline-6c20e5345ee8": {
      "sha256": "6c20e5345ee8028f61cc0541aeb60699e5cffa99c8f79ff7f8c62b0a8dad1837",
      "sourceLines": [
        766,
        853
      ]
    }
  },
  "runtimeFunctions": [
    {
      "schema": "pg_catalog",
      "name": "nameeq",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "name"
        },
        {
          "schema": "pg_catalog",
          "name": "name"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "bool"
      },
      "nativeWitnessOid": 62,
      "originSql": [
        {
          "id": "_ROLE",
          "sha256": "2e5f6cbb0fbdd9a25756cf2427fafd55c2578c1e03499a6d287d0981d5aa9fe6",
          "parameterVariant": "no-params"
        },
        {
          "id": "_TABLE",
          "sha256": "2c0f17ae15c2fba1c085d832dbffd8300e93fda505f38db36e70c1fe47eeb0d7",
          "parameterVariant": "unknown-strings"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int2"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int4"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int8"
        },
        {
          "id": "_RESOLUTION",
          "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
          "parameterVariant": "text-array-bool-unknown"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "int24gt",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "int2"
        },
        {
          "schema": "pg_catalog",
          "name": "int4"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "bool"
      },
      "nativeWitnessOid": 162,
      "originSql": [
        {
          "id": "_COLUMNS",
          "sha256": "f72756ea19e874a864df94d7fca92f5199a58aa8e2212240b0c2acddb779b33b",
          "parameterVariant": "int2"
        },
        {
          "id": "_COLUMNS",
          "sha256": "f72756ea19e874a864df94d7fca92f5199a58aa8e2212240b0c2acddb779b33b",
          "parameterVariant": "int4"
        },
        {
          "id": "_COLUMNS",
          "sha256": "f72756ea19e874a864df94d7fca92f5199a58aa8e2212240b0c2acddb779b33b",
          "parameterVariant": "int8"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int2[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int4[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int8[]"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "oideq",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "oid"
        },
        {
          "schema": "pg_catalog",
          "name": "oid"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "bool"
      },
      "nativeWitnessOid": 184,
      "originSql": [
        {
          "id": "_TABLE",
          "sha256": "2c0f17ae15c2fba1c085d832dbffd8300e93fda505f38db36e70c1fe47eeb0d7",
          "parameterVariant": "unknown-strings"
        },
        {
          "id": "_COLUMNS",
          "sha256": "f72756ea19e874a864df94d7fca92f5199a58aa8e2212240b0c2acddb779b33b",
          "parameterVariant": "int2"
        },
        {
          "id": "_COLUMNS",
          "sha256": "f72756ea19e874a864df94d7fca92f5199a58aa8e2212240b0c2acddb779b33b",
          "parameterVariant": "int4"
        },
        {
          "id": "_COLUMNS",
          "sha256": "f72756ea19e874a864df94d7fca92f5199a58aa8e2212240b0c2acddb779b33b",
          "parameterVariant": "int8"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int2"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int4"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int8"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int2[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int4[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int8[]"
        },
        {
          "id": "_RESOLUTION",
          "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
          "parameterVariant": "text-array-bool-unknown"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "nameeqtext",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "name"
        },
        {
          "schema": "pg_catalog",
          "name": "text"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "bool"
      },
      "nativeWitnessOid": 240,
      "originSql": [
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int2"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int4"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int8"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "int4",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "int2"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "int4"
      },
      "nativeWitnessOid": 313,
      "originSql": [
        {
          "id": "_COLUMNS",
          "sha256": "f72756ea19e874a864df94d7fca92f5199a58aa8e2212240b0c2acddb779b33b",
          "parameterVariant": "int2"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int2"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int2[]"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "text",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "name"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "text"
      },
      "nativeWitnessOid": 406,
      "originSql": [
        {
          "id": "_RESOLUTION",
          "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
          "parameterVariant": "text-array-bool-unknown"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "int4",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "int8"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "int4"
      },
      "nativeWitnessOid": 480,
      "originSql": [
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int2"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int4"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int8"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "current_database",
      "arguments": [],
      "result": {
        "schema": "pg_catalog",
        "name": "name"
      },
      "nativeWitnessOid": 861,
      "originSql": [
        {
          "id": "_RESOLUTION",
          "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
          "parameterVariant": "text-array-bool-unknown"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "textcat",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "text"
        },
        {
          "schema": "pg_catalog",
          "name": "text"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "text"
      },
      "nativeWitnessOid": 1258,
      "originSql": [
        {
          "id": "_RESOLUTION",
          "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
          "parameterVariant": "text-array-bool-unknown"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "int84mi",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "int8"
        },
        {
          "schema": "pg_catalog",
          "name": "int4"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "int8"
      },
      "nativeWitnessOid": 1275,
      "originSql": [
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int2"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int4"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int8"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "quote_ident",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "text"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "text"
      },
      "nativeWitnessOid": 1282,
      "originSql": [
        {
          "id": "_RESOLUTION",
          "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
          "parameterVariant": "text-array-bool-unknown"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "oid",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "int8"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "oid"
      },
      "nativeWitnessOid": 1287,
      "originSql": [
        {
          "id": "_COLUMNS",
          "sha256": "f72756ea19e874a864df94d7fca92f5199a58aa8e2212240b0c2acddb779b33b",
          "parameterVariant": "int8"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int8"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int8[]"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "current_schemas",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "bool"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "_name"
      },
      "nativeWitnessOid": 1403,
      "originSql": [
        {
          "id": "_RESOLUTION",
          "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
          "parameterVariant": "text-array-bool-unknown"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "int82le",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "int8"
        },
        {
          "schema": "pg_catalog",
          "name": "int2"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "bool"
      },
      "nativeWitnessOid": 1860,
      "originSql": [
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int2"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int4"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int8"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "set_config",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "text"
        },
        {
          "schema": "pg_catalog",
          "name": "text"
        },
        {
          "schema": "pg_catalog",
          "name": "bool"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "text"
      },
      "nativeWitnessOid": 2078,
      "originSql": [
        {
          "id": "inline-a24f29197f6a",
          "sha256": "a24f29197f6a349ae81e10693b97a062195fa5027ed2976e3758fb2e03392849",
          "parameterVariant": "unknown-strings"
        },
        {
          "id": "inline-6f0a092bfd47",
          "sha256": "6f0a092bfd47e34756c8981defc3c5eb684025a0c60dfbe4ac5d3d6fb894c068",
          "parameterVariant": "unknown-strings"
        },
        {
          "id": "inline-79424d69b495",
          "sha256": "79424d69b495c9e84fbf10c55e320e5ba12278a37887509b1515009832186e9e",
          "parameterVariant": "unknown-strings"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "unnest",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "anyarray"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "anyelement"
      },
      "nativeWitnessOid": 2331,
      "originSql": [
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int2"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int4"
        },
        {
          "id": "_KEYS",
          "sha256": "4ab8f52c86d796021d053f5f5e6b7f726a3d5e9511d0564f2054c9da88c54c70",
          "parameterVariant": "int8"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int2[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int4[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int8[]"
        },
        {
          "id": "_RESOLUTION",
          "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
          "parameterVariant": "text-array-bool-unknown"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "pg_has_role",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "name"
        },
        {
          "schema": "pg_catalog",
          "name": "oid"
        },
        {
          "schema": "pg_catalog",
          "name": "text"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "bool"
      },
      "nativeWitnessOid": 2706,
      "originSql": [
        {
          "id": "_TABLE",
          "sha256": "2c0f17ae15c2fba1c085d832dbffd8300e93fda505f38db36e70c1fe47eeb0d7",
          "parameterVariant": "unknown-strings"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "jsonb_agg",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "anyelement"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "jsonb"
      },
      "nativeWitnessOid": 3267,
      "originSql": [
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int2[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int4[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int8[]"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "jsonb_build_array",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "any"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "jsonb"
      },
      "nativeWitnessOid": 3271,
      "originSql": [
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int2[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int4[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int8[]"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "jsonb_build_object",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "any"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "jsonb"
      },
      "nativeWitnessOid": 3273,
      "originSql": [
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int2[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int4[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int8[]"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "pg_control_system",
      "arguments": [],
      "result": {
        "schema": "pg_catalog",
        "name": "record"
      },
      "nativeWitnessOid": 3441,
      "originSql": [
        {
          "id": "_RESOLUTION",
          "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
          "parameterVariant": "text-array-bool-unknown"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "to_regclass",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "text"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "regclass"
      },
      "nativeWitnessOid": 3495,
      "originSql": [
        {
          "id": "_RESOLUTION",
          "sha256": "8e4c47059c4ea8f811d19a13d65332b0e4129afb625db10a9ceb621b33b55d5c",
          "parameterVariant": "text-array-bool-unknown"
        },
        {
          "id": "inline-365ce44eecfd",
          "sha256": "365ce44eecfd313c769f71d7aeba48e43087273d4c1cb2d263b259b976d96241",
          "parameterVariant": "unknown-strings"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "to_jsonb",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "anyelement"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "jsonb"
      },
      "nativeWitnessOid": 3787,
      "originSql": [
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int2[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int4[]"
        },
        {
          "id": "_SHAPE",
          "sha256": "ec2166fbf89ba2e33f93756dc2ab135aea1dfbf6ebcfc4c91078a45c8c1fba54",
          "parameterVariant": "int8[]"
        }
      ]
    }
  ],
  "runtimeRelations": [
    {
      "schema": "pg_catalog",
      "relation": "pg_roles",
      "columns": [
        "rolname",
        "rolsuper",
        "rolbypassrls"
      ],
      "wholeRow": false,
      "originSqlIds": [
        "_ROLE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_class",
      "columns": [
        "oid",
        "relname",
        "relnamespace",
        "relowner",
        "relkind",
        "relrowsecurity",
        "relforcerowsecurity",
        "relam"
      ],
      "wholeRow": false,
      "originSqlIds": [
        "_KEYS",
        "_RESOLUTION",
        "_SHAPE",
        "_TABLE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_namespace",
      "columns": [
        "oid",
        "nspname"
      ],
      "wholeRow": false,
      "originSqlIds": [
        "_COLUMNS",
        "_KEYS",
        "_RESOLUTION",
        "_SHAPE",
        "_TABLE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_inherits",
      "columns": [
        "inhrelid",
        "inhparent",
        "inhseqno",
        "inhdetachpending"
      ],
      "wholeRow": true,
      "originSqlIds": [
        "_SHAPE",
        "_TABLE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_attribute",
      "columns": [
        "attrelid",
        "attname",
        "atttypid",
        "attnum",
        "attnotnull",
        "attisdropped",
        "attcollation",
        "atttypmod",
        "atthasdef",
        "attidentity",
        "attgenerated"
      ],
      "wholeRow": false,
      "originSqlIds": [
        "_COLUMNS",
        "_KEYS",
        "_SHAPE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_type",
      "columns": [
        "oid",
        "typname",
        "typnamespace",
        "typowner",
        "typlen",
        "typbyval",
        "typtype",
        "typcategory",
        "typispreferred",
        "typisdefined",
        "typdelim",
        "typrelid",
        "typsubscript",
        "typelem",
        "typarray",
        "typinput",
        "typoutput",
        "typreceive",
        "typsend",
        "typmodin",
        "typmodout",
        "typanalyze",
        "typalign",
        "typstorage",
        "typnotnull",
        "typbasetype",
        "typtypmod",
        "typndims",
        "typcollation",
        "typdefaultbin",
        "typdefault",
        "typacl"
      ],
      "wholeRow": true,
      "originSqlIds": [
        "_COLUMNS",
        "_KEYS",
        "_SHAPE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_index",
      "columns": [
        "indexrelid",
        "indrelid",
        "indnkeyatts",
        "indisunique",
        "indimmediate",
        "indisvalid",
        "indisready",
        "indkey",
        "indcollation",
        "indclass",
        "indexprs",
        "indpred",
        "indnatts",
        "indnullsnotdistinct",
        "indisprimary",
        "indisexclusion",
        "indisclustered",
        "indcheckxmin",
        "indislive",
        "indisreplident",
        "indoption"
      ],
      "wholeRow": true,
      "originSqlIds": [
        "_KEYS",
        "_SHAPE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_am",
      "columns": [
        "oid",
        "amname",
        "amhandler",
        "amtype"
      ],
      "wholeRow": true,
      "originSqlIds": [
        "_KEYS",
        "_SHAPE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_opclass",
      "columns": [
        "oid",
        "opcmethod",
        "opcname",
        "opcnamespace",
        "opcowner",
        "opcfamily",
        "opcintype",
        "opcdefault",
        "opckeytype"
      ],
      "wholeRow": true,
      "originSqlIds": [
        "_KEYS",
        "_SHAPE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_collation",
      "columns": [
        "oid",
        "collisdeterministic",
        "collname",
        "collnamespace",
        "collowner",
        "collprovider",
        "collencoding",
        "collcollate",
        "collctype",
        "colllocale",
        "collicurules",
        "collversion"
      ],
      "wholeRow": true,
      "originSqlIds": [
        "_KEYS",
        "_SHAPE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_opfamily",
      "columns": [
        "oid",
        "opfmethod",
        "opfname",
        "opfnamespace",
        "opfowner"
      ],
      "wholeRow": true,
      "originSqlIds": [
        "_SHAPE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_amop",
      "columns": [
        "oid",
        "amopfamily",
        "amoplefttype",
        "amoprighttype",
        "amopstrategy",
        "amoppurpose",
        "amopopr",
        "amopmethod",
        "amopsortfamily"
      ],
      "wholeRow": true,
      "originSqlIds": [
        "_SHAPE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_extension",
      "columns": [
        "oid",
        "extname",
        "extnamespace",
        "extversion"
      ],
      "wholeRow": false,
      "originSqlIds": [
        "_SHAPE"
      ]
    },
    {
      "schema": "pg_catalog",
      "relation": "pg_database",
      "columns": [
        "oid",
        "datname"
      ],
      "wholeRow": false,
      "originSqlIds": [
        "_RESOLUTION"
      ]
    }
  ],
  "selectedFixtureOwnerFunctions": [
    {
      "schema": "pg_catalog",
      "name": "booleq",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "bool"
        },
        {
          "schema": "pg_catalog",
          "name": "bool"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "bool"
      },
      "nativeWitnessOid": 60,
      "originSql": [
        {
          "id": "owner-business-1",
          "sha256": "21e922fa5e31f242f25ad1f95f3c82eaf046d5f4377d9aaad35550b26cf97eba",
          "parameterVariant": "captured-owner-parameters"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "int8",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "int4"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "int8"
      },
      "nativeWitnessOid": 481,
      "originSql": [
        {
          "id": "owner-business-0",
          "sha256": "4bf99a2e6fbf7dee78b7b1c762556708dec109f37f8d42ea76022f3319df1110",
          "parameterVariant": "captured-owner-parameters"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "text_gt",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "text"
        },
        {
          "schema": "pg_catalog",
          "name": "text"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "bool"
      },
      "nativeWitnessOid": 742,
      "originSql": [
        {
          "id": "owner-business-1",
          "sha256": "21e922fa5e31f242f25ad1f95f3c82eaf046d5f4377d9aaad35550b26cf97eba",
          "parameterVariant": "captured-owner-parameters"
        }
      ]
    },
    {
      "schema": "pg_catalog",
      "name": "int8",
      "arguments": [
        {
          "schema": "pg_catalog",
          "name": "int2"
        }
      ],
      "result": {
        "schema": "pg_catalog",
        "name": "int8"
      },
      "nativeWitnessOid": 754,
      "originSql": [
        {
          "id": "owner-business-1",
          "sha256": "21e922fa5e31f242f25ad1f95f3c82eaf046d5f4377d9aaad35550b26cf97eba",
          "parameterVariant": "captured-owner-parameters"
        }
      ]
    }
  ],
  "nativeSdkSourceFiles": {
    "umf_access/__init__.py": "767836329333329c211f57b23116b0aff5f35ced12c9eb2988474c6fdd113cb9",
    "umf_access/adoption.py": "42dedd7ae908c4194a99c586e9056cfeda638209c4f2d56426d2c15383aaafd2",
    "umf_access/bulk.py": "cd947c132b909e97b1d77d39b93b3fe59cece99412fae65040beaebccaf5d19d",
    "umf_access/capture.py": "8f391f644b6794b83a52ee7754544c9a6914022de66ad40e3c1499c2609c2586",
    "umf_access/catalog.py": "3e92c5a24ea2bc16bcfa796ff10d8942cf3b31ac560342040934f82c6c8ae3cb",
    "umf_access/codec_support.py": "2d99a82a08ab7168d3782543e42495b3605d43d75e2834fa7c4b7c609763f700",
    "umf_access/commands.py": "1a79461725d561b1217b9031374416df9ebf38a8875448c22d3e751df019123c",
    "umf_access/delta_read.py": "ea9cf42a663a014e6953847865be29d596d2b253b367ae1aff4f7b1d65bd9893",
    "umf_access/engine_catalog.py": "dcd1eae05ae0d7b9b2c9e5dd09d94fcd56dd920caf4aa7ab7827af01ecee91eb",
    "umf_access/managed_actions.py": "f9c05769d52786fb7e4c4756b7444c08017b1546d7ef9d1bf34901a06829e584",
    "umf_access/managed_bulk.py": "7b911affd616882806d133511d792bf74e75a3f0035a77e41b164d4df46c5bd6",
    "umf_access/managed_delta.py": "4d46234e1b1e64fc92dbac89981a1fd3e652a24c6e5fdabff1c87836d6cb8617",
    "umf_access/managed_support.py": "c652f5afec7d9344af6f26cecd1be0ba09ae0e0788fd48a7e9fcf419ad325616",
    "umf_access/native_actions.py": "1abca7c496470968e5d8872850e62af27652b5bcea2a03f76d195eeb83036d15",
    "umf_access/native_program.py": "50388efcaf91bda7dc566c3d22268f0e19fe11a6515acf312fd6eb47edda2184",
    "umf_access/pages.py": "ba6f61af9426a954d2c6d4b84ff1e2baff70f08a4ee2a18fd2f1dc0a0767a4a6",
    "umf_access/postgres_bulk.py": "0ca598b133837bb5f7cd8909ecaec1a123898547c7576a48f015b81d46146073",
    "umf_access/postgres_read.py": "1d32b92015cfb3eacf5f2caa08f152a60d1c6bc99508895f4da856642ba76010",
    "umf_access/postgres_search.py": "551fb7432a177d7f92ea232bd0dd64e5764670f46294b43932fdf4e88fbd7b06",
    "umf_access/protocols.py": "3de9750adcd78e6e7b95374771e9b4385e4326c31ea1cbc4d6930cbd1daa82c3",
    "umf_access/py.typed": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "umf_access/related_keys.py": "bfb831ec71a21ce35b0ec8630d7c1f54060a95042a75eb21cec29b8b68da2c0c",
    "umf_access/reviewed.py": "ecca027076ca2a855ffe96c4456c93840de218028296b2abee1253a44d732d10",
    "umf_access/search_catalog.py": "0c12485ca262052faf7bd2bf5b81140aa5b4f5ffb90186183dd2af2c45c28832",
    "umf_access/targets.py": "2c34e7c988e05c19ef6fb6690f5186eab68f089583009fbee36cfc19be61c472",
    "umf_access/types.py": "b003ca6d6a84446a2f0eb32d26187c5adc27dbf62936ce6f69827b6a1f9a2d5e",
    "umf_access/unity_search.py": "39ea9b4c8fce488982349ffac768506db860e7eb3f16a1b260a97e69cfae6e17",
    "umf_access/values.py": "c8aab7363a09c38d77b8f60c2b97fa361fc4b80f522e9d1d3f7cbaaf32b5d848",
    "umf_access/verification.py": "070ea416451d8cc8e26482173557c067b8e25137ef1d9778c00c30259f8ba48b",
    "umf_access/build/__init__.py": "f2a7ac0078bc169c017a8b280d6ad7fc4f45ea043d25c987890ed015fae3db9c",
    "umf_access/build/catalog.py": "9d3d8abe5a49a61acdd1721395c4acf037a04f4a60de09665610d9c2cfb21106",
    "umf_access/build/commands.py": "b92e8a37d363d260d7fa345c38d293c7ab54bebda91cfc14f84666495821a6f2",
    "umf_access/build/privileges.py": "4647689ef639272b2c3d3b5d1a96af50b366b932d5a816cba55991495d00a27a",
    "umf_access/build/search.py": "17b1e5f3defdcf9f2e1b7e117ca069eaa849e89865801b3d1d881ce0e0845b42",
    "umf_access/build/unity_search.py": "bc9e67b576699ed66d01a502212c8d23b3b7917486c4139ae06f3cf9a6008fda",
    "umf_access/dsl/__init__.py": "c8d509c865e54a032a4c720b8965ace080b6867360e649606942d186119546dc",
    "umf_access/dsl/_context.py": "a73451718cc072692ae821971e17e1ebd23eee98e1bca9401ba7b285b4fdf2d7",
    "umf_access/dsl/_expressions.py": "c22a687e5fb057b1e979ad90103ab0824f0bcdae9c373bb186862adebf04501e",
    "umf_access/dsl/_joined.py": "65a897ab4f0cae0eb66ec3afed6164d1a014774cb159e5c7efee1382bc3884cb",
    "umf_access/dsl/_nodes.py": "aeeda9c07fd5072449bb6533155f0a4bf77b8cef23d0de694f55cf2e386c9bf8",
    "umf_access/dsl/_query.py": "2b92bd376109038cba8d28961788ef64e2dd40be5dbcdd2d2fac52313e557f1b",
    "umf_access/dsl/_selection.py": "fe574f91ee55de766feda900081050a7dc8f4a0fa324002ad46102d527caf5ef",
    "umf_access/dsl/navigation.py": "2ef3f1bf450ab2a6213634280014e7c957e3b1d24b23f81b1f1bb91e2f19e7f6",
    "umf_access/dsl/render.py": "e0f2daddc00b10e2c27deb21eaf2916f4a1e6bf289f2dbc4f33e86316d695da1",
    "umf_access/dsl/search.py": "d1dea05095662ca06bb0e0bb9dac7156c5b1b94dc60f162d6f6887d02abd2dde"
  }
}""")


_TESTED_REFERENCE = r"""{
  "version": "umf.pg-privilege-qualification-reference/0.1",
  "scope": "exact owned plain/pages generated catalog; current SDK metadata/cache/closing/read/page/stream sync/async paths only",
  "sdkWheelSha256": "b1acf1978672c1f1ba7af0593d33bbbbc8c34f65a715839eed8b58f4dff5556c",
  "weftWheelSha256": "26d20aa8e4d1bac465051498b1a3fe4fdf01dd0a2fee1591e755099d8e8e4323",
  "catalogSha256": "2f06038d4007a32c3727e60e40a93db974a30a4debc337220a3d0e6cf2171a59",
  "selectedEntries": [
    {
      "name": "plain",
      "kind": "query",
      "targetId": "local",
      "originalStructuralDigest": "3a86cb6658e15c89f7053c9735e0b09326cb526542d9920cbfb55b0e27501f31"
    },
    {
      "name": "pages",
      "kind": "query",
      "targetId": "local",
      "originalStructuralDigest": "3d9913d325caeda8751360cc39162a178c28e16951b0fe681ecd30b191a62a55"
    }
  ],
  "observedNecessaryFunctions": 27,
  "runtimeFunctions": 23,
  "metadataRelations": 14,
  "nativeVersion": 180006,
  "inventoryComplete": false,
  "nativeAuthority": false,
  "unresolved": [
    "other selected programs/capabilities require their own owner/runtime path inventories",
    "actions/bulk/search/managed/engine grants not qualified by this read catalog",
    "production report reference integration and reporting ABI correspondence require root review"
  ],
  "temporal": "HELD",
  "sdkSourceCommit": "7b206ef3b2720500c8409b17915629e4aac11448",
  "weftSourceCommit": "8bf99117f1e4ab6fd8d4506b25bfdd8214c9afd6",
  "packet": "docs/helix/04-build/evidence/typed-persistence/runtime-privilege-r19-20261017",
  "packetInventorySha256": "6a86cb623bf4489983a7751791771f991a0185e3f4e8554535e7ae07c43eb1e5",
  "qualificationTransfer": false,
  "currentTargetQualified": false,
  "reportingAbiScope": "informative reference only; changing this report module does not qualify a new runtime wheel",
  "selectedOperations": [
    "plain read",
    "keyset page",
    "bounded stream",
    "cold/warm verification and cache",
    "selected metadata/admission/closing SQL",
    "sync/async execution and cancellation cleanup"
  ],
  "unselectedOperations": [
    "actions",
    "bulk commands",
    "search",
    "managed platforms",
    "engine targets"
  ]
}"""


def _source_snapshot() -> dict[str, Any]:
    path = Path(__file__).resolve().parent.parent / "postgres_read.py"
    try:
        source = path.read_bytes()
        tree = ast.parse(source)
    except (OSError, SyntaxError, ValueError) as error:
        return {"available": False, "reason": type(error).__name__}
    names = {
        node.value.value: node.targets[0].id
        for node in tree.body
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and isinstance(node.value, ast.Constant)
        and isinstance(node.value.value, str)
    }
    sql: dict[str, dict[str, Any]] = {}
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and node.value.startswith(("SELECT ", "WITH ", "SET TRANSACTION "))
        ):
            digest = hashlib.sha256(node.value.encode()).hexdigest()
            key = names.get(node.value, "inline-" + digest[:12])
            entry = sql.setdefault(key, {"sha256": digest, "sourceLines": []})
            entry["sourceLines"].append(node.lineno)
    package = Path(__file__).resolve().parent.parent
    payloads: dict[str, str | None] = {}
    for name in _EVIDENCE["nativeSdkSourceFiles"]:
        try:
            payloads[name] = hashlib.sha256(
                (package / name.removeprefix("umf_access/")).read_bytes()
            ).hexdigest()
        except OSError:
            payloads[name] = None
    return {
        "available": True,
        "sha256": hashlib.sha256(source).hexdigest(),
        "fixedSql": sql,
        "nativePayloads": payloads,
    }


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _reference_grants(data: dict[str, Any]) -> list[str]:
    principal = _quote("<principal>")
    grants = []
    for function in data["runtimeFunctions"]:
        arguments = ", ".join(
            _quote(t["schema"]) + "." + _quote(t["name"]) for t in function["arguments"]
        )
        name = _quote(function["schema"]) + "." + _quote(function["name"])
        grants.append(f"GRANT EXECUTE ON FUNCTION {name}({arguments}) TO {principal};")
    for relation in data["runtimeRelations"]:
        columns = ", ".join(_quote(name) for name in relation["columns"])
        name = _quote(relation["schema"]) + "." + _quote(relation["relation"])
        grants.append(f"GRANT SELECT ({columns}) ON TABLE {name} TO {principal};")
    return grants


def postgres_runtime_advisory(
    target: dict[str, Any], entries: list[dict[str, Any]]
) -> dict[str, Any]:
    """Expose a partial reference proposal; never an inventory-complete claim."""
    data: dict[str, Any] = json.loads(json.dumps(_EVIDENCE))
    snapshot = _source_snapshot()
    expected = {key: value["sha256"] for key, value in data["fixedSql"].items()}
    observed = {
        key: value["sha256"] for key, value in snapshot.get("fixedSql", {}).items()
    }
    sql_match = snapshot["available"] and expected == observed
    source_match = (
        snapshot.get("sha256") == data["evidence"]["testedRuntimeSourceSha256"]
        and snapshot.get("nativePayloads") == data["nativeSdkSourceFiles"]
    )
    versions = {
        str(version)
        for platform in target.get("platform", [])
        if isinstance(platform, dict) and platform.get("name") == "postgresql"
        for version in platform.get("versions", [])
    }
    profile_match = (
        target["kind"] == "postgresql"
        and versions == {"180006"}
        and target.get("backendId") == "weft-postgresql"
        and target.get("backendVersion") == "raw-read/0.1"
        and target.get("targetProfile") == "weft.raw-read/0.1"
    )
    matching = []
    outside = []
    for entry in entries:
        artifact = entry["artifact"]
        binding = artifact.get("binding", {})
        if (
            entry["kind"] == "query"
            and artifact.get("version") == "weft.raw-read/0.1"
            and artifact.get("target") == "postgresql18"
            and isinstance(binding, dict)
            and binding.get("schemaBinding") == "qualified"
        ):
            matching.append(entry["name"])
        else:
            outside.append(entry["name"])
    reference_selected = bool(sql_match and profile_match and matching)
    data.update(
        {
            "status": "SCOPED_REFERENCE_ADVISORY"
            if reference_selected
            else "REFERENCE_ONLY_NOT_APPLICABLE",
            "inventoryComplete": False,
            "testedReferences": [json.loads(_TESTED_REFERENCE)],
            "sourceObservation": snapshot,
            "fixedSqlHashesMatch": bool(sql_match),
            "nativeTestedSourceMatches": source_match,
            "declaredNativeProfileMatches": profile_match,
            "matchingEntryNames": matching,
            "entriesOutsideRuntimeSlice": outside,
            "referenceGrantStatements": _reference_grants(data)
            if reference_selected
            else [],
            "grantStatementScope": "23 fixed read-runtime overloads and 14 metadata relations only; replace the quoted principal placeholder after host review; never executed by the SDK",
            "scope": "PostgreSQL18.6 qualified-schema read/page/stream fixed metadata SQL and verification cache; original compiler business/LOCK/admission SQL is separate",
            "currentSourceQualification": "NATIVE_TESTED_SOURCE"
            if source_match
            else "UNQUALIFIED_SOURCE_REVISION; matching SQL hashes do not qualify changed control flow",
            "notCovered": [
                "original compiler business/LOCK/native admissions",
                "search",
                "actions/bulk",
                "Lakebase and other native versions",
                "existing-view security lineage and future driver/platform qualifications",
            ],
            "hostOnlyObligations": [
                "application schema USAGE and original compiler table-level SELECT/LOCK grants",
                "review actual native ACLs and selected profile; never grant blanket pg_catalog privileges",
                "independent principal, current role/grants, RLS, DDL and source/version custody remain required",
            ],
            "qualification": {
                "leastPrivilege": "UNQUALIFIED",
                "sufficiencyClaim": False,
            },
        }
    )
    return data
