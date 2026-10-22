"""Replace the local workspace with the real NIST reference and a curated fictional demo.

Run with the backend stopped: .venv/Scripts/python.exe examples/load_nist_demo.py
The old documents and graph are backed up under ignored output/ before replacement.
No provider call is made; scripted traces are labeled curated-synthetic, not AI output.
"""

import hashlib
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.graph_schema import Extraction, validate_extraction, normalize

FILES = ROOT / "examples" / "reference-documents"


def build_demo():
    pdf_path = FILES / "nist-authentication-guidelines-800-63b-4.pdf"
    reference_id = hashlib.sha256(pdf_path.read_bytes()).hexdigest()[:16]
    reference_chunks = []
    with pymupdf.open(pdf_path) as pdf:
        page_count = len(pdf)
        for page, source in enumerate(pdf, 1):
            text = source.get_text()
            for offset in range(0, len(text), 880):
                part = text[offset : offset + 1000].strip()
                if part:
                    reference_chunks.append(
                        dict(
                            chunk_id=f"{reference_id}_p{page}_c{offset // 880 + 1}",
                            page=page,
                            section=f"NIST SP 800-63B-4 - original PDF page {page}",
                            text=part,
                        )
                    )
    reference = dict(
        document_id=reference_id,
        filename=pdf_path.name,
        title="NIST authentication guidelines - full 129-page reference",
        document_date="2025-07-31",
        source_type="reference",
        synthetic=False,
        pages=page_count,
        warnings=[],
        chunks=reference_chunks,
        source_url="https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf",
    )
    transcript_path = FILES / "northstar-security-conversation.md"
    text = transcript_path.read_text("utf-8")
    conversation_id = hashlib.sha256(text.encode()).hexdigest()[:16]
    chunks, messages = [], {}
    section = "Transcript provenance and participants"
    for number, block in enumerate(text.split("\n\n"), 1):
        if not block.strip():
            continue
        if block.startswith("## "):
            section = block[3:]
        chunk = dict(
            chunk_id=f"{conversation_id}_p1_c{number}",
            page=1,
            section=section,
            text=block,
        )
        chunks.append(chunk)
        match = re.match(
            r"(M\d+) \| (\d{4}-\d{2}-\d{2}) \d{2}:\d{2} \| ([^:]+):", block
        )
        if match:
            messages[match[1]] = (chunk, match[2], match[3])
    conversation = dict(
        document_id=conversation_id,
        filename=transcript_path.name,
        title="Northstar security design - 8 sessions, 64 fictional messages",
        document_date="2026-10-12",
        source_type="conversation",
        synthetic=True,
        pages=1,
        warnings=[
            "Scripted hackathon conversation using team names; messages, events, and decisions are fictional."
        ],
        chunks=chunks,
        workspace_name="Northstar Portal",
        suggested_questions=[
            "Why was password rotation reversed?",
            "Why was email OTP sign-in rejected?",
            "What depends on the authentication assurance baseline?",
        ],
    )

    def ref(page, phrase, label):
        # The phrase can normalize line wrapping; save the exact original text as the receipt.
        for chunk in reference_chunks:
            if chunk["page"] != page:
                continue
            words = re.findall(r"\S+", phrase)
            pattern = r"\s+".join(re.escape(word) for word in words)
            match = re.search(pattern, chunk["text"])
            if match:
                return dict(chunk_id=chunk["chunk_id"], quote=match[0], label=label)
        raise ValueError(f"Reference passage not found on PDF page {page}: {phrase}")

    refs = {
        "Authentication assurance baseline": [
            ref(
                17,
                "At AAL2, authentication SHALL use either a multi-factor authenticator or a combination of two separate authentication factors.",
                "AAL2 requires two authentication factors",
            )
        ],
        "Phishing-resistant sign-in": [
            ref(
                18,
                "Verifiers SHALL offer at least one phishing-resistant authentication option at AAL2, as described in Sec. 3.2.5.",
                "AAL2 must offer a phishing-resistant option",
            )
        ],
        "Password policy": [
            ref(
                25,
                "Verifiers and CSPs SHALL NOT impose other composition rules (e.g., requiring mixtures of different character types) for passwords.",
                "Do not impose password composition rules",
            )
        ],
        "Password rotation": [
            ref(
                25,
                "Verifiers and CSPs SHALL NOT require subscribers to change passwords periodically. However, verifiers SHALL force a change if there is evidence that the authenticator has been compromised.",
                "No periodic password changes; change on compromise evidence",
            )
        ],
        "Email OTP sign-in": [
            ref(
                31,
                "Email SHALL NOT be used for out-of-band authentication because it may be vulnerable to:",
                "Email is not permitted for out-of-band authentication",
            )
        ],
        "Session timeouts": [
            ref(
                18,
                "SHOULD be no more than 24 hours at AAL2. The inactivity timeout SHOULD be no more than 1 hour.",
                "AAL2 recommends at most 24 hours overall and 1 hour inactivity",
            )
        ],
        "SMS fallback": [
            ref(
                33,
                "Use of the PSTN for out-of-band verification is restricted as described in this section",
                "PSTN out-of-band verification is restricted, not universally banned",
            )
        ],
    }
    specs = [
        (
            "M02",
            "Authentication assurance baseline",
            "proposed",
            "AAL2-oriented baseline proposed",
        ),
        (
            "M05",
            "Authentication assurance baseline",
            "approved",
            "AAL2-oriented baseline approved",
        ),
        ("M11", "Password policy", "proposed", "Uniform password policy proposed"),
        ("M12", "Password policy", "approved", "Uniform password policy approved"),
        ("M14", "Password rotation", "proposed", "30-day password expiry proposed"),
        (
            "M15",
            "Password rotation",
            "approved",
            "30-day password expiry initially approved",
        ),
        (
            "M18",
            "Password rotation",
            "reversed",
            "Scheduled rotation explicitly superseded",
        ),
        ("M26", "Phishing-resistant sign-in", "proposed", "Passkey option proposed"),
        (
            "M29",
            "Phishing-resistant sign-in",
            "approved",
            "Passkey option approved, subject to review",
        ),
        (
            "M33",
            "Email OTP sign-in",
            "proposed",
            "Email OTP proposed for normal sign-in",
        ),
        (
            "M35",
            "Email OTP sign-in",
            "rejected",
            "Email OTP rejected for normal authentication",
        ),
        (
            "M43",
            "Session timeouts",
            "proposed",
            "12-hour overall and 30-minute inactivity limits proposed",
        ),
        (
            "M45",
            "Session timeouts",
            "approved",
            "Stricter product session limits approved",
        ),
        ("M49", "SMS fallback", "proposed", "SMS fallback proposed"),
        (
            "M51",
            "SMS fallback",
            "postponed",
            "SMS fallback deferred pending restriction review",
        ),
        (
            "M57",
            "Security launch gate",
            "proposed",
            "Evidence-based security launch gate proposed",
        ),
        (
            "M60",
            "Security launch gate",
            "approved",
            "Launch gate approved; actual release remains unapproved",
        ),
    ]
    rationales = {
        "Authentication assurance baseline": "The fictional portal handles account and support-ticket information. The team voluntarily chooses an AAL2-oriented target without claiming certification or complete conformance.",
        "Password policy": "The team selects a uniform 15-character minimum and removes inherited composition requirements. The uniform minimum is a product choice, not the NIST minimum for all MFA passwords.",
        "Password rotation": "The legacy checklist initially led to 30-day expiry; Raymund Zyron explicitly reverses that approval after John Lorenzo reviews the prohibition on routine changes and the compromise exception.",
        "Phishing-resistant sign-in": "The chosen AAL2-oriented direction requires offering a phishing-resistant option. The WebAuthn choice still requires implementation and test review.",
        "Email OTP sign-in": "NIST prohibits email as out-of-band authentication. This rejection does not decide recovery or email-address verification.",
        "Session timeouts": "Shared-desk use motivates a stricter 12-hour overall and 30-minute inactivity product policy; the referenced AAL2 recommendations are 24 hours and one hour.",
        "SMS fallback": "The PSTN restrictions and mitigations have not been reviewed. The team defers v1 SMS rather than claiming the reference universally bans it.",
        "Security launch gate": "The pilot waits for checks of phishing-resistant sign-in, password policy, and session enforcement. Approving the gate is not approval to launch or evidence that tests passed.",
    }
    items = []
    for message_id, subject, state, action in specs:
        chunk, date, actor = messages[message_id]
        quote = chunk["text"]
        role = (
            "proposed_by"
            if state == "proposed"
            else (
                "rejected_by"
                if state == "rejected"
                else "approved_by" if state in ("approved", "reversed") else "mentioned"
            )
        )
        dependencies = []
        if subject in ("Phishing-resistant sign-in", "Session timeouts"):
            dependencies = ["Authentication assurance baseline"]
        elif subject == "Security launch gate":
            dependencies = [
                "Phishing-resistant sign-in",
                "Password policy",
                "Session timeouts",
            ]
        people = [dict(name=actor, role=role, quote=quote)]
        assignments = {
            "M05": ["John Lorenzo", "Jhon Paul"],
            "M12": ["Jhon Paul", "Jhon Paul"],
            "M18": ["John Lorenzo"],
            "M29": ["Jhon Paul", "Jhon Paul"],
            "M45": ["Jhon Paul", "Jhon Paul", "Jhon Paul"],
            "M51": ["John Lorenzo"],
            "M60": ["Jhon Paul", "Raymund Zyron"],
        }
        people.extend(
            dict(name=name, role="assigned_to", quote=quote)
            for name in dict.fromkeys(assignments.get(message_id, []))
        )
        rationale = rationales[subject]
        if subject == "Password rotation" and state != "reversed":
            rationale = "The legacy onboarding checklist motivates an initial 30-day expiry proposal and conditional approval; John Lorenzo's review is still pending at this point."
        items.append(
            dict(
                subject=subject,
                scope="v1",
                state=state,
                action=action,
                cluster=(
                    "Release readiness"
                    if subject == "Security launch gate"
                    else (
                        "Session security"
                        if subject == "Session timeouts"
                        else "Authentication design"
                    )
                ),
                rationale=rationale,
                event_date=date,
                chunk_id=chunk["chunk_id"],
                evidence_quote=quote,
                supersedes_previous=message_id == "M18",
                people=people,
                constraints=(
                    [
                        dict(
                            label="PSTN restriction review and mitigations incomplete",
                            quote=quote,
                        )
                    ]
                    if message_id == "M51"
                    else []
                ),
                outcomes=(
                    [
                        dict(
                            label="Maintain the requirement-to-test checklist",
                            quote=quote,
                        )
                    ]
                    if message_id == "M05"
                    else (
                        [
                            dict(
                                label="Implement server password validation and interface guidance",
                                quote=quote,
                            )
                        ]
                        if message_id == "M12"
                        else (
                            [
                                dict(
                                    label="Correct the legacy password-rotation checklist",
                                    quote=quote,
                                )
                            ]
                            if message_id == "M18"
                            else []
                        )
                    )
                ),
                topics=["NIST SP 800-63B-4", "Northstar Portal", "Authentication"],
                relations=[
                    dict(
                        target_subject=target,
                        target_scope="v1",
                        type="depends_on",
                        quote=quote,
                    )
                    for target in dependencies
                ],
                references=(
                    refs.get(subject, [])
                    if state != "proposed"
                    and not (subject == "Password rotation" and state == "approved")
                    else []
                ),
            )
        )
    payload = Extraction.model_validate(dict(decisions=items))
    validate_extraction(payload, chunks, reference_chunks)
    assert len(messages) == 64
    assert sum(len(c["text"]) for c in chunks) < 60000
    return [reference, conversation], payload.model_dump()


def load_demo():
    from app import main, graph_store as store

    docs, payload = build_demo()  # Validate every quote before changing the workspace.
    backup = (
        ROOT / "output" / "nist-demo-backup" / datetime.now().strftime("%Y%m%d-%H%M%S")
    )
    backup.mkdir(parents=True, exist_ok=True)
    for path in (main.DATA, store.DB):
        if path.exists():
            shutil.copy2(path, backup / path.name)
    main.documents[:] = docs
    for doc in docs:
        main.save_original(doc, (FILES / doc["filename"]).read_bytes())
    main.save()
    with store.connection() as con:
        con.execute("DELETE FROM records")
        con.execute("DELETE FROM failures")
    store.store_record(docs[0], dict(decisions=[]), "reference-index", docs)
    store.store_record(docs[1], payload, "curated-synthetic", docs)
    result = store.snapshot(docs)
    print(
        dict(
            stats=result["stats"],
            messages=64,
            observations=len(payload["decisions"]),
            conversation_words=len(
                (FILES / docs[1]["filename"]).read_text("utf-8").split()
            ),
            reference_pages=docs[0]["pages"],
            backup=str(backup),
        )
    )
    return result


if __name__ == "__main__":
    load_demo()
