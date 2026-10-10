# Pinned notice sources

- protobuf-LICENSE: https://raw.githubusercontent.com/bufbuild/protobuf-es/v2.15.0/LICENSE ; installed @bufbuild/protobuf 2.15.0 omits its root license. Google BSD text is also retained from bundled wire/varint.js in generated notices.
- change-case-LICENSE: https://raw.githubusercontent.com/blakeembrey/change-case/8aaff31471c918d3eac2b40939c601bee37375dd/LICENSE ; npm change-case 5.4.4 gitHead is this revision.

Other bundled notices come from the installed, locked package files identified by
Bun's actual input metafile. Notice generation refuses an unrecognized missing
license instead of silently dropping it. The Apache license text for UMF's dual
license is the standard Apache 2.0 text, independently retained from the first URL.
