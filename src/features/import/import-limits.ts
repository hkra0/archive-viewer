/** Conservative limits prevent accidental browser exhaustion and ZIP bombs. */
export const IMPORT_LIMITS = {
  maxFiles: 300,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalFileBytes: 100 * 1024 * 1024,
  // ChatGPT's current export format bundles binary assets next to JSON shards.
  // Keep a finite ceiling while allowing a standard export with its attachments.
  maxZipUncompressedBytes: 160 * 1024 * 1024,
  maxZipEntries: 500,
} as const;
