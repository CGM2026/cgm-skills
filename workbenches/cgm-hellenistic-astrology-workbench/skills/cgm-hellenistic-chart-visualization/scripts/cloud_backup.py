"""Optional encrypted backups, independent per suite and library. No automatic enrollment."""
import argparse
import contextlib
import importlib.util
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from backup_crypto import BackupError, CHUNK, MAX_BYTES, aes, b64, canonical, decrypt_file, encrypt_file, file_sha, key_id, recovery_code, unlock, un64, wrap_password, wrap_recovery
from backup_github import GitHub, RELEASE_TAG, RESOURCE_NAME, SNAPSHOT_NAME, repository_name
from backup_schedule import Scheduler, SystemVault, atomic

HERE = Path(__file__).resolve().parent
MAX_FILES = 10000
CONFIG_SCHEMA = 'cgm-cloud-backup/1'
FONT_SUFFIXES = {'.ttf', '.otf', '.woff', '.woff2'}


def write_json(path, data):
    atomic(path, canonical(data) + b'\n')


def read_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding='utf-8-sig'))


class FileLock:
    """Kernel-owned locks disappear after a crashed process; stale lock files are harmless."""
    def __init__(self, path):
        self.path = Path(path)

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.stream = self.path.open('a+b')
        if self.stream.tell() == 0:
            self.stream.write(b'0')
            self.stream.flush()
        self.stream.seek(0)
        try:
            if sys.platform == 'win32':
                import msvcrt
                msvcrt.locking(self.stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            self.stream.close()
            raise BackupError('另一处正在执行备份或恢复，请等它完成。', 'busy') from error
        return self

    def __exit__(self, *args):
        if sys.platform == 'win32':
            import msvcrt
            self.stream.seek(0)
            msvcrt.locking(self.stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(self.stream.fileno(), fcntl.LOCK_UN)
        self.stream.close()


def state_directory(kind, library):
    identity = str(Path(library).resolve())
    if sys.platform == 'win32':
        identity = identity.casefold()
    import hashlib
    name = kind + '-' + hashlib.sha256(identity.encode()).hexdigest()[:20]
    return Path(os.environ.get('CGM_BACKUP_HOME') or Path.home() / '.cgm-workbenches/backup') / name


def validate_options(data):
    days, keep, clock = data.get('intervalDays', 3), data.get('keep', 12), data.get('time', '09:00')
    if type(days) is not int or not 1 <= days <= 365:
        raise BackupError('备份间隔需要在1至365天之间。', 'options')
    if type(keep) is not int or not 2 <= keep <= 60:
        raise BackupError('保留数量需要在2至60份之间。', 'options')
    if not isinstance(clock, str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', clock):
        raise BackupError('备份时间需要写成小时与分钟。', 'options')
    automatic = data.get('automatic', True)
    if type(automatic) is not bool:
        raise BackupError('自动备份选项无效。', 'options')
    return dict(intervalDays=days, keep=keep, time=clock, automatic=automatic)


def due_time(clock, days=0, now=None):
    now = time.time() if now is None else now
    current = datetime.fromtimestamp(now)
    hour, minute = map(int, clock.split(':'))
    selected = current.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days)
    return max(now, selected.timestamp())


def validate_database(path, kind):
    with contextlib.closing(sqlite3.connect(Path(path).as_uri() + '?mode=ro', uri=True, timeout=20)) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise BackupError('案例库完整性检查未通过，请保留原文件并检查数据库。', 'database')
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {'cases', 'views', 'entries'} <= tables:
            raise BackupError('文件不是工作台案例库。', 'database')
        case_columns = {r[1] for r in db.execute('PRAGMA table_info(cases)')}
        view_columns = {r[1] for r in db.execute('PRAGMA table_info(views)')}
        if kind == 'bazi' and ('chart' not in case_columns or 'manifest' in view_columns):
            raise BackupError('文件不属于八字案例库。', 'kind')
        if kind == 'astrology' and ('blobs' not in tables or not {'manifest', 'facts'} <= view_columns):
            raise BackupError('文件不属于占星案例库。', 'kind')
        return dict(cases=db.execute('SELECT count(*) FROM cases').fetchone()[0], views=db.execute('SELECT count(*) FROM views').fetchone()[0])


def referenced_assets(path, kind):
    if kind == 'bazi':
        return set()
    names = set()
    with contextlib.closing(sqlite3.connect(Path(path).as_uri() + '?mode=ro', uri=True)) as db:
        for row in db.execute('SELECT manifest FROM views'):
            assets = json.loads(row[0]).get('assets', {})
            if not isinstance(assets, dict):
                raise BackupError('案例资源清单无效。', 'database')
            names.update(assets.values())
    if len(names) > MAX_FILES or any(not isinstance(n, str) or not re.fullmatch(r'[a-f0-9]{64}\.[a-zA-Z0-9]{1,12}', n) for n in names):
        raise BackupError('案例资源清单过大或包含无效路径。', 'database')
    return names


def snapshot_database(source, target):
    started = time.monotonic()
    def progress(status, remaining, total):
        if time.monotonic() - started > 90:
            raise BackupError('案例库持续繁忙，这次备份暂缓，稍后会重试。', 'busy')
    try:
        with contextlib.closing(sqlite3.connect(Path(source).as_uri() + '?mode=ro', uri=True, timeout=15)) as src, contextlib.closing(sqlite3.connect(target)) as dest:
            src.backup(dest, pages=512, progress=progress, sleep=0.05)
    except sqlite3.DatabaseError as error:
        raise BackupError('案例库无法读取；请保留原文件并检查数据库，已有云端备份保留。', 'database') from error


def make_archive(target, kind, files, bundle_type='snapshot'):
    """Content fingerprint excludes ZIP timestamps and creation time."""
    records = [dict(name=name, sha256=file_sha(path), bytes=Path(path).stat().st_size) for name, path in sorted(files.items())]
    if len(records) > MAX_FILES or sum(r['bytes'] for r in records) > MAX_BYTES:
        raise BackupError('备份内容超过当前大小或文件数量上限。', 'size')
    import hashlib
    fingerprint = hashlib.sha256(canonical(dict(kind=kind, type=bundle_type, files=records))).hexdigest()
    manifest = dict(schema='cgm-backup-files/1', kind=kind, type=bundle_type, files=records)
    with zipfile.ZipFile(target, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
        for name, path in sorted(files.items()):
            zipped.write(path, name)
        zipped.writestr('snapshot.json', canonical(manifest))
    return fingerprint


def extract_verified(source, target, kind, bundle_type='snapshot'):
    target = Path(target)
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as zipped:
        entries = zipped.infolist()
        names = [i.filename for i in entries]
        if len(names) > MAX_FILES + 1 or len(set(names)) != len(names) or 'snapshot.json' not in names:
            raise BackupError('备份文件清单有重复或缺失。', 'format')
        for entry in entries:
            name = entry.filename
            path = PurePosixPath(name)
            if (name != path.as_posix() or '\\' in name or ':' in name or path.is_absolute() or '..' in path.parts or
                    entry.is_dir() or (entry.external_attr >> 16) & 0o170000 == 0o120000 or
                    not (name in ('snapshot.json', 'cases.sqlite3', 'settings.json') or re.fullmatch(r'assets/[a-f0-9]{64}\.[a-zA-Z0-9]{1,12}', name))):
                raise BackupError('备份包含无效文件路径。', 'format')
        if zipped.getinfo('snapshot.json').file_size > 4 * 1024 * 1024 or sum(i.file_size for i in entries) > MAX_BYTES:
            raise BackupError('备份解压大小超过上限。', 'size')
        manifest = json.loads(zipped.read('snapshot.json'))
        if manifest.get('schema') != 'cgm-backup-files/1' or manifest.get('kind') != kind or manifest.get('type') != bundle_type or not isinstance(manifest.get('files'), list):
            raise BackupError('备份说明与当前工作台不一致。', 'kind')
        records = manifest['files']
        if {r['name'] for r in records} != set(names) - {'snapshot.json'} or len(records) != len(names) - 1:
            raise BackupError('备份内容与文件清单不一致。', 'integrity')
        if bundle_type == 'resources' and any(not r['name'].startswith('assets/') for r in records):
            raise BackupError('共享资源包内容无效。', 'format')
        for record in records:
            name = record['name']
            entry = zipped.getinfo(name)
            if type(record.get('bytes')) is not int or entry.file_size != record['bytes'] or not re.fullmatch(r'[a-f0-9]{64}', record['sha256']):
                raise BackupError('备份文件长度或摘要无效。', 'integrity')
            path = target.joinpath(*PurePosixPath(name).parts)
            path.parent.mkdir(parents=True, exist_ok=True)
            with zipped.open(name) as src, path.open('xb') as out:
                shutil.copyfileobj(src, out, CHUNK)
            if file_sha(path) != record['sha256']:
                raise BackupError('备份解压后的内容校验失败。', 'integrity')
        return manifest


class BackupManager:
    def __init__(self, kind, library, settings=None, state_root=None, vault=None, github_factory=None, scheduler=None, now=None):
        if kind not in ('bazi', 'astrology'):
            raise BackupError('工作台类型无效。', 'kind')
        self.kind = kind
        self.library = Path(library).resolve()
        self.settings = Path(settings).resolve() if settings else None
        self.root = Path(state_root).resolve() if state_root else state_directory(kind, library)
        self.config_path = self.root / 'config.json'
        self.vault = vault or SystemVault(self.root / 'credentials')
        self.github_factory = github_factory or GitHub
        self.scheduler = scheduler or Scheduler(self.root, kind, library, settings)
        self.now = now or time.time
        self.jobs = {}
        self.job_lock = threading.Lock()

    def lock(self):
        return FileLock(self.root / 'operation.lock')

    def config(self, required=False):
        config = read_json(self.config_path)
        if config and (config.get('schema') != CONFIG_SCHEMA or config.get('kind') != self.kind or config.get('library') != str(self.library)):
            raise BackupError('备份设置不属于当前案例库。', 'config')
        if required and not config.get('credential'):
            raise BackupError('请先连接私有仓库并保存恢复密钥。', 'setup')
        return config

    def save(self, config):
        config.update(schema=CONFIG_SCHEMA, kind=self.kind, library=str(self.library))
        write_json(self.config_path, config)

    def credentials(self, config):
        return self.vault.get(config['credential'])

    def status(self):
        config = self.config()
        pending_setup = (self.root / 'setup.json').exists()
        with self.job_lock:
            jobs = list(self.jobs.values())
            job = dict(jobs[-1]) if jobs else None
        fields = ('repository', 'intervalDays', 'keep', 'time', 'automatic', 'paused', 'nextDue', 'nextRetry', 'lastCheck',
                  'lastSuccess', 'lastOutcome', 'lastError', 'errorCode', 'lastSnapshot', 'lastBytes', 'recoveryFingerprint', 'scheduler', 'scheduleError')
        return dict(configured=bool(config.get('credential')), setupPending=pending_setup, kind=self.kind,
                    cryptoReady=importlib.util.find_spec('cryptography') is not None,
                    pendingUpload=(self.root / 'outbox/pending.json').exists(), job=job,
                    **{k: config.get(k) for k in fields if k in config})

    def prepare(self, body):
        with self.lock():
            if self.config().get('credential'):
                raise BackupError('此案例库已有备份设置，请使用管理中的重新连接或修改密码。', 'setup')
            options = validate_options(body)
            password = body.get('password')
            if password != body.get('passwordConfirm'):
                raise BackupError('两次输入的备份密码不一致。', 'password')
            key = os.urandom(32)
            password_wrap = wrap_password(key, password)
            code = recovery_code()
            recovery_wrap = wrap_recovery(key, code)
            repository = repository_name(body.get('repository'))
            client = self.github_factory(repository, body.get('token'))
            client.verify_private(write=True)
            identity = os.urandom(12).hex()
            secret = dict(key=b64(key), token=body['token'], passwordWrap=password_wrap, recoveryWrap=recovery_wrap, pendingRecovery=code)
            credential = self.vault.put(secret)
            config = dict(options, repository=repository, collection=identity, credential=credential, paused=False,
                          recoveryFingerprint=code.rsplit('-', 1)[-1], nextDue=due_time(options['time'], now=self.now()))
            write_json(self.root / 'setup.json', config)
            return dict(recoveryCode=code, recoveryFingerprint=config['recoveryFingerprint'], message='请将恢复密钥单独保存，再粘贴一次完成启用。')

    def confirm(self, body):
        with self.lock():
            candidate = read_json(self.root / 'setup.json')
            if not candidate:
                raise BackupError('请重新开始备份设置。', 'setup')
            secrets = self.credentials(candidate)
            key = unlock(dict(keyId=key_id(un64(secrets['key'], 32)), recoveryWrap=secrets['recoveryWrap']), recovery=body.get('recoveryCode'))
            if key != un64(secrets['key'], 32):
                raise BackupError('恢复密钥不匹配。', 'unlock')
            secrets.pop('pendingRecovery', None)
            candidate['credential'] = self.vault.put(secrets)
            if candidate['automatic']:
                try:
                    candidate['scheduler'] = self.scheduler.install()
                except BackupError as error:
                    candidate.update(automatic=False, scheduleError=str(error))
            self.save(candidate)
            (self.root / 'setup.json').unlink(missing_ok=True)
            return self.status()

    def resume_setup(self):
        with self.lock():
            candidate = read_json(self.root / 'setup.json')
            if not candidate:
                raise BackupError('没有待确认的设置。', 'setup')
            secret = self.credentials(candidate)
            return dict(recoveryCode=secret['pendingRecovery'])

    def update(self, body):
        with self.lock():
            config = self.config(True)
            options = validate_options({**config, **body})
            if options['automatic']:
                config['scheduler'] = self.scheduler.install()
                config.pop('scheduleError', None)
            elif config.get('scheduler', {}).get('installed'):
                config['scheduler'] = self.scheduler.remove()
            config.update(options, nextDue=due_time(options['time'], now=self.now()))
            self.save(config)
        return self.status()

    def pause(self, paused=True):
        if type(paused) is not bool:
            raise BackupError('暂停选项无效。', 'options')
        with self.lock():
            config = self.config(True)
            config['paused'] = paused
            self.save(config)
        return self.status()

    def reconnect(self, body):
        with self.lock():
            config = self.config(True)
            secret = self.credentials(config)
            repository = repository_name(body.get('repository', config['repository']))
            token = body.get('token') or secret['token']
            self.github_factory(repository, token).verify_private(write=True)
            changed = repository.lower() != config['repository'].lower()
            if changed and (self.root / 'outbox/pending.json').exists():
                raise BackupError('请先完成待上传备份，再更换仓库。', 'pending')
            secret['token'] = token
            config.update(repository=repository, credential=self.vault.put(secret), lastError=None, errorCode=None, nextRetry=0)
            if changed:
                config.update(lastFingerprint=None, lastSuccess=None, lastSnapshot=None, collection=os.urandom(12).hex())
            self.save(config)
        return self.status()

    def change_password(self, body):
        with self.lock():
            config = self.config(True)
            secret = self.credentials(config)
            key = un64(secret['key'], 32)
            if body.get('password') != body.get('passwordConfirm'):
                raise BackupError('两次输入的新密码不一致。', 'password')
            secret['passwordWrap'] = wrap_password(key, body.get('password'))
            config['credential'] = self.vault.put(secret)
            config['lastFingerprint'] = None
            self.save(config)
        return dict(message='新密码用于之后的备份；旧备份仍可用原密码、恢复密钥或本机密钥打开。')

    def rotate_recovery(self):
        with self.lock():
            config = self.config(True)
            secret = self.credentials(config)
            code = recovery_code()
            secret['recoveryWrap'] = wrap_recovery(un64(secret['key'], 32), code)
            secret['pendingRecovery'] = code
            write_json(self.root / 'recovery-pending.json', dict(credential=self.vault.put(secret), fingerprint=code.rsplit('-', 1)[-1]))
            return dict(recoveryCode=code, message='确认保存新恢复密钥后，它才用于后续备份。旧备份仍使用旧恢复密钥。')

    def confirm_recovery(self, body):
        with self.lock():
            config = self.config(True)
            pending = read_json(self.root / 'recovery-pending.json')
            if not pending:
                raise BackupError('请先生成新恢复密钥。', 'setup')
            secret = self.credentials(pending)
            unlock(dict(keyId=key_id(un64(secret['key'], 32)), recoveryWrap=secret['recoveryWrap']), recovery=body.get('recoveryCode'))
            secret.pop('pendingRecovery', None)
            config.update(credential=self.vault.put(secret), recoveryFingerprint=pending['fingerprint'])
            config['lastFingerprint'] = None
            self.save(config)
            (self.root / 'recovery-pending.json').unlink(missing_ok=True)
        return self.status()

    def reset(self, body):
        if body.get('confirmation') != '重新设置备份':
            raise BackupError('请明确选择重新设置备份。', 'setup')
        with self.lock():
            config = self.config()
            if config.get('scheduler', {}).get('installed'):
                self.scheduler.remove()
            archive = self.root / 'previous-connections' / uuid.uuid4().hex
            archive.mkdir(parents=True, exist_ok=False)
            for name in ('config.json', 'setup.json', 'recovery-pending.json'):
                path = self.root / name
                if path.exists():
                    os.replace(path, archive / name)
            outbox = self.root / 'outbox'
            if outbox.exists():
                os.replace(outbox, archive / 'outbox')
        return dict(message='连接设置已归档，案例库与云端备份保留。可以重新启用。')

    def housekeeping(self):
        # A process crash can leave private temporary plaintext. Only this module's
        # exact temporary directory prefixes, inside its private root, are removed.
        if not self.root.is_dir():
            return
        for path in self.root.iterdir():
            if re.fullmatch(r'(?:work|restore-work)-[a-z0-9_]{8}', path.name) and path.is_dir() and not path.is_symlink() and (path / '.cgm-backup-temp').is_file():
                resolved = path.resolve()
                marker = read_json(path / '.cgm-backup-temp')
                if resolved.parent == self.root.resolve() and marker == {'schema': 'cgm-backup-temp/1', 'kind': self.kind}:
                    shutil.rmtree(resolved)
        outbox = self.root / 'outbox'
        if outbox.is_dir() and not outbox.is_symlink():
            pending = read_json(outbox / 'pending.json')
            retained = {pending.get('name'), pending.get('resources')}
            for path in outbox.iterdir():
                name = path.name
                managed = (SNAPSHOT_NAME.fullmatch(name) or RESOURCE_NAME.fullmatch(name) or
                           SNAPSHOT_NAME.fullmatch(name.removesuffix('.part')) or
                           re.fullmatch(r'resources-[a-f0-9]{64}\.part', name))
                if managed and name not in retained and path.is_file() and not path.is_symlink() and path.resolve().parent == outbox.resolve():
                    path.unlink()

    def _client(self, config):
        secret = self.credentials(config)
        return self.github_factory(config['repository'], secret['token']), secret

    def _metadata(self, config, secret, file_type, **extra):
        return dict(kind=self.kind, type=file_type, collection=config['collection'], created=self.now(), **extra)

    @staticmethod
    def _wrappers(secret):
        return dict(passwordWrap=secret['passwordWrap'], recoveryWrap=secret['recoveryWrap'])

    def _build(self, config, secret, temporary):
        db = self.library / 'cases.sqlite3'
        if not db.is_file():
            raise BackupError('正式案例库不存在，请核对位置；没有建立空库。', 'database')
        snapshot = temporary / 'cases.sqlite3'
        snapshot_database(db, snapshot)
        validate_database(snapshot, self.kind)
        files = {'cases.sqlite3': snapshot}
        if self.settings and self.settings.is_file():
            settings = self.settings.read_bytes()
            try:
                valid_settings = len(settings) <= 4 * 1024 * 1024 and isinstance(json.loads(settings), dict)
            except (ValueError, UnicodeError):
                valid_settings = False
            if not valid_settings:
                raise BackupError('默认设置文件无效或过大。', 'settings')
            settings_file = temporary / 'settings.json'
            settings_file.write_bytes(settings)
            files['settings.json'] = settings_file
        assets = referenced_assets(snapshot, self.kind)
        resource_files = {}
        for name in assets:
            path = self.library / 'assets' / name
            if not path.is_file() or path.is_symlink() or file_sha(path) != name.rsplit('.', 1)[0]:
                raise BackupError('案例引用的资源缺失或已改变，请先修复资源。', 'asset')
            if path.suffix.lower() in FONT_SUFFIXES:
                resource_files['assets/' + name] = path
            else:
                files['assets/' + name] = path
        resource_fingerprint = None
        if resource_files:
            resource_fingerprint = make_archive(temporary / 'resources.zip', self.kind, resource_files, 'resources')
        fingerprint = make_archive(temporary / 'snapshot.zip', self.kind, files)
        import hashlib
        fingerprint = hashlib.sha256((fingerprint + ':' + str(resource_fingerprint)).encode()).hexdigest()
        if fingerprint == config.get('lastFingerprint'):
            return dict(unchanged=True)
        name = self.kind + '-' + datetime.fromtimestamp(self.now(), timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:12] + '.cgmbackup'
        outbox = self.root / 'outbox'
        outbox.mkdir(parents=True, exist_ok=True)
        resources_name = 'resources-' + resource_fingerprint + '.cgmresource' if resource_fingerprint else None
        key = un64(secret['key'], 32)
        wrappers = self._wrappers(secret)
        staged = outbox / (name + '.part')
        metadata = self._metadata(config, secret, 'snapshot', resourceAsset=resources_name)
        encrypt_file(temporary / 'snapshot.zip', staged, key, wrappers, metadata)
        os.replace(staged, outbox / name)
        if resources_name:
            path = outbox / resources_name
            if not path.exists():
                part = path.with_suffix('.part')
                part.unlink(missing_ok=True)
                encrypt_file(temporary / 'resources.zip', part, key, wrappers, self._metadata(config, secret, 'resources'))
                os.replace(part, path)
        pending = dict(name=name, resources=resources_name, fingerprint=fingerprint, created=self.now(), repository=config['repository'], collection=config['collection'])
        write_json(outbox / 'pending.json', pending)
        return pending

    def _upload(self, client, release, name, path, temporary, label='', config=None):
        rows = client.assets(release['id'])
        found = next((a for a in rows if a['name'] == name), None)
        if found and found.get('state') != 'uploaded':
            client.delete_asset(found['id'])
            found = None
        if found:
            # Resources are encrypted only once for each immutable font set. Their wrapping
            # password may predate a password change; restored snapshots supply the master key.
            if RESOURCE_NAME.fullmatch(name):
                cache = (config if config is not None else {}).setdefault('resourceDigests', {})
                if not found.get('size') or not found.get('digest') or cache.get(name) != found.get('digest'):
                    check = temporary / ('resource-check-' + str(found['id']))
                    client.download(found['id'], check)
                    plain = temporary / ('resource-check-' + str(found['id']) + '.zip')
                    secret = self.credentials(self.config(True))
                    decrypt_file(check, plain, self.kind, local_key=un64(secret['key'], 32), expected_type='resources')
                    manifest = extract_verified(plain, temporary / ('resource-check-' + str(found['id']) + '-files'), self.kind, 'resources')
                    import hashlib
                    fingerprint = hashlib.sha256(canonical(dict(kind=self.kind, type='resources', files=manifest['files']))).hexdigest()
                    if name != 'resources-' + fingerprint + '.cgmresource':
                        raise BackupError('共享字体包与资源清单不一致。', 'integrity')
                if found.get('digest'):
                    cache[name] = found['digest']
                return found
            try:
                client.verify_asset(found, path, temporary)
                return found
            except BackupError as error:
                if error.code != 'integrity':
                    raise
                # Replace only the exact incomplete pending upload; successful older
                # snapshots have different immutable names and are never affected.
                client.delete_asset(found['id'])
        uploaded = client.upload(release, name, path, label)
        client.verify_asset(uploaded, path, temporary)
        if RESOURCE_NAME.fullmatch(name) and config is not None and uploaded.get('digest'):
            config.setdefault('resourceDigests', {})[name] = uploaded['digest']
        return uploaded

    def _complete_pending(self, client, secret, config, pending, temporary):
        if pending['repository'] != config['repository'] or pending['collection'] != config['collection']:
            raise BackupError('待上传备份与当前仓库设置不一致，请先核对。', 'pending')
        release = client.ensure_release('cgm-backup-' + self.kind + '-' + config['collection'])
        if pending.get('resources'):
            self._upload(client, release, pending['resources'], self.root / 'outbox' / pending['resources'], temporary, config=config)
        path = self.root / 'outbox' / pending['name']
        asset = self._upload(client, release, pending['name'], path, temporary, 'cgmres:' + (pending.get('resources') or 'none'))
        config.update(lastSuccess=self.now(), lastCheck=self.now(), lastSnapshot=asset['name'], lastBytes=asset['size'],
                      lastFingerprint=pending['fingerprint'], lastOutcome='uploaded', lastError=None, errorCode=None,
                      failureCount=0, nextRetry=0, nextDue=due_time(config['time'], config['intervalDays'], self.now()))
        self.save(config)
        (self.root / 'outbox/pending.json').unlink(missing_ok=True)
        path.unlink(missing_ok=True)
        if pending.get('resources'):
            (self.root / 'outbox' / pending['resources']).unlink(missing_ok=True)
        return release, asset

    def _prune(self, client, release, config, current_id=None):
        try:
            rows = sorted((a for a in client.assets(release['id']) if SNAPSHOT_NAME.fullmatch(a['name']) and
                           a['name'].startswith(self.kind + '-') and a.get('state') == 'uploaded'),
                          key=lambda a: (a.get('created_at') or a['name'], a['id']), reverse=True)
            for old in rows[config['keep']:]:
                if old['id'] != current_id:
                    client.delete_asset(old['id'])
            config['cleanupPending'] = False
            warning = None
        except BackupError:
            config['cleanupPending'] = True
            warning = '新备份已成功；旧版本清理稍后再试。'
        self.save(config)
        return warning

    def run(self, scheduled=False):
        try:
            with self.lock():
                config = self.config(True)
                now = self.now()
                if scheduled and (not config.get('automatic') or config.get('paused') or now < config.get('nextDue', 0) or now < config.get('nextRetry', 0)):
                    return dict(skipped=True, reason='not-due')
                self.housekeeping()
                client, secret = self._client(config)
                client.verify_private(write=True)
                config['lastAttempt'] = now
                self.save(config)
                self.root.mkdir(parents=True, exist_ok=True)
                with tempfile.TemporaryDirectory(prefix='work-', dir=self.root) as temp:
                    temporary = Path(temp)
                    temporary.chmod(0o700)
                    write_json(temporary / '.cgm-backup-temp', dict(schema='cgm-backup-temp/1', kind=self.kind))
                    pending = read_json(self.root / 'outbox/pending.json')
                    resumed = bool(pending)
                    pending = pending or self._build(config, secret, temporary)
                    if pending.get('unchanged'):
                        config.update(lastCheck=now, lastOutcome='unchanged', lastError=None, errorCode=None, failureCount=0,
                                      nextRetry=0, nextDue=due_time(config['time'], config['intervalDays'], now))
                        self.save(config)
                        warning = None
                        if config.get('cleanupPending'):
                            release = client.ensure_release('cgm-backup-' + self.kind + '-' + config['collection'])
                            warning = self._prune(client, release, config)
                        return dict(unchanged=True, warning=warning, message='数据没有变化，沿用上一次备份。')
                    release, asset = self._complete_pending(client, secret, config, pending, temporary)
                    if resumed:
                        # Complete the interrupted snapshot, then capture changes made
                        # since it was created. One catch-up call reaches current data.
                        fresh = self._build(config, secret, temporary)
                        if not fresh.get('unchanged'):
                            verify_temp = temporary / 'fresh-verification'
                            verify_temp.mkdir()
                            release, asset = self._complete_pending(client, secret, config, fresh, verify_temp)
                    warning = self._prune(client, release, config, asset['id'])
                    return dict(uploaded=True, name=asset['name'], bytes=asset['size'], warning=warning, message='加密备份已上传并校验。')
        except BackupError as error:
            if error.code != 'busy':
                try:
                    with self.lock():
                        config = self.config()
                        if config.get('credential'):
                            failures = min(8, config.get('failureCount', 0) + 1)
                            config.update(lastError=str(error), errorCode=error.code, failureCount=failures,
                                          lastOutcome='failed', nextRetry=self.now() + min(86400, 1800 * 2 ** (failures - 1)))
                            self.save(config)
                except BackupError:
                    pass
            raise

    def _remote_selection(self, body, write=False):
        config = self.config()
        repository = body.get('repository') or config.get('repository')
        token = body.get('token')
        if not token and config.get('credential') and repository == config.get('repository'):
            token = self.credentials(config)['token']
        client = self.github_factory(repository, token)
        client.verify_private(write=write)
        return client, config

    def snapshots(self, body):
        client, config = self._remote_selection(body)
        snapshots = []
        for release in client.releases():
            tag = RELEASE_TAG.fullmatch(release.get('tag_name', ''))
            if not tag or tag[1] != self.kind:
                continue
            for asset in client.assets(release['id']):
                if SNAPSHOT_NAME.fullmatch(asset['name']) and asset['name'].startswith(self.kind + '-') and asset.get('state') == 'uploaded':
                    snapshots.append(dict(id=asset['id'], name=asset['name'], bytes=asset['size'], created=asset.get('created_at'),
                                          collection=release['tag_name'], releaseId=release['id']))
        return dict(snapshots=sorted(snapshots, key=lambda a: (a.get('created') or a['name'], a['id']), reverse=True))

    def restore(self, body):
        with self.lock():
            self.housekeeping()
            client, config = self._remote_selection(body)
            options = self.snapshots(body)['snapshots']
            selected = next((a for a in options if a['id'] == body.get('snapshotId')), None)
            if selected is None:
                raise BackupError('所选备份不存在或不属于当前工作台。', 'snapshot')
            self.root.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='restore-work-', dir=self.root) as temp:
                temporary = Path(temp)
                temporary.chmod(0o700)
                write_json(temporary / '.cgm-backup-temp', dict(schema='cgm-backup-temp/1', kind=self.kind))
                downloaded = temporary / 'snapshot.cgmbackup'
                client.download(selected['id'], downloaded)
                method = body.get('unlockMethod', 'password')
                if method not in ('password', 'recovery', 'thisComputer'):
                    raise BackupError('请选择一种解锁方式。', 'unlock')
                key = un64(self.credentials(config)['key'], 32) if method == 'thisComputer' and config.get('credential') else None
                if method == 'thisComputer' and key is None:
                    raise BackupError('此电脑没有保存对应密钥，请使用密码或恢复密钥。', 'unlock')
                header, key = decrypt_file(downloaded, temporary / 'snapshot.zip', self.kind,
                                          password=body.get('password') if method == 'password' else None,
                                          recovery=body.get('recoveryCode') if method == 'recovery' else None, local_key=key)
                if selected['collection'] != 'cgm-backup-' + self.kind + '-' + header.get('collection', ''):
                    raise BackupError('备份集合与加密说明不一致。', 'integrity')
                directory = temporary / 'verified'
                extract_verified(temporary / 'snapshot.zip', directory, self.kind)
                resource = header.get('resourceAsset')
                if resource:
                    if not RESOURCE_NAME.fullmatch(resource):
                        raise BackupError('共享资源包名称无效。', 'format')
                    asset = next((a for a in client.assets(selected['releaseId']) if a['name'] == resource and a.get('state') == 'uploaded'), None)
                    if not asset:
                        raise BackupError('这份备份引用的共享字体包缺失，请保留备份并检查仓库。', 'asset')
                    client.download(asset['id'], temporary / 'resources.cgmresource')
                    decrypt_file(temporary / 'resources.cgmresource', temporary / 'resources.zip', self.kind, local_key=key, expected_type='resources')
                    extract_verified(temporary / 'resources.zip', directory, self.kind, 'resources')
                counts = validate_database(directory / 'cases.sqlite3', self.kind)
                required = referenced_assets(directory / 'cases.sqlite3', self.kind)
                for name in required:
                    path = directory / 'assets' / name
                    if not path.is_file() or file_sha(path) != name.rsplit('.', 1)[0]:
                        raise BackupError('恢复的案例资源不完整，未接入原案例库。', 'asset')
                if (directory / 'settings.json').is_file() and not isinstance(read_json(directory / 'settings.json'), dict):
                    raise BackupError('恢复的默认设置格式无效。', 'settings')
                identity = uuid.uuid4().hex
                target = self.root / 'restores' / (self.kind + '-' + identity)
                target.parent.mkdir(parents=True, exist_ok=True)
                secret = dict(key=b64(key), token=client.token, passwordWrap=header['passwordWrap'], recoveryWrap=header['recoveryWrap'])
                warning = None
                try:
                    credential = self.vault.put(secret)
                except BackupError as error:
                    if error.code != 'vault':
                        raise
                    credential = None
                    warning = '恢复文件已校验；系统钥匙串不可用，尚未保存云端连接凭据。'
                os.replace(directory, target)
                record = dict(id=identity, directory=str(target), snapshot=selected['name'], repository=client.repository,
                              collection=header['collection'], credential=credential, counts=counts, created=self.now())
                restores = read_json(self.root / 'restores.json', [])
                restores.append(record)
                write_json(self.root / 'restores.json', restores)
                return dict(restored=True, restoreId=identity, directory=str(target), counts=counts,
                            warning=warning, message='已在独立目录恢复并校验；原案例库保持原样。')

    def adopt(self, body):
        """Explicitly switch only this suite's registry; retain the original library."""
        from local_installation import profile_path, profile
        with self.lock():
            identity = body.get('restoreId')
            record = next((r for r in read_json(self.root / 'restores.json', []) if r['id'] == identity), None)
            if not record:
                raise BackupError('找不到已校验的恢复记录。', 'restore')
            directory = Path(record['directory']).resolve()
            if directory.parent != (self.root / 'restores').resolve():
                raise BackupError('恢复目录不属于当前备份记录。', 'restore')
            validate_database(directory / 'cases.sqlite3', self.kind)
            path = profile_path()
            with FileLock(path.with_suffix('.lock')):
                data = profile()
                data.update(schema='cgm-workbench-locations/1', **{self.kind + '_library': str(directory)})
                if body.get('restoreSettings', True) and (directory / 'settings.json').exists():
                    data[self.kind + '_settings'] = str(directory / 'settings.json')
                write_json(path, data)
            return dict(switched=True, directory=str(directory), message='已登记这份恢复库；请让Agent重新打开工作台。当前页面仍连接原库。')

    def install_dependencies(self):
        result = subprocess.run([sys.executable, '-m', 'pip', '--disable-pip-version-check', 'install', '-r', str(HERE / 'requirements-backup.txt')],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600)
        if result.returncode:
            raise BackupError('可选组件安装未完成，请让Agent按云端备份说明安装后重试。', 'dependency')
        return dict(installed=True, message='备份组件已就绪。')

    def start(self, action, body):
        actions = {'backup': lambda: self.run(), 'snapshots': lambda: self.snapshots(body), 'restore': lambda: self.restore(body), 'install-dependencies': self.install_dependencies}
        if action not in actions:
            raise BackupError('后台操作不存在。', 'action')
        with self.job_lock:
            if any(j['status'] == 'running' for j in self.jobs.values()):
                raise BackupError('当前窗口有一项操作正在执行。', 'busy')
            identity = uuid.uuid4().hex
            job = dict(id=identity, action=action, status='running', started=self.now())
            self.jobs[identity] = job
            if len(self.jobs) > 12:
                self.jobs.pop(next(iter(self.jobs)))
        def run():
            try:
                result = actions[action]()
                with self.job_lock:
                    job.update(status='done', result=result)
            except Exception as error:
                message = str(error) if isinstance(error, BackupError) else '操作未完成，请重试或让Agent检查本机运行记录。'
                with self.job_lock:
                    job.update(status='error', error=message, errorCode=getattr(error, 'code', 'backup'))
        threading.Thread(target=run, name='cgm-private-backup', daemon=True).start()
        return dict(jobId=identity)

    def action(self, body):
        if not isinstance(body, dict):
            raise BackupError('备份请求格式无效。', 'action')
        action = body.get('action')
        if action in ('backup', 'snapshots', 'restore', 'install-dependencies'):
            return self.start(action, body)
        actions = {'prepare': lambda: self.prepare(body), 'confirm': lambda: self.confirm(body), 'resume-setup': self.resume_setup,
                   'update': lambda: self.update(body), 'pause': lambda: self.pause(body.get('paused', True)),
                   'reconnect': lambda: self.reconnect(body), 'change-password': lambda: self.change_password(body),
                   'rotate-recovery': self.rotate_recovery, 'confirm-recovery': lambda: self.confirm_recovery(body), 'adopt': lambda: self.adopt(body), 'reset': lambda: self.reset(body)}
        if action not in actions:
            raise BackupError('备份操作不存在。', 'action')
        return actions[action]()


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description='可选的私有加密云端备份')
    parser.add_argument('--kind', choices=('bazi', 'astrology'), required=True)
    parser.add_argument('--library')
    parser.add_argument('--settings')
    parser.add_argument('--state-root')
    parser.add_argument('command', choices=('status', 'tick', 'backup', 'action'))
    args = parser.parse_args()
    from local_installation import library, location
    selected = args.library or library(args.kind, 'bazi-case-library' if args.kind == 'bazi' else 'case-library')
    settings = args.settings or location(args.kind + '_settings')
    manager = BackupManager(args.kind, selected, settings, args.state_root)
    try:
        if args.command == 'status':
            result = manager.status()
        elif args.command in ('tick', 'backup'):
            if args.command == 'tick' and not manager.config().get('credential'):
                result = dict(skipped=True, reason='not-enabled')
            else:
                result = manager.run(scheduled=args.command == 'tick')
        else:
            body = json.load(sys.stdin)
            if body.get('action') in ('backup', 'restore', 'snapshots', 'install-dependencies'):
                direct = {'backup': lambda: manager.run(), 'restore': lambda: manager.restore(body), 'snapshots': lambda: manager.snapshots(body),
                          'install-dependencies': manager.install_dependencies}
                result = direct[body['action']]()
            else:
                result = manager.action(body)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        safe = str(error) if isinstance(error, BackupError) else '备份操作未完成；请检查本机运行环境或备份文件。'
        print(json.dumps(dict(error=safe, errorCode=getattr(error, 'code', 'backup')), ensure_ascii=False))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
