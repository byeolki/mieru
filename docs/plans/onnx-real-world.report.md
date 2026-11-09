# Report: accept real-world ONNX files

Status: done. Deployed to https://mieru.dokploy.byeolki.me on 2026-11-09.

## Summary

All ten scope items in `onnx-real-world.md` are implemented.

**Parser**
- int64 attributes outside ±2^53 are kept as exact strings.
- External data: a version stores its `.onnx` plus data files as blobs (`model_files.kind = 'external_data'`, migration 003). Tensors point at them by `location`.
- A version with missing or short data files fails with `external_data_missing`, and the missing names are stored in `failure_detail`.
- Weights inside If/Loop/Scan bodies and sparse initializers count toward the totals.
- Any ModelProto field may come first in the file.
- `PARSER_VERSION` is 3.

**Weights**
- New decoders for every numeric dtype (int16/uint16/int64/uint32/uint64/bool/float8 ×4/int4/uint4).
- Varint-encoded tensors are decoded, streamed in chunks and resynchronized for sampling windows.
- Weights are read from external data files too.

**Diff and download**
- Tensors are hashed from whichever file holds them.
- The file ticket lists the data files, each with the exact `location` the runtime needs.
- The download button opens a file list when there is more than one file.

**Upload UI**
- The model page and the new-version panel accept the `.onnx` together with its data files and upload them in sequence.

**Graph**
- Past the 1,500-item cap, edges only connect kept items. A failed layout shows an error instead of spinning.

**Demo**
- Every input and its shape can be edited, with name-based defaults.
- More input dtypes are supported.
- If the patched session fails, it retries without intermediates.
- External data is passed to the runtime.
- Fully symbolic NCHW inputs such as `pixel_values` count as RGB images.

**Not in the plan, requested during the work**
- Light/dark toggle in the header, applied before the first paint by `public/theme-init.js`.
- Labelled example cards on the landing while nothing is public.

**Deviations**
- The weights stats cache is keyed by model blob + data blob + tensor name, because versions can share one blob without the other.
- Integration tests now default to a 1 MiB disk reserve. Before, they failed whenever the developer's disk had under 50 GiB free.
- The local `.env` (gitignored) sets `DISK_RESERVE_BYTES=1 GiB` for the same reason.

## Tests

| Command | Result |
|---|---|
| `npm run test:unit` | 234 passed |
| `npx vitest run --project integration` | 127 passed, including the new `external-data.int.test.ts` |
| `E2E_BASE_URL=… npx playwright test` (headless) | 21 passed, including `external-data.spec.ts` and the theme toggle |
| `tsc`, `eslint .`, `prettier --check .` | clean (1 existing warning) |

The capped-edge regression test fails on the old code and passes on the fix.

Before the migration ran, the production database was dumped to `/data/projects/mieru/backups/predeploy-003-202611091104.sql.gz` on freeride.

## Real models in production (approved)

The models were downloaded on freeride and uploaded with a test account directly to the app container. The account was deleted afterwards, which removed its models; the downloads, the job container and the pulled images were deleted too.

| Model | Result |
|---|---|
| ResNet-50 (Optimum, opset 11) | Ready in 2 s. 25.5M params, 122 nodes. Browser demo ran on WASM: top-1 #911 at 23.1%, with feature maps. It first failed on 1-channel input; fixed in `84fda2b`. |
| DistilBERT SST-2 (Optimum) | Ready. 67.0M params, 435 nodes. Demo ran with two int64 inputs (66.8% / 33.2%), with feature maps. |
| BERT-SQuAD 8 (tf2onnx, opset 8) | Ready. 108.9M params, 1,166 nodes. int32/int64/float32 stats all returned. |
| Gemma-3 270M (0.2 MB `.onnx` + 1.1 GB `model.onnx_data`) | Ready. 284.9M params, which include the stored rotary caches. Embedding stats read from the data file. Data download answers range requests with 206. The demo correctly refuses it: over 512 MB. |

## Needs manual check

- **INT64 sentinel attributes:** none of the four real models had any. That path is covered only by the generated `quirks.onnx` fixture.
- **WebGPU:** headless runs used WASM. WebGPU on a real GPU, and models near the 512 MB demo limit, are untested.
- **Many-file exports:** exports that write one file per tensor (hundreds of files) are untested. They upload one file at a time.
- **Graph view of subgraph bodies:** If/Loop/Scan bodies still show only a node count, by plan.

## Open questions

None.
