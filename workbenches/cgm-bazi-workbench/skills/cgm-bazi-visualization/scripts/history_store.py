"""Compress older Bazi history in place, preserving IDs and exact recovery text."""
import gzip,sqlite3
RECENT=100
class HistoryRow(dict):
    def __getitem__(self,key):
        if isinstance(key,int):return list(self.values())[key]
        return super().__getitem__(key)
def row_factory(cursor,values):
    data=dict(zip([col[0] for col in cursor.description],values));packed=data.pop('text_z',None)
    if packed is not None:
        # Invalid compressed history raises explicitly; never substitutes empty text.
        data['text']=gzip.decompress(packed).decode('utf-8')
    return HistoryRow(data)
def prepare(c):
    for table in ['history','research_history']:
        if 'text_z' not in [r[1] for r in c.execute('PRAGMA table_info('+table+')')]:c.execute('ALTER TABLE '+table+' ADD COLUMN text_z BLOB')
def archive_older(c,view):
    for table in ['history','research_history']:
        rows=c.execute('SELECT id,text FROM '+table+' WHERE view_id=? AND text_z IS NULL AND id NOT IN (SELECT id FROM '+table+' WHERE view_id=? ORDER BY id DESC LIMIT ?) ORDER BY id LIMIT 100',(view,view,RECENT)).fetchall()
        for row in rows:
            raw=row['text'].encode();packed=gzip.compress(raw)
            if len(packed)<len(raw):c.execute('UPDATE '+table+' SET text=?,text_z=? WHERE id=?',('',packed,row['id']))
