"""Persistent SQLite property graph, rebuilt transactionally from validated traces."""

import hashlib
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from app.graph_schema import normalize

DB = Path(__file__).resolve().parent.parent / "data" / "context.sqlite3"


def identity(kind, label):
    return kind + "_" + hashlib.sha256(normalize(label).encode()).hexdigest()[:16]


def scope_key(scope):
    return re.sub(r"version\s*(\d+)", r"v\1", normalize(scope))


@contextmanager
def connection():
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB, timeout=30)
    con.row_factory = sqlite3.Row
    con.executescript("""
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS records(document_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, engine TEXT NOT NULL, extracted_at TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS failures(document_id TEXT PRIMARY KEY, message TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS nodes(id TEXT PRIMARY KEY, kind TEXT NOT NULL, label TEXT NOT NULL, props TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS edges(id TEXT PRIMARY KEY, source TEXT NOT NULL REFERENCES nodes(id), target TEXT NOT NULL REFERENCES nodes(id), kind TEXT NOT NULL, props TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS edge_target ON edges(target,kind);
    CREATE INDEX IF NOT EXISTS edge_source ON edges(source,kind);
    """)
    try:
        with con:
            yield con
    finally:
        con.close()


def fingerprint(doc):
    return hashlib.sha256(
        json.dumps(doc["chunks"], sort_keys=True).encode()
    ).hexdigest()


def records():
    with connection() as con:
        return [
            dict(r, payload=json.loads(r["payload"]))
            for r in con.execute("SELECT * FROM records ORDER BY rowid")
        ]


def store_record(doc, payload, engine, docs):
    with connection() as con:
        con.execute(
            "INSERT OR REPLACE INTO records VALUES(?,?,?,?,?)",
            (
                doc["document_id"],
                fingerprint(doc),
                engine,
                datetime.now(timezone.utc).isoformat(),
                json.dumps(payload),
            ),
        )
        con.execute("DELETE FROM failures WHERE document_id=?", (doc["document_id"],))
    rebuild(docs)


def status_of(observations):
    governing = None
    conflict = False
    explanation = (
        observations[-1]["description"]
        if observations
        else "No governing decision is documented."
    )
    ordered = sorted(
        observations,
        key=lambda o: (
            o["date"] or "9999",
            o["supersedes_previous"],
            o.get("source_order", 0),
            o["id"],
        ),
    )
    for o in ordered:
        state = o["state"]
        if state in ("proposed", "unresolved"):
            if governing is None:
                governing = state
            continue
        if (
            governing not in (None, "proposed", "unresolved", state)
            and not o["supersedes_previous"]
        ):
            conflict = True
        if o["supersedes_previous"] and o["date"]:
            conflict = False
        governing = state
        explanation = o["description"]
    if len(
        {o["state"] for o in ordered if o["state"] not in ("proposed", "unresolved")}
    ) > 1 and any(not o["date"] for o in ordered):
        conflict = True
    if conflict:
        return (
            "unresolved",
            True,
            "Records contain competing decisions without a clearly documented supersession.",
        )
    return governing or "unresolved", False, explanation


def build_graph(docs, extracted):
    nodes, edges, groups, aliases = {}, {}, {}, {}
    doc_map = {d["document_id"]: d for d in docs}

    def node(kind, label, key=None, **props):
        nid = key or identity(kind, label)
        if nid not in nodes:
            nodes[nid] = dict(id=nid, kind=kind, label=label, props=props)
        return nid

    def edge(source, target, kind, receipt=None):
        eid = identity("edge", source + " " + target + " " + kind)
        if eid not in edges:
            edges[eid] = dict(
                id=eid, source=source, target=target, kind=kind, receipts=[]
            )
        if receipt and receipt not in edges[eid]["receipts"]:
            edges[eid]["receipts"].append(receipt)

    def resolve(subject, scope):
        labelkey = normalize(subject) + "|" + scope_key(scope)
        if labelkey in aliases:
            return aliases[labelkey]
        words = set(normalize(subject).split())
        for key, group in groups.items():
            other = set(normalize(group["subject"]).split())
            if (
                scope_key(scope) == scope_key(group["scope"])
                and len(words) >= 2
                and len(other) >= 2
                and len(words & other) / len(words | other) >= 0.82
            ):
                aliases[labelkey] = key
                return key
        key = identity("decision", labelkey)
        groups[key] = dict(subject=subject, scope=scope, observations=[], raw=[])
        aliases[labelkey] = key
        return key

    for record in extracted:
        doc = doc_map.get(record["document_id"])
        if not doc:
            continue
        chunkmap = {c["chunk_id"]: c for c in doc["chunks"]}
        for item in record["payload"]["decisions"]:
            if item["chunk_id"] not in chunkmap:
                continue
            did = resolve(item["subject"], item.get("scope", ""))
            chunk = chunkmap[item["chunk_id"]]
            receipt = dict(
                document_id=doc["document_id"],
                filename=doc["filename"],
                chunk_id=chunk["chunk_id"],
                page=chunk["page"],
                section=chunk["section"],
                document_date=doc["document_date"],
                quote=item["evidence_quote"],
                synthetic=doc["synthetic"],
            )
            oid = identity(
                "observation",
                doc["document_id"]
                + did
                + item["state"]
                + normalize(item["evidence_quote"]),
            )
            observation = dict(
                source_order=sum(len(g["observations"]) for g in groups.values()),
                id=oid,
                decision_id=did,
                date=item.get("event_date"),
                state=item["state"],
                title=item["action"],
                description=item["rationale"],
                supersedes_previous=item.get("supersedes_previous", False),
                people=item.get("people", []),
                receipt=receipt,
                engine=record["engine"],
            )
            if not any(o["id"] == oid for o in groups[did]["observations"]):
                groups[did]["observations"].append(observation)
                groups[did]["raw"].append((item, receipt))
    for doc in docs:
        node(
            "source",
            doc["title"],
            key=doc["document_id"],
            filename=doc["filename"],
            date=doc["document_date"],
            synthetic=doc["synthetic"],
            pages=doc["pages"],
            first_chunk_id=doc["chunks"][0]["chunk_id"] if doc["chunks"] else None,
        )
    # Materialize all decisions before resolving relationships.
    for did, group in groups.items():
        observations = sorted(
            group["observations"],
            key=lambda o: (
                o["date"] or "9999",
                o["supersedes_previous"],
                o.get("source_order", 0),
                o["id"],
            ),
        )
        state, conflict, summary = status_of(observations)
        node(
            "decision",
            group["subject"],
            key=did,
            scope=group["scope"],
            state=state,
            conflict=conflict,
            summary=summary,
            observations=observations,
            last_date=max((o["date"] for o in observations if o["date"]), default=None),
            people=sorted({p["name"] for o in observations for p in o["people"]}),
            pending_relations=[],
        )
    for did, group in groups.items():
        for item, receipt in group["raw"]:
            edge(receipt["document_id"], did, "supports", receipt)
            cluster = node("cluster", item["cluster"])
            edge(did, cluster, "in_cluster", receipt)
            for topic in item.get("topics", []):
                edge(did, node("topic", topic), "has_topic", receipt)
            for person in item.get("people", []):
                r = dict(receipt, quote=person["quote"])
                edge(did, node("person", person["name"]), person["role"], r)
            for field, kind, link in [
                ("constraints", "constraint", "constrained_by"),
                ("facts", "fact", "has_fact"),
                ("outcomes", "action", "results_in"),
            ]:
                for facet in item.get(field, []):
                    edge(
                        did,
                        node(kind, facet["label"]),
                        link,
                        dict(receipt, quote=facet["quote"]),
                    )
            for relation in item.get("relations", []):
                target_key = (
                    normalize(relation["target_subject"])
                    + "|"
                    + scope_key(relation.get("target_scope", ""))
                )
                target = aliases.get(target_key)
                if not target:
                    # Apply the same conservative name match, without creating phantom decisions.
                    words = set(normalize(relation["target_subject"]).split())
                    for gid, g in groups.items():
                        other = set(normalize(g["subject"]).split())
                        if (
                            scope_key(g["scope"])
                            == scope_key(relation.get("target_scope", ""))
                            and len(words) >= 2
                            and len(words & other) / max(1, len(words | other)) >= 0.82
                        ):
                            target = gid
                            break
                if target and target != did:
                    edge(
                        did,
                        target,
                        relation["type"],
                        dict(receipt, quote=relation["quote"]),
                    )
                elif not target:
                    nodes[did]["props"]["pending_relations"].append(relation)
    return list(nodes.values()), list(edges.values())


def rebuild(docs):
    active = {d["document_id"] for d in docs}
    with connection() as con:
        for row in con.execute("SELECT document_id FROM records").fetchall():
            if row["document_id"] not in active:
                con.execute(
                    "DELETE FROM records WHERE document_id=?", (row["document_id"],)
                )
                con.execute(
                    "DELETE FROM failures WHERE document_id=?", (row["document_id"],)
                )
        for row in con.execute("SELECT document_id FROM failures").fetchall():
            if row["document_id"] not in active:
                con.execute(
                    "DELETE FROM failures WHERE document_id=?", (row["document_id"],)
                )
        extracted = [
            dict(r, payload=json.loads(r["payload"]))
            for r in con.execute("SELECT * FROM records ORDER BY rowid")
        ]
        nodes, edges = build_graph(docs, extracted)
        con.execute("DELETE FROM edges")
        con.execute("DELETE FROM nodes")
        con.executemany(
            "INSERT INTO nodes VALUES(?,?,?,?)",
            [(n["id"], n["kind"], n["label"], json.dumps(n["props"])) for n in nodes],
        )
        con.executemany(
            "INSERT INTO edges VALUES(?,?,?,?,?)",
            [
                (
                    e["id"],
                    e["source"],
                    e["target"],
                    e["kind"],
                    json.dumps({"receipts": e["receipts"]}),
                )
                for e in edges
            ],
        )


def snapshot(docs):
    with connection() as con:
        nodes = [
            dict(
                id=r["id"],
                kind=r["kind"],
                label=r["label"],
                props=json.loads(r["props"]),
            )
            for r in con.execute("SELECT * FROM nodes")
        ]
        edges = [
            dict(
                id=r["id"],
                source=r["source"],
                target=r["target"],
                kind=r["kind"],
                **json.loads(r["props"])
            )
            for r in con.execute("SELECT * FROM edges")
        ]
        recs = {
            r["document_id"]: dict(r)
            for r in con.execute(
                "SELECT document_id,fingerprint,engine,extracted_at FROM records"
            )
        }
        errors = {
            r["document_id"]: r["message"]
            for r in con.execute("SELECT * FROM failures")
        }
    sources = []
    for d in docs:
        r = recs.get(d["document_id"])
        valid = r and r["fingerprint"] == fingerprint(d)
        sources.append(
            {
                **{k: v for k, v in d.items() if k != "chunks"},
                "first_chunk_id": d["chunks"][0]["chunk_id"] if d["chunks"] else None,
                "chunk_count": len(d["chunks"]),
                "extraction_state": (
                    "error"
                    if d["document_id"] in errors
                    else "extracted" if valid else "pending"
                ),
                "extraction_error": errors.get(d["document_id"]),
                "engine": r["engine"] if valid else None,
                "extracted_at": r["extracted_at"] if valid else None,
            }
        )
    return dict(
        nodes=nodes,
        edges=edges,
        sources=sources,
        stats=dict(
            decisions=sum(n["kind"] == "decision" for n in nodes),
            sources=len(docs),
            relationships=len(edges),
            people=sum(n["kind"] == "person" for n in nodes),
            clusters=sum(n["kind"] == "cluster" for n in nodes),
            conflicts=sum(bool(n["props"].get("conflict")) for n in nodes),
            pending=sum(s["extraction_state"] != "extracted" for s in sources),
        ),
    )


def impact(decision_id):
    # A depends_on B means that changing B potentially affects A. Traverse incoming edges only.
    with connection() as con:
        rows = con.execute(
            """WITH RECURSIVE affected(id,depth,path) AS (
          SELECT source,1,'|' || ? || '|' || source || '|' FROM edges WHERE target=? AND kind='depends_on'
          UNION ALL
          SELECT e.source,a.depth+1,a.path || e.source || '|' FROM edges e JOIN affected a ON e.target=a.id
          WHERE e.kind='depends_on' AND a.depth<20 AND instr(a.path,'|' || e.source || '|')=0
        ) SELECT id,depth,path FROM affected ORDER BY depth,id""",
            (decision_id, decision_id),
        ).fetchall()
    found = {}
    for r in rows:
        if r["id"] not in found:
            found[r["id"]] = dict(
                id=r["id"], depth=r["depth"], path=r["path"].strip("|").split("|")
            )
    return list(found.values())
