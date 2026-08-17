# Writing an adapter

Implement `FormatAdapter` in `src/adapters`. `detect` must return a conservative confidence score based on structural evidence, while `parse` must return `UniversalConversation` objects and non-fatal warnings.

Do not make UI changes for a provider. Never send export content over the network. Add a small, redacted fixture and tests for every adapter.
