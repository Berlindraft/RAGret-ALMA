import asyncio
import os
import unittest
from unittest.mock import patch

import httpx
from app import provider
from app.graph_schema import Extraction


class ProviderTransportTests(unittest.TestCase):
    def test_connection_check_recovers_without_generating_a_completion(self):
        async def available(client, url, **kwargs):
            self.assertEqual(url, "https://api.deepseek.com/models")
            return httpx.Response(200, json={"data": [{"id": "deepseek-flash"}]})

        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER": "deepseek",
                "DEEPSEEK_API_KEY": "probe-test-key",
                "DEEPSEEK_MODEL": "deepseek-flash",
            },
        ), patch.object(httpx.AsyncClient, "get", available), patch.object(
            httpx.AsyncClient,
            "post",
            side_effect=AssertionError("Probe must not generate"),
        ):
            provider._mark("unavailable", "Old network failed")
            result = asyncio.run(provider.check_connection())
        self.assertEqual(result["connection_status"], "connected")
        self.assertNotIn("probe-test-key", str(result))

    def test_connection_check_rejects_an_unavailable_model(self):
        async def available(client, url, **kwargs):
            return httpx.Response(200, json={"data": [{"id": "another-model"}]})

        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER": "deepseek",
                "DEEPSEEK_API_KEY": "probe-model-key",
                "DEEPSEEK_MODEL": "deepseek-flash",
            },
        ), patch.object(httpx.AsyncClient, "get", available):
            result = asyncio.run(provider.check_connection())
        self.assertEqual(result["connection_status"], "unavailable")
        self.assertIn("model is not available", result["connection_message"])

    def test_tls_timeout_is_bounded_and_health_reports_unavailable(self):
        async def timeout(client, url, **kwargs):
            self.assertEqual(client.timeout.connect, 8)
            raise httpx.ConnectTimeout("TLS handshake timed out")

        with patch.dict(
            os.environ,
            {"AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "transport-test-key"},
        ), patch.object(httpx.AsyncClient, "post", timeout):
            with self.assertRaises(provider.ProviderUnavailable) as result:
                asyncio.run(provider.structured("Extract evidence", {}, Extraction))
            self.assertEqual(result.exception.status_code, 504)
            status = provider.connection_status()
            self.assertEqual(status["connection_status"], "unavailable")
            self.assertIn("connection timed out", status["connection_message"])
            self.assertNotIn("transport-test-key", str(status))

    def test_successful_request_restores_connected_status(self):
        async def success(client, url, **kwargs):
            return httpx.Response(
                200,
                request=httpx.Request("POST", url),
                json={"choices": [{"message": {"content": '{"decisions": []}'}}]},
            )

        with patch.dict(
            os.environ,
            {"AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "recovery-test-key"},
        ), patch.object(httpx.AsyncClient, "post", success):
            provider._mark("unavailable", "Previous request failed")
            result = asyncio.run(
                provider.structured("Extract evidence", {}, Extraction)
            )
            self.assertEqual(result, {"decisions": []})
            self.assertEqual(
                provider.connection_status()["connection_status"], "connected"
            )
