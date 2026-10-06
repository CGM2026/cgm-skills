"""Versioned, bounded streaming backup envelopes. Cryptography is optional until used."""
import base64
import hashlib
import json
import os
import re
import struct
from pathlib import Path

MAGIC = b'CGMBKP1\n'
CHUNK = 1024 * 1024
MAX_BYTES = 1800 * 1024 * 1024
MAX_HEADER = 65536
KDF = dict(n=32768, r=8, p=1)


class BackupError(ValueError):
    def __init__(self, message, code='backup'):
        super().__init__(message)
        self.code = code


def aes():
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        return AESGCM
    except ImportError as error:
        raise BackupError('备份加密组件尚未安装，请按云端备份说明安装可选依赖。', 'dependency') from error


def b64(value):
    return base64.b64encode(value).decode('ascii')


def un64(value, size=None):
    try:
        if not isinstance(value, str) or len(value) > MAX_HEADER:
            raise ValueError()
        result = base64.b64decode(value, validate=True)
        if size is not None and len(result) != size:
            raise ValueError()
        return result
    except (ValueError, TypeError) as error:
        raise BackupError('备份文件中的加密参数无效。', 'format') from error


def canonical(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def file_sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(CHUNK), b''):
            digest.update(block)
    return digest.hexdigest()


def key_id(key):
    return hashlib.sha256(key).hexdigest()[:24]


def password_key(password, salt):
    if not isinstance(password, str) or not 1 <= len(password) <= 1024:
        raise BackupError('请填写备份密码。', 'unlock')
    return hashlib.scrypt(password.encode('utf-8'), salt=salt, maxmem=64 * 1024 * 1024, dklen=32, **KDF)


def wrap(key, wrapping_key):
    nonce = os.urandom(12)
    ciphertext = aes()(wrapping_key).encrypt(nonce, key, ('cgm-backup-key/1:' + key_id(key)).encode())
    return dict(nonce=b64(nonce), ciphertext=b64(ciphertext))


def wrap_password(key, password):
    if not isinstance(password, str) or not 10 <= len(password) <= 1024:
        raise BackupError('备份密码至少需要10个字符。', 'password')
    salt = os.urandom(16)
    return dict(kdf='scrypt', salt=b64(salt), **KDF, **wrap(key, password_key(password, salt)))


def recovery_code(raw=None):
    raw = raw or os.urandom(32)
    text = base64.b32encode(raw).decode().rstrip('=')
    checksum = hashlib.sha256(b'cgm-recovery/1:' + raw).hexdigest()[:8].upper()
    return 'CGMR-' + '-'.join(text[i:i + 6] for i in range(0, len(text), 6)) + '-' + checksum


def recovery_raw(code):
    try:
        clean = re.sub(r'[\s-]', '', code.upper())
        if not clean.startswith('CGMR') or len(clean) != 64:
            raise ValueError()
        text, checksum = clean[4:-8], clean[-8:]
        raw = base64.b32decode(text + '=' * ((-len(text)) % 8))
        if len(raw) != 32 or hashlib.sha256(b'cgm-recovery/1:' + raw).hexdigest()[:8].upper() != checksum:
            raise ValueError()
        return raw
    except (ValueError, TypeError, AttributeError) as error:
        raise BackupError('恢复密钥不完整或有抄写错误，请核对保存的密钥。', 'unlock') from error


def wrap_recovery(key, code):
    return wrap(key, hashlib.sha256(b'cgm-recovery-wrap/1:' + recovery_raw(code)).digest())


def unlock(header, password=None, recovery=None, local_key=None):
    try:
        kid = header['keyId']
        if not re.fullmatch(r'[a-f0-9]{24}', kid):
            raise ValueError()
        if local_key is not None:
            if len(local_key) == 32 and key_id(local_key) == kid:
                return local_key
            raise BackupError('本机保存的密钥不属于这份备份，请使用对应密码或恢复密钥。', 'unlock')
        if recovery:
            record = header['recoveryWrap']
            wrapping = hashlib.sha256(b'cgm-recovery-wrap/1:' + recovery_raw(recovery)).digest()
        else:
            record = header['passwordWrap']
            if record.get('kdf') != 'scrypt' or any(record.get(k) != v for k, v in KDF.items()):
                raise BackupError('备份的密码参数不受支持，请核对工作台版本。', 'format')
            wrapping = password_key(password, un64(record['salt'], 16))
        key = aes()(wrapping).decrypt(un64(record['nonce'], 12), un64(record['ciphertext'], 48), ('cgm-backup-key/1:' + kid).encode())
        if key_id(key) != kid:
            raise ValueError()
        return key
    except BackupError:
        raise
    except Exception as error:
        raise BackupError('密码或恢复密钥不匹配，备份和原案例库均保持原样。', 'unlock') from error


def read_header(stream):
    try:
        if stream.read(len(MAGIC)) != MAGIC:
            raise ValueError()
        size_bytes = stream.read(4)
        if len(size_bytes) != 4:
            raise ValueError()
        size = struct.unpack('>I', size_bytes)[0]
        if not 0 < size <= MAX_HEADER:
            raise ValueError()
        data = stream.read(size)
        header = json.loads(data)
        if not isinstance(header, dict) or header.get('schema') != 'cgm-backup/1' or header.get('cipher') != 'AES-256-GCM/chunks' or header.get('chunkBytes') != CHUNK:
            raise ValueError()
        total = header['plaintextBytes']
        if type(total) is not int or not 0 <= total <= MAX_BYTES or header.get('kind') not in ('bazi', 'astrology') or header.get('type') not in ('snapshot', 'resources'):
            raise ValueError()
        un64(header['noncePrefix'], 8)
        if not re.fullmatch(r'[a-f0-9]{64}', header['plaintextSha256']):
            raise ValueError()
        return header, data
    except BackupError:
        raise
    except Exception as error:
        raise BackupError('备份文件格式无效、过大或不完整。', 'format') from error


def encrypt_file(source, target, key, wrappers, metadata):
    source, target = Path(source), Path(target)
    size = source.stat().st_size
    if size > MAX_BYTES:
        raise BackupError('单份备份超过当前1.8GB上限，请减少备份范围。', 'size')
    prefix = os.urandom(8)
    header = dict(metadata, schema='cgm-backup/1', cipher='AES-256-GCM/chunks', chunkBytes=CHUNK,
                  plaintextBytes=size, plaintextSha256=file_sha(source), noncePrefix=b64(prefix), keyId=key_id(key), **wrappers)
    data = canonical(header)
    if len(data) > MAX_HEADER:
        raise BackupError('备份说明过大。', 'format')
    cipher = aes()(key)
    digest = hashlib.sha256(data).digest()
    try:
        with source.open('rb') as src, target.open('xb') as out:
            out.write(MAGIC + struct.pack('>I', len(data)) + data)
            for index in range(max(1, (size + CHUNK - 1) // CHUNK)):
                counter = struct.pack('>I', index)
                encrypted = cipher.encrypt(prefix + counter, src.read(CHUNK), digest + counter)
                out.write(struct.pack('>I', len(encrypted)) + encrypted)
            out.flush()
            os.fsync(out.fileno())
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    return header


def decrypt_file(source, target, expected_kind, password=None, recovery=None, local_key=None, expected_type='snapshot'):
    source, target = Path(source), Path(target)
    try:
        with source.open('rb') as src:
            header, data = read_header(src)
            if header['kind'] != expected_kind or header['type'] != expected_type:
                raise BackupError('这份备份不属于当前工作台或所选文件类型。', 'kind')
            key = unlock(header, password, recovery, local_key)
            cipher = aes()(key)
            prefix = un64(header['noncePrefix'], 8)
            digest = hashlib.sha256(data).digest()
            total = header['plaintextBytes']
            written = 0
            checksum = hashlib.sha256()
            with target.open('xb') as out:
                for index in range(max(1, (total + CHUNK - 1) // CHUNK)):
                    expected = min(CHUNK, total - written)
                    length = src.read(4)
                    if len(length) != 4 or struct.unpack('>I', length)[0] != expected + 16:
                        raise BackupError('备份文件被截断或已损坏。', 'integrity')
                    counter = struct.pack('>I', index)
                    encrypted = src.read(expected + 16)
                    try:
                        plain = cipher.decrypt(prefix + counter, encrypted, digest + counter)
                    except Exception as error:
                        raise BackupError('备份内容校验失败；没有写入原案例库。', 'integrity') from error
                    checksum.update(plain)
                    out.write(plain)
                    written += len(plain)
                if src.read(1) or written != total or checksum.hexdigest() != header['plaintextSha256']:
                    raise BackupError('备份文件长度或内容校验失败。', 'integrity')
                out.flush()
                os.fsync(out.fileno())
            return header, key
    except BaseException:
        target.unlink(missing_ok=True)
        raise
