# Universal Conversation Schema

The app transforms provider exports into `ConversationArchive` version `1.0`. A conversation contains a provider record, portable metadata, normalised messages, and attachments. UI components only use this schema and must not read provider-specific fields.

Message content is a list of typed blocks rather than a single string. This preserves Markdown, code, images, files, and future tool payloads without requiring a schema redesign.

Unknown source fields are retained only when useful in `metadata.extra`; adapters should emit a warning instead of silently inventing a value.
