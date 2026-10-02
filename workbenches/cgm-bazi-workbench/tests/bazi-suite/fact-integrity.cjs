'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=process.env.CGM_BAZI_TEST_OUTPUT||path.join(root,'output/发布修复_20261002/validation/bazi-facts');
fs.mkdirSync(out,{recursive:true});
const {calculateBirth,validate,sha}=require('../../skills/cgm-bazi-chart/scripts/chart.cjs');
const {migrate}=require('../../skills/cgm-bazi-chart/scripts/timeline.cjs');
const cal=require('../../skills/cgm-bazi-chart/scripts/calendar.cjs');
const input={schema:'cgm-bazi-birth/1',name:'事实交叉核验隔离测试',birth:{calendar:'solar',date:'2001-11-12',time:'01:01',sex:'male',timezone:'Asia/Shanghai',location:{name:'模拟地点',longitude:120,latitude:26}},conventions:{solarTime:'civil'}};
const results=[];
const test=(name,run)=>{const before=Date.now();run();results.push({name,status:'pass',durationMs:Date.now()-before});fs.writeFileSync(path.join(out,'事实完整性回归.json'),JSON.stringify({status:'executed-pass',results},null,2));};
const chart=calculateBirth(input);
test('合法坐标边界与未提供可选坐标',()=>{for(const [longitude,latitude]of [[180,90],[-180,-90],[0,0]])assert.doesNotThrow(()=>calculateBirth({...input,birth:{...input.birth,location:{name:'模拟',longitude,latitude}}}));const i=structuredClone(input);delete i.birth.location.longitude;delete i.birth.location.latitude;assert.doesNotThrow(()=>calculateBirth(i));});
for(const mode of ['civil','mean','apparent','provided-apparent'])test('各时间模式统一拒绝非法经纬度 '+mode,()=>{for(const [field,values]of [['longitude',[true,false,null,'120',NaN,Infinity,-181,181]],['latitude',[true,false,null,'26',NaN,Infinity,-91,91]]])for(const value of values){const i=structuredClone(input);i.conventions.solarTime=mode;i.birth.location[field]=value;if(mode==='provided-apparent')Object.assign(i.birth,{correctedLocal:'2001-11-12T01:01:00',correctionSource:'隔离来源'});assert.throws(()=>calculateBirth(i),/location\.(longitude|latitude)/);}});
test('未知时辰也拒绝无效坐标',()=>{const i=structuredClone(input);i.birth.time=null;i.birth.location.latitude=true;assert.throws(()=>calculateBirth(i),/latitude/);});
test('导入命盘重填输入摘要不能绕过坐标校验',()=>{const d=structuredClone(chart);d.person.birth.location.longitude=true;d.provenance.inputSha256=sha(JSON.stringify({birth:d.person.birth,conventions:d.rules.conventions}));assert.throws(()=>validate(d),/longitude/);});
test('合法命盘校验不改写任何字段',()=>{const before=JSON.stringify(chart);assert.equal(validate(chart),chart);assert.equal(JSON.stringify(chart),before);});
const changes=[
 ['UTC年份矛盾',d=>d.astronomy.correction.birthUTC='1900-01-01T00:00:00Z'],
 ['出生JD差一天',d=>d.astronomy.birthJDUT+=1],
 ['钟表日期矛盾',d=>d.astronomy.correction.originalLocal='1900-01-01T00:00:00+08:00'],
 ['同一瞬间冒充另一当地时制',d=>d.astronomy.correction.originalLocal='2001-11-11T17:01:00+00:00'],
 ['太阳时标签矛盾',d=>d.astronomy.correction.pillarClock='1900-01-01T00:00:00'],
 ['钟表模式伪造出生时差',d=>d.astronomy.correction.utcOffsetSeconds=0],
 ['年界年份矛盾',d=>d.astronomy.baziYear=1900],
 ['节月年矛盾',d=>d.astronomy.solarTermYear=1900],
 ['节月序号矛盾',d=>d.astronomy.baziMonth=1],
 ['合法但不属于生日的日支',d=>d.natal[2].branch='巳'],
 ['春节年界证据矛盾',d=>d.astronomy.yearBoundaryEvidence.lunarCalendar.evaluatedDate='2001-01-01'],
 ['节气瞬间矛盾',d=>d.astronomy.previousJie.utc='2001-11-01T00:00:00Z'],
 ['起运分钟矛盾',d=>d.luckExact.wholeMinutes+=1],
 ['起运实际间隔矛盾',d=>d.luckExact.elapsedSeconds+=60],
 ['起运折算矛盾',d=>d.luckExact.ageOffset.days+=1],
 ['重新摘要后的原始出生时间变化',d=>{d.person.birth.time='04:01';d.provenance.inputSha256=sha(JSON.stringify({birth:d.person.birth,conventions:d.rules.conventions}));}]
];
for(const [name,change]of changes)test('拒绝 '+name,()=>{const d=structuredClone(chart);change(d);const before=JSON.stringify(d);assert.throws(()=>validate(d),/交叉核验|一致性|摘要/);assert.equal(JSON.stringify(d),before);});
test('校验缓存不缓存整张命盘的成功状态',()=>{validate(chart);const d=structuredClone(chart);d.astronomy.correction.birthUTC='1900-01-01T00:00:00Z';assert.throws(()=>validate(d),/出生UTC/);assert.doesNotThrow(()=>validate(chart));});
test('完整旧schema核验兼容且迁移只加元数据',()=>{const old=structuredClone(chart);delete old.protocolRevision;delete old.provenance;delete old.calendarView.endBoundary;const before=JSON.stringify(old);assert.doesNotThrow(()=>validate(old));const migrated=migrate(old);assert.equal(JSON.stringify(old),before);assert.deepEqual(migrated.natal,old.natal);assert.deepEqual(migrated.luckExact,old.luckExact);assert.equal(migrated.provenance.engineVersion,'legacy-unspecified');const wrong=structuredClone(old);wrong.astronomy.correction.birthUTC='1900-01-01T00:00:00Z';assert.throws(()=>validate(wrong),/出生UTC/);});
// Reproduce the old transport format from synthetic data; no private output
// fixture or user's case library is needed by this test or the release package.
const legacyRuntime=process.env.CGM_BAZI_PYTHON||path.join(root,'.cgm-hellenistic-astrology/runtime/Scripts/python.exe');
const realLegacyPath=path.join(out,'synthetic-legacy-encoding.json');
const realLegacy=calculateBirth({...input,conventions:{solarTime:'provided-apparent'},birth:{...input.birth,correctedLocal:'2001-11-12T01:01:00',correctionSource:'合成旧编码来源'}});
delete realLegacy.protocolRevision;delete realLegacy.provenance;delete realLegacy.astronomy.correction.utcOffsetSeconds;
const encodingProgram="import json,sys; print(json.dumps(json.loads(sys.stdin.read()).encode('utf-8').decode('gbk','surrogateescape')))";
const encodedLegacy=cp.spawnSync(legacyRuntime,['-X','utf8','-c',encodingProgram],{input:JSON.stringify(realLegacy.person.birth.correctionSource),encoding:'utf8',windowsHide:true});
assert.equal(encodedLegacy.status,0,encodedLegacy.stderr);realLegacy.astronomy.correction.source=JSON.parse(encodedLegacy.stdout);fs.writeFileSync(realLegacyPath,JSON.stringify(realLegacy,null,2));
test('合成早期格式缺新时差字段且历史GBK来源仍可只读核验',()=>{assert.equal(realLegacy.protocolRevision,undefined);assert.equal(realLegacy.astronomy.correction.utcOffsetSeconds,undefined);assert.notEqual(realLegacy.astronomy.correction.source,realLegacy.person.birth.correctionSource);const before=JSON.stringify(realLegacy),fileBefore=fs.readFileSync(realLegacyPath);assert.doesNotThrow(()=>validate(realLegacy));assert.equal(JSON.stringify(realLegacy),before);assert.deepEqual(fs.readFileSync(realLegacyPath),fileBefore);});
for(const [name,change,pattern]of [
 ['合成旧稿存在的时差矛盾',d=>d.astronomy.correction.utcOffsetSeconds=0,/出生时差/],
 ['合成旧稿UTC矛盾',d=>d.astronomy.correction.birthUTC='1900-01-01T00:00:00Z',/出生UTC/],
 ['合成旧稿JD矛盾',d=>d.astronomy.birthJDUT+=1,/儒略日/],
 ['合成旧稿太阳时矛盾',d=>d.astronomy.correction.pillarClock='2001-11-12T04:18:00',/太阳时/],
 ['合成旧稿合法却错误的日支',d=>d.natal[2].branch='巳',/日柱/],
 ['合成旧稿任意不同的来源不能当编码兼容',d=>d.astronomy.correction.source='任意不同的来源',/时间来源/],
 ['合成旧稿缺UTC仍拒绝',d=>delete d.astronomy.correction.birthUTC,/出生UTC/],
 ['合成旧稿缺太阳时仍拒绝',d=>delete d.astronomy.correction.pillarClock,/太阳时/]
])test('拒绝 '+name,()=>{const d=structuredClone(realLegacy);change(d);const before=JSON.stringify(d);assert.throws(()=>validate(d),pattern);assert.equal(JSON.stringify(d),before);});
test('新计算不能通过删除时差字段冒充兼容旧证据',()=>{const d=structuredClone(chart);delete d.astronomy.correction.utcOffsetSeconds;assert.throws(()=>validate(d),/出生时差/);});
test('旧历史fixture保持结构检查且不伪装新计算',()=>{const fixture=structuredClone(chart);fixture.calculation.status='historical-fixture';fixture.rules={id:'legacy-display-v1',age:'selected-year-minus-birth-year',timeResolution:'symbolic-year'};delete fixture.protocolRevision;delete fixture.provenance;delete fixture.astronomy;delete fixture.luckExact;delete fixture.calendarView;const before=JSON.stringify(fixture);assert.doesNotThrow(()=>validate(fixture));assert.equal(JSON.stringify(fixture),before);assert.throws(()=>migrate(fixture));});
const unknown=calculateBirth({...input,birth:{...input.birth,time:null}});
test('未知时辰维持null和标明的正午参照',()=>{assert.equal(unknown.natal[3].stem,null);assert.equal(unknown.luckExact,null);assert.equal(unknown.astronomy.birthJDUT,null);assert.doesNotThrow(()=>validate(unknown));});
test('未知时辰参照被改动亦拒绝',()=>{const d=structuredClone(unknown);d.astronomy.referenceResult.correction.birthUTC='1900-01-01T00:00:00Z';assert.throws(()=>validate(d),/出生UTC/);});
test('未知时辰参照标签不能改称真实出生时刻',()=>{const d=structuredClone(unknown);d.astronomy.referenceTime='13:00';assert.throws(()=>validate(d),/参照时刻/);});
test('年度大运投影不能与精确推运事实矛盾',()=>{const d=structuredClone(chart);d.luck[1].gz='甲子';assert.throws(()=>validate(d),/年度推运/);});
test('外部核验标识不能绕过已有口径计算事实',()=>{const d=structuredClone(chart);d.calculation.status='externally-verified';d.natal[2].branch='巳';assert.throws(()=>validate(d),/日柱/);});
test('日期归一结果不能违背原始日期',()=>{const i=structuredClone(input);i.birth.solarDate='2001-11-13';assert.throws(()=>calculateBirth(i),/solarDate/);});
test('重填摘要不能导入不支持的小运口径',()=>{const d=structuredClone(chart);d.rules.conventions.smallLuck='other';d.provenance.inputSha256=sha(JSON.stringify({birth:d.person.birth,conventions:d.rules.conventions}));assert.throws(()=>validate(d),/fixed-origin/);});
test('已有校正来源须为非空原文字符串',()=>{const i=structuredClone(input);i.conventions.solarTime='provided-apparent';Object.assign(i.birth,{correctedLocal:'2001-11-12T01:01:00',correctionSource:true});assert.throws(()=>calculateBirth(i),/correctionSource strings/);});

const runtime=process.env.CGM_BAZI_PYTHON||path.join(root,'.cgm-hellenistic-astrology/runtime/Scripts/python.exe');
const source='中文校正来源：𠮷字与表情😀；仅验证原文完整。';
const provided=structuredClone(input);provided.conventions.solarTime='provided-apparent';Object.assign(provided.birth,{correctedLocal:'2001-11-12T01:01:00',correctionSource:source});
test('自然GBK配置下Node排盘中文校正来源完整',()=>{const env={...process.env,CGM_BAZI_PYTHON:runtime,PYTHONUTF8:'0',PYTHONIOENCODING:'gbk'};const program=`const {calculateBirth}=require(${JSON.stringify(path.join(root,'skills/cgm-bazi-chart/scripts/chart.cjs'))});const d=calculateBirth(${JSON.stringify(provided)});console.log(JSON.stringify({source:d.astronomy.correction.source,input:d.person.birth.correctionSource}));`;const r=cp.spawnSync(process.execPath,['-e',program],{env,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);const d=JSON.parse(r.stdout);assert.equal(d.source,source);assert.equal(d.input,source);});
test('自然GBK配置下历史中文时制来源完整',()=>{const i=structuredClone(input);Object.assign(i.birth,{date:'1856-05-06',timeSource:source,utcOffsetSeconds:3464,timezone:'Europe/Prague'});const env={...process.env,CGM_BAZI_PYTHON:runtime,PYTHONUTF8:'0',PYTHONIOENCODING:'gbk'};const program=`const {calculateBirth}=require(${JSON.stringify(path.join(root,'skills/cgm-bazi-chart/scripts/chart.cjs'))});const d=calculateBirth(${JSON.stringify(i)});console.log(JSON.stringify({source:d.astronomy.correction.timeSource,input:d.person.birth.timeSource}));`;const r=cp.spawnSync(process.execPath,['-e',program],{env,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);const d=JSON.parse(r.stdout);assert.equal(d.source,source);assert.equal(d.input,source);});
test('直接运行Python天文接口也固定UTF8',()=>{const d=calculateBirth(provided),birth=d.person.birth,yearEvidence=structuredClone(d.astronomy.yearBoundaryEvidence.lunarCalendar);yearEvidence.dateYears=Object.fromEntries([-2,-1,0,1,2].map(n=>{const date=new Date(Date.parse(birth.solarDate+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);return [date,cal.toLunar(date).year];}));delete yearEvidence.evaluatedDate;const r=cp.spawnSync(runtime,[path.join(root,'skills/cgm-bazi-chart/scripts/astronomy.py')],{input:JSON.stringify({birth,conventions:d.rules.conventions,yearEvidence,includeTermYears:false}),env:{...process.env,PYTHONUTF8:'0',PYTHONIOENCODING:'gbk'},encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);const a=JSON.parse(r.stdout);assert.equal(a.correction.source,source);assert.equal(a.termYears,undefined);});
test('导入CLI拒绝矛盾命盘且不生成输出',()=>{const d=structuredClone(chart);d.astronomy.correction.birthUTC='1900-01-01T00:00:00Z';const file=path.join(out,'拒绝输入.json'),destination=path.join(out,'不应生成的命盘.json');fs.writeFileSync(file,JSON.stringify(d));const r=cp.spawnSync(process.execPath,[path.join(root,'skills/cgm-bazi-chart/scripts/chart.cjs'),'validate',file,destination],{encoding:'utf8',windowsHide:true});assert.notEqual(r.status,0);assert.match(r.stderr,/出生UTC/);assert.equal(fs.existsSync(destination),false);});
console.log(JSON.stringify({passed:results.length,results}));
