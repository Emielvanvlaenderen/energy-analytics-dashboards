#!/usr/bin/env python3
"""CLI entrypoint for V2G UK simulator (web app)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "optimisation"))

from v2g_pipeline import build_simulation_table, load_context, run_plug_session_loop  # noqa: E402


def _slug(x: str) -> str:
    return "".join(c if c.isalnum() or c in "-._" else "_" for c in str(x))


def main() -> int:
    param = ROOT / "optimisation" / "study_inputs.json"
    if not param.is_file():
        print(
            "Study inputs have not been submitted: optimisation/study_inputs.json is missing.",
            file=sys.stderr,
        )
        return 1

    with open(param, encoding="utf-8") as f:
        study = json.load(f)

    simulation_name = (study.get("simulationName") or "").strip()
    if not simulation_name:
        print(
            "Simulation name is required. Enter a name when you run the V2G simulation.",
            file=sys.stderr,
        )
        return 1

    ctx = load_context(param)
    data_dir = ROOT / "data"
    raw_df = build_simulation_table(ctx, data_dir)
    results_df = run_plug_session_loop(raw_df, ctx)

    results_dir = ROOT / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    v2g = ctx.v2g
    if "capacityMw" in v2g and "durationHours" in v2g:
        cap_mw = float(v2g["capacityMw"])
        dur_h = int(v2g["durationHours"])
        battery_parts = [f"{int(cap_mw)}MW", f"{dur_h}h"]
    else:
        battery_parts = [f"{v2g['energyBessMwh']}MWh", f"{v2g['maxPowerBessMw']}MW"]
    stem_parts = [
        "v2g_wholesale",
        _slug(v2g["startDate"]),
        _slug(v2g["endDate"]),
        *battery_parts,
        f"ret{int(float(v2g['returnSocPct']))}",
        f"tgt{int(float(v2g['targetSocPct']))}",
        "v2g" if ctx.params.allow_v2g_discharge else "smart",
    ]
    stem = "__".join([_slug(simulation_name), *stem_parts])
    out_path = results_dir / f"{stem}.csv"
    results_df.to_csv(out_path, index=False)

    marker = ROOT / "optimisation" / ".last_optimisation_output.txt"
    marker.write_text(str(out_path.resolve()), encoding="utf-8")
    print(json.dumps({"ok": True, "resultsCsv": str(out_path.resolve()), "rows": len(results_df)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
