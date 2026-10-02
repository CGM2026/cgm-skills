"""Working calculation engine using the already available Swiss Ephemeris.
No downloads, installation or external ephemeris files: explicit Moshier mode.
"""
import calendar
import functools
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import swisseph as swe

STEMS = '甲乙丙丁戊己庚辛壬癸'
BRANCHES = '子丑寅卯辰巳午未申酉戌亥'
TERMS = ['立春','惊蛰','清明','立夏','芒种','小暑','立秋','白露','寒露','立冬','大雪','小寒']
UTC = timezone.utc
FLAGS = swe.FLG_MOSEPH

def jd(dt):
    # Before UTC, the supplied civil offset locates a UT1-like instant.
    # Numeric subtraction also supports year-1 local clocks whose UT is in year 0.
    if dt.year < 1972:
        return swe.julday(dt.year,dt.month,dt.day,dt.hour+dt.minute/60+(dt.second+dt.microsecond/1e6)/3600)-dt.utcoffset().total_seconds()/86400
    u = dt.astimezone(UTC)
    return swe.utc_to_jd(u.year,u.month,u.day,u.hour,u.minute,u.second+u.microsecond/1e6)[1]

def utc(j):
    y,m,d,h,mi,s = swe.jdut1_to_utc(j)
    return datetime(y,m,d,h,mi,tzinfo=UTC)+timedelta(seconds=s)

def utc_iso(j):
    y,m,d,h,mi,s = swe.jdut1_to_utc(j)
    if y >= 1:
        return (datetime(y,m,d,h,mi,tzinfo=UTC)+timedelta(seconds=s)).isoformat()
    # ISO astronomical year zero is internal evidence, never an accepted birth year.
    return f'{y:04d}-{m:02d}-{d:02d}T{h:02d}:{mi:02d}:{s:09.6f}+00:00'

def gz(n):
    return STEMS[n%10]+BRANCHES[n%12]

@functools.lru_cache(maxsize=256)
def term_year(year):
    result=[]
    for index,name in enumerate(TERMS):
        cy,cm = (year,index+2) if index<11 else (year+1,1)
        target=(315+30*index)%360
        crossing=swe.solcross_ut(target,swe.julday(cy,cm,1,0),FLAGS)
        longitude, flags=swe.calc_ut(crossing,swe.SUN,FLAGS)
        residual=(longitude[0]-target+180)%360-180
        if abs(residual)>1e-6 or not flags & FLAGS:
            raise ValueError('Solar crossing failed precision/ephemeris check')
        result.append(dict(index=index,term=name,jdUT=crossing,utc=utc_iso(crossing),solarLongitude=target,residualDegrees=residual))
    return result

def localize(text,zone,fold=None):
    naive=datetime.fromisoformat(text)
    if naive.tzinfo is not None:
        raise ValueError('birth time must be local clock time without embedded offset')
    if naive.year == 1:
        # tzdb's earliest offset is fixed here; normal UTC roundtrip exceeds datetime's range.
        return naive.replace(tzinfo=zone)
    candidates=[]
    for f in (0,1):
        candidate=naive.replace(tzinfo=zone,fold=f)
        if candidate.astimezone(UTC).astimezone(zone).replace(tzinfo=None)==naive:
            if all(candidate.utcoffset()!=c.utcoffset() for c in candidates):candidates.append(candidate)
    if not candidates:raise ValueError('Nonexistent local time during DST transition')
    if len(candidates)>1 and fold not in (0,1):raise ValueError('Ambiguous local time: provide fold 0 or 1')
    return naive.replace(tzinfo=zone,fold=fold or 0)

def add_months(dt,n):
    total=dt.year*12+dt.month-1+n
    y,m=divmod(total,12);m+=1
    return dt.replace(year=y,month=m,day=min(dt.day,calendar.monthrange(y,m)[1]))

def gods(day):
    di=STEMS.index(day)
    # element order wood, fire, earth, metal, water: same, output, wealth, officer, resource
    names=[('比','劫'),('食','伤'),('才','财'),('杀','官'),('枭','印')]
    return {s:names[(i//2-di//2)%5][0 if i%2==di%2 else 1] for i,s in enumerate(STEMS)}

def luck_offset(method,delta_seconds,start_local,end_local):
    """Method units describe a convention, not the accuracy of a prediction.

    The shichen branch follows lunar-python Yun sect 1's civil-date and branch
    index subtraction, including its explicit treatment of hour 23 as index 11.
    Minute branches retain this suite's elapsed-UT interval definition.
    """
    minutes=math.floor(delta_seconds/60+1e-7)
    if method=='three-days-year-shichen':
        branch_index=lambda value:11 if value.hour==23 else (value.hour+1)//2
        day_difference=(end_local.date()-start_local.date()).days
        shichen_difference=branch_index(end_local)-branch_index(start_local)
        if shichen_difference<0:
            day_difference-=1
            shichen_difference+=12
        total_days=day_difference*120+shichen_difference*10
        if total_days<0:raise ValueError('Invalid chronological interval for shichen method')
        years,remainder=divmod(total_days,360)
        months,days=divmod(remainder,30)
        return dict(years=years,months=months,days=days,hours=0),dict(
            method=method,precision='day',discardedIntervalMinutes=0,
            intervalBasis='civil-date-and-shichen-index',wholeMinutes=minutes,
            shichenInterval=dict(days=day_difference,shichen=shichen_difference,
                startIndex=branch_index(start_local),endIndex=branch_index(end_local),
                lateZiIndex=11,subShichen='ignored'))
    if method not in ('three-days-year-minute-day','three-days-year-minute'):
        raise ValueError('Unsupported luckStart method')
    years,remainder=divmod(minutes,4320)
    months,remainder=divmod(remainder,360)
    days,remainder=divmod(remainder,12)
    day_precision=method=='three-days-year-minute-day'
    return dict(years=years,months=months,days=days,hours=0 if day_precision else remainder*2),dict(
        method=method,precision='day' if day_precision else 'hour',
        intervalBasis='elapsed-UT-whole-minutes',wholeMinutes=minutes,
        discardedIntervalMinutes=remainder if day_precision else 0)

def calculate(data):
    b=data['birth'];c=data['conventions'];zone=timezone(timedelta(seconds=b['utcOffsetSeconds'])) if 'utcOffsetSeconds' in b else ZoneInfo(b['timezone'])
    for key,limit in [('longitude',180),('latitude',90)]:
        if key in b.get('location',{}):
            value=b['location'][key]
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or abs(value)>limit:
                raise ValueError('Invalid birth.location.'+key)
    clock=localize(b['solarDate']+'T'+b['time'],zone,b.get('fold'))
    if not 1<=clock.year<=2099:raise ValueError('Supported birth range is 0001–2099')
    instant=jd(clock)
    shift=400 if clock.year==1 else 0
    pillar_clock=clock.replace(year=clock.year+shift,tzinfo=None)
    def stamp(dt):return f'{dt.year-shift:04d}'+dt.isoformat()[4:]
    correction={'mode':c['solarTime'],'originalLocal':clock.isoformat(),'birthUTC':utc_iso(instant),'timeSource':b.get('timeSource'),'utcOffsetSeconds':clock.utcoffset().total_seconds(),'historicalTimeScale':'UT1 approximation before 1972; UTC thereafter'}
    if c['solarTime']=='provided-apparent':
        if not b.get('correctedLocal') or not b.get('correctionSource'):raise ValueError('Provided correction needs correctedLocal and correctionSource')
        pillar_clock=datetime.fromisoformat(b['correctedLocal'])
        if pillar_clock.tzinfo is not None:raise ValueError('correctedLocal must be a naive apparent date/time')
        if shift:pillar_clock=pillar_clock.replace(year=pillar_clock.year+shift)
        if abs((pillar_clock-clock.replace(year=clock.year+shift,tzinfo=None)).total_seconds())>86400:raise ValueError('Corrected time differs by more than one day')
        correction['source']=b['correctionSource']
        correction['status']='user-provided-not-independently-recomputed'
    elif c['solarTime'] in ('apparent','mean'):
        lon=b['location'].get('longitude')
        if not isinstance(lon,(float,int)) or isinstance(lon,bool) or not math.isfinite(lon) or not -180<=lon<=180:raise ValueError('Solar time needs valid longitude')
        mean=clock.replace(year=clock.year+shift,tzinfo=None)+timedelta(seconds=lon*240-clock.utcoffset().total_seconds())
        eq=swe.time_equ(instant)*86400
        pillar_clock=mean+timedelta(seconds=eq if c['solarTime']=='apparent' else 0)
        correction.update(longitude=lon,equationOfTimeSeconds=eq,meanLocal=stamp(mean))
    correction['pillarClock']=stamp(pillar_clock)
    year=clock.year if instant>=term_year(clock.year)[0]['jdUT'] else clock.year-1
    jie=term_year(year)
    month=max(i for i,t in enumerate(jie) if instant>=t['jdUT'])
    # Month sequence always uses its solar-term year, independently of natal year selection.
    solar_yg=gz(year-1984)
    year_evidence=data['yearEvidence']
    year_date=pillar_clock.date()+timedelta(days=1 if pillar_clock.hour>=23 else 0)
    year_date_text=f'{year_date.year-shift:04d}'+year_date.isoformat()[4:]
    year_evidence['evaluatedDate']=year_date_text
    year_evidence['lunarYear']=year_evidence.pop('dateYears')[year_date_text]
    natal_year=year_evidence['lunarYear'] if c['yearBoundary']=='lunar-new-year' else year
    yg=gz(natal_year-1984)
    mg=STEMS[((STEMS.index(solar_yg[0])%5)*2+2+month)%10]+BRANCHES[(2+month)%12]
    daydate=pillar_clock.date()
    if c['dayBoundary']=='zi-23' and pillar_clock.hour>=23:daydate+=timedelta(days=1)
    dg=gz(int(swe.julday(daydate.year-shift,daydate.month,daydate.day,12))+49)
    hi=((pillar_clock.hour+1)//2)%12
    # Split zi retains today's day pillar but uses tomorrow's stem for the
    # late-zi hour pillar. Midnight mode uses the displayed day's stem.
    hour_day=daydate+timedelta(days=1) if c['dayBoundary']=='split-zi' and pillar_clock.hour>=23 else daydate
    hour_day_stem=gz(int(swe.julday(hour_day.year-shift,hour_day.month,hour_day.day,12))+49)[0]
    hg=STEMS[(STEMS.index(hour_day_stem)*2+hi)%10]+BRANCHES[hi]
    forward=(STEMS.index(yg[0])%2==0)==(b['sex']=='male')
    previous=jie[month]
    following=jie[month+1] if month<11 else term_year(year+1)[0]
    target=following if forward else previous
    # Minute-resolution three-days-one-year convention; UTC elapsed interval, not solar-clock labels.
    a,z=(instant,target['jdUT']) if forward else (target['jdUT'],instant)
    delta_seconds=(z-a)*86400
    # Use the birth timezone for both civil labels. The year-1 fallback is
    # solely for a prior term whose instant cannot be represented by datetime.
    interval_clock=clock
    target_local=clock
    if c['luckStart']=='three-days-year-shichen':
        if clock.year==1:
            ty,tm,td,th,tmi,ts=swe.jdut1_to_utc(target['jdUT'])
            target_local=(datetime(ty+400,tm,td,th,tmi,tzinfo=UTC)+timedelta(seconds=ts)).astimezone(timezone(clock.utcoffset()))
            interval_clock=clock.replace(year=401)
        else:
            target_local=utc(target['jdUT']).astimezone(zone)
    start_local,end_local=(interval_clock,target_local) if forward else (target_local,interval_clock)
    age_offset,offset_evidence=luck_offset(c['luckStart'],delta_seconds,start_local,end_local)
    day_precision=offset_evidence['precision']=='day'
    onset=add_months(add_months(clock,age_offset['years']*12),age_offset['months'])+timedelta(days=age_offset['days'],hours=age_offset['hours'])
    if day_precision:onset=onset.replace(hour=0,minute=0,second=0,microsecond=0)
    # Revalidate local civil timestamps if an onset falls into DST ambiguity or gaps.
    onset=localize(onset.replace(tzinfo=None).isoformat(),zone,b.get('fold'))
    index=next(i for i in range(60) if gz(i)==mg)
    periods=[]
    for i in range(10):
        start=add_months(onset,120*i);end=add_months(onset,120*(i+1))
        periods.append(dict(index=i+1,gz=gz(index+(i+1)*(1 if forward else -1)),startUTC=utc_iso(jd(start)),endUTC=utc_iso(jd(end)),startLocal=start.isoformat(),endLocal=end.isoformat()))
    result=dict(natal=[dict(stem=p[0],branch=p[1]) for p in (yg,mg,dg,hg)],godMap=gods(dg[0]),correction=correction,birthJDUT=instant,baziYear=natal_year,solarTermYear=year,yearBoundaryEvidence=dict(selected=c['yearBoundary'],selectedYear=natal_year,lunarCalendar=year_evidence,monthStemBasis='lichun-solar-term-year',monthStemYear=year),baziMonth=month,previousJie=previous,nextJie=following,luckExact=dict(**offset_evidence,rounding='floor',startDate=onset.date().isoformat(),directionYearStem=yg[0],directionBasis='selected-natal-year-stem-and-sex',direction='forward' if forward else 'backward',basisTerm=target,elapsedSeconds=delta_seconds,ageOffset=age_offset,startLocal=onset.isoformat(),periods=periods),runtime=dict(python=sys.version.split()[0],swisseph=swe.version,ephemeris='Moshier',timezone=b['timezone']))
    if data.get('includeTermYears',True):
        result['termYears']={str(y):term_year(y) for y in range(clock.year-1,periods[-1] and onset.year+101)}
    return result

if __name__=='__main__':
    try:
        for stream in (sys.stdin,sys.stdout,sys.stderr):
            if hasattr(stream,'reconfigure'):stream.reconfigure(encoding='utf-8',errors='strict')
        payload=json.load(sys.stdin)
        result=calculate(payload)
        print(json.dumps(result,ensure_ascii=True))
    except Exception as error:
        print(str(error),file=sys.stderr);sys.exit(1)
