"""User-confirmed defaults, shared by first-run setup and the local settings UI."""
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

RECOMMENDED = {'zodiac': 'sidereal', 'ayanamsa': 'fagan_bradley',
               'bound_system': 'egyptian', 'house_system': 'whole_sign'}
METHOD_KEYS = tuple(RECOMMENDED)
HOUSE_SYSTEMS = {'whole_sign', 'equal', 'placidus', 'koch', 'regiomontanus', 'porphyry', 'alcabitius'}


def default_path():
    from local_installation import location
    return location('astrology_settings') or Path.cwd() / '.cgm-hellenistic-astrology' / 'settings.json'


def validate_methods(methods):
    if not isinstance(methods, dict):
        raise ValueError('排盘设置必须是一个对象')
    result = {key: methods.get(key) for key in METHOD_KEYS}
    if result['zodiac'] not in ('tropical', 'sidereal'):
        raise ValueError('请选择回归黄道或恒星黄道')
    if result['zodiac'] == 'sidereal' and result['ayanamsa'] not in ('fagan_bradley', 'lahiri'):
        raise ValueError('恒星黄道需要选择岁差')
    if result['zodiac'] == 'tropical' and result['ayanamsa'] is not None:
        raise ValueError('回归黄道的岁差须为空')
    if result['bound_system'] not in ('egyptian', 'ptolemy_lilly'):
        raise ValueError('界表无效')
    if result['house_system'] not in HOUSE_SYSTEMS:
        raise ValueError('宫位制无效')
    return result


def read_settings(path):
    path = Path(path)
    if not path.is_file():
        raise ValueError('尚未完成首次设置。请先接受推荐口径或手动选择，再保存个人默认设置。')
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(data, dict) or data.get('setup_complete') is not True:
        raise ValueError('首次设置尚未确认，请先完成设置')
    validate_methods(data)
    return data


def save_settings(path, methods, **updates):
    methods = validate_methods(methods)
    path = Path(path).expanduser().resolve()
    previous = json.loads(path.read_text(encoding='utf-8-sig')) if path.is_file() else {}
    if not isinstance(previous, dict):
        raise ValueError('现有设置格式损坏，请先检查设置文件')
    data = {'schema_version': 1, 'case_storage_prompted': False,
            'case_storage_enabled': False, 'case_storage_path': None,
            **previous, **updates, **methods, 'setup_complete': True,
            'updated_at': datetime.now(timezone.utc).isoformat()}
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.settings-', suffix='.json', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return data
