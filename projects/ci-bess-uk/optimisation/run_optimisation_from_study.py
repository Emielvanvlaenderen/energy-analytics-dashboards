#!/usr/bin/env python3
"""
CLI entrypoint for the web app / Simulate BESS: runs the PuLP + bess_pipeline
optimisation, writes results CSV + .last_optimisation_output.txt.

Usage (cwd = project repo root):
  python3 optimisation/run_optimisation_from_study.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Project root (parent of ``optimisation/``); ``data/``, ``results/``, and ``study_inputs.json`` live here.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "optimisation"))

from bess_pipeline import (  # noqa: E402
    load_context,
    load_half_hour_stack,
    build_raw_df_auction,
    auction_loop,
)


def _slug(x: str) -> str:
    """Sanitise a string for use inside CSV filenames (letters, digits, ``-._`` kept; rest → ``_``).

    **Meaning:** Keeps ``results/*.csv`` stems filesystem-safe and stable when BESS metadata contains
    spaces or odd characters.

    **Used by:** Only :func:`main` when building the results filename stem.
    """
    return "".join(c if c.isalnum() or c in "-._" else "_" for c in str(x))


def main() -> int:
    """Load inputs, run the auction MILP loop, write CSV + marker, emit JSON status for the server.

    Requires ``optimisation/study_inputs.json``. If missing, prints a stderr message and
    returns 1. Otherwise builds the half-hour stack from ``data/``, runs optimisation, writes
    ``results/<stem>.csv``, updates ``.last_optimisation_output.txt``, and prints a single JSON object
    to stdout with the absolute CSV path and row count.
    """
    
    param = ROOT / "optimisation" / "study_inputs.json"
    if not param.is_file():
        print(
            "Study inputs have not been submitted: optimisation/study_inputs.json is missing.",
            file=sys.stderr,
        )
        return 1

    with open(param, encoding="utf-8") as f:
        study = json.load(f)
    ctx = load_context(param)
    bess = ctx.bess
    simulation_name = (study.get("simulationName") or "").strip()
    data_dir = ROOT / "data"

    base = load_half_hour_stack(ctx, data_dir)
    raw_df = build_raw_df_auction(base, ctx)
    df_auction = auction_loop(raw_df, ctx)

    results_dir = ROOT / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    cap_mw = float(bess["capacityMw"])
    dur_h = int(bess["durationHours"])
    form = study.get("siteDataForm") or {}
    site_tags = []
    if form.get("pvChoice") == "yes":
        site_tags.append("pvY")
    elif form.get("pvChoice") == "no":
        site_tags.append("pvN")
    if form.get("consumptionChoice") == "yes":
        site_tags.append("loadY")
    elif form.get("consumptionChoice") == "no":
        site_tags.append("loadN")

    stem_parts = [
        *site_tags,
        "bess_auction",
        _slug(bess["startDate"]),
        _slug(bess["endDate"]),
        f"{int(cap_mw)}MW",
        f"{dur_h}h",
        f"rte{int(bess['roundtripEfficiencyPct'])}",
        f"soc{int(bess['socLowerPct'])}_{int(bess['socUpperPct'])}",
        "cyc" + _slug(str(bess["cyclesPerDayTarget"])),
        f"pmax{_slug(f'{ctx.max_abs_power_charge_mw:.4f}')}MW",
        f"e{_slug(f'{ctx.total_capacity_mwh:.2f}')}MWh",
    ]
    if not simulation_name:
        print(
            "Simulation name is required. Enter a name when you run Simulate BESS.",
            file=sys.stderr,
        )
        return 1
    stem = "__".join([_slug(simulation_name), *stem_parts])
    out_path = results_dir / f"{stem}.csv"
    df_auction.to_csv(out_path, index=True)

    marker = ROOT / "optimisation" / ".last_optimisation_output.txt"
    marker.write_text(str(out_path.resolve()), encoding="utf-8")
    print(json.dumps({"ok": True, "resultsCsv": str(out_path.resolve()), "rows": len(df_auction)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
