import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from app import main, graph, graph_store as store
from app.graph_schema import Extraction, validate_extraction
from app.graph_demo import demo


class GraphTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [
            patch.object(store, "DB", Path(self.tmp.name) / "graph.sqlite3"),
            patch.object(main, "DATA", Path(self.tmp.name) / "documents.json"),
        ]
        for p in self.patches:
            p.start()
        self.original = main.documents[:]
        graph.load_demo()
        self.client = TestClient(main.app)

    def tearDown(self):
        main.documents[:] = self.original
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def workspace(self):
        return self.client.get("/api/workspace").json()

    def decision(self, subject, scope):
        return next(
            n
            for n in self.workspace()["nodes"]
            if n["kind"] == "decision"
            and n["label"] == subject
            and n["props"]["scope"] == scope
        )

    def upload(self, text, name="new.md"):
        r = self.client.post(
            "/api/documents", files=[("files", (name, text.encode(), "text/markdown"))]
        )
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()[-1]["document_id"]

    def test_persistent_scoped_identities_and_current_state(self):
        g = self.workspace()
        self.assertEqual(g["stats"]["decisions"], 6)
        self.assertEqual(g["stats"]["sources"], 6)
        first = self.decision("Offline mode", "v1")
        second = self.decision("Offline mode", "v2")
        self.assertEqual(first["props"]["state"], "postponed")
        self.assertEqual(second["props"]["state"], "proposed")
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(len(first["props"]["observations"]), 4)
        again = store.snapshot(main.documents)
        self.assertEqual(
            {n["id"] for n in again["nodes"]}, {n["id"] for n in g["nodes"]}
        )

    def test_multihop_impact_and_path_receipts(self):
        root = self.decision("Synchronization prototype", "v2")
        r = self.client.get("/api/workspace/decisions/" + root["id"] + "/impact").json()
        affected = {x["decision"]["label"]: x for x in r["affected"]}
        self.assertEqual(set(affected), {"Offline mode", "Offline field pilot"})
        self.assertEqual(affected["Offline field pilot"]["depth"], 2)
        self.assertEqual(len(affected["Offline field pilot"]["chain"]), 3)
        self.assertEqual(len(affected["Offline field pilot"]["receipts"]), 2)
        for item in r["affected"]:
            for receipt in item["receipts"]:
                source = self.client.get("/api/evidence/" + receipt["chunk_id"]).json()
                self.assertIn(receipt["quote"], source["text"])

    def test_shared_people_and_topics_are_not_dependencies(self):
        root = self.decision("Product launch", "v1")
        r = self.client.get("/api/workspace/decisions/" + root["id"] + "/impact").json()
        self.assertEqual(
            [x["decision"]["label"] for x in r["affected"]], ["Online field pilot"]
        )
        root = self.decision("Offline mode", "v1")
        self.assertEqual(
            self.client.get(
                "/api/workspace/decisions/" + root["id"] + "/impact"
            ).json()["affected"],
            [],
        )

    def test_actor_constraint_cluster_filters(self):
        rows = self.client.get(
            "/api/workspace/search", params={"person": "Adrian Cruz"}
        ).json()
        self.assertGreaterEqual(len(rows), 3)
        for row in rows:
            self.assertIn("Adrian Cruz", row["node"]["props"]["people"])
        rows = self.client.get(
            "/api/workspace/search", params={"constraint": "May 1 delivery deadline"}
        ).json()
        self.assertEqual(
            {r["node"]["label"] for r in rows}, {"Offline mode", "Product launch"}
        )
        rows = self.client.get(
            "/api/workspace/search", params={"cluster": "Release delivery"}
        ).json()
        self.assertEqual(
            {r["node"]["label"] for r in rows}, {"Product launch", "Online field pilot"}
        )

    def test_removal_retracts_observations_and_dependent_edges(self):
        before = self.decision("Synchronization prototype", "v2")["id"]
        r = self.client.delete("/api/workspace/sources/graph_atlas_6")
        self.assertEqual(r.status_code, 200)
        after = self.decision("Synchronization prototype", "v2")
        self.assertEqual(before, after["id"])
        self.assertEqual(after["props"]["state"], "proposed")
        g = self.workspace()
        self.assertEqual(g["stats"]["decisions"], 3)
        ids = {n["id"] for n in g["nodes"]}
        self.assertTrue(
            all(e["source"] in ids and e["target"] in ids for e in g["edges"])
        )
        self.assertEqual(
            self.client.get("/api/workspace/decisions/" + before + "/impact").json()[
                "affected"
            ][0]["decision"]["label"],
            "Offline mode",
        )

    def test_repeated_mentions_merge_decisions_preserving_provenance(self):
        docs, records = demo()
        duplicate = copy.deepcopy(docs[1])
        duplicate["document_id"] = "repeated_doc"
        duplicate["chunks"][0]["chunk_id"] = "repeat_chunk"
        main.documents.append(duplicate)
        payload = copy.deepcopy(records[1][1])
        payload["decisions"][0]["chunk_id"] = "repeat_chunk"
        store.store_record(duplicate, payload, "test", main.documents)
        self.assertEqual(self.workspace()["stats"]["decisions"], 6)
        self.assertEqual(
            len(self.decision("Offline mode", "v1")["props"]["observations"]), 5
        )

    def test_conflicting_approvals_are_unresolved_without_supersession(self):
        obs = [
            dict(
                id="a",
                date="2026-04-01",
                state="approved",
                supersedes_previous=False,
                description="Approved.",
            ),
            dict(
                id="b",
                date="2026-04-02",
                state="rejected",
                supersedes_previous=False,
                description="Rejected.",
            ),
        ]
        self.assertEqual(store.status_of(obs)[:2], ("unresolved", True))
        obs[1]["supersedes_previous"] = True
        self.assertEqual(store.status_of(obs)[:2], ("rejected", False))
        obs.append(
            dict(
                id="c",
                date="2026-04-03",
                state="proposed",
                supersedes_previous=False,
                description="Reconsidered.",
            )
        )
        self.assertEqual(store.status_of(obs)[0], "rejected")

    def test_invented_quotes_and_people_cannot_be_saved(self):
        docs, records = demo()
        payload = copy.deepcopy(records[0][1])
        payload["decisions"][0]["evidence_quote"] = "The team approved biometric login."
        with self.assertRaises(ValueError):
            validate_extraction(Extraction.model_validate(payload), docs[0]["chunks"])
        payload = copy.deepcopy(records[0][1])
        payload["decisions"][0]["people"][0]["name"] = "Invented Person"
        with self.assertRaises(ValueError):
            validate_extraction(Extraction.model_validate(payload), docs[0]["chunks"])

    def test_no_model_cost_for_unchanged_extraction(self):
        with patch(
            "app.graph.structured",
            side_effect=AssertionError("Must reuse stored traces"),
        ):
            result = self.client.post("/api/workspace/extract", json={}).json()
        self.assertTrue(all(x["state"] == "unchanged" for x in result["results"]))

    def test_model_extraction_is_validated_saved_and_reused(self):
        quote = "Rhea Santos approved full-text search for v1 because the current index is too slow."
        did = self.upload("Date: 2026-05-01\n" + quote)
        cid = next(d for d in main.documents if d["document_id"] == did)["chunks"][0][
            "chunk_id"
        ]
        decision = dict(
            subject="Full-text search",
            scope="v1",
            cluster="Search infrastructure",
            state="approved",
            action="Full-text search approved",
            rationale="The current index is too slow.",
            event_date="2026-05-01",
            chunk_id=cid,
            evidence_quote=quote,
            people=[dict(name="Rhea Santos", role="approved_by", quote=quote)],
        )
        calls = []

        async def respond(client, url, **kwargs):
            calls.append(url)
            return httpx.Response(
                200,
                request=httpx.Request("POST", url),
                json={
                    "choices": [
                        {"message": {"content": json.dumps({"decisions": [decision]})}}
                    ]
                },
            )

        with patch.dict(
            main.os.environ, {"AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "test-key"}
        ), patch.object(httpx.AsyncClient, "post", respond):
            result = self.client.post(
                "/api/workspace/extract", json={"document_ids": [did]}
            )
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["results"][0]["state"], "extracted")
        self.assertEqual(len(calls), 1)
        node = self.decision("Full-text search", "v1")
        self.assertEqual(node["props"]["state"], "approved")
        self.assertIn("Rhea Santos", node["props"]["people"])
        with patch("app.graph.structured", side_effect=AssertionError("Must reuse")):
            again = self.client.post(
                "/api/workspace/extract", json={"document_ids": [did]}
            ).json()
        self.assertEqual(again["results"][0]["state"], "unchanged")

    def test_network_failure_keeps_source_for_retry_and_never_fakes_traces(self):
        did = self.upload("Date: 2026-05-02\nNoah proposed a new dashboard for v1.")

        async def fail(client, url, **kwargs):
            raise httpx.ConnectError("unreachable")

        with patch.dict(
            main.os.environ, {"AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "test-key"}
        ), patch.object(httpx.AsyncClient, "post", fail):
            result = self.client.post(
                "/api/workspace/extract", json={"document_ids": [did]}
            ).json()
        self.assertEqual(result["results"][0]["state"], "error")
        self.assertEqual(result["workspace"]["stats"]["decisions"], 6)
        self.assertEqual(
            next(s for s in result["workspace"]["sources"] if s["document_id"] == did)[
                "extraction_state"
            ],
            "error",
        )

    def test_unmatched_dependency_is_pending_not_a_phantom_node(self):
        docs, records = demo()
        payload = copy.deepcopy(records[4][1])
        payload["decisions"][0]["relations"][0]["target_subject"] = "Missing prototype"
        store.store_record(docs[4], payload, "test", main.documents)
        n = self.decision("Offline mode", "v2")
        self.assertEqual(len(n["props"]["pending_relations"]), 1)
        self.assertFalse(
            any(n["label"] == "Missing prototype" for n in self.workspace()["nodes"])
        )

    def test_dependency_cycles_terminate_without_returning_root(self):
        a = self.decision("Offline mode", "v2")["id"]
        b = self.decision("Synchronization prototype", "v2")["id"]
        with store.connection() as con:
            con.execute(
                "INSERT INTO edges VALUES(?,?,?,?,?)",
                ("test-cycle", b, a, "depends_on", json.dumps({"receipts": []})),
            )
        affected = store.impact(a)
        self.assertNotIn(a, [r["id"] for r in affected])
        self.assertLess(len(affected), 5)

    def test_graph_question_without_evidence_abstains_without_model(self):
        with patch.object(
            main, "generate", side_effect=AssertionError("No evidence must abstain")
        ):
            r = self.client.post(
                "/api/workspace/ask", json={"question": "Who approved biometric login?"}
            )
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["evidence_sufficient"])
        self.assertEqual(r.json()["engine"], "graph-retrieval")

    def test_export_is_a_complete_receipted_property_graph(self):
        g = self.client.get("/api/workspace/export").json()
        self.assertEqual(g["format"], "ragret-property-graph-v1")
        self.assertTrue(all(e["receipts"] for e in g["edges"]))
        self.assertNotIn("api_key", json.dumps(g).lower())


if __name__ == "__main__":
    unittest.main()
