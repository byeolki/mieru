import { PARSER_VERSION, type ModuleNode, type ParsedModel } from '@mieru/shared';
import type { Pool } from 'mysql2/promise';
import { selectOne } from '../../db/query.js';
import { readGzipJson, sidecarPath } from '../../storage/disk.js';

function modulePaths(root: ModuleNode, into: Set<string>): Set<string> {
  for (const child of root.children) {
    into.add(child.path);
    modulePaths(child, into);
  }
  for (const tensor of root.tensors)
    into.add(root.path ? `${root.path}.${tensor.name}` : tensor.name);
  return into;
}

/**
 * True when `nodeRef` names a node (ONNX) or module/tensor path (safetensors) of the
 * repository's current version. Returns null when the graph isn't available to check.
 */
export async function isKnownNodeRef(
  pool: Pool,
  storageDir: string,
  modelId: string,
  nodeRef: string,
): Promise<boolean | null> {
  const blob = await selectOne<{ storage_key: string }>(
    pool,
    `SELECT b.storage_key FROM models m
       JOIN model_files f ON f.version_id = m.current_version_id AND f.kind = 'model'
       JOIN blobs b ON b.id = f.blob_id
      WHERE m.id = ?`,
    [modelId],
  );
  if (!blob) return null;
  let parsed: ParsedModel;
  try {
    parsed = (await readGzipJson(
      sidecarPath(storageDir, blob.storage_key, 'graph', PARSER_VERSION),
    )) as ParsedModel;
  } catch {
    return null;
  }
  if (parsed.payload.kind === 'onnx-graph')
    return parsed.payload.nodes.some((node) => node.name === nodeRef);
  return modulePaths(parsed.payload.root, new Set()).has(nodeRef);
}
