"""Private GitHub release assets; fixed hosts, bounded I/O, no tokens in messages."""
import hashlib
import http.client
import json
import re
import socket
import ssl
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from backup_crypto import BackupError, CHUNK, MAX_BYTES, file_sha

API_VERSION = '2022-11-28'
SNAPSHOT_NAME = re.compile(r'^(bazi|astrology)-\d{8}T\d{6}Z-[a-f0-9]{12}\.cgmbackup$')
RESOURCE_NAME = re.compile(r'^resources-[a-f0-9]{64}\.cgmresource$')
RELEASE_TAG = re.compile(r'^cgm-backup-(bazi|astrology)-[a-f0-9]{24}$')


def repository_name(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}', value) or value.rsplit('/', 1)[-1] in ('.', '..'):
        raise BackupError('仓库请写成「GitHub账号/私有仓库名称」。', 'repository')
    return value


class GitHub:
    def __init__(self, repository, token):
        self.repository = repository_name(repository)
        if not isinstance(token, str) or not 10 <= len(token) <= 2048 or any(c.isspace() for c in token):
            raise BackupError('请填写有效的GitHub授权码。', 'auth')
        self.token = token
        self.base = '/repos/' + self.repository

    def _request(self, method, path, value=None, binary=None, download=None, url=None, accept=None):
        address = urlsplit(url or ('https://api.github.com' + path))
        if address.scheme != 'https' or address.hostname not in ('api.github.com', 'uploads.github.com') or address.port not in (None, 443):
            raise BackupError('GitHub接口地址无效。', 'network')
        headers = {'User-Agent': 'CGM-workbench-backup/1', 'Authorization': 'Bearer ' + self.token,
                   'Accept': accept or 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION}
        data = json.dumps(value).encode() if value is not None else None
        if binary:
            headers.update({'Content-Type': 'application/octet-stream', 'Content-Length': str(Path(binary).stat().st_size)})
        elif data is not None:
            headers.update({'Content-Type': 'application/json', 'Content-Length': str(len(data))})
        else:
            headers['Content-Length'] = '0'
        connection = http.client.HTTPSConnection(address.hostname, timeout=45, context=ssl.create_default_context())
        try:
            connection.putrequest(method, address.path + ('?' + address.query if address.query else ''))
            for key, item in headers.items():
                connection.putheader(key, item)
            connection.endheaders()
            if binary:
                with Path(binary).open('rb') as stream:
                    for block in iter(lambda: stream.read(CHUNK), b''):
                        connection.send(block)
            elif data is not None:
                connection.send(data)
            reply = connection.getresponse()
            if download and reply.status in (301, 302, 303, 307, 308):
                redirect = reply.getheader('Location')
                reply.read(16384)
                return self._public_download(redirect, download)
            if reply.status >= 400:
                code = 'auth' if reply.status in (401, 403, 404) else 'network'
                message = ('GitHub授权码已失效、权限不足或仓库不可见，请重新连接。' if code == 'auth' else
                           'GitHub暂时无法完成请求，请稍后重试。')
                if reply.status in (429, 403) and (reply.getheader('Retry-After') or reply.getheader('X-RateLimit-Remaining') == '0'):
                    code, message = 'rate-limit', 'GitHub请求额度暂时用尽，稍后会自动补做。'
                raise BackupError(message, code)
            if download:
                return self._write_download(reply, download)
            payload = reply.read(8 * 1024 * 1024 + 1)
            if len(payload) > 8 * 1024 * 1024:
                raise BackupError('GitHub返回内容超过读取上限。', 'size')
            return json.loads(payload) if payload else None
        except BackupError:
            raise
        except (OSError, socket.timeout, http.client.HTTPException, ValueError) as error:
            raise BackupError('GitHub连接中断；已有备份保留，联网后可以重试。', 'network') from error
        finally:
            connection.close()

    def _public_download(self, url, target):
        # Signed storage URLs carry their own temporary authorization. Never forward the token.
        for _ in range(4):
            address = urlsplit(url or '')
            if address.scheme != 'https' or not (address.hostname in ('release-assets.githubusercontent.com', 'objects.githubusercontent.com') or
                                                (address.hostname or '').endswith('.githubusercontent.com')) or address.port not in (None, 443):
                raise BackupError('GitHub下载地址无效。', 'network')
            connection = http.client.HTTPSConnection(address.hostname, timeout=45, context=ssl.create_default_context())
            try:
                connection.request('GET', address.path + ('?' + address.query if address.query else ''), headers={'User-Agent': 'CGM-workbench-backup/1'})
                reply = connection.getresponse()
                if reply.status in (301, 302, 303, 307, 308):
                    url = reply.getheader('Location')
                    continue
                if reply.status != 200:
                    raise BackupError('备份下载暂时失败，请重新连接后重试。', 'network')
                return self._write_download(reply, target)
            except (OSError, http.client.HTTPException) as error:
                raise BackupError('备份下载中断，请联网后重试。', 'network') from error
            finally:
                connection.close()
        raise BackupError('备份下载重定向过多。', 'network')

    @staticmethod
    def _write_download(reply, target):
        length = reply.getheader('Content-Length')
        if length and int(length) > MAX_BYTES + 1024 * 1024:
            raise BackupError('备份文件超过读取上限。', 'size')
        count = 0
        try:
            with Path(target).open('xb') as stream:
                for block in iter(lambda: reply.read(CHUNK), b''):
                    count += len(block)
                    if count > MAX_BYTES + 1024 * 1024:
                        raise BackupError('备份文件超过读取上限。', 'size')
                    stream.write(block)
            if length and count != int(length):
                raise BackupError('备份下载不完整，请重试。', 'integrity')
            return count
        except BaseException:
            Path(target).unlink(missing_ok=True)
            raise

    def verify_private(self, write=False):
        data = self._request('GET', self.base)
        if data.get('private') is not True:
            raise BackupError('备份只能连接私有仓库；请在GitHub将仓库设为Private。', 'public-repository')
        if data.get('full_name', '').lower() != self.repository.lower():
            raise BackupError('仓库名称已变化，请重新填写当前名称。', 'repository')
        if write and (data.get('archived') or data.get('disabled') or data.get('permissions', {}).get('push') is False):
            raise BackupError('此仓库当前不可写，请检查授权范围与仓库状态。', 'auth')
        if write:
            branch = data.get('default_branch')
            if not branch:
                raise BackupError('私有仓库尚未初始化，请在GitHub添加README后重试。', 'empty-repository')
            from urllib.parse import quote
            self._request('GET', self.base + '/commits/' + quote(branch, safe=''))
        return data

    def releases(self):
        result = []
        for page in range(1, 21):
            rows = self._request('GET', self.base + '/releases?' + urlencode(dict(per_page=100, page=page)))
            result.extend(rows)
            if len(rows) < 100:
                return result
        raise BackupError('仓库发布记录过多，请为备份使用专用私有仓库。', 'size')

    def ensure_release(self, tag):
        if not RELEASE_TAG.fullmatch(tag):
            raise BackupError('备份集合编号无效。', 'format')
        found = next((r for r in self.releases() if r['tag_name'] == tag), None)
        if found:
            return found
        return self._request('POST', self.base + '/releases', dict(tag_name=tag, name='CGM encrypted backups',
                            body='Encrypted private workbench backups. No plaintext case data.', draft=True, make_latest='false'))

    def assets(self, release_id):
        result = []
        for page in range(1, 101):
            rows = self._request('GET', self.base + '/releases/' + str(int(release_id)) + '/assets?' + urlencode(dict(per_page=100, page=page)))
            result.extend(rows)
            if len(rows) < 100:
                return result
        raise BackupError('备份文件过多，请检查保留数量。', 'size')

    def upload(self, release, name, path, label=''):
        if not (SNAPSHOT_NAME.fullmatch(name) or RESOURCE_NAME.fullmatch(name)):
            raise BackupError('备份文件名无效。', 'format')
        url = release['upload_url'].split('{', 1)[0] + '?' + urlencode(dict(name=name, label=label))
        return self._request('POST', '', binary=path, url=url)

    def delete_asset(self, asset_id):
        self._request('DELETE', self.base + '/releases/assets/' + str(int(asset_id)))

    def download(self, asset_id, path):
        return self._request('GET', self.base + '/releases/assets/' + str(int(asset_id)), download=path, accept='application/octet-stream')

    def verify_asset(self, asset, path, temporary):
        if asset.get('state') != 'uploaded' or asset.get('size') != Path(path).stat().st_size:
            raise BackupError('云端文件尚未完整写入；保留原有备份，稍后重试。', 'integrity')
        expected = file_sha(path)
        remote = asset.get('digest')
        if remote:
            if remote != 'sha256:' + expected:
                raise BackupError('云端文件校验不一致；原有备份保留。', 'integrity')
        else:
            check = Path(temporary) / ('verify-' + str(asset['id']))
            try:
                self.download(asset['id'], check)
                if file_sha(check) != expected:
                    raise BackupError('云端文件回读校验失败。', 'integrity')
            finally:
                check.unlink(missing_ok=True)
