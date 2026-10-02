"""Civil birthday age, independent of astrological year lengths."""
from calendar import monthrange
from datetime import datetime
from zoneinfo import ZoneInfo


def local_zone(facts):
    meta = facts['metadata']
    return (ZoneInfo(meta['time_reference']) if meta['time_basis'] == 'iana'
            else datetime.fromisoformat(meta['local_datetime']).tzinfo)


def civil_age(birth, instant, zone):
    birth, instant = birth.astimezone(zone), instant.astimezone(zone)
    def anniversary(year):
        return birth.replace(year=year, day=min(birth.day, monthrange(year, birth.month)[1]))
    years = instant.year - birth.year
    if instant < anniversary(birth.year + years):
        years -= 1
    start, end = anniversary(birth.year + years), anniversary(birth.year + years + 1)
    return round(years + (instant - start).total_seconds() / (end - start).total_seconds(), 2)


def annotate_periods(schedules, birth, zone):
    def visit(value):
        if isinstance(value, dict):
            if 'start_utc' in value:
                instant = datetime.fromisoformat(value['start_utc'])
                value['age'] = civil_age(birth, instant, zone)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(schedules)
