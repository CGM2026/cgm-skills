#!/usr/bin/env python3
"""Generate a six-question option layout and save it to a private temp file."""

from __future__ import annotations

import argparse
import itertools
import json
import random
import tempfile
from collections import Counter
from pathlib import Path


SYSTEMS = ("M", "H", "C", "B", "Z")
NAMES = {
    "M": "现代占星",
    "H": "希腊占星",
    "C": "古典占星",
    "B": "八字",
    "Z": "紫微斗数",
}


def build_layout(rng: random.Random) -> dict:
    extra_four = set(rng.sample([s for s in SYSTEMS if s != "H"], 2))
    targets = {s: (4 if s == "H" or s in extra_four else 3) for s in SYSTEMS}
    trios = list(itertools.combinations(SYSTEMS, 3))

    valid_sets = []
    for chosen in itertools.combinations(trios, 6):
        counts = Counter(s for trio in chosen for s in trio)
        if all(counts[s] == targets[s] for s in SYSTEMS):
            valid_sets.append(chosen)

    if not valid_sets:
        raise RuntimeError("No valid exposure layout found")

    chosen = list(rng.choice(valid_sets))
    rng.shuffle(chosen)

    questions = []
    for number, trio in enumerate(chosen, start=1):
        displayed = list(trio)
        rng.shuffle(displayed)
        questions.append(
            {
                "question": number,
                "options": {
                    letter: {"code": code, "system": NAMES[code]}
                    for letter, code in zip(("A", "B", "C"), displayed)
                },
            }
        )

    return {
        "target_exposure": {NAMES[s]: targets[s] for s in SYSTEMS},
        "questions": questions,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, help="Optional seed for reproducible tests")
    parser.add_argument(
        "--print",
        action="store_true",
        dest="print_out",
        help="Print JSON for debugging instead of returning a temp-file path",
    )
    args = parser.parse_args()
    rng = random.Random(args.seed)
    payload = json.dumps(build_layout(rng), ensure_ascii=False, indent=2)
    if args.print_out:
        print(payload)
        return

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        prefix="diagnose-mingli-layout-",
        suffix=".json",
        delete=False,
    ) as stream:
        stream.write(payload)
        path = Path(stream.name)
    print(path.resolve())


if __name__ == "__main__":
    main()
