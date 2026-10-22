# Current implementation

This guide describes the shipped local application. The [original blueprint](../RAGret_Blueprint.md) records the hackathon proposal; it is not a list of verified integrations. See [setup](../SETUP.md), [API routes](../README.md#api), and the [demo guide](../examples/README.md).

## Sources and decisions

Conversations record what the team proposed, approved, rejected, postponed, or reversed. References provide supporting requirements and policy context. They have separate upload pages and distinct graph presentation. Importing a reference indexes its passages without inventing team decisions or using generation credits.

Live conversation extraction retrieves relevant reference context, validates literal quotations, and saves decision observations with source receipts. Canonical subject and scope preserve decision identity across mentions. Re-extraction can replace that conversation's saved traces after successful validation. The full uploaded file remains available independently of the extraction limit.

Messaging context currently comes from uploaded exports or pasted text. There are no live Slack, WhatsApp, or email connectors. Generic text remains readable; structured speaker/timestamp cards support the prepared transcript format `M05 | YYYY-MM-DD HH:mm | Name: message`.

## Graph interaction

| Type | Visual treatment |
| --- | --- |
| Conversation | Teal, message icon, supporting message excerpt |
| Reference | Blue, document icon, cited page and passage |
| Decision | Purple, decision icon, state and summary |
| Person | Amber, person icon |
| Constraint | Rose, alert icon |
| Action | Green, completion icon |
| Fact | Cyan, lightbulb icon |
| Topic | Slate, tag icon |
| Group | Mauve, folder icon |

Filter chips show counts and hide/show types. Decisions remain visible as anchors. Hovering a node highlights connected paths and dims unrelated context. Cards can be dragged; the graph supports pan, zoom, a minimap, and resetting filters. The inspector stacks beneath the canvas on narrower screens. Motion follows the user's reduced-motion preference.

Conversation support edges are solid teal and labeled **documents**. Reference support edges are dashed blue and labeled **reference for**. Dependencies are purple; constraint links are dotted. Relationship inspection exposes saved receipts. Shared participants or topics alone do not establish dependency impact.

## Evidence previews and full viewers

Source cards choose a saved receipt for the focused decision when available, otherwise the first linked decision. The conversation preview shows the cited message and expandable previous/next messages when the exact text can be located. It retains synthetic-data labeling for the prepared demo. The reference preview shows the saved quotation, page number, and actual PDF page thumbnail.

Library rows offer the same evidence glimpse. A source without linked decision evidence can show its first stored chunk as a source excerpt without claiming that a decision exists.

**Open conversation** scrolls the full transcript to the cited message and highlights it. **Open document page** opens the PDF at the receipt's page, with a cited-passage banner and a text highlight when the quote matches extracted page text. The viewer supports full-text search, PDF navigation/zoom, and original-file downloads. Older records without retained originals explicitly offer only stored excerpts.

These previews show stored source passages. They do not generate new explanations or certify that a policy interpretation is correct.

## Provider and data flow

1. FastAPI stores uploaded originals and page-aware chunks locally.
2. Reference indexing or validated conversation extraction updates the SQLite graph.
3. The frontend reads the saved graph and fetches source chunks, full content, or rendered PDF pages as needed.
4. Questions retrieve graph context and original passages before calling the configured provider.
5. A provider transport failure can return labeled saved evidence. Extraction failures keep the source available for retry; output validation failures remain errors.

The frontend checks DeepSeek on startup, browser online events, and manual status clicks. Model discovery verifies access without generating a completion. ALMA remains configurable pending the organizer's endpoint/schema; its live compatibility is not yet verified.

Keys, uploaded records, SQLite data, local backups, build output, and browser artifacts are excluded from Git. The committed Northstar source pair is a public reference plus a deliberately fictional transcript; see its [provenance and loader instructions](../examples/README.md).

## UI verification

With the Northstar demo loaded:

1. Open Context graph and focus Authentication assurance baseline. Toggle People, then reset filters. Hover a decision and inspect connected-path emphasis.
2. Preview the conversation source. Inspect the cited message, expand neighboring messages, and open the full conversation. Confirm the cited message is highlighted.
3. Preview the reference source. Inspect the exact passage and page thumbnail, then open the full PDF. For the prepared baseline receipt this opens PDF page 17.
4. Open each source library and inspect its inline snippet. Download the original reference document from the viewer.
5. Check desktop and narrow mobile widths for readable controls and page overflow. On narrow screens, pan/zoom the graph to reach offscreen nodes.

The backend automated suite covers extraction, provenance, reference grounding, provider handling, downloads, and viewer endpoints. Build and lint validate the frontend. Graph filtering and source-jump behavior have also been checked manually in a real browser.
