"""User-owned OS scheduling and protected local secrets; never a plaintext fallback."""
import base64
import ctypes
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path
from backup_crypto import BackupError, aes, b64, un64


def atomic(path, data):
    path = Path(path)
    created = not path.parent.exists()
    path.parent.mkdir(parents=True, exist_ok=True)
    if created:
        path.parent.chmod(0o700)
    temporary = path.with_name(path.name + '.' + os.urandom(6).hex() + '.tmp')
    try:
        with temporary.open('xb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o600)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class SystemVault:
    def __init__(self, root):
        self.root = Path(root)
        self.identity = hashlib.sha256(str(self.root.resolve()).encode()).hexdigest()

    @staticmethod
    def dpapi(data, decrypt=False):
        from ctypes import wintypes
        class Blob(ctypes.Structure):
            _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_ubyte))]
        array = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
        source, target = Blob(len(data), array), Blob()
        crypt = ctypes.WinDLL('crypt32', use_last_error=True)
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree.restype = ctypes.c_void_p
        if decrypt:
            fn = crypt.CryptUnprotectData
            fn.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
        else:
            fn = crypt.CryptProtectData
            fn.argtypes = [ctypes.POINTER(Blob), wintypes.LPCWSTR, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
        fn.restype = wintypes.BOOL
        if not fn(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
            raise BackupError('系统无法解锁本机保存的备份凭据，请使用密码或恢复密钥重新连接。', 'vault')
        try:
            return ctypes.string_at(target.pbData, target.cbData)
        finally:
            ctypes.memset(target.pbData, 0, target.cbData)
            kernel.LocalFree(ctypes.cast(target.pbData, ctypes.c_void_p))

    def _keyring_key(self):
        try:
            import keyring
            backend = keyring.get_keyring()
            name = type(backend).__module__
            if not any(word in name for word in ('SecretService', 'macOS', 'kwallet')):
                from keyring.backend import get_all_keyring
                candidates = [item for item in get_all_keyring() if any(word in type(item).__module__ for word in ('SecretService', 'macOS', 'kwallet')) and item.priority > 0]
                if not candidates:
                    raise BackupError('自动备份需要系统钥匙串；请启用macOS钥匙串、Secret Service或KWallet。', 'vault')
                backend = max(candidates, key=lambda item: item.priority)
            value = backend.get_password('cgm-workbench-backup', self.identity)
            if value is None:
                value = b64(os.urandom(32))
                backend.set_password('cgm-workbench-backup', self.identity, value)
            return un64(value, 32)
        except BackupError:
            raise
        except Exception as error:
            raise BackupError('系统钥匙串当前不可用，自动备份凭据未写入。', 'vault') from error

    def put(self, value):
        data = json.dumps(value, ensure_ascii=False).encode('utf-8')
        if sys.platform == 'win32':
            sealed = b'DPAPI1\n' + self.dpapi(data)
        else:
            nonce = os.urandom(12)
            sealed = b'KEYRING1\n' + nonce + aes()(self._keyring_key()).encrypt(nonce, data, self.identity.encode())
        name = os.urandom(12).hex() + '.sealed'
        atomic(self.root / name, sealed)
        return name

    def get(self, name):
        if not isinstance(name, str) or len(name) != 31 or not name.endswith('.sealed') or any(c not in '0123456789abcdef' for c in name[:-7]):
            raise BackupError('本机备份凭据位置无效。', 'vault')
        try:
            sealed = (self.root / name).read_bytes()
            if sealed.startswith(b'DPAPI1\n') and sys.platform == 'win32':
                data = self.dpapi(sealed[7:], True)
            elif sealed.startswith(b'KEYRING1\n'):
                data = aes()(self._keyring_key()).decrypt(sealed[9:21], sealed[21:], self.identity.encode())
            else:
                raise ValueError()
            return json.loads(data)
        except BackupError:
            raise
        except Exception as error:
            raise BackupError('本机凭据无法解锁，请使用备份密码或恢复密钥重新连接。', 'vault') from error


class Scheduler:
    def __init__(self, root, kind, library, settings):
        self.root = Path(root).resolve()
        self.identity = hashlib.sha256(str(self.root).encode()).hexdigest()[:20]
        self.name = 'CGM-Backup-' + self.identity
        executable = Path(sys.executable)
        if sys.platform == 'win32' and executable.with_name('pythonw.exe').is_file():
            executable = executable.with_name('pythonw.exe')
        self.command = [str(executable), str(Path(__file__).with_name('cloud_backup.py').resolve()), '--kind', kind,
                        '--library', str(Path(library).resolve()), '--state-root', str(self.root), 'tick']
        if settings:
            self.command[2:2] = ['--settings', str(Path(settings).resolve())]

    def install(self):
        if sys.platform == 'win32':
            payload = dict(name=self.name, execute=self.command[0], arguments=subprocess.list2cmdline(self.command[1:]))
            value = base64.b64encode(json.dumps(payload).encode()).decode()
            script = """$ErrorActionPreference='Stop'
$c=([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%s')) | ConvertFrom-Json)
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute $c.execute -Argument $c.arguments
$repeat=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 30)
$login=New-ScheduledTaskTrigger -AtLogOn -User $user
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $c.name -Action $action -Trigger @($repeat,$login) -Principal $principal -Settings $settings -Description 'CGM optional encrypted private backup' -Force | Out-Null
Write-Output 'CGM_SCHEDULE_OK'
""" % value
            path = self.root / 'schedule.ps1'
            atomic(path, script.encode('utf-8-sig'))
            result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', str(path)], capture_output=True, timeout=45)
            if result.returncode or b'CGM_SCHEDULE_OK' not in result.stdout:
                raise BackupError('系统未允许创建定时备份任务；仍可立即备份，也可稍后重试开启自动备份。', 'schedule')
            return dict(type='windows-task', name=self.name, installed=True)
        if sys.platform == 'darwin':
            label = 'com.cgm.backup.' + self.identity
            path = Path.home() / 'Library/LaunchAgents' / (label + '.plist')
            atomic(path, plistlib.dumps(dict(Label=label, ProgramArguments=self.command, StartInterval=1800, RunAtLoad=True)))
            subprocess.run(['launchctl', 'bootout', 'gui/' + str(os.getuid()), str(path)], capture_output=True, timeout=15)
            result = subprocess.run(['launchctl', 'bootstrap', 'gui/' + str(os.getuid()), str(path)], capture_output=True, timeout=30)
            if result.returncode:
                raise BackupError('macOS未启用定时任务，仍可立即备份。', 'schedule')
            return dict(type='launchd', name=label, installed=True)
        if not shutil.which('systemctl'):
            raise BackupError('此系统未提供用户级systemd定时器，仍可立即备份或由外部任务调用tick。', 'schedule')
        folder = Path.home() / '.config/systemd/user'
        name = 'cgm-backup-' + self.identity
        def quoted(value):
            return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%').replace('$', '$$') + '"'
        command = ' '.join(quoted(item) for item in self.command)
        atomic(folder / (name + '.service'), ('[Unit]\nDescription=CGM encrypted private backup\n[Service]\nType=oneshot\nExecStart=' + command + '\n').encode())
        atomic(folder / (name + '.timer'), ('[Unit]\nDescription=CGM optional backup timer\n[Timer]\nOnStartupSec=2min\nOnUnitActiveSec=30min\n[Install]\nWantedBy=timers.target\n').encode())
        for command in (['systemctl', '--user', 'daemon-reload'], ['systemctl', '--user', 'enable', '--now', name + '.timer']):
            result = subprocess.run(command, capture_output=True, timeout=30)
            if result.returncode:
                raise BackupError('系统未启用定时任务，仍可立即备份。', 'schedule')
        return dict(type='systemd-user', name=name, installed=True)

    def remove(self):
        if sys.platform == 'win32':
            result = subprocess.run(['schtasks.exe', '/Delete', '/TN', self.name, '/F'], capture_output=True, timeout=30)
        elif sys.platform == 'darwin':
            label = 'com.cgm.backup.' + self.identity
            path = Path.home() / 'Library/LaunchAgents' / (label + '.plist')
            result = subprocess.run(['launchctl', 'bootout', 'gui/' + str(os.getuid()), str(path)], capture_output=True, timeout=30)
            path.unlink(missing_ok=True)
        else:
            name = 'cgm-backup-' + self.identity
            result = subprocess.run(['systemctl', '--user', 'disable', '--now', name + '.timer'], capture_output=True, timeout=30)
        return dict(installed=False, disabled=True, osResult=result.returncode)
