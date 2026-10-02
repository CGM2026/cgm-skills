"""Verify this extracted release against SHA256SUMS.json (Python standard library)."""
import hashlib
import json
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent
    hashes = json.loads((root / 'SHA256SUMS.json').read_text(encoding='utf-8'))
    failed = []
    for relative, expected in hashes.items():
        target = (root / relative).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            failed.append({'file': relative, 'error': 'missing or unsafe path'})
        else:
            digest = hashlib.sha256()
            with target.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            if digest.hexdigest() != expected:
                failed.append({'file': relative, 'error': 'hash mismatch'})
    print(json.dumps({'files': len(hashes), 'ok': not failed, 'failures': failed}, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
