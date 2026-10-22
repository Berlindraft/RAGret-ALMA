"""A small, explicitly synthetic corpus with hand-verified decision traces."""

from app.graph_schema import Extraction, validate_extraction


def demo():
    docs, records = [], []

    def add(index, title, date, paragraphs, items):
        did = f"graph_atlas_{index}"
        text = (
            f"SYNTHETIC PROJECT ATLAS RECORD\nDate: {date}\n# {title}\n\n"
            + "\n\n".join(paragraphs)
        )
        cid = f"{did}_p1_c1"
        doc = dict(
            document_id=did,
            filename=f'{index:02d}_{title.lower().replace(" ","_")}.md',
            title=title,
            document_date=date,
            synthetic=True,
            pages=1,
            warnings=[],
            chunks=[dict(chunk_id=cid, page=1, section=title, text=text)],
        )
        for item in items:
            item.update(chunk_id=cid, event_date=date)
        payload = Extraction.model_validate({"decisions": items})
        validate_extraction(payload, doc["chunks"])
        docs.append(doc)
        records.append((doc, payload.model_dump()))

    def trace(subject, scope, state, action, quote, **extra):
        return dict(
            subject=subject,
            scope=scope,
            cluster="Offline capability",
            state=state,
            action=action,
            rationale=quote,
            evidence_quote=quote,
            **extra,
        )

    def person(name, role, quote):
        return dict(name=name, role=role, quote=quote)

    def detail(label, quote):
        return dict(label=label, quote=quote)

    def relation(subject, scope, kind, quote):
        return dict(target_subject=subject, target_scope=scope, type=kind, quote=quote)

    q = "Mina Torres proposed offline mode for v1 so field researchers could capture notes without an internet connection. Scope approval is still pending."
    add(
        1,
        "Project kickoff",
        "2026-01-12",
        [q],
        [
            trace(
                "Offline mode",
                "v1",
                "proposed",
                "Offline capture proposed",
                q,
                people=[person("Mina Torres", "proposed_by", q)],
                topics=["Field research", "Offline access"],
            )
        ],
    )
    q = "Adrian Cruz approved offline mode for v1, including local note capture and subsequent synchronization."
    add(
        2,
        "Scope approval",
        "2026-02-03",
        [q],
        [
            trace(
                "Offline mode",
                "v1",
                "approved",
                "Offline mode approved for v1",
                q,
                people=[person("Adrian Cruz", "approved_by", q)],
                topics=["Offline access"],
            )
        ],
    )
    q = "Priya Shah reported that offline synchronization remained unreliable: conflicting edits caused data loss in two test scenarios. Resolving the synchronization issues would add three weeks and threaten the May 1 v1 delivery deadline."
    add(
        3,
        "Technical review",
        "2026-03-08",
        [q],
        [
            trace(
                "Offline mode",
                "v1",
                "unresolved",
                "Synchronization reliability risk identified",
                q,
                people=[person("Priya Shah", "mentioned", q)],
                constraints=[
                    detail("May 1 delivery deadline", q),
                    detail("Synchronization reliability", q),
                ],
                facts=[detail("Data loss in two test scenarios", q)],
                topics=["Synchronization"],
            )
        ],
    )
    q = "Adrian Cruz approved removing offline mode from v1 because of synchronization reliability and delivery timeline risks. This explicitly supersedes the February 3 v1 approval. Offline work is postponed beyond v1."
    add(
        4,
        "Decision review",
        "2026-03-15",
        [q],
        [
            trace(
                "Offline mode",
                "v1",
                "postponed",
                "Offline mode postponed beyond v1",
                q,
                supersedes_previous=True,
                people=[person("Adrian Cruz", "approved_by", q)],
                constraints=[
                    detail("Synchronization reliability", q),
                    detail("Delivery timeline", q),
                ],
                topics=["Offline access"],
            )
        ],
    )
    q1 = "Mina Torres proposed reconsidering offline mode for v2. This is not an approval to build or launch it; the v1 removal remains in effect. Offline mode v2 depends on the synchronization prototype."
    q2 = "Priya Shah proposed a synchronization prototype for v2 to validate conflict resolution before offline mode can be approved. Priya Shah will evaluate the prototype and publish a reliability report."
    add(
        5,
        "Version two roadmap",
        "2026-04-02",
        [q1, q2],
        [
            trace(
                "Offline mode",
                "v2",
                "proposed",
                "Offline mode reconsidered for v2",
                q1,
                people=[person("Mina Torres", "proposed_by", q1)],
                relations=[
                    relation("Synchronization prototype", "v2", "depends_on", q1),
                    relation("Offline mode", "v1", "reconsiders", q1),
                ],
                topics=["Offline access"],
            ),
            trace(
                "Synchronization prototype",
                "v2",
                "proposed",
                "Reliability prototype proposed",
                q2,
                people=[person("Priya Shah", "proposed_by", q2)],
                outcomes=[
                    detail("Evaluate prototype and publish reliability report", q2)
                ],
                topics=["Synchronization"],
            ),
        ],
    )
    q1 = "Adrian Cruz approved the synchronization prototype for v2. Priya Shah is assigned to evaluate conflict resolution; approving the prototype does not approve offline mode v2."
    q2 = "Adrian Cruz approved the v1 launch for May 1. The May 1 delivery deadline remains fixed."
    q3 = "Nora Reyes approved the online field pilot for v1. The online field pilot depends on the v1 launch. Nora Reyes will schedule the online pilot after launch."
    q4 = "Alex Chen proposed an offline field pilot for v2. The offline field pilot depends on offline mode v2, which is not approved. No launch date is established for the offline pilot."
    add(
        6,
        "Delivery alignment",
        "2026-04-06",
        [q1, q2, q3, q4],
        [
            trace(
                "Synchronization prototype",
                "v2",
                "approved",
                "Synchronization prototype approved",
                q1,
                people=[
                    person("Adrian Cruz", "approved_by", q1),
                    person("Priya Shah", "assigned_to", q1),
                ],
                topics=["Synchronization"],
            ),
            dict(
                trace(
                    "Product launch",
                    "v1",
                    "approved",
                    "May 1 launch approved",
                    q2,
                    people=[person("Adrian Cruz", "approved_by", q2)],
                    constraints=[detail("May 1 delivery deadline", q2)],
                    topics=["Release planning"],
                ),
                cluster="Release delivery",
            ),
            dict(
                trace(
                    "Online field pilot",
                    "v1",
                    "approved",
                    "Online pilot approved after launch",
                    q3,
                    people=[person("Nora Reyes", "approved_by", q3)],
                    outcomes=[detail("Schedule online pilot after launch", q3)],
                    relations=[relation("Product launch", "v1", "depends_on", q3)],
                    topics=["Field research"],
                ),
                cluster="Release delivery",
            ),
            trace(
                "Offline field pilot",
                "v2",
                "proposed",
                "Offline pilot proposed",
                q4,
                people=[person("Alex Chen", "proposed_by", q4)],
                relations=[relation("Offline mode", "v2", "depends_on", q4)],
                topics=["Field research"],
            ),
        ],
    )
    return docs, records
