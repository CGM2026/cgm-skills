"""Validate stored record shapes without rewriting legacy values."""
import json

MAX_VALUE_BYTES = 2_000_000
MAX_REQUEST_BYTES = 32_000_000


def unreadable_message(key, history_id=None):
    labels={'chart-note-layers-v1':'笔记图层','chart-case-archive-v1':'档案记录','chart-point-notes':'对象笔记','chart-editor-drafts-v1':'编辑草稿','chart-transit-research-v1':'行运记录','chart-transit-query-results-v1':'行运查询','chart-return-cards-v1':'返照记录'}
    label=labels.get(key.split(':',1)[0],'保存内容')
    ending='可恢复最近有效版本。' if history_id is not None else '可查看保留的原文。'
    return label+'有一项内容无法读取，原文已保留，'+ending


def _ids(value):
    if isinstance(value, list):
        ids = [item['id'] for item in value if isinstance(item, dict) and isinstance(item.get('id'), str)]
        if len(ids) != len(set(ids)):
            raise ValueError('记录编号重复，请保留不同编号后重试')
        for item in value:
            _ids(item)
    elif isinstance(value, dict):
        for item in value.values():
            _ids(item)


def _records(value, label):
    if not isinstance(value, list):
        raise ValueError(label + '必须是列表')
    for record in value:
        if not isinstance(record, dict) or not isinstance(record.get('id'), str) or not record['id']:
            raise ValueError(label + '缺少有效编号')


def validate_entry(key, value):
    if value is None:
        return
    if not isinstance(value, str) or len(value.encode('utf-8')) > MAX_VALUE_BYTES:
        raise ValueError('记录字段无效或过大')
    prefix = key.split(':', 1)[0]
    structured = prefix in {'chart-note-layers-v1', 'chart-case-archive-v1', 'chart-point-notes', 'chart-editor-drafts-v1', 'chart-transit-research-v1', 'chart-transit-query-results-v1', 'chart-return-cards-v1'}
    try:
        data = json.loads(value)
    except (ValueError, TypeError, RecursionError):
        if structured:
            raise ValueError('记录内容损坏：' + prefix + ' 必须是有效结构。原文仍保留，可恢复最近有效版本。')
        return
    try:_ids(data)
    except RecursionError as error:raise ValueError('记录结构层数过深') from error
    if prefix == 'chart-note-layers-v1':
        if not isinstance(data, dict) or data.get('version') != 1:
            raise ValueError('笔记图层格式无效')
        _records(data.get('layers'), '笔记图层')
        for layer in data['layers']:
            if 'relations' in layer:
                _records(layer['relations'], '关联笔记')
                for note in layer['relations']:
                    if not isinstance(note.get('objects', []), list) or not all(isinstance(o, str) and o for o in note.get('objects', [])):
                        raise ValueError('笔记关联对象必须是对象键列表')
                    for name in ('title', 'text'):
                        if name in note and not isinstance(note[name], str):
                            raise ValueError('笔记标题和正文必须是文字')
            if 'pointNotes' in layer and (not isinstance(layer['pointNotes'], dict) or not all(isinstance(v, str) for v in layer['pointNotes'].values())):
                raise ValueError('旧对象笔记格式无效')
            if 'note' in layer and not isinstance(layer['note'], str):
                raise ValueError('旧图层说明必须是文字')
    elif prefix == 'chart-case-archive-v1':
        # Old pages stored either a record array or a versioned object.
        records = data if isinstance(data, list) else data.get('records') if isinstance(data, dict) else None
        _records(records, '案例档案')
        for record in records:
            for name in ('title', 'date', 'analysis', 'feedback'):
                if name in record and not isinstance(record[name], str):
                    raise ValueError('档案字段必须是文字')
    elif prefix == 'chart-point-notes':
        if not isinstance(data, dict) or not all(isinstance(v, str) for v in data.values()):
            raise ValueError('对象笔记必须是文字映射')
    elif prefix == 'chart-editor-drafts-v1':
        if not isinstance(data, dict):
            raise ValueError('编辑草稿必须是对象')
        for draft in data.values():
            if not isinstance(draft, dict) or not isinstance(draft.get('context'), dict) or not isinstance(draft.get('fields'), list):
                raise ValueError('编辑草稿缺少编辑上下文或字段列表')
    elif structured and not isinstance(data, list):
        raise ValueError('保存的卡片资料必须是列表')


def validate_note_limit(value, previous):
    """Limit additions after merge; grandfather intact older over-limit layers."""
    if value is None:
        return
    data=json.loads(value)
    try:old=json.loads(previous) if previous else {}
    except (ValueError,TypeError):old={}
    if not isinstance(old,dict):old={}
    layers={layer['id']:layer for layer in old.get('layers',[]) if isinstance(layer,dict) and 'id' in layer}
    for layer in data.get('layers',[]):
        notes=layer.get('relations',[])
        prior=layers.get(layer['id'],{}).get('relations',[])
        if len(notes)>30 and not {n['id'] for n in notes}.issubset({n['id'] for n in prior}):
            raise ValueError('每个笔记图层最多30条笔记，请先删除多余笔记后新增')
