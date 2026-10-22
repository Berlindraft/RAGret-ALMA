import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pymupdf
from fastapi.testclient import TestClient
from app import main


class SourceViewerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = main.documents[:]
        main.documents[:] = []
        self.data_patch = patch.object(
            main, "DATA", Path(self.temp.name) / "documents.json"
        )
        self.data_patch.start()
        self.client = TestClient(main.app)

    def tearDown(self):
        main.documents[:] = self.original
        self.data_patch.stop()
        self.temp.cleanup()

    def test_full_pdf_view_and_download_preserve_original_bytes(self):
        with pymupdf.open() as pdf:
            pdf.new_page().insert_text((72, 72), "First page: authentication reference")
            pdf.new_page().insert_text((72, 72), "Second page: session requirements")
            original = pdf.tobytes()
        upload = self.client.post(
            "/api/documents",
            files=[("files", ("reference.pdf", original, "application/pdf"))],
        )
        doc = upload.json()[0]
        self.assertTrue(doc["has_original"])
        base = "/api/documents/" + doc["document_id"]
        content = self.client.get(base + "/content").json()
        self.assertEqual(content["format"], "pdf")
        self.assertEqual(len(content["pages"]), 2)
        self.assertIn("session requirements", content["pages"][1]["text"])
        downloaded = self.client.get(base + "/file?download=true")
        self.assertEqual(downloaded.content, original)
        self.assertEqual(downloaded.headers["content-type"], "application/pdf")
        self.assertIn("attachment", downloaded.headers["content-disposition"])
        self.assertIn("reference.pdf", downloaded.headers["content-disposition"])
        self.assertIn(
            "inline", self.client.get(base + "/file").headers["content-disposition"]
        )
        image = self.client.get(base + "/pages/2/image")
        self.assertEqual(image.headers["content-type"], "image/png")
        self.assertTrue(image.content.startswith(b"\x89PNG"))
        self.assertEqual(self.client.get(base + "/pages/0/image").status_code, 404)
        self.assertEqual(self.client.get(base + "/pages/3/image").status_code, 404)

    def test_long_conversation_is_complete_without_chunk_overlap(self):
        text = (
            "# Meeting\n\n"
            + "Maya: Review this decision.\n" * 150
            + "\nDaniel: Final message."
        )
        upload = self.client.post(
            "/api/documents",
            data={"source_type": "conversation"},
            files=[("files", ("conversation.md", text.encode(), "text/markdown"))],
        )
        base = "/api/documents/" + upload.json()[0]["document_id"]
        content = self.client.get(base + "/content").json()
        self.assertEqual(content["pages"][0]["text"], text)
        self.assertEqual(content["source"]["source_type"], "conversation")
        self.assertEqual(
            self.client.get(base + "/file?download=true").content, text.encode()
        )
        self.assertEqual(self.client.get(base + "/pages/1/image").status_code, 404)

    def test_missing_original_is_explicit_and_removed_source_cannot_be_downloaded(self):
        main.documents[:] = main.sample_docs()
        base = "/api/documents/" + main.documents[0]["document_id"]
        content = self.client.get(base + "/content").json()
        self.assertFalse(content["original_available"])
        self.assertEqual(content["format"], "text")
        self.assertEqual(self.client.get(base + "/file?download=true").status_code, 404)
        main.documents.clear()
        self.assertEqual(self.client.get(base + "/content").status_code, 404)
        self.assertEqual(self.client.get(base + "/file").status_code, 404)

    def test_invalid_batch_does_not_save_partial_original_uploads(self):
        result = self.client.post(
            "/api/documents",
            files=[
                ("files", ("good.txt", b"Useful source text", "text/plain")),
                ("files", ("bad.exe", b"bad", "application/octet-stream")),
            ],
        )
        self.assertEqual(result.status_code, 400)
        self.assertFalse(main.documents)
        self.assertFalse((main.DATA.parent / "originals").exists())
