# RAGret backend

FastAPI provides page-preserving ingestion, persistent decision extraction, a SQLite property graph, dependency traversal, source viewers, grounded questions, and DeepSeek/ALMA adapters. See [setup](../SETUP.md) for commands and the [root API table](../README.md#api) for routes.

## Source processing

- Conversation uploads trigger live extraction. Decisions retain chronological observations, participants, constraints, actions, and receipts.
- Reference uploads index the full supported document without generating approval events or calling the model. Conversation extraction retrieves up to eight relevant reference chunks and validates cited quotes against those chunks.
- Re-extract explicitly bypasses the unchanged-source cache. A failed extraction preserves existing traces and leaves the source available for retry.
- Original files are retained for exact downloads. PDF metadata preserves page numbers; PyMuPDF renders individual pages. Full transcript text is available independently of the extraction character limit.

## Persistence and provider access

Source metadata/chunks live in `backend/data/documents.json`; graph records live in `backend/data/context.sqlite3`; originals live in `backend/data/originals/`. These local paths are ignored by Git. Deleting a source retracts unsupported observations and relationships.

Configure keys only in the ignored `backend/.env`. The DeepSeek connection check uses authenticated model discovery. Generation has an eight-second connection timeout and a 90-second read timeout. Transport failures in graph questions can return explicitly labeled saved evidence; validation failures do not become fabricated answers. ALMA requires the organizer's actual endpoint and request/response schema.

Interactive API docs: http://127.0.0.1:3005/docs. The test suite uses `unittest` and mocked provider responses; run it with the commands in [SETUP.md](../SETUP.md#verification).

See [the implementation guide](../docs/IMPLEMENTATION.md) for the distinction between policy context, conversation evidence, and graph relationships.
