# Accept real-world ONNX files

Status: approved in chat on 2026-11-09 ("그런 문제 해결하고, 실 사용 가능하게 해줘"), including
real-model verification on freeride against production.

## Goal

A typical `.onnx` file from PyTorch, Optimum, TF2ONNX or the ONNX model zoo uploads, parses and
shows a correct graph, weights and demo. Models whose weights live in external data files upload
together with those files.

## Scope

1. **INT64 attributes.** An attribute int outside ±2^53 is kept as an exact decimal string, so
   `Slice ends=INT64_MAX` no longer fails the parse.
2. **External data.** A version can hold one `.onnx` plus external data files. The parser maps
   each external tensor to `{ location, offset, length }`. Processing checks that every location
   was uploaded and fits inside its file. If not, the version fails with `external_data_missing`
   and the names of the missing files. Data files are stored as blobs (deduplicated by SHA-256)
   and listed under `model_files.kind = 'external_data'`. The weights tab, diff, download and demo
   read from them.
3. **Subgraphs.** Initializers and Constant nodes inside If/Loop/Scan bodies count toward
   parameters, the dtype breakdown and the tensor index. Expanding bodies in the graph view is out
   of scope.
4. **Sparse initializers** count toward parameters.
5. **Header check.** Any valid first protobuf field passes; the parser does the full validation.
6. **Varint-encoded tensors** (`int32_data`, `int64_data`, `uint64_data`) decode correctly in the
   weights tab.
7. **Weight dtypes:** add int16, uint16, int64, uint32, uint64, bool, the four float8 types,
   int4 and uint4.
8. **Graph view:** edges only connect kept items past the 1500-item cap; a failed layout shows an
   error instead of spinning.
9. **Demo:**
   - Every input can be edited, including its shape.
   - Add int32, uint8, bool and float16 inputs.
   - Name-based defaults: masks 1, token types 0, positions 0..n-1. Sequence dims default to 8.
   - If the patched model fails, retry without intermediates.
   - Pass external data files to the runtime.
10. `PARSER_VERSION` → 3, so existing models re-parse lazily.

## Decisions

| # | Decision | Answer | Confidence |
|---|---|---|---|
| 1 | Unsafe int64 attribute values | Exact decimal string; safe values stay numbers | High |
| 2 | External data upload | Several tus uploads; create body gets `dataUploadIds` | High |
| 3 | Matching data files | `location` basename equals the uploaded file name | High |
| 4 | Size limits | `.onnx` 2 GiB; each data file 10 GiB; repository total unchanged | Medium |
| 5 | Storage | Data files are blobs, deduplicated by SHA-256 | High |
| 6 | Download | One link per file, no zip | Medium |
| 7 | Subgraph bodies | Count their weights; no graph expansion | Medium |
| 8 | Sparse initializers | Count parameters only | High |
| 9 | Varint tensors | Decode them | High |
| 10 | Extra weight dtypes | Add all listed above | High |
| 11 | 1500-item cap | Filter edges and surface layout errors | High |
| 12 | Demo inputs | Per-input editors, shape editing, name-based defaults | Medium |
| 13 | Header check | Any valid first field tag | High |
| 14 | Existing models | Re-parse lazily via `PARSER_VERSION` | High |

## Verification

- Unit and integration tests for each item, with generated fixtures (INT64_MAX attribute,
  external data, subgraph initializers, sparse initializer, varint tensors, new dtypes).
- Headless e2e for uploading a model with external data.
- On freeride (approved): download ResNet-50, DistilBERT and a small LLM split into external data.
  Upload them to production with a test account, check graph, weights, demo and download. Then
  delete the account, the models and the downloaded files.

## Open questions

None.
