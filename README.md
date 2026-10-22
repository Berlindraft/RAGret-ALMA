# RAGret

**No more regrets. Just receipts.**

A local decision-memory app. Upload project records or conversation exports, extract persistent decision traces, and explore their people, constraints, evidence, and explicit dependencies in an interactive context graph.

## Run locally

Requires Node.js 22+ and Python 3.11+.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm --prefix frontend install
```

On a fresh checkout, copy `backend/.env.example` to `backend/.env` and add your provider key. The existing local environment already contains the supplied DeepSeek key. Do not overwrite it or commit it.

Start the backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 3005
```

Start the frontend in another terminal:

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1
```

Open **http://127.0.0.1:5173**. No PostgreSQL, Neo4j, or embedding service is required.

## What the app does

- **Sources:** PDF, UTF-8 TXT/Markdown, and pasted meeting/chat/email exports. Uploading in the UI automatically runs extraction. Failed extractions retain the source for retry.
- **Persistent decision identity:** Canonical subject plus release/scope identifies a decision independently of its state and participants. Repeated mentions add observations and receipts. v1 and v2 remain separate decisions.
- **Enrichment:** Extracts people and their roles, topical clusters, topics, constraints/risks, facts, and documented actions.
- **Context graph:** Pan, zoom, move cards, inspect nodes, and click relationships to inspect their evidence. Focus on one trace, expand the graph, or view the full workspace.
- **Decision register:** Search across decision content and connected context. Filter by state, person, constraint, and topical group.
- **History:** Saved observations with source-supported dates. Same-date observations retain their extraction/source order; unknown dates stay unknown.
- **Impact analysis:** Traverses explicit `depends_on` relationships across multiple hops, returning the chain and its source receipts. Sharing a topic or participant is not a dependency.
- **Graph-backed questions:** Ranks stored decisions by lexical relevance, graph degree, and recency; expands documented decision links; generates a cited answer from the original passages and saved graph context.
- **Exports:** Full property graph as JSON; individual traces as Markdown; source citations via clipboard.

The interface uses React Flow, Lucide icons, restrained Motion transitions, locally bundled DM Sans/Manrope fonts, and native scrolling. Ctrl/Cmd+K focuses the question field. Reduced-motion preferences are respected.

## Synthetic example

Project Atlas contains **six explicitly synthetic sources** and six decision identities. Its traces are hand-curated and quote-validated; opening this example spends no AI credits. Uploaded records use live AI extraction.

Try these workflows:

1. Inspect **Offline mode / v1**: proposal, approval, reliability risk, and explicit postponement.
2. Inspect **Offline mode / v2**: reconsideration remains proposed, not approved.
3. Select **Synchronization prototype / v2 → Impact**: offline mode is one dependency step away, and the offline pilot is two steps away.
4. Filter decisions by **Adrian Cruz** or **May 1 delivery deadline**.
5. Ask why offline mode was postponed, or ask about an undocumented biometric-login approval.

Choose **Create an empty workspace** before importing a larger private corpus. Workspace switching replaces current records; export first if needed. Initial startup upgrades the earlier synthetic sample when no graph has been created. Existing user-uploaded records are retained and remain pending until extracted.

## Storage and grounding

`backend/data/documents.json` stores source metadata and text chunks. `backend/data/context.sqlite3` stores validated extraction records plus typed graph nodes and edges. Both are ignored by Git. The graph is a **SQLite-backed property graph**, with recursive SQL traversal for dependency impact; it does not run a native graph server.

Every observation references a stored chunk. Extracted quotations and people are validated against that chunk before saving. Invalid output receives one repair attempt; failure does not silently create demo traces. Graph nodes/edges are rebuilt transactionally from saved extractions. Deleting a source retracts observations and graph links that no remaining record supports. Repeated extraction of unchanged source content reuses saved traces without another model call.

Identity resolution uses model reuse of existing canonical labels plus conservative normalized-name matching within the same scope. Topical grouping is inferred by extraction and normalized cluster names. This is not universal semantic deduplication. A matching quote proves provenance, not the correctness of every interpretation; review receipts. Competing governing states remain unresolved unless explicit supersession is documented. A later proposal does not overwrite an established approval or postponement.

## Limits

A workspace supports eight files, 10 MB per file, and 200 pages per PDF. Live extraction supports at most 60,000 extracted characters per source, batched into bounded model requests. Scanned PDFs need OCR elsewhere. Include ISO dates in source text where possible. Document dates and event dates are separate; upload time is never an event date.

This is a single-user local app without production authentication or multi-user isolation. Retrieved text is sent to the configured AI provider. Slack/WhatsApp/email exports can be imported, but there are no live service connectors. Documented actions are represented, never executed. Confidence percentages are not presented as measured accuracy.

## Providers

DeepSeek uses its documented chat-completions endpoint, `deepseek-flash`, JSON output, and non-thinking mode. Override `DEEPSEEK_MODEL` if needed. See [DeepSeek's documentation](https://api-docs.deepseek.com/).

For ALMA, use the exact endpoint and schema supplied by organizers:

```dotenv
AI_PROVIDER=alma
ALMA_API_URL=https://organizer-provided-exact-endpoint
ALMA_API_KEY=your-private-team-key
ALMA_MODEL=organizer-provided-identifier
ALMA_AUTH_HEADER=Authorization
ALMA_AUTH_PREFIX="Bearer "
ALMA_REQUEST_TEMPLATE='{"model":"$model","messages":"$messages"}'
ALMA_RESPONSE_PATH=choices.0.message.content
```

The request schema above is illustrative. Template values `$messages`, `$model`, and `$prompt` substitute a messages array, model identifier, or combined prompt. The dotted response path supports array indices; leave it empty for a direct structured JSON answer. No OpenAI-compatible ALMA route is assumed. Restart the backend after changing configuration. Live ALMA verification awaits organizer credentials/schema.

## Validation

```powershell
$env:PYTHONPATH='backend'
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
npm --prefix frontend run build
npm --prefix frontend run lint
```

The tests mock model responses and spend no credits. They cover ingestion, citation rejection, absent evidence, failures, ALMA configuration, persistent identities, source removal, conflict handling, entity/constraint filtering, cached extraction, multi-hop impact, cycles, and exported provenance.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/workspace` | Saved graph, sources, extraction state, and counts |
| `POST /api/documents` | Parse sources and preserve page/chunk metadata |
| `POST /api/workspace/extract` | Extract pending source IDs; unchanged content is reused |
| `GET /api/workspace/search` | Ranked graph search with people/constraint/state/group filters |
| `GET /api/workspace/decisions/{id}/impact` | Explicit downstream dependency paths with receipts |
| `POST /api/workspace/ask` | Graph-backed, source-cited questions |
| `GET /api/evidence/{chunk_id}` | Original stored passage |
| `DELETE /api/workspace/sources/{id}` | Remove a source and retract unsupported traces |
| `GET /api/workspace/export` | Full JSON property graph |
| `POST /api/workspace/demo` | Replace the workspace with the synthetic example |
| `POST /api/workspace/clear` | Create an empty workspace |

Interactive API documentation: http://127.0.0.1:3005/docs

Conceptual inspiration: [Decision Traces / Context Graphs](https://medium.com/chettoai/we-built-a-system-that-extracts-decisions-from-conversations-0effb06f73ad). This is an independent implementation adapted to the document-RAG hackathon brief.
