"""Isolated backup/restore and fault tests. No live repository or personal data is used.

Run with the workbench's Python:
  python tests/cloud-backup.py skills/<visualization>/scripts
"""
import base64
import contextlib
import copy
import hashlib
import io
import json
import os
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(sys.argv.pop(1)).resolve()))
import backup_crypto as crypto
import backup_github as gh
import backup_schedule as schedule
import cloud_backup as backup


class MemoryVault:
    def __init__(self):
        self.values = {}
    def put(self, data):
        name = os.urandom(12).hex() + '.sealed'
        self.values[name] = copy.deepcopy(data)
        return name
    def get(self, name):
        return copy.deepcopy(self.values[name])


class TestScheduler:
    def __init__(self):
        self.installs = 0
        self.removes = 0
        self.fail = False
    def install(self):
        self.installs += 1
        if self.fail:
            raise crypto.BackupError('Test schedule refused', 'schedule')
        return dict(type='test', installed=True)
    def remove(self):
        self.removes += 1
        return dict(installed=False)


class Cloud:
    def __init__(self):
        self.rows = {}
        self.data = {}
        self.next_id = 1
        self.private = True
        self.offline = False
        self.ambiguous = False
        self.bad_digest = False
        self.token_expired = False
        self.fail_delete = False
        self.calls = []
        self.hold = None
        self.hit = None
    def client(self, repository, token):
        gh.repository_name(repository)
        if not token:
            raise crypto.BackupError('Test needs token', 'auth')
        cloud = self
        class Client:
            def __init__(self):
                self.repository, self.token = repository, token
            def verify_private(self, write=False):
                cloud.calls.append(('private', repository, write))
                if cloud.hold:
                    cloud.hit.set(); cloud.hold.wait(5)
                if cloud.token_expired:
                    raise crypto.BackupError('Test auth expired', 'auth')
                if cloud.offline:
                    raise crypto.BackupError('Test network offline', 'network')
                if not cloud.private:
                    raise crypto.BackupError('Test public repo', 'public-repository')
                return dict(private=True)
            def releases(self):
                return copy.deepcopy(cloud.rows.get(repository, []))
            def ensure_release(self, tag):
                existing = next((r for r in cloud.rows.get(repository, []) if r['tag_name'] == tag), None)
                if existing:
                    return copy.deepcopy(existing)
                value = dict(id=cloud.next_id, tag_name=tag, upload_url='https://uploads.github.com/repos/' + repository + '/releases/1/assets{?name,label}', assets=[])
                cloud.next_id += 1
                cloud.rows.setdefault(repository, []).append(value)
                return copy.deepcopy(value)
            def assets(self, release_id):
                return copy.deepcopy(next(r for r in cloud.rows[repository] if r['id'] == release_id)['assets'])
            def upload(self, release, name, path, label=''):
                data = Path(path).read_bytes()
                asset = dict(id=cloud.next_id, name=name, state='uploaded', size=len(data), digest='sha256:' + hashlib.sha256(data).hexdigest(),
                             label=label, created_at='2026-10-06T01:00:00Z')
                cloud.next_id += 1
                cloud.data[asset['id']] = data
                next(r for r in cloud.rows[repository] if r['id'] == release['id'])['assets'].append(asset)
                cloud.calls.append(('upload', name))
                if cloud.bad_digest:
                    asset['digest'] = 'sha256:' + '0' * 64
                if cloud.ambiguous:
                    cloud.ambiguous = False
                    raise crypto.BackupError('Test upload reply lost', 'network')
                return copy.deepcopy(asset)
            def verify_asset(self, asset, path, temporary):
                gh.GitHub.verify_asset(self, asset, path, temporary)
            def download(self, asset_id, path):
                if cloud.offline:
                    raise crypto.BackupError('Test download offline', 'network')
                with Path(path).open('xb') as stream:
                    stream.write(cloud.data[asset_id])
                cloud.calls.append(('download', asset_id))
            def delete_asset(self, asset_id):
                if cloud.fail_delete:
                    raise crypto.BackupError('Test delete failed', 'network')
                cloud.calls.append(('delete', asset_id))
                for release in cloud.rows[repository]:
                    release['assets'] = [a for a in release['assets'] if a['id'] != asset_id]
                cloud.data.pop(asset_id, None)
        return Client()


def database(path, kind, text='fictitious-analysis', font=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.closing(sqlite3.connect(path)) as db:
        db.execute('PRAGMA journal_mode=WAL')
        if kind == 'bazi':
            db.executescript("CREATE TABLE cases(id TEXT PRIMARY KEY,name TEXT,chart BLOB); INSERT INTO cases VALUES('case-fixture','Fictitious fixture',X'78'); CREATE TABLE views(id TEXT,case_id TEXT,mode TEXT); INSERT INTO views VALUES('view-fixture','case-fixture','year');")
        else:
            db.executescript("CREATE TABLE blobs(id TEXT PRIMARY KEY,kind TEXT,data BLOB); INSERT INTO blobs VALUES('blob-fixture','text',X'78'); CREATE TABLE cases(id TEXT PRIMARY KEY,name TEXT); INSERT INTO cases VALUES('case-fixture','Fictitious fixture'); CREATE TABLE views(id TEXT,case_id TEXT,mode TEXT,manifest TEXT,facts TEXT);")
            manifest = dict(assets={'font.ttf': font} if font else {})
            db.execute('INSERT INTO views VALUES(?,?,?,?,?)', ('view-fixture', 'case-fixture', 'natal', json.dumps(manifest), 'blob-fixture'))
        db.executescript("CREATE TABLE entries(view_id TEXT,key TEXT,value TEXT); CREATE TABLE history(id INTEGER PRIMARY KEY,text TEXT); INSERT INTO history VALUES(1,'historical-feedback'); CREATE TABLE case_remarks(case_id TEXT,text TEXT,version INTEGER); INSERT INTO case_remarks VALUES('case-fixture','fictional-source-and-background',3);")
        db.execute('INSERT INTO entries VALUES(?,?,?)', ('view-fixture', 'analysis', text))
        db.execute('INSERT INTO entries VALUES(?,?,?)', ('view-fixture', 'feedback', 'fictitious-feedback'))
        db.execute('INSERT INTO entries VALUES(?,?,?)', ('view-fixture', 'layers', '{"fixtureLayer":"preserve"}'))
        db.commit()


def content(path):
    with contextlib.closing(sqlite3.connect(path)) as db:
        return {name: db.execute('SELECT * FROM ' + name).fetchall() for name in ('cases', 'views', 'entries', 'history', 'case_remarks')}


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='backup-tests-', dir=Path.cwd())
        self.root = Path(self.temp.name)
        self.cloud = Cloud()
        self.clock = [1791248400.0]
        self.vault = schedule.SystemVault(self.root / 'vault') if sys.platform == 'win32' else MemoryVault()
        self.scheduler = TestScheduler()
        self.library = self.root / 'bazi'
        database(self.library / 'cases.sqlite3', 'bazi')
        self.settings = self.root / 'settings.json'
        self.settings.write_text('{"fixtureSetting":"preserve"}', encoding='utf-8')
        self.manager = self.new_manager('bazi', self.library, 'state', self.vault)
    def tearDown(self):
        self.temp.cleanup()
    def new_manager(self, kind, library, suffix, vault=None):
        return backup.BackupManager(kind, library, self.settings, self.root / suffix, vault or self.vault,
                                    self.cloud.client, self.scheduler, now=lambda: self.clock[0])
    def enable(self, manager=None, repository='fixture/private-backup', **options):
        manager = manager or self.manager
        prepared = manager.prepare(dict(repository=repository, token='fake-token-only', password='fixture password', passwordConfirm='fixture password',
                                        **dict(intervalDays=3, keep=2, time='09:00', automatic=True, **options)))
        manager.confirm(dict(recoveryCode=prepared['recoveryCode']))
        return prepared['recoveryCode']
    def change(self, text='new-fictitious-analysis'):
        with contextlib.closing(sqlite3.connect(self.library / 'cases.sqlite3')) as db:
            db.execute("UPDATE entries SET value=? WHERE key='analysis'", (text,));db.commit()
        self.clock[0] += 1
    def restore(self, manager=None, **unlock):
        manager = manager or self.manager
        rows = manager.snapshots(dict(repository='fixture/private-backup', token='fake-token-only'))['snapshots']
        return manager.restore(dict(repository='fixture/private-backup', token='fake-token-only', snapshotId=rows[0]['id'], **unlock))
    def assertError(self, code, call):
        with self.assertRaises(crypto.BackupError) as context:
            call()
        self.assertEqual(context.exception.code, code)

    def test_disabled_default_creates_nothing(self):
        self.assertFalse(self.manager.status()['configured'])
        self.assertFalse(self.manager.root.exists())
        self.assertEqual(self.cloud.calls, [])

    def test_initial_setup_requires_saved_recovery(self):
        prepared = self.manager.prepare(dict(repository='fixture/private-backup', token='fake-token-only', password='fixture password', passwordConfirm='fixture password'))
        self.assertFalse(self.manager.status()['configured'])
        self.assertTrue(self.manager.status()['setupPending'])
        self.assertEqual(self.scheduler.installs, 0)
        self.assertError('unlock', lambda: self.manager.confirm(dict(recoveryCode='wrong')))
        self.manager.confirm(dict(recoveryCode=prepared['recoveryCode']))
        self.assertTrue(self.manager.status()['configured'])
        self.assertEqual(self.scheduler.installs, 1)
        public = json.dumps(self.manager.status())
        self.assertNotIn('fake-token-only', public)
        self.assertNotIn(prepared['recoveryCode'], public)
        self.assertNotIn('fixture password', self.manager.config_path.read_text(encoding='utf-8'))

    def test_public_repository_rejected_before_setup_or_upload(self):
        self.cloud.private = False
        self.assertError('public-repository', self.enable)
        self.assertFalse(self.manager.status()['configured'])
        self.cloud.private = True
        self.enable();self.manager.run();before = copy.deepcopy(self.cloud.rows)
        self.cloud.private = False;self.change()
        self.assertError('public-repository', self.manager.run)
        self.assertEqual(before, self.cloud.rows)

    def test_complete_restore_preserves_all_records_and_original(self):
        self.enable();before = content(self.library / 'cases.sqlite3')
        self.assertTrue(self.manager.run()['uploaded'])
        self.assertFalse(self.manager.status()['pendingUpload'])
        for payload in self.cloud.data.values():
            self.assertNotIn(b'fictitious-analysis', payload)
            self.assertNotIn(b'fictional-source-and-background', payload)
        restored = self.restore(unlockMethod='password', password='fixture password')
        self.assertEqual(before, content(Path(restored['directory']) / 'cases.sqlite3'))
        self.assertEqual(before, content(self.library / 'cases.sqlite3'))
        self.assertEqual(json.loads((Path(restored['directory']) / 'settings.json').read_text(encoding='utf-8')), {'fixtureSetting': 'preserve'})

    def test_recovery_and_saved_local_key_restore(self):
        recovery = self.enable();self.manager.run()
        fresh = self.new_manager('bazi', self.library, 'other-computer', MemoryVault())
        result = self.restore(fresh, unlockMethod='recovery', recoveryCode=recovery)
        self.assertTrue(result['restored'])
        self.assertTrue(self.restore(unlockMethod='thisComputer')['restored'])

    def test_wrong_password_and_damage_do_not_publish_restores(self):
        self.enable();self.manager.run();original = content(self.library / 'cases.sqlite3')
        self.assertError('unlock', lambda: self.restore(unlockMethod='password', password='wrong password'))
        row = self.manager.snapshots({})['snapshots'][0]
        damaged = bytearray(self.cloud.data[row['id']]);damaged[-1] ^= 0xFF;self.cloud.data[row['id']] = bytes(damaged)
        self.assertError('integrity', lambda: self.restore(unlockMethod='password', password='fixture password'))
        self.assertEqual(original, content(self.library / 'cases.sqlite3'))
        self.assertFalse((self.manager.root / 'restores.json').exists())

    def test_unchanged_data_skips_upload_and_catches_up_once(self):
        self.enable();self.manager.run();uploads = len([c for c in self.cloud.calls if c[0] == 'upload'])
        self.assertTrue(self.manager.run()['unchanged'])
        self.clock[0] += 30 * 86400
        self.assertTrue(self.manager.run(scheduled=True)['unchanged'])
        self.assertEqual(len([c for c in self.cloud.calls if c[0] == 'upload']), uploads)
        self.assertEqual(self.manager.run(scheduled=True)['reason'], 'not-due')

    def test_upload_interruption_retries_same_snapshot_without_duplicate(self):
        self.enable();self.cloud.ambiguous = True
        self.assertError('network', self.manager.run)
        self.assertTrue(self.manager.status()['pendingUpload'])
        pending = backup.read_json(self.manager.root / 'outbox/pending.json')
        result = self.manager.run()
        self.assertEqual(result['name'], pending['name'])
        self.assertEqual(len(self.manager.snapshots({})['snapshots']), 1)

    def test_retry_also_captures_changes_after_interruption(self):
        self.enable();self.cloud.ambiguous = True
        self.assertError('network', self.manager.run)
        self.change('changed-while-offline')
        self.manager.run()
        result = self.restore(unlockMethod='thisComputer')
        with contextlib.closing(sqlite3.connect(Path(result['directory']) / 'cases.sqlite3')) as db:
            self.assertEqual(db.execute("SELECT value FROM entries WHERE key='analysis'").fetchone()[0], 'changed-while-offline')

    def test_cloud_digest_absent_falls_back_to_download_verification(self):
        self.enable();self.manager.run();self.change()
        self.cloud.ambiguous = True
        self.assertError('network', self.manager.run)
        pending = backup.read_json(self.manager.root / 'outbox/pending.json')
        for release in self.cloud.rows['fixture/private-backup']:
            for asset in release['assets']:
                if asset['name'] == pending['name']:
                    asset.pop('digest')
        self.assertTrue(self.manager.run()['uploaded'])
        self.assertTrue(any(c[0] == 'download' for c in self.cloud.calls))

    def test_retention_only_after_new_verified_snapshot(self):
        self.enable();self.manager.run();self.change('v2');self.manager.run();before = len(self.manager.snapshots({})['snapshots'])
        self.change('v3');self.cloud.bad_digest = True
        self.assertError('integrity', self.manager.run)
        self.assertEqual(len([c for c in self.cloud.calls if c[0] == 'delete']), 0)
        self.assertEqual(before, 2)
        self.cloud.bad_digest = False;self.manager.run()
        self.assertEqual(len(self.manager.snapshots({})['snapshots']), 2)

    def test_offline_and_expired_credentials_preserve_last_success(self):
        self.enable();self.manager.run();last = self.manager.status()['lastSuccess'];self.change()
        self.cloud.offline = True
        self.assertError('network', self.manager.run)
        self.assertEqual(self.manager.status()['lastSuccess'], last)
        self.assertGreater(self.manager.status()['nextRetry'], self.clock[0])
        self.cloud.offline = False;self.cloud.token_expired = True
        self.assertError('auth', self.manager.run)
        self.cloud.token_expired = False;self.manager.reconnect(dict(token='fake-token-renewed'))
        self.assertIsNone(self.manager.status()['lastError'])
        self.assertTrue(self.manager.run()['uploaded'])

    def test_suite_isolation_and_font_resource_deduplication(self):
        self.enable();self.manager.run()
        library = self.root / 'astrology'
        font = b'fictitious-font-resource';name = hashlib.sha256(font).hexdigest() + '.ttf'
        (library / 'assets').mkdir(parents=True);(library / 'assets' / name).write_bytes(font)
        database(library / 'cases.sqlite3', 'astrology', 'astrology-private-analysis', name)
        astro = self.new_manager('astrology', library, 'astro-state')
        self.enable(astro);astro.run()
        self.assertEqual(len(astro.snapshots({})['snapshots']), 1)
        self.assertEqual(len(self.manager.snapshots({})['snapshots']), 1)
        with contextlib.closing(sqlite3.connect(library / 'cases.sqlite3')) as db:
            db.execute("UPDATE entries SET value='astro-new-analysis' WHERE key='analysis'");db.commit()
        self.clock[0] += 1;astro.run()
        resources = [c for c in self.cloud.calls if c[0] == 'upload' and c[1].endswith('.cgmresource')]
        self.assertEqual(len(resources), 1)
        restored = self.restore(astro, unlockMethod='password', password='fixture password')
        self.assertEqual((Path(restored['directory']) / 'assets' / name).read_bytes(), font)
        self.assertEqual(content(library / 'cases.sqlite3'), content(Path(restored['directory']) / 'cases.sqlite3'))
        bazi_id = self.manager.snapshots({})['snapshots'][0]['id']
        self.assertError('snapshot', lambda: astro.restore(dict(snapshotId=bazi_id, password='fixture password')))

    def test_password_reset_new_backups_and_original_recovery(self):
        recovery = self.enable();self.manager.run()
        old = self.manager.snapshots({})['snapshots'][0]
        self.manager.change_password(dict(password='new fixture password', passwordConfirm='new fixture password'))
        self.assertTrue(self.manager.run()['uploaded'])
        self.assertTrue(self.restore(unlockMethod='password', password='new fixture password')['restored'])
        self.assertTrue(self.manager.restore(dict(snapshotId=old['id'], unlockMethod='password', password='fixture password'))['restored'])
        self.assertTrue(self.restore(unlockMethod='recovery', recoveryCode=recovery)['restored'])

    def test_scheduler_failure_is_reported_as_manual_backup(self):
        self.scheduler.fail = True
        self.enable()
        self.assertFalse(self.manager.status()['automatic'])
        self.assertIn('scheduleError', self.manager.status())
        self.assertTrue(self.manager.run()['uploaded'])

    def test_pause_and_concurrent_lock(self):
        self.enable();self.manager.pause(True)
        self.assertEqual(self.manager.run(scheduled=True)['reason'], 'not-due')
        self.assertTrue(self.manager.run()['uploaded'])
        self.manager.pause(False)
        self.change();self.cloud.hit = threading.Event();self.cloud.hold = threading.Event()
        result = []
        thread = threading.Thread(target=lambda: result.append(self.manager.run()));thread.start();self.cloud.hit.wait(5)
        try:
            self.assertError('busy', self.manager.run)
        finally:
            self.cloud.hold.set();thread.join(5)
        self.assertTrue(result[0]['uploaded'])

    def test_reconnect_new_repo_and_reset_preserve_data(self):
        self.enable();self.manager.run();before = content(self.library / 'cases.sqlite3')
        self.manager.reconnect(dict(repository='fixture/another-private', token='fake-token-only'))
        self.assertTrue(self.manager.run()['uploaded'])
        self.manager.reset(dict(confirmation='重新设置备份'))
        self.assertFalse(self.manager.status()['configured'])
        self.assertEqual(content(self.library / 'cases.sqlite3'), before)
        self.assertTrue(self.cloud.rows['fixture/private-backup'][0]['assets'])

    def test_adopt_changes_only_selected_suite_registry(self):
        self.enable();self.manager.run();restored = self.restore(unlockMethod='thisComputer')
        profile = self.root / 'locations.json'
        profile.write_text(json.dumps(dict(schema='cgm-workbench-locations/1', astrology_library='preserved-other-suite', node='preserved-runtime')))
        with patch.dict(os.environ, CGM_WORKBENCH_CONFIG=str(profile)):
            self.manager.adopt(dict(restoreId=restored['restoreId']))
        data = json.loads(profile.read_text(encoding='utf-8'))
        self.assertEqual(data['astrology_library'], 'preserved-other-suite')
        self.assertEqual(data['node'], 'preserved-runtime')
        self.assertEqual(data['bazi_library'], restored['directory'])
        self.assertTrue((self.library / 'cases.sqlite3').exists())

    def test_zip_path_traversal_and_oversize_rejected(self):
        archive = self.root / 'bad.zip'
        with zipfile.ZipFile(archive, 'x') as zipped:
            zipped.writestr('../escaped', 'bad');zipped.writestr('snapshot.json', '{}')
        self.assertError('format', lambda: backup.extract_verified(archive, self.root / 'extract', 'bazi'))
        self.assertFalse((self.root / 'escaped').exists())
        archive = self.root / 'oversized.zip'
        with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as zipped:
            zipped.writestr('cases.sqlite3', 'x' * 2048);zipped.writestr('snapshot.json', '{}')
        with patch.object(backup, 'MAX_BYTES', 1024):
            self.assertError('size', lambda: backup.extract_verified(archive, self.root / 'extract-large', 'bazi'))

    def test_wal_snapshot_contains_recent_commits(self):
        self.enable()
        with contextlib.closing(sqlite3.connect(self.library / 'cases.sqlite3')) as writer:
            writer.execute('PRAGMA journal_mode=WAL')
            writer.execute("UPDATE entries SET value='recent-wal-commit' WHERE key='feedback'");writer.commit()
            self.assertTrue(Path(str(self.library / 'cases.sqlite3') + '-wal').exists())
            self.manager.run()
            result = self.restore(unlockMethod='thisComputer')
            with contextlib.closing(sqlite3.connect(Path(result['directory']) / 'cases.sqlite3')) as db:
                self.assertEqual(db.execute("SELECT value FROM entries WHERE key='feedback'").fetchone()[0], 'recent-wal-commit')

    def test_streaming_chunks_truncation_tampering_and_wrong_kind(self):
        source = self.root / 'large.bin';source.write_bytes(os.urandom(2 * crypto.CHUNK + 31))
        encrypted = self.root / 'large.cgmbackup';key = os.urandom(32);code = crypto.recovery_code()
        crypto.encrypt_file(source, encrypted, key, dict(passwordWrap=crypto.wrap_password(key, 'fixture password'), recoveryWrap=crypto.wrap_recovery(key, code)), dict(kind='bazi', type='snapshot'))
        output = self.root / 'roundtrip.bin'
        crypto.decrypt_file(encrypted, output, 'bazi', recovery=code)
        self.assertEqual(crypto.file_sha(source), crypto.file_sha(output))
        self.assertError('kind', lambda: crypto.decrypt_file(encrypted, self.root / 'wrongkind', 'astrology', recovery=code))
        broken = self.root / 'truncated';broken.write_bytes(encrypted.read_bytes()[:-100])
        self.assertError('integrity', lambda: crypto.decrypt_file(broken, self.root / 'broken-output', 'bazi', recovery=code))
        self.assertFalse((self.root / 'broken-output').exists())
        data = bytearray(encrypted.read_bytes());header_length = struct.unpack('>I', data[8:12])[0]
        data[12+header_length+20] ^= 1;broken.write_bytes(data)
        self.assertError('integrity', lambda: crypto.decrypt_file(broken, self.root / 'tampered-output', 'bazi', recovery=code))

    def test_os_secret_is_not_plaintext(self):
        if sys.platform != 'win32':
            self.skipTest('Windows DPAPI is exercised on Windows')
        name = self.vault.put(dict(token='fixture-secret-marker'))
        self.assertNotIn(b'fixture-secret-marker', (self.vault.root / name).read_bytes())
        self.assertEqual(self.vault.get(name)['token'], 'fixture-secret-marker')

    def test_invalid_settings_and_corrupt_database_keep_last_backup(self):
        self.enable();self.manager.run();last = self.manager.status()['lastSuccess']
        self.settings.write_text('{broken-json', encoding='utf-8')
        self.assertError('settings', self.manager.run)
        self.assertEqual(self.manager.status()['lastSuccess'], last)
        self.settings.write_text('{}', encoding='utf-8')
        (self.library / 'cases.sqlite3').write_bytes(b'not-a-database')
        self.assertError('database', self.manager.run)
        self.assertEqual(self.manager.status()['lastSuccess'], last)
        self.assertEqual(len(self.manager.snapshots({})['snapshots']), 1)

    def test_failed_retention_retries_without_new_upload(self):
        self.enable();self.manager.run();self.change('v2');self.manager.run()
        self.change('v3');self.cloud.fail_delete = True
        result = self.manager.run()
        self.assertTrue(result['uploaded']);self.assertTrue(result['warning'])
        self.assertTrue(self.manager.config()['cleanupPending'])
        uploads = len([c for c in self.cloud.calls if c[0] == 'upload'])
        self.cloud.fail_delete = False
        self.assertTrue(self.manager.run()['unchanged'])
        self.assertEqual(len(self.manager.snapshots({})['snapshots']), 2)
        self.assertFalse(self.manager.config()['cleanupPending'])
        self.assertEqual(len([c for c in self.cloud.calls if c[0] == 'upload']), uploads)

    def test_new_recovery_key_requires_confirmation_and_preserves_old_snapshot(self):
        old_key = self.enable();self.manager.run();old = self.manager.snapshots({})['snapshots'][0]
        proposed = self.manager.rotate_recovery()['recoveryCode']
        self.assertError('unlock', lambda: self.manager.confirm_recovery(dict(recoveryCode=old_key)))
        self.assertTrue(self.manager.run()['unchanged'])
        self.manager.confirm_recovery(dict(recoveryCode=proposed));self.manager.run()
        self.assertTrue(self.restore(unlockMethod='recovery', recoveryCode=proposed)['restored'])
        self.assertTrue(self.manager.restore(dict(snapshotId=old['id'], unlockMethod='recovery', recoveryCode=old_key))['restored'])
        self.assertError('unlock', lambda: self.restore(unlockMethod='recovery', recoveryCode=old_key))

    def test_restore_without_system_vault_still_recovers_verified_files(self):
        self.enable();self.manager.run()
        new = self.new_manager('bazi', self.root / 'new-machine', 'new-state', MemoryVault())
        with patch.object(new.vault, 'put', side_effect=crypto.BackupError('Fixture vault unavailable', 'vault')):
            result = self.restore(new, unlockMethod='password', password='fixture password')
        self.assertTrue(result['restored']);self.assertTrue(result['warning'])
        self.assertEqual(content(self.library / 'cases.sqlite3'), content(Path(result['directory']) / 'cases.sqlite3'))
        self.assertFalse(new.status()['configured'])
        self.assertIsNone(backup.read_json(new.root / 'restores.json')[0]['credential'])

    def test_process_crash_releases_kernel_lock_and_stale_temp_cleanup(self):
        self.manager.root.mkdir(parents=True)
        script = "import sys,os; sys.path.insert(0,sys.argv[1]); from cloud_backup import FileLock; lock=FileLock(sys.argv[2]);lock.__enter__();os._exit(0)"
        subprocess.run([sys.executable, '-c', script, str(backup.HERE), str(self.manager.root / 'operation.lock')], check=True)
        with self.manager.lock():
            stale = self.manager.root / 'work-abcdefgh';stale.mkdir();(stale / 'plaintext').write_text('fixture')
            backup.write_json(stale / '.cgm-backup-temp', dict(schema='cgm-backup-temp/1', kind='bazi'))
            other = self.manager.root / 'keep-user-folder';other.mkdir()
            unmarked = self.manager.root / 'work-12345678';unmarked.mkdir()
            self.manager.housekeeping()
            self.assertFalse(stale.exists());self.assertTrue(other.exists());self.assertTrue(unmarked.exists())

    def test_crash_orphan_ciphertext_is_cleaned_but_pending_upload_is_preserved(self):
        outbox = self.manager.root / 'outbox';outbox.mkdir(parents=True)
        pending_name = 'bazi-20261006T090000Z-' + '1' * 12 + '.cgmbackup'
        orphan_name = 'bazi-20261006T090000Z-' + '2' * 12 + '.cgmbackup'
        resources = 'resources-' + '3' * 64 + '.cgmresource'
        backup.write_json(outbox / 'pending.json', dict(name=pending_name, resources=resources))
        for name in (pending_name, resources, orphan_name, orphan_name+'.part', 'readme.txt'):
            (outbox / name).write_bytes(b'fixture')
        self.manager.housekeeping()
        self.assertEqual({p.name for p in outbox.iterdir()}, {'pending.json', pending_name, resources, 'readme.txt'})


if __name__ == '__main__':
    unittest.main(verbosity=2)
