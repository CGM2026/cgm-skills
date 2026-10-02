"""Calculate asteroid positions with an ASCII relative ephemeris path on Windows."""
import json
import sys
from calculate_chart import calculation_flags, swe


def main():
    jobs = json.load(sys.stdin)
    swe.set_ephe_path('.')
    result = {}
    try:
        for key, job in jobs.items():
            flags = calculation_flags(job['zodiac'], job.get('ayanamsa'))
            result[key] = {
                name: swe.calc_ut(job['jd'], body, flags)[0]
                for name, body in [('chiron', swe.CHIRON), ('ceres', swe.CERES),
                                   ('pallas', swe.PALLAS), ('juno', swe.JUNO), ('vesta', swe.VESTA)]
            }
    finally:
        swe.close()
    json.dump(result, sys.stdout)


if __name__ == '__main__':
    main()
