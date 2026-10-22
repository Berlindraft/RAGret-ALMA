"""Decision extraction, search, provenance and dependency traversal API."""

import asyncio
import json
import math
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app import graph_store as store
from app.graph_schema import EXTRACT_SYSTEM, Extraction, validate_extraction, normalize
from app.provider import structured, ProviderUnavailable

router = APIRouter(prefix="/api/workspace", tags=["Decision graph"])
extraction_lock = asyncio.Lock()


def core():
    from app import main

    return main


def install_graph(app):
    app.include_router(router)

    @app.on_event("startup")
    async def startup():
        main = core()
        if (
            not store.records()
            and main.documents
            and all(d["synthetic"] for d in main.documents)
        ):
            load_demo()
        else:
            store.rebuild(main.documents)


def load_demo():
    from app.graph_demo import demo

    docs, records = demo()
    main = core()
    main.documents[:] = docs
    main.save()
    with store.connection() as con:
        con.execute("DELETE FROM records")
        con.execute("DELETE FROM failures")
    for doc, payload in records:
        store.store_record(doc, payload, "curated-synthetic", docs)
    return store.snapshot(docs)


@router.get("")
def workspace():
    store.rebuild(core().documents)
    return store.snapshot(core().documents)


@router.post("/demo")
async def reset_demo():
    async with extraction_lock:
        return load_demo()


@router.post("/clear")
async def clear():
    async with extraction_lock:
        main = core()
        main.documents.clear()
        main.save()
        with store.connection() as con:
            con.execute("DELETE FROM records")
            con.execute("DELETE FROM failures")
        store.rebuild([])
        return store.snapshot([])


@router.delete("/sources/{document_id}")
async def remove_source(document_id: str):
    async with extraction_lock:
        main = core()
        main.documents[:] = [
            d for d in main.documents if d["document_id"] != document_id
        ]
        main.save()
        store.rebuild(main.documents)
        return store.snapshot(main.documents)


class ExtractRequest(BaseModel):
    document_ids: list[str] = Field(default_factory=list, max_length=8)
    force: bool = False


def reference_context(chunks, docs, limit=8):
    """Select bounded, relevant policy passages without treating them as decisions."""
    candidates = [
        dict(c, filename=d["filename"], document_id=d["document_id"])
        for d in docs
        if d.get("source_type") == "reference"
        for c in d["chunks"]
    ]
    query = set(core().tokens(" ".join(c["text"] for c in chunks)))
    if not candidates or not query:
        return []
    words = [set(core().tokens(c["text"])) for c in candidates]
    idf = {
        w: math.log((len(words) + 1) / (1 + sum(w in text for text in words))) + 1
        for w in query
    }
    scored = sorted(
        (
            (sum(idf[w] ** 2 for w in query & text) / math.sqrt(max(1, len(text))), c)
            for text, c in zip(words, candidates)
        ),
        key=lambda pair: -pair[0],
    )
    result, per_page = [], {}
    for score, chunk in scored:
        key = (chunk["document_id"], chunk["page"])
        if score <= 0 or per_page.get(key, 0) >= 2:
            continue
        result.append(chunk)
        per_page[key] = per_page.get(key, 0) + 1
        if len(result) >= limit:
            break
    return result


@router.post("/extract")
async def extract(body: ExtractRequest):
    async with extraction_lock:
        main = core()
        docs = [
            d
            for d in main.documents
            if not body.document_ids or d["document_id"] in body.document_ids
        ]
        if body.document_ids and set(body.document_ids) - {
            d["document_id"] for d in docs
        }:
            raise HTTPException(404, "One or more sources no longer exist.")
        store.rebuild(main.documents)
        existing = {r["document_id"]: r for r in store.records()}
        results = []
        for doc in docs:
            previous = existing.get(doc["document_id"])
            if (
                previous
                and previous["fingerprint"] == store.fingerprint(doc)
                and not body.force
                and (
                    doc.get("source_type") != "reference"
                    or previous["engine"] == "reference-index"
                )
            ):
                results.append(dict(document_id=doc["document_id"], state="unchanged"))
                continue
            try:
                if doc.get("source_type") == "reference":
                    store.store_record(
                        doc, dict(decisions=[]), "reference-index", main.documents
                    )
                    results.append(
                        dict(
                            document_id=doc["document_id"],
                            state="indexed",
                            observations=0,
                        )
                    )
                    continue
                if sum(len(c["text"]) for c in doc["chunks"]) > 60000:
                    raise HTTPException(
                        413,
                        "This source exceeds 60,000 extracted characters. Split it into smaller records before extraction.",
                    )
                current = store.snapshot(main.documents)
                identities = [
                    dict(subject=n["label"], scope=n["props"]["scope"])
                    for n in current["nodes"]
                    if n["kind"] == "decision"
                ]
                clusters = [
                    n["label"] for n in current["nodes"] if n["kind"] == "cluster"
                ]
                batches = []
                batch = []
                size = 0
                for chunk in doc["chunks"]:
                    if batch and size + len(chunk["text"]) > 14000:
                        batches.append(batch)
                        batch = []
                        size = 0
                    batch.append(chunk)
                    size += len(chunk["text"])
                if batch:
                    batches.append(batch)
                decisions = []
                for chunks in batches:
                    references = reference_context(chunks, main.documents)
                    result = await structured(
                        EXTRACT_SYSTEM,
                        dict(
                            document=dict(
                                filename=doc["filename"],
                                source_type=doc.get("source_type", "reference"),
                                document_date=doc["document_date"],
                                synthetic=doc["synthetic"],
                            ),
                            chunks=chunks,
                            reference_chunks=references,
                            existing_decisions=identities,
                            existing_clusters=clusters,
                        ),
                        Extraction,
                        lambda r: validate_extraction(r, chunks, references),
                        max_tokens=8000,
                    )
                    decisions.extend(result["decisions"])
                    identities.extend(
                        dict(subject=d["subject"], scope=d["scope"])
                        for d in result["decisions"]
                    )
                store.store_record(
                    doc,
                    dict(decisions=decisions),
                    main.health()["provider"],
                    main.documents,
                )
                results.append(
                    dict(
                        document_id=doc["document_id"],
                        state="extracted",
                        observations=len(decisions),
                    )
                )
            except HTTPException as exc:
                with store.connection() as con:
                    con.execute(
                        "INSERT OR REPLACE INTO failures VALUES(?,?)",
                        (doc["document_id"], str(exc.detail)),
                    )
                results.append(
                    dict(
                        document_id=doc["document_id"],
                        state="error",
                        message=str(exc.detail),
                    )
                )
        return dict(workspace=store.snapshot(main.documents), results=results)


@router.get("/decisions/{decision_id}/impact")
def impact(decision_id: str):
    graph = store.snapshot(core().documents)
    lookup = {n["id"]: n for n in graph["nodes"]}
    if decision_id not in lookup or lookup[decision_id]["kind"] != "decision":
        raise HTTPException(404, "Decision not found.")
    impacts = store.impact(decision_id)
    for item in impacts:
        item["decision"] = lookup[item["id"]]
        item["chain"] = [lookup[x] for x in item["path"]]
        item["receipts"] = [
            r
            for a, b in zip(item["path"], item["path"][1:])
            for e in graph["edges"]
            if e["source"] == b and e["target"] == a and e["kind"] == "depends_on"
            for r in e["receipts"]
        ]
    return dict(
        decision_id=decision_id,
        affected=impacts,
        limitation="Potential downstream effects from explicit depends_on relationships only. This does not prove an implementation change.",
    )


@router.get("/search")
def search(
    q: str = "",
    kind: str = "decision",
    state: str = "",
    person: str = "",
    constraint: str = "",
    cluster: str = "",
):
    graph = store.snapshot(core().documents)
    nodes = {n["id"]: n for n in graph["nodes"]}
    query = set(core().tokens(q))
    results = []
    for n in graph["nodes"]:
        if kind and n["kind"] != kind:
            continue
        links = [
            e
            for e in graph["edges"]
            if e["source"] == n["id"] or e["target"] == n["id"]
        ]
        neighbors = [
            nodes[e["target"] if e["source"] == n["id"] else e["source"]] for e in links
        ]
        if state and n["props"].get("state") != state:
            continue
        if person and not any(
            x["kind"] == "person" and normalize(person) in normalize(x["label"])
            for x in neighbors
        ):
            continue
        if constraint and not any(
            x["kind"] == "constraint" and normalize(constraint) in normalize(x["label"])
            for x in neighbors
        ):
            continue
        if cluster and not any(
            x["kind"] == "cluster"
            and (x["id"] == cluster or normalize(cluster) in normalize(x["label"]))
            for x in neighbors
        ):
            continue
        text = normalize(
            n["label"]
            + " "
            + json.dumps(n["props"])
            + " "
            + " ".join(x["label"] for x in neighbors)
        )
        words = set(text.split())
        overlap = len(query & words)
        if query and not overlap:
            continue
        # Lexical relevance dominates. Degree and recency break otherwise similar matches.
        recent = n["props"].get("last_date") or ""
        score = (
            overlap / max(1, len(query)) * 10
            + math.log1p(len(links)) * 0.1
            + (int(recent.replace("-", "")) / 1e9 if recent else 0)
        )
        results.append(dict(node=n, score=round(score, 5), connections=len(links)))
    return sorted(results, key=lambda r: (-r["score"], r["node"]["id"]))


class GraphQuestion(BaseModel):
    question: str = Field(min_length=3, max_length=1500)


@router.post("/ask")
async def ask(body: GraphQuestion):
    graph = store.snapshot(core().documents)
    ranked = search(q=body.question)
    matches = (
        [r for r in ranked if r["score"] >= ranked[0]["score"] * 0.55][:5]
        if ranked
        else []
    )
    if not matches and re.search(r"depend|downstream|impact", body.question, re.I):
        generic = {
            "which",
            "decisions",
            "decision",
            "depend",
            "depends",
            "each",
            "other",
            "downstream",
            "impact",
            "affected",
            "affects",
            "happens",
            "changes",
            "if",
            "would",
            "could",
            "be",
            "are",
            "on",
            "what",
        }
        if not (set(core().tokens(body.question)) - generic):
            dependency_ids = {
                e[k]
                for e in graph["edges"]
                if e["kind"] == "depends_on"
                for k in ("source", "target")
            }
            matches = [
                dict(node=n) for n in graph["nodes"] if n["id"] in dependency_ids
            ][:6]
    if not matches:
        return dict(
            question=body.question,
            answer="The extracted records do not establish this. No relevant decision trace was found.",
            current_status="unresolved",
            status_explanation="Not established by the decision graph.",
            evidence_sufficient=False,
            events=[],
            limitations=["Add a relevant source and extract its decisions first."],
            evidence=[],
            decision_ids=[],
            engine="graph-retrieval",
        )
    ids = {r["node"]["id"] for r in matches}
    # Expand one hop over documented dependency/supersession relationships, not arbitrary shared terms.
    for edge in graph["edges"]:
        if edge["kind"] in (
            "depends_on",
            "supersedes",
            "reconsiders",
            "contradicts",
        ) and (edge["source"] in ids or edge["target"] in ids):
            ids.update([edge["source"], edge["target"]])
    selected = [n for n in graph["nodes"] if n["id"] in ids]
    chunks = []
    seen = set()
    for n in selected:
        for observation in n["props"].get("observations", []):
            cid = observation["receipt"]["chunk_id"]
            if cid not in seen:
                chunks.append(
                    dict(core().get_evidence(cid), evidence_id=f"E{len(chunks)+1}")
                )
                seen.add(cid)
    # Include reference guidance without inventing a decision event for the policy.
    for edge in graph["edges"]:
        if edge["kind"] != "supports" or edge["target"] not in ids:
            continue
        for receipt in edge["receipts"]:
            cid = receipt["chunk_id"]
            if receipt.get("source_type") == "reference" and cid not in seen:
                chunks.append(
                    dict(core().get_evidence(cid), evidence_id=f"E{len(chunks)+1}")
                )
                seen.add(cid)
    if not chunks:
        raise HTTPException(
            409, "The graph has no source receipts for these decisions."
        )
    # Bound model context; all selected decision traces still have a stable saved identity.
    reference_evidence = [c for c in chunks if c.get("source_type") == "reference"]
    conversation_evidence = [c for c in chunks if c.get("source_type") != "reference"]
    evidence = (
        conversation_evidence[:8] + reference_evidence[:4]
        if reference_evidence
        else chunks[:12]
    )
    for e in evidence:
        e["graph_context"] = [
            dict(
                id=n["id"],
                subject=n["label"],
                scope=n["props"]["scope"],
                status=n["props"]["state"],
                conflict=n["props"]["conflict"],
            )
            for n in selected
        ]
    links = [
        dict(
            source=e["source"],
            target=e["target"],
            kind=e["kind"],
            quotes=[r["quote"] for r in e["receipts"]],
        )
        for e in graph["edges"]
        if e["source"] in ids and e["target"] in ids
    ]
    evidence[0]["documented_relationships"] = links
    engine = core().health()["provider"]
    try:
        result = await core().generate(body.question, evidence)
    except ProviderUnavailable as exc:
        # These are saved traces, not a generated answer or a replacement extraction.
        primary = matches[0]["node"]
        props = primary["props"]
        citations = {e["chunk_id"]: e["evidence_id"] for e in evidence}
        events = [
            dict(
                date=o["date"],
                date_certainty="explicit" if o["date"] else "uncertain",
                state=o["state"],
                title=o["title"],
                description=o["description"],
                evidence_ids=[citations[o["receipt"]["chunk_id"]]],
            )
            for o in props["observations"]
            if o["receipt"]["chunk_id"] in citations
        ]
        text = f"Saved decision: {primary['label']} ({props['scope']}) — {props['state']}. {props['summary']}"
        if props["people"]:
            text += " Recorded participants: " + ", ".join(props["people"]) + "."
        if re.search(r"depend|downstream|impact", body.question, re.I):
            labels = {n["id"]: n["label"] for n in selected}
            relationships = [
                f"{labels[e['source']]} depends on {labels[e['target']]}"
                for e in links
                if e["kind"] == "depends_on"
                and primary["id"] in (e["source"], e["target"])
            ]
            if relationships:
                text += " Recorded links: " + "; ".join(relationships) + "."
        result = dict(
            answer=text,
            current_status=props["state"],
            status_explanation=props["summary"],
            evidence_sufficient=False,
            events=events,
            limitations=[
                "Live AI is unavailable. Showing related saved decision traces, without generating a new answer. These records may not fully answer your question.",
                exc.detail,
            ],
        )
        engine = "saved-graph"
    result["events"].sort(key=lambda e: e["date"] or "9999")
    return dict(
        result,
        question=body.question,
        evidence=evidence,
        decision_ids=list(ids),
        engine=engine,
    )


@router.get("/export")
def export_graph():
    return dict(format="ragret-property-graph-v1", **store.snapshot(core().documents))
