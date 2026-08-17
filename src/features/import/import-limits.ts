/** Conservative limits prevent accidental browser exhaustion and ZIP bombs. */
export const IMPORT_LIMITS = {
  maxFiles: 300,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalFileBytes: 100 * 1024 * 1024,
  maxZipUncompressedBytes: 100 * 1024 * 1024,
  maxZipEntries: 500,
} as const;
