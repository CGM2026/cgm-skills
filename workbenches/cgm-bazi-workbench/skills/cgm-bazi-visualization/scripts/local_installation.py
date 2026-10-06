"""Read this machine's optional workbench locations; no global environment changes."""
import json
import os
import shutil
import argparse
import tempfile
from pathlib import Path


def profile_path():
    return Path(os.environ.get('CGM_WORKBENCH_CONFIG') or Path.home() / '.cgm-workbenches' / 'locations.json').expanduser()


def profile():
    path = profile_path()
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    if data.get('schema') != 'cgm-workbench-locations/1':
        raise ValueError('本机工作台位置配置格式无效：' + str(path))
    return data


def location(key):
    value = profile().get(key)
    if not value:
        return None
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ValueError('本机工作台位置必须为绝对路径：' + key)
    return path


def library(kind, fallback):
    path = location(kind + '_library')
    if path and not (path / 'cases.sqlite3').is_file():
        raise ValueError('已登记案例库不可用，请核对位置：' + str(path))
    return path or Path(fallback)


def node(kind):
    explicit = os.environ.get('CGM_' + kind.upper() + '_NODE')
    if explicit:
        return explicit
    registered = location('node')
    return str(registered) if registered and registered.is_file() else shutil.which('node')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--register', type=Path, help='Register confirmed locations from a JSON file')
    args = parser.parse_args()
    if args.register:
        data = json.loads(args.register.read_text(encoding='utf-8-sig'))
        if data.get('schema') != 'cgm-workbench-locations/1':
            parser.error('本机工作台位置配置格式无效')
        data = {**profile(), **data}
        for key in ('python', 'node', 'bazi_library', 'bazi_settings', 'astrology_library', 'astrology_settings', 'astrology_state'):
            if data.get(key) and (not Path(data[key]).is_absolute() or not Path(data[key]).exists()):
                parser.error('已登记位置不存在或不是绝对路径：' + key)
        target = profile_path()
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent, delete=False) as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            temporary = stream.name
        os.replace(temporary, target)
    print(json.dumps({'config': str(profile_path()), **profile()}, ensure_ascii=False, indent=2))
