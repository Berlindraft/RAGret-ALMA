import copy
import json
import re
import httpx
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from app import main, graph_store as store
from app.graph_schema import Extraction, validate_extraction
from app.provider import ProviderUnavailable
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from examples.load_nist_demo import build_demo


class NistDemoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = main.documents[:]
        self.db_patch = patch.object(
            store, "DB", Path(self.temp.name) / "graph.sqlite3"
        )
        self.data_patch = patch.object(
            main, "DATA", Path(self.temp.name) / "documents.json"
        )
        self.db_patch.start()
        self.data_patch.start()
        self.docs, self.payload = build_demo()
        main.documents[:] = self.docs
        store.store_record(
            self.docs[0], dict(decisions=[]), "reference-index", self.docs
        )
        store.store_record(self.docs[1], self.payload, "curated-synthetic", self.docs)
        self.client = TestClient(main.app)

    def tearDown(self):
        main.documents[:] = self.original
        self.db_patch.stop()
        self.data_patch.stop()
        self.temp.cleanup()

    def test_reference_is_not_a_team_approval_and_rotation_is_reversed(self):
        g = store.snapshot(self.docs)
        self.assertEqual(g["stats"]["sources"], 2)
        self.assertEqual(g["stats"]["decisions"], 8)
        self.assertEqual(g["stats"]["pending"], 0)
        self.assertEqual(self.docs[0]["pages"], 129)
        self.assertFalse(self.docs[0]["synthetic"])
        self.assertTrue(self.docs[1]["synthetic"])
        rotation = next(n for n in g["nodes"] if n["label"] == "Password rotation")
        self.assertEqual(rotation["props"]["state"], "reversed")
        self.assertFalse(rotation["props"]["conflict"])
        self.assertEqual(
            [o["state"] for o in rotation["props"]["observations"]],
            ["proposed", "approved", "reversed"],
        )
        observations = [
            o for n in g["nodes"] for o in n["props"].get("observations", [])
        ]
        self.assertEqual(len(observations), 17)
        self.assertTrue(
            all(
                o["receipt"]["document_id"] == self.docs[1]["document_id"]
                for o in observations
            )
        )
        refs = [e for e in g["edges"] if e["source"] == self.docs[0]["document_id"]]
        self.assertEqual(len(refs), 7)

    def test_reference_quotes_validate_and_tampering_is_rejected(self):
        payload = Extraction.model_validate(self.payload)
        validate_extraction(payload, self.docs[1]["chunks"], self.docs[0]["chunks"])
        bad = copy.deepcopy(self.payload)
        next(d for d in bad["decisions"] if d["references"])["references"][0][
            "quote"
        ] = "An invented policy requirement not present in NIST."
        with self.assertRaises(ValueError):
            validate_extraction(
                Extraction.model_validate(bad),
                self.docs[1]["chunks"],
                self.docs[0]["chunks"],
            )

    def test_reference_removal_retracts_policy_links_not_conversation_events(self):
        g = self.client.delete(
            "/api/workspace/sources/" + self.docs[0]["document_id"]
        ).json()
        self.assertEqual(g["stats"]["decisions"], 8)
        self.assertFalse(
            any(e["source"] == self.docs[0]["document_id"] for e in g["edges"])
        )
        receipts = [r for e in g["edges"] for r in e["receipts"]]
        self.assertTrue(
            all(r["document_id"] == self.docs[1]["document_id"] for r in receipts)
        )

    def test_question_context_contains_both_policy_and_team_receipts(self):
        response = dict(answer="Test response", events=[], evidence_sufficient=True)
        with patch.object(
            main, "generate", new=AsyncMock(return_value=response)
        ) as generate:
            r = self.client.post(
                "/api/workspace/ask", json={"question": "Why was email OTP rejected?"}
            )
        self.assertEqual(r.status_code, 200, r.text)
        evidence = generate.call_args.args[1]
        self.assertTrue(any(e.get("source_type") == "reference" for e in evidence))
        self.assertTrue(any(e.get("source_type") == "conversation" for e in evidence))

    def test_assurance_baseline_has_multihop_release_impact(self):
        g = store.snapshot(self.docs)
        baseline = next(
            n for n in g["nodes"] if n["label"] == "Authentication assurance baseline"
        )
        affected = self.client.get(
            "/api/workspace/decisions/" + baseline["id"] + "/impact"
        ).json()["affected"]
        self.assertEqual(
            {a["decision"]["label"] for a in affected},
            {"Phishing-resistant sign-in", "Session timeouts", "Security launch gate"},
        )

    def test_large_reference_indexes_without_extracting_policy_as_decisions(self):
        with patch(
            "app.graph.structured",
            side_effect=AssertionError("Reference indexing must not call the model"),
        ):
            r = self.client.post(
                "/api/workspace/extract",
                json={"document_ids": [self.docs[0]["document_id"]], "force": True},
            )
        self.assertEqual(r.status_code, 200, r.text)
        result = r.json()
        self.assertEqual(result["results"][0]["state"], "indexed")
        self.assertEqual(result["workspace"]["stats"]["decisions"], 8)
        self.assertEqual(
            next(
                record
                for record in store.records()
                if record["document_id"] == self.docs[0]["document_id"]
            )["payload"]["decisions"],
            [],
        )

    def test_new_conversation_receives_and_cites_real_reference_context(self):
        quote = "2026-10-22 | Raymund Zyron rejected Email OTP sign-in for v2 because email must not be used for out-of-band authentication."
        upload = self.client.post(
            "/api/documents",
            data={"source_type": "conversation"},
            files=[("files", ("email-review-v2.md", quote.encode(), "text/markdown"))],
        )
        doc = upload.json()[-1]

        async def respond(client, url, **kwargs):
            content = json.loads(kwargs["json"]["messages"][1]["content"])
            self.assertLessEqual(len(content["reference_chunks"]), 8)
            ref = next(
                c
                for c in content["reference_chunks"]
                if "email shall not be used" in re.sub(r"\s+", " ", c["text"]).lower()
            )
            decision = dict(
                subject="Email OTP sign-in",
                scope="v2",
                cluster="Authentication design",
                state="rejected",
                action="Email OTP rejected for v2",
                rationale="Email is prohibited for out-of-band authentication.",
                event_date="2026-10-22",
                chunk_id=content["chunks"][0]["chunk_id"],
                evidence_quote=quote,
                people=[dict(name="Raymund Zyron", role="rejected_by", quote=quote)],
                references=[
                    dict(
                        label="No email for out-of-band authentication",
                        chunk_id=ref["chunk_id"],
                        quote=ref["text"],
                    )
                ],
            )
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
            main.os.environ,
            {"AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "context-test-key"},
        ), patch.object(httpx.AsyncClient, "post", respond):
            r = self.client.post(
                "/api/workspace/extract", json={"document_ids": [doc["document_id"]]}
            )
        self.assertEqual(r.status_code, 200, r.text)
        result = r.json()
        self.assertEqual(result["results"][0]["state"], "extracted", result["results"])
        node = next(
            n
            for n in result["workspace"]["nodes"]
            if n["kind"] == "decision"
            and n["label"] == "Email OTP sign-in"
            and n["props"]["scope"] == "v2"
        )
        self.assertTrue(
            any(
                e["source"] == self.docs[0]["document_id"]
                and e["target"] == node["id"]
                and e["kind"] == "supports"
                for e in result["workspace"]["edges"]
            )
        )

    def test_transport_failure_shows_labeled_saved_evidence(self):
        with patch.object(
            main,
            "generate",
            new=AsyncMock(
                side_effect=ProviderUnavailable(504, "Connection timed out.")
            ),
        ):
            r = self.client.post(
                "/api/workspace/ask",
                json={"question": "Why was password rotation reversed?"},
            )
        self.assertEqual(r.status_code, 200, r.text)
        result = r.json()
        self.assertEqual(result["engine"], "saved-graph")
        self.assertFalse(result["evidence_sufficient"])
        self.assertEqual(result["current_status"], "reversed")
        self.assertIn("Raymund Zyron", result["answer"])
        self.assertEqual(
            [e["state"] for e in result["events"]], ["proposed", "approved", "reversed"]
        )
        evidence_ids = {e["evidence_id"] for e in result["evidence"]}
        self.assertTrue(
            all(set(e["evidence_ids"]) <= evidence_ids for e in result["events"])
        )
        self.assertIn("without generating a new answer", result["limitations"][0])

    def test_model_validation_failure_is_not_hidden_by_fallback(self):
        with patch.object(
            main,
            "generate",
            new=AsyncMock(
                side_effect=HTTPException(502, "Invalid structured evidence")
            ),
        ):
            r = self.client.post(
                "/api/workspace/ask",
                json={"question": "Why was password rotation reversed?"},
            )
        self.assertEqual(r.status_code, 502)
        self.assertNotIn("engine", r.json())
