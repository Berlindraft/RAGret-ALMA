# Northstar authentication demo

This demo pairs a real public NIST reference with a fictional, 4,000-word conversation:

- `reference-documents/nist-authentication-guidelines-800-63b-4.pdf`: unchanged official 129-page NIST SP 800-63B-4, July 2025. Downloaded from https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf.
- `reference-documents/northstar-security-conversation.md`: 64 scripted messages across eight dated sessions using the team names Raymund Zyron, John Lorenzo, and Jhon Paul. Messages, project events, test scenarios, and approvals are fictional; role assignments are for the demonstration only.

Stop the backend, then run `.venv/Scripts/python.exe examples/load_nist_demo.py` from the repository root. Restart the backend afterward. The command **replaces the active workspace**, backing up its documents and SQLite graph under the ignored `output/nist-demo-backup/` directory before writing. It loads two sources, eight decisions, and 17 chronological observations. Every saved quote is validated against its source. It does not call an AI provider or consume credits.

The full reference is indexed locally. Selected, hand-curated reference passages link to the relevant decisions without manufacturing approval events in the policy document. The conversation traces are labeled `curated-synthetic`; they are prepared demo data, not a claim that live AI extraction produced them. Asking questions still calls the configured model provider. Reviewing saved traces, receipts, and dependency impact works without that provider.

New conversations use live extraction with relevant reference context and quote-validated citations. Reference documents are indexed without generating decision events. The prepared transcript can also be re-extracted with live AI using its **Re-extract** control; doing so replaces its curated traces after successful validation. Connection can be checked through the provider status in the top bar.

Suggested walkthrough:

1. Open Reference documents and inspect the real 129-page source.
2. Open Conversations and inspect the clearly labeled fictional discussion.
3. Select Password rotation: proposed, initially approved, then explicitly reversed after reference review.
4. Select Email OTP sign-in: rejected for normal authentication, without falsely prohibiting all email recovery or address validation.
5. Select Session timeouts: distinguish the team's 12-hour/30-minute limits from the reference's 24-hour/one-hour recommendations.
6. Inspect the impact of Authentication assurance baseline: phishing-resistant sign-in and session timeouts lead to the security launch gate.
7. In Context graph, toggle type filters and hover a decision to highlight its connected context. Teal conversation links and dashed blue reference links distinguish team evidence from policy guidance.
8. Preview the baseline's conversation receipt, expand adjacent messages, and open the full transcript at the highlighted message. Preview its reference receipt and open PDF page 17. Library rows provide inline snippets, and the reference viewer can download the unchanged original PDF.

This is a selected demonstration, not a complete implementation assessment or claim of NIST certification, legal compliance, complete AAL2 conformance, or NIST endorsement. The approved launch gate does not imply that tests passed or that a release was approved.
