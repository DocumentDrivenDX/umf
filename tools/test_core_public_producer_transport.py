# SPDX-License-Identifier: MIT OR Apache-2.0
"""Network-free regression coverage for authenticated producer API redirects."""

from __future__ import annotations

import hashlib
import io
import json
import unittest
import zipfile
from email.message import Message
from unittest.mock import patch
from urllib.request import HTTPRedirectHandler

from tools import verify_core_public_producer as verifier


class ProducerTransportTests(unittest.TestCase):
    token = "test-only-fake-bearer-token"
    ordinary_headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "umf-core-public-install-proof",
    }

    @staticmethod
    def _regular_headers(request) -> dict[str, str]:
        return {name.lower(): value for name, value in request.headers.items()}

    def _redirecting_urlopen(self, payload: bytes, initial_url: str):
        def open_response(request, timeout: int):
            self.assertEqual(request.full_url, initial_url)
            self.assertEqual(request.get_method(), "GET")
            self.assertEqual(timeout, 30)
            self.assertEqual(
                self._regular_headers(request),
                {name.lower(): value for name, value in self.ordinary_headers.items()},
            )
            self.assertEqual(
                request.unredirected_hdrs,
                {"Authorization": f"Bearer {self.token}"},
            )

            current = request
            redirector = HTTPRedirectHandler()
            for target in (
                "https://objects.githubusercontent.com/fake-artifact?sig=fake",
                "https://storage.example.test/final?sig=fake",
            ):
                response_headers = Message()
                response_headers["Location"] = target
                redirected = redirector.redirect_request(
                    current,
                    None,
                    302,
                    "Found",
                    response_headers,
                    target,
                )
                self.assertIsNotNone(redirected)
                current = redirected
                self.assertEqual(current.full_url, target)
                self.assertEqual(current.get_method(), "GET")
                self.assertEqual(
                    self._regular_headers(current),
                    {name.lower(): value for name, value in self.ordinary_headers.items()},
                )
                self.assertEqual(current.unredirected_hdrs, {})
                self.assertFalse(
                    any(
                        name.lower() == "authorization"
                        for name, _ in current.header_items()
                    )
                )
            return io.BytesIO(payload)

        return open_response

    def test_api_json_keeps_auth_off_cross_origin_redirects(self) -> None:
        url = "https://api.github.com/repos/example/umf/actions/runs/7"
        payload = b'{"status":"completed"}'
        with patch.object(
            verifier.urllib.request,
            "urlopen",
            side_effect=self._redirecting_urlopen(payload, url),
        ) as urlopen:
            result = verifier.api_json(url, self.token)

        self.assertEqual(result, {"status": "completed"})
        self.assertEqual(urlopen.call_count, 1)

    def test_api_json_refuses_non_object_json(self) -> None:
        url = "https://api.github.com/repos/example/umf/actions/runs/7"
        with patch.object(
            verifier.urllib.request,
            "urlopen",
            side_effect=self._redirecting_urlopen(b"[]", url),
        ):
            with self.assertRaisesRegex(ValueError, "unexpected shape"):
                verifier.api_json(url, self.token)

    def test_api_json_retains_one_mib_response_bound(self) -> None:
        url = "https://api.github.com/repos/example/umf/actions/runs/7"
        payload = b" " * 1_048_577
        with patch.object(
            verifier.urllib.request,
            "urlopen",
            side_effect=self._redirecting_urlopen(payload, url),
        ):
            with self.assertRaisesRegex(ValueError, "one MiB bound"):
                verifier.api_json(url, self.token)

    @staticmethod
    def _tiny_zip() -> bytes:
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("producer.json", b'{"status":"pass"}\n')
        return output.getvalue()

    def _artifact_row(self, payload: bytes) -> dict[str, object]:
        return {
            "id": 42,
            "name": "tiny-producer-artifact",
            "size_in_bytes": len(payload),
            "digest": "sha256:" + hashlib.sha256(payload).hexdigest(),
            "expired": False,
        }

    def test_artifact_zip_keeps_auth_off_redirects_and_returns_exact_member(self) -> None:
        payload = self._tiny_zip()
        url = "https://api.github.com/repos/example/umf/actions/artifacts/42/zip"
        with patch.object(
            verifier.urllib.request,
            "urlopen",
            side_effect=self._redirecting_urlopen(payload, url),
        ) as urlopen:
            files = verifier.artifact_zip(self._artifact_row(payload), "example/umf", self.token)

        self.assertEqual(files, {"producer.json": b'{"status":"pass"}\n'})
        self.assertEqual(urlopen.call_count, 1)

    def test_artifact_zip_refuses_download_size_mismatch(self) -> None:
        payload = self._tiny_zip()
        row = self._artifact_row(payload)
        row["size_in_bytes"] = len(payload) + 1
        url = "https://api.github.com/repos/example/umf/actions/artifacts/42/zip"
        with patch.object(
            verifier.urllib.request,
            "urlopen",
            side_effect=self._redirecting_urlopen(payload, url),
        ):
            with self.assertRaisesRegex(ValueError, "download size differs"):
                verifier.artifact_zip(row, "example/umf", self.token)

    def test_artifact_zip_refuses_digest_mismatch(self) -> None:
        payload = self._tiny_zip()
        row = self._artifact_row(payload)
        row["digest"] = "sha256:" + "0" * 64
        url = "https://api.github.com/repos/example/umf/actions/artifacts/42/zip"
        with patch.object(
            verifier.urllib.request,
            "urlopen",
            side_effect=self._redirecting_urlopen(payload, url),
        ):
            with self.assertRaisesRegex(ValueError, "API digest differs"):
                verifier.artifact_zip(row, "example/umf", self.token)
