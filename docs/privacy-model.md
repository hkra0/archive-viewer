# Privacy model

- Imports are read with the Browser File API and parsed in page memory.
- ZIP archives are expanded locally and are limited by entry count and uncompressed size.
- The app contains no sign-in, database, upload endpoint, analytics SDK, or automatic network request.
- Search indexes are rebuilt in memory and discarded with the current session.
- Attachment Blob URLs are revoked when the user clears the session.
- Context Snapshots are generated locally and require a user action to copy or download.

Optional persisted storage and remote AI summarisation are deliberately out of scope for this MVP.
