#!/usr/bin/env python3
"""Add calculator-produced return results to an existing return HTML page."""
import argparse
import json
import re
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--page', type=Path, required=True)
    parser.add_argument('--query', type=Path, required=True)
    args = parser.parse_args()
    page = args.page.resolve()
    if page.name != 'chart.html' or not page.is_file():
        parser.error('page must be an existing return chart.html')
    source = page.read_text(encoding='utf-8')
    if 'globalThis.ChartReturnMode=true' not in source:
        parser.error('page is not a return chart')
    query = json.loads(args.query.read_text(encoding='utf-8-sig'))
    if query.get('schema') != 'cgm.return-query.v1' or not isinstance(query.get('results'), list):
        parser.error('query must be a calculator return-query v1 result')
    if any(not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}[+-]\d{2}:\d{2}', str(item.get('local', '')))
           for item in query['results']):
        parser.error('each result requires a local time with seconds and UTC offset')
    natal = json.loads((page.parent / 'natal-facts-v4.json').read_text(encoding='utf-8'))
    settings = natal['settings']
    if query.get('zodiac') != settings['zodiac'] or query.get('ayanamsa') != settings.get('ayanamsa'):
        parser.error('query zodiac or ayanamsa differs from the natal chart')
    return_facts = json.loads((page.parent / 'chart-facts-v4.json').read_text(encoding='utf-8'))
    if query.get('time_reference') != return_facts['metadata']['time_reference']:
        parser.error('query display timezone differs from the return page')
    companion = page.parent / 'return-query-results.json'
    records = json.loads(companion.read_text(encoding='utf-8'))
    records.append(query)
    pattern = r'(<script id="return-query-data" type="application/json">)[\s\S]*?(</script>)'
    if len(re.findall(pattern, source)) != 1:
        parser.error('page has no unique return result data slot')
    updated = re.sub(pattern, lambda match: match[1] + json.dumps(records, ensure_ascii=False).replace('<', '\\u003c') + match[2], source, count=1)
    page.write_text(updated, encoding='utf-8')
    companion.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'page': str(page), 'queries': len(records), 'new_results': len(query['results'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
