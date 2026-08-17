# Privacy model

- Imports are read with the Browser File API and parsed in page memory. Folder imports use the same path-aware pipeline without an archive extraction step.
- ZIP archives are expanded locally and are limited by entry count and uncompressed size.
- Imported groups, conversations, attachments, and import batch metadata are persisted only in the browser's IndexedDB database. The application has no sign-in, server-side database, upload endpoint, analytics SDK, or automatic network request.
- Search indexes are rebuilt in memory; persisted source data remains local until the user deletes its group or clears all local data.
- Attachment Blob URLs are revoked when switching, deleting, or clearing groups. The underlying attachment Blob is removed from IndexedDB when its group is deleted.
- Current-branch exports are generated locally and require a user action to copy.

The “account” label is a local grouping hint only. It is derived from an imported package when possible and does not create or connect an online account.
