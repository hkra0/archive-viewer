import { z } from "zod";

/** The stable format consumed by every UI feature and importer. */
export const MessageRoleSchema = z.enum(["system", "user", "assistant", "tool", "unknown"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageContentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("markdown"), markdown: z.string() }),
  z.object({ type: z.literal("code"), code: z.string(), language: z.string().optional() }),
  z.object({ type: z.literal("image"), attachmentId: z.string(), alt: z.string().optional() }),
  z.object({ type: z.literal("file"), attachmentId: z.string() }),
  z.object({ type: z.literal("tool-call"), name: z.string(), input: z.unknown().optional() }),
  z.object({ type: z.literal("tool-result"), name: z.string().optional(), output: z.unknown() }),
  z.object({ type: z.literal("unknown"), raw: z.unknown() }),
]);
export type MessageContentBlock = z.infer<typeof MessageContentBlockSchema>;

export const UniversalAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string().optional(),
  size: z.number().nonnegative().optional(),
  createdAt: z.string().datetime().optional(),
  sourcePath: z.string().optional(),
  objectUrl: z.string().optional(),
  /** Raw attachment data is kept only while importing / in IndexedDB. */
  blob: z.custom<Blob>((value) => typeof Blob !== "undefined" && value instanceof Blob).optional(),
  textContent: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UniversalAttachment = z.infer<typeof UniversalAttachmentSchema>;

export const UniversalMessageSchema = z.object({
  id: z.string(),
  /** Stable provider ID when an export exposes one. Internal IDs may differ after merge conflicts. */
  sourceMessageId: z.string().optional(),
  /** Stable, normalised representation of the message payload used for local deduplication. */
  contentHash: z.string().optional(),
  /** Identifies the import which introduced this local node. */
  importBatchId: z.string().optional(),
  role: MessageRoleSchema,
  content: z.array(MessageContentBlockSchema).min(1),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  parentMessageId: z.string().optional(),
  model: z.string().optional(),
  authorName: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UniversalMessage = z.infer<typeof UniversalMessageSchema>;

export const UniversalConversationSchema = z.object({
  id: z.string(),
  provider: z.object({
    id: z.string(),
    name: z.string(),
    sourceFormat: z.string().optional(),
    sourceVersion: z.string().optional(),
  }),
  metadata: z.object({
    title: z.string(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    modelNames: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    sourceConversationId: z.string().optional(),
    sourceUrl: z.string().optional(),
    language: z.string().optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
  messages: z.array(UniversalMessageSchema),
  attachments: z.array(UniversalAttachmentSchema),
  warnings: z.array(z.object({
    code: z.string(),
    message: z.string(),
    conversationId: z.string().optional(),
    messageId: z.string().optional(),
  })).optional(),
});
export type UniversalConversation = z.infer<typeof UniversalConversationSchema>;

export const ConversationArchiveSchema = z.object({
  schemaVersion: z.literal("1.0"),
  exportedAt: z.string().datetime().optional(),
  sourceFiles: z.array(z.object({
    name: z.string(),
    size: z.number().nonnegative(),
    mimeType: z.string().optional(),
    lastModified: z.number().optional(),
  })),
  conversations: z.array(UniversalConversationSchema),
});
export type ConversationArchive = z.infer<typeof ConversationArchiveSchema>;

export interface ImportWarning {
  code: string;
  message: string;
  conversationId?: string;
  messageId?: string;
}
