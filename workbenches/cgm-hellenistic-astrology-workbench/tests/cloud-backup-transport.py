"""GitHub HTTPS adapter contract checks without sending credentials or data."""
import contextlib
import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(sys.argv.pop(1)).resolve()))
import backup_crypto as crypto
import backup_github as gh


class Reply:
    def __init__(self, status=200, payload=None, headers=None):
        self.status = status
        data = payload if isinstance(payload, bytes) else json.dumps(payload or {}).encode()
        self.body = io.BytesIO(data)
        self.headers = headers or {}
    def read(self, size=-1):
        return self.body.read(size)
    def getheader(self, name):
        return self.headers.get(name)


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='github-transport-', dir=Path.cwd())
        self.root = Path(self.temp.name)
        self.events = []
        self.replies = []
        outer = self
        class Connection:
            def __init__(self, host, **kwargs):
                self.host = host;self.headers = {};self.body = bytearray();outer.events.append(self)
            def putrequest(self, method, path):
                self.method, self.path = method, path
            def putheader(self, name, value):
                self.headers[name] = value
            def endheaders(self):
                pass
            def send(self, data):
                self.body.extend(data)
            def request(self, method, path, headers):
                self.method, self.path, self.headers = method, path, headers
            def getresponse(self):
                return outer.replies.pop(0)
            def close(self):
                pass
        self.patched = patch.object(gh.http.client, 'HTTPSConnection', Connection)
        self.patched.start()
        self.client = gh.GitHub('fixture/private-backup', 'fixture-token-only')
    def tearDown(self):
        self.patched.stop();self.temp.cleanup()

    def test_private_repo_read_and_initialized_commit_check(self):
        self.replies.extend([Reply(payload=dict(private=True, full_name='fixture/private-backup', default_branch='main', permissions=dict(push=True))), Reply(payload=dict(sha='fixture'))])
        self.assertTrue(self.client.verify_private(write=True)['private'])
        self.assertEqual(self.events[1].path, '/repos/fixture/private-backup/commits/main')

    def test_private_download_signed_redirect_never_receives_token(self):
        data = b'fictitious-encrypted-payload'
        self.replies.extend([Reply(302, headers={'Location':'https://release-assets.githubusercontent.com/fixture?temporary=signature'}), Reply(payload=data, headers={'Content-Length': str(len(data))})])
        target = self.root / 'download'
        self.client.download(123, target)
        self.assertEqual(target.read_bytes(), data)
        self.assertEqual(self.events[0].headers['Authorization'], 'Bearer fixture-token-only')
        self.assertNotIn('Authorization', self.events[1].headers)

    def test_non_github_redirect_is_rejected(self):
        self.replies.append(Reply(302, headers={'Location': 'https://unrelated.example/download'}))
        with self.assertRaises(crypto.BackupError):
            self.client.download(123, self.root / 'blocked')
        self.assertEqual(len(self.events), 1)

    def test_release_upload_streams_binary_not_json(self):
        source = self.root / 'encrypted';source.write_bytes(b'fictitious-data-' * 120000)
        self.replies.append(Reply(201, payload=dict(id=1, state='uploaded')))
        name = 'bazi-20261006T090000Z-0123456789ab.cgmbackup'
        self.client.upload(dict(upload_url='https://uploads.github.com/repos/fixture/private-backup/releases/1/assets{?name,label}'), name, source)
        event = self.events[0]
        self.assertEqual(bytes(event.body), source.read_bytes())
        self.assertEqual(event.headers['Content-Type'], 'application/octet-stream')
        self.assertEqual(int(event.headers['Content-Length']), source.stat().st_size)
        self.assertIn('name=bazi-', event.path)

    def test_release_and_asset_pagination(self):
        self.replies.extend([Reply(payload=[dict(id=i) for i in range(100)]), Reply(payload=[dict(id=100)])])
        self.assertEqual(len(self.client.releases()), 101)
        self.assertIn('page=2', self.events[-1].path)

    def test_http_auth_error_is_safe_and_does_not_echo_body(self):
        self.replies.append(Reply(401, payload=dict(message='fixture-token-only')))
        with self.assertRaises(crypto.BackupError) as caught:
            self.client.verify_private()
        self.assertEqual(caught.exception.code, 'auth')
        self.assertNotIn('fixture-token-only', str(caught.exception))

    def test_rate_limit_is_identified(self):
        self.replies.append(Reply(403, headers={'X-RateLimit-Remaining': '0'}))
        with self.assertRaises(crypto.BackupError) as caught:
            self.client.verify_private()
        self.assertEqual(caught.exception.code, 'rate-limit')

    def test_truncated_download_does_not_leave_partial_file(self):
        self.replies.append(Reply(payload=b'abc', headers={'Content-Length': '100'}))
        target = self.root / 'partial'
        with self.assertRaises(crypto.BackupError):
            self.client.download(123, target)
        self.assertFalse(target.exists())

    def test_untrusted_upload_url_is_rejected(self):
        source = self.root / 'encrypted';source.write_bytes(b'fixture')
        with self.assertRaises(crypto.BackupError):
            self.client.upload(dict(upload_url='https://unrelated.example/'), 'bazi-20261006T090000Z-0123456789ab.cgmbackup', source)
        self.assertEqual(self.events, [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
