/** Hard ceilings so a hostile or broken file can't make the parser allocate without bound. */
export const LIMITS = {
  maxNodes: 200_000,
  maxTensors: 500_000,
  maxDims: 16,
  maxNameBytes: 1024,
  maxAttributeListItems: 64,
  maxDocStringBytes: 4096,
  maxMetadataValueBytes: 1024,
  maxMetadataEntries: 256,
  /** Small messages (nodes, value infos) are decoded fully only below this size. */
  maxDecodedMessageBytes: 1024 * 1024,
  maxSafetensorsHeaderBytes: 100 * 1024 * 1024,
  maxSafetensorsJsonDepth: 4,
  maxStripSegments: 512,
} as const;
