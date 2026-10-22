import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pymupdf as fitz
import httpx
from fastapi.testclient import TestClient
from app import main


class RAGretTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_patch = patch.object(main, 'DATA', Path(self.tmp.name) / 'documents.json')
        self.data_patch.start()
        self.original = main.documents[:]
        main.documents[:] = main.sample_docs()
        self.client = TestClient(main.app)

    def tearDown(self):
        main.documents[:] = self.original
        self.data_patch.stop()
        self.tmp.cleanup()

    def test_primary_sequence_and_receipts(self):
        r = self.client.post('/api/investigate', json={'question': 'Why was offline mode removed, and is it approved again?', 'mode': 'sample'})
        self.assertEqual(r.status_code, 200)
        r = r.json()
        self.assertEqual(r['current_status'], 'postponed')
        self.assertEqual(len(r['events']), 5)
        self.assertEqual([e['state'] for e in r['events']], ['proposed', 'approved', 'unresolved', 'postponed', 'proposed'])
        self.assertEqual([e['date'] for e in r['events']], sorted(e['date'] for e in r['events']))
        evidence = {e['evidence_id']: e for e in r['evidence']}
        for event in r['events']:
            for ref in event['evidence_ids']:
                source = self.client.get('/api/evidence/' + evidence[ref]['chunk_id'])
                self.assertEqual(source.status_code, 200)
                self.assertEqual(source.json()['text'], evidence[ref]['text'])
        self.assertIn('does not approve', r['answer'])

    def test_missing_evidence_does_not_call_provider(self):
        with patch.object(main, 'generate', side_effect=AssertionError('Must not call provider')):
            r = self.client.post('/api/investigate', json={'question': 'Who approved a biometric login launch?'})
        self.assertFalse(r.json()['evidence_sufficient'])
        self.assertEqual(r.json()['events'], [])
        self.assertEqual(r.json()['engine'], 'retrieval')

    def test_temporal_query_retrieves_decision_sequence(self):
        r = self.client.post('/api/investigate', json={'question': 'What changed between February and April?', 'mode': 'sample'})
        self.assertEqual(len(r.json()['events']), 5)

    def test_markdown_upload_date_metadata_and_delete(self):
        content = b'# Decision: Search\nDate: 2026-05-01\nThe team approved full-text search for v1.'
        r = self.client.post('/api/documents', files=[('files', ('decision.md', content, 'text/markdown'))])
        self.assertEqual(r.status_code, 200)
        d = r.json()[-1]
        self.assertEqual(d['document_date'], '2026-05-01')
        self.assertFalse(d['synthetic'])
        self.assertEqual(d['pages'], 1)
        e = self.client.get('/api/evidence/' + d['first_chunk_id']).json()
        self.assertEqual(e['section'], 'Decision: Search')
        self.assertIn('approved full-text search', e['text'])
        self.assertTrue(main.DATA.exists())
        self.assertEqual(len(self.client.delete('/api/documents/' + d['document_id']).json()), 5)

    def test_undated_source_and_bad_types(self):
        r = self.client.post('/api/documents', files=[('files', ('notes.txt', b'We proposed search.', 'text/plain'))])
        self.assertIsNone(r.json()[-1]['document_date'])
        self.assertTrue(r.json()[-1]['warnings'])
        self.assertEqual(self.client.post('/api/documents', files=[('files', ('bad.exe', b'no', 'application/octet-stream'))]).status_code, 400)
        self.assertEqual(self.client.post('/api/documents', files=[('files', ('empty.txt', b'', 'text/plain'))]).status_code, 400)

    def test_pdf_keeps_page_numbers_and_empty_page_warning(self):
        with fitz.open() as pdf:
            pdf.new_page()
            p = pdf.new_page()
            p.insert_text((72, 72), 'Date: 2026-06-02. Offline mode was rejected.')
            data = pdf.tobytes()
        r = self.client.post('/api/documents', files=[('files', ('review.pdf', data, 'application/pdf'))])
        d = r.json()[-1]
        self.assertEqual(d['pages'], 2)
        self.assertTrue(d['warnings'])
        e = self.client.get('/api/evidence/' + d['first_chunk_id']).json()
        self.assertEqual(e['page'], 2)

    def test_upload_batch_is_atomic_and_limited(self):
        r = self.client.post('/api/documents', files=[('files', ('good.md', b'Date: 2026-04-01\nSearch proposed.')), ('files', ('bad.exe', b'bad'))])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(len(main.documents), 5)
        r = self.client.post('/api/documents', files=[('files', (f'{i}.txt', b'Valid text')) for i in range(4)])
        self.assertEqual(r.status_code, 400)

    def test_sample_preview_refuses_unprepared_answers(self):
        r = self.client.post('/api/investigate', json={'question': 'Who approved offline mode?', 'mode': 'sample'})
        self.assertEqual(r.status_code, 400)

    def test_invented_citations_are_rejected_after_retry(self):
        invalid = dict(answer='A finding', current_status='approved', status_explanation='Approved', evidence_sufficient=True, events=[dict(date='2026-01-12', date_certainty='explicit', state='approved', title='Claim', description='Claim', evidence_ids=['E999'])], limitations=[])
        calls = []
        async def fake_post(client, url, **kwargs):
            calls.append(url)
            return httpx.Response(200, request=httpx.Request('POST', url), json={'choices': [{'message': {'content': json.dumps(invalid)}}]})
        with patch.dict(main.os.environ, {'AI_PROVIDER': 'deepseek', 'DEEPSEEK_API_KEY': 'test-key'}), patch.object(httpx.AsyncClient, 'post', fake_post):
            r = self.client.post('/api/investigate', json={'question': 'Why was offline mode removed?'})
        self.assertEqual(r.status_code, 502)
        self.assertEqual(len(calls), 2)
        self.assertNotIn('answer', r.json())

    def test_provider_network_failure_is_honest(self):
        async def fail(client, url, **kwargs):
            raise httpx.ConnectError('unreachable')
        with patch.dict(main.os.environ, {'AI_PROVIDER': 'deepseek', 'DEEPSEEK_API_KEY': 'test-key'}), patch.object(httpx.AsyncClient, 'post', fail):
            r = self.client.post('/api/investigate', json={'question': 'Why was offline mode removed?'})
        self.assertEqual(r.status_code, 502)
        self.assertIn('could not be reached', r.json()['detail'])

    def test_alma_adapter_uses_supplied_schema(self):
        result = dict(answer='Not established.', current_status='unresolved', status_explanation='Unknown', evidence_sufficient=False, events=[], limitations=['No approval.'])
        async def fake_post(client, url, **kwargs):
            self.assertEqual(url, 'https://organizer.example/infer')
            self.assertEqual(kwargs['headers'], {'X-Team-Key': 'test-key'})
            self.assertEqual(kwargs['json']['model_id'], 'provided-gemma')
            self.assertIn('offline', kwargs['json']['input'])
            return httpx.Response(200, request=httpx.Request('POST', url), json={'output': {'answer': result}})
        config = dict(AI_PROVIDER='alma', ALMA_API_KEY='test-key', ALMA_API_URL='https://organizer.example/infer', ALMA_MODEL='provided-gemma', ALMA_AUTH_HEADER='X-Team-Key', ALMA_AUTH_PREFIX='', ALMA_REQUEST_TEMPLATE='{"model_id":"$model","input":"$prompt"}', ALMA_RESPONSE_PATH='output.answer')
        with patch.dict(main.os.environ, config), patch.object(httpx.AsyncClient, 'post', fake_post):
            r = self.client.post('/api/investigate', json={'question': 'Why was offline mode removed?'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['engine'], 'alma')


if __name__ == '__main__':
    unittest.main()

