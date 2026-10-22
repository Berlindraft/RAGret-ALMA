# RAGret frontend

React + Vite with React Flow, Lucide, Motion, and locally bundled DM Sans/Manrope fonts. See [setup](../SETUP.md) for installation and run commands. Vite proxies `/api` to port 3005.

## Current interface

- Separate conversation and reference libraries, with upload, full-source viewing, inline evidence glimpses, and original-file downloads.
- Typed graph cards for conversations, references, decisions, people, constraints, actions, facts, topics, and groups. Type chips show counts and toggle visibility; decision cards remain visible.
- Pan/zoom, draggable cards, a minimap, connected-path highlighting, and focused/full-workspace views. Conversation support is solid teal, reference support is dashed blue, and dependencies use purple.
- Conversation previews show the cited message and expandable neighboring messages. Reference previews show the exact quote and a rendered PDF page thumbnail. Full-source links open at the cited message/page.
- Decision register, history, dependency impact, source receipts, and graph-backed questions. Ctrl/Cmd+K focuses the question field.
- Larger text and controls, responsive layouts, reduced-motion support, and the supplied avatar as logo/favicon. Provider status can be clicked to recheck connectivity.

## Files to know

| File | Responsibility |
| --- | --- |
| `src/App.jsx` | Navigation, libraries, questions, dialogs, provider status |
| `src/ContextGraph.jsx` | Graph layout, node types, filters, highlighting, minimap |
| `src/graphContext.js` | Type metadata, linked receipt selection, transcript parsing |
| `src/GraphPreview.jsx` | Conversation/reference graph preview panel |
| `src/EvidencePreview.jsx` | Inline source-library snippets |
| `src/SourceViewer.jsx` | Full transcript/PDF viewer and cited-passage navigation |
| `src/graph-context.css` | Typed cards, previews, graph responsive styles |
| `src/readability.css` | Larger typography and controls |
| `public/brand/ragret-logo.png` | Shared website logo/icon |

Run `npm run build` and `npm run lint` from this directory. See [UI verification](../docs/IMPLEMENTATION.md#ui-verification) for the source-preview walkthrough.
