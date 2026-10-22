# RAGret

<p align="center">
  <img src="frontend/public/brand/ragret-logo.png" alt="RAGret logo" width="160" />
</p>

**No more regrets. Just receipts.** Turn conversations and reference documents into a traceable history of what your team decided, what changed, and why.

## Team

**KodoTech** - Future Forge: The ALMA Hackathon, October 22, 2026.

| Name | Role |
| --- | --- |
| Raymund Zyron | Project team |
| John Lorenzo | Project team |
| Jhon Paul | Project team |

## What it does

Teams remember what they decided but often lose the reasoning across meeting notes, chat exports, and requirements. RAGret connects those records so users can investigate a decision and inspect the original evidence.

The MVP provides:

- **Separate conversation and reference libraries:** Upload PDF, TXT, Markdown, or pasted discussions. Conversations record team decisions; references supply background guidance.
- **Persistent decision history:** Track proposals, approvals, rejections, postponements, and documented reversals while keeping release scopes separate.
- **Interactive context graph:** Explore decisions, people, constraints, actions, facts, topics, groups, and sources with typed cards, filters, connected-path highlighting, and a minimap.
- **Evidence previews and viewers:** Glimpse the cited conversation message or reference passage, open the exact message or PDF page, and download retained originals.
- **AI questions with citations:** Ask why something was decided and receive an answer grounded in saved decisions and source passages.
- **Dependency impact and exports:** Follow explicit dependencies and export the graph or individual decision traces.

The responsive interface uses larger text and controls, locally bundled fonts, and reduced-motion support.

## Demo video

- [Watch the MVP live demo on YouTube](https://youtu.be/4OlcFbmS5CM)
- [Watch the setup and narrated walkthrough on YouTube](https://youtu.be/xdFQnc7oE2U)

Download copies and presentation screenshots:

- [MVP live demo - 1 minute 45 seconds, screen recording](https://raw.githubusercontent.com/Berlindraft/RAGret-ALMA/main/RAGret-Live-Demo.mp4)
- [Narrated setup and walkthrough - 3 minutes 50 seconds](https://raw.githubusercontent.com/Berlindraft/RAGret-ALMA/main/RAGret-Setup-and-Demo.mp4)
- [Project screenshots](https://github.com/Berlindraft/RAGret-ALMA/raw/refs/heads/main/RAGret-Screenshots.zip)

For a local walkthrough, see the [Northstar demonstration guide](examples/README.md). It pairs a real 129-page NIST reference with a clearly fictional 64-message conversation, eight curated decisions, and 17 observations.

## Slides

Presentation PDF (public, no sign-in required):

https://github.com/Berlindraft/RAGret-ALMA/blob/main/RAGret%20-%20KodoTech%20Presentation.pdf

## How it works

| Layer | Technology and purpose |
| --- | --- |
| Frontend | React, Vite, React Flow, Lucide, and Motion |
| Backend | Python, FastAPI, and Pydantic validation |
| Document processing | PyMuPDF for PDF text extraction and page rendering |
| Storage | SQLite property graph, JSON text chunks, and retained original files |
| AI | Configurable hosted model API for structured extraction and cited answers |
| Retrieval | Weighted word matching, graph connections, and recency |

```text
Upload references + conversations
    -> Extract text and preserve source locations
    -> Retrieve relevant reference passages
    -> AI extracts structured decision observations
    -> Validate quotations and save the decision graph
    -> Retrieve decisions and evidence for cited answers
```

The current development provider is DeepSeek. An ALMA adapter supports the organizer-provided endpoint once its actual schema and credentials are configured; live ALMA compatibility remains unverified. Claude Haiku and embeddings are not used in the current implementation. No vector database, PostgreSQL, or Neo4j service is required.

RAGret adds a persistent decision layer to basic document RAG: stable decision identities, chronological observations, state-resolution rules, explicit dependencies, and source receipts. The model interprets text; deterministic backend checks validate the supplied quotations before records are saved. Adding a reference does not silently rewrite earlier decisions: re-extract an existing conversation to analyze it with updated references.

Read the [technical overview](TECHNICAL_OVERVIEW.md) for the architecture, algorithms, and source-code map, or the [implementation guide](docs/IMPLEMENTATION.md) for UI behavior.

## How to run it


Requires Node.js 22+ and Python 3.11+.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm --prefix frontend install
```

On a fresh checkout, copy `backend/.env.example` to `backend/.env` and add your provider key. Preserve any existing local configuration. Credentials and local workspace data are ignored by Git.

Start the backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 3005
```

Start the frontend in another terminal:

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1
```

Open **http://127.0.0.1:5173**. No PostgreSQL, Neo4j, or embedding service is required.

## Business plan

Full business-model PDF (public, no sign-in required):

https://github.com/Berlindraft/RAGret-ALMA/blob/main/RAGret%20-%20Business%20Model%20-%20KodoTech.pdf

This is a proposed direction for the hackathon MVP, not an existing commercial offering.

| Area | Plan |
| --- | --- |
| Problem | Decision rationale becomes scattered across conversations and documents, making handovers, reviews, and change assessment difficult. |
| Target users | Student and capstone teams, software teams, project managers, and teams onboarding new members. |
| Solution and value | A searchable decision history with evidence, reducing time spent reconstructing context and helping users verify why a decision was made. |
| Revenue or sustainability | A free local starter with user-supplied model credentials; a proposed PHP 499/month shared workspace for up to five members; and scoped organization deployment/support. Shared workspaces and billing require further development. Prices and willingness to pay remain unvalidated. |
| Competition | Alternatives include document chat tools, meeting summarizers, team wikis, and manual decision logs. RAGret focuses on decision state, changes over time, dependencies, and direct evidence inspection. Comparative performance has not been benchmarked. |
| Next steps | Proposed 90-day pilot: 15 interviews, five supervised teams, and two price acceptances as targets. Verify ALMA integration, add authentication and shared workspaces, introduce background extraction jobs, and evaluate retrieval and extraction quality. Messaging integrations are future work. |

The current MVP is a local, single-user application. It has no paying customers or validated revenue model claimed here.

## Further documentation

- [Setup and troubleshooting](SETUP.md)
- [Simple technical overview and architecture](TECHNICAL_OVERVIEW.md)
- [Current implementation](docs/IMPLEMENTATION.md)
- [Backend guide](backend/README.md) and [frontend guide](frontend/README.md)
- [Hackathon demo and source provenance](examples/README.md)
- [Original project blueprint](RAGret_Blueprint.md)

## Synthetic example

For the larger hackathon demonstration, follow [examples/README.md](examples/README.md). Northstar Portal pairs an unchanged 129-page public NIST reference with a fictional 64-message team conversation, eight curated decisions, and 17 observations. Loading it explicitly replaces the active workspace after making a local backup; a fresh checkout does not automatically load this dataset.

Project Atlas contains **six explicitly synthetic sources** and six decision identities. Its traces are hand-curated and quote-validated; opening this example spends no AI credits. Uploaded records use live AI extraction.

Try these workflows:

1. Inspect **Offline mode / v1**: proposal, approval, reliability risk, and explicit postponement.
2. Inspect **Offline mode / v2**: reconsideration remains proposed, not approved.
3. Select **Synchronization prototype / v2 → Impact**: offline mode is one dependency step away, and the offline pilot is two steps away.
4. Filter decisions by **Raymund Zyron** or **May 1 delivery deadline**.
5. Ask why offline mode was postponed, or ask about an undocumented biometric-login approval.

Choose **Create an empty workspace** before importing a larger private corpus. Workspace switching replaces current records; export first if needed. Initial startup upgrades the earlier synthetic sample when no graph has been created. Existing user-uploaded records are retained and remain pending until extracted.

## Storage and grounding

`backend/data/documents.json` stores source metadata and text chunks. `backend/data/context.sqlite3` stores validated extraction records plus typed graph nodes and edges. Original uploads are retained under `backend/data/originals/` for full-source viewing and exact-file downloads. All three are ignored by Git. The graph is a **SQLite-backed property graph**, with recursive SQL traversal for dependency impact; it does not run a native graph server.

Click a source title or **View** in either library to open its full viewer. PDFs support page navigation, zoom, text search, and downloading the original PDF. Conversations retain the full transcript with search; the prepared Northstar transcript displays speakers, timestamps, and session headings. Evidence receipts also offer **Open full source** at the cited PDF page. Older sources whose originals were not retained show an explicit excerpts-only notice.

If the model API cannot be reached, graph questions show explicitly labeled **Saved evidence · AI unavailable**: related saved decision summaries, history, and citations. This is retrieval of existing records, not a generated answer, and it may not fully answer the question. Extraction still requires the model. Backend health information distinguishes a configured key from a successful connection, and connection attempts time out after eight seconds rather than waiting for the full generation timeout. The next question retries the provider automatically.

The frontend checks provider access on load and when the browser reports coming online. The connection badge is intentionally hidden from the interface. Authenticated model discovery checks access without generating a completion; live requests can still fail later. The backend check endpoint remains available for troubleshooting.

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

The tests mock model responses and spend no credits. They cover ingestion, citation rejection, absent evidence, failures, ALMA configuration, persistent identities, source removal, conflict handling, entity/constraint filtering, cached extraction, multi-hop impact, cycles, exported provenance, reference grounding, provider checks, original-file downloads, and source viewers. UI verification also covers graph filters, conversation/PDF preview links, citation highlighting, and mobile overflow.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/workspace` | Saved graph, sources, extraction state, and counts |
| `POST /api/documents` | Parse sources and preserve page/chunk metadata |
| `POST /api/provider/check` | Recheck DeepSeek credentials and configured-model access |
| `GET /api/documents/{id}/content` | Full source text and viewer metadata |
| `GET /api/documents/{id}/file?download=true` | Download the retained original file |
| `GET /api/documents/{id}/pages/{page}/image` | Render a retained PDF page for the viewer |
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
