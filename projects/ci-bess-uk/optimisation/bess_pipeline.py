"""Shared data load + auction loop for the GB BESS study (PuLP + CBC).

End-to-end flow (see ``run_optimisation_from_study.py``, invoked by the app server):

``load_context`` → ``load_half_hour_stack`` → ``build_raw_df_auction`` → ``auction_loop``
(``auction_loop`` ends with ``_format_results_for_csv``).

``auction_loop`` returns a results table in the web/CSV schema: timestamps, site flows, tariffs,
state of charge, charge/discharge/action, half-hour cashflows with and without BESS, and deltas.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from bess_milp import BessMilpParams, milp

# Canonical timestamp column name in the study CSVs under ``data/`` (PV, consumption, tariffs, DA).
UTC_COL = "Datetime (UTC)"


@dataclass
class BessContext:
    study: dict
    bess: dict
    fx: float
    nb_days_per_period: int
    zone_da: str
    start: str
    end: str
    minimum_soc: float
    maximum_soc: float
    initial_soc: float
    total_capacity_mwh: float
    charging_efficiency: float
    discharging_efficiency: float
    max_abs_power_charge_mw: float
    max_cycle_per_day: float
    auctions: list[str]
    milp_params: BessMilpParams


def load_context(study_path: Path) -> BessContext:
    """Read ``optimisation/study_inputs.json`` and build :class:`BessContext` + :class:`BessMilpParams`.

    **Meaning:** Maps the front-end JSON (BESS block, optional site import/export limits, FX, horizon
    length) into efficiencies, energy capacity, and CBC/PuLP solver parameters.

    **Used by:** ``run_optimisation_from_study.py`` (first step); the Node server runs that script
    for “Simulate BESS”.
    """
    with open(study_path, encoding="utf-8") as f:
        study = json.load(f)
    bess = study["bessSimulationCommitted"]
    limits = study.get("siteImportExportLimitsMw") or {}
    fx = float(study.get("fxGbpPerEur", 0.85))
    nb_days_per_period = int(study.get("nbDaysPerPeriod", 3))

    cap_mw = float(bess["capacityMw"])
    dur_h = int(bess["durationHours"])
    total_capacity_mwh = cap_mw * dur_h
    rte = float(bess["roundtripEfficiencyPct"]) / 100.0
    ce = np.sqrt(rte)
    de = np.sqrt(rte)

    mi = limits.get("maxImportMw")
    me = limits.get("maxExportMw")
    mi_f = float(mi) if mi is not None else None
    me_f = float(me) if me is not None else None
    if mi is not None and me is not None:
        max_abs = float(min(cap_mw, float(mi), float(me)))
    else:
        max_abs = cap_mw

    min_soc = float(bess["socLowerPct"]) / 100.0
    max_soc = float(bess["socUpperPct"]) / 100.0
    init_soc = (float(bess["socLowerPct"]) + float(bess["socUpperPct"])) / 200.0

    mp = BessMilpParams(
        total_capacity_mwh=total_capacity_mwh,
        minimum_soc=min_soc,
        maximum_soc=max_soc,
        initial_soc=init_soc,
        charging_efficiency=ce,
        discharging_efficiency=de,
        max_abs_power_mw=max_abs,
        max_cycle_per_day=float(bess["cyclesPerDayTarget"]),
        nb_days_per_period=nb_days_per_period,
        max_import_mw=mi_f,
        max_export_mw=me_f,
        interval_hours=0.5,
    )

    return BessContext(
        study=study,
        bess=bess,
        fx=fx,
        nb_days_per_period=nb_days_per_period,
        zone_da="UK",
        start=f"{bess['startDate']} 00:00:00",
        end=f"{bess['endDate']} 23:59:59",
        minimum_soc=min_soc,
        maximum_soc=max_soc,
        initial_soc=init_soc,
        total_capacity_mwh=total_capacity_mwh,
        charging_efficiency=ce,
        discharging_efficiency=de,
        max_abs_power_charge_mw=max_abs,
        max_cycle_per_day=float(bess["cyclesPerDayTarget"]),
        auctions=["day-ahead"],
        milp_params=mp,
    )


def load_half_hour_stack(ctx: BessContext, data_dir: Path) -> pd.DataFrame:
    """Merge half-hour site PV, load, import/export charges, and hourly DA into one UTC-indexed frame.

    **Meaning:** One row per settlement period in the simulation window with ``pv_mw``, ``cons_mw``,
    ``site_MW`` (net before BESS), GBP tariff columns, and ``settlement_price`` (DA × FX, used as
    wholesale in the study).

    **Used by:** ``run_optimisation_from_study.py`` → passed to :func:`build_raw_df_auction`.
    """
    bess = ctx.bess
    fx = ctx.fx

    pv = pd.read_csv(data_dir / "site_pv_generation_synthetic_mw.csv")
    cons = pd.read_csv(data_dir / "site_consumption_constant_mw.csv")
    imp = pd.read_csv(data_dir / "site_import_charges_timeseries.csv")
    exp = pd.read_csv(data_dir / "site_export_charges_timeseries.csv")
    da = pd.read_csv(data_dir / "day-ahead-prices.csv")

    for df in (pv, cons, imp, exp, da):
        df[UTC_COL] = pd.to_datetime(df[UTC_COL], utc=True)

    pv = pv.rename(columns={"Power (MW)": "pv_mw"})
    cons = cons.rename(columns={"Power (MW)": "cons_mw"})
    imp = imp.rename(columns={"Import charge (£/MWh)": "import_gbp_mwh"})
    exp = exp.rename(columns={"Export charge (£/MWh)": "export_gbp_mwh"})
    da = da.rename(columns={"Price (EUR/MWhe)": "da_eur_mwh"})

    m = pv[[UTC_COL, "pv_mw"]].merge(cons[[UTC_COL, "cons_mw"]], on=UTC_COL, how="inner")
    m = m.merge(imp[[UTC_COL, "import_gbp_mwh"]], on=UTC_COL, how="inner")
    m = m.merge(exp[[UTC_COL, "export_gbp_mwh"]], on=UTC_COL, how="inner")

    da["hour_key"] = da[UTC_COL].dt.floor("h")
    da_h = da.groupby("hour_key", as_index=False)["da_eur_mwh"].first()
    m["hour_key"] = m[UTC_COL].dt.floor("h")
    m = m.merge(da_h, on="hour_key", how="inner")
    m["forecast_price"] = m["da_eur_mwh"] * fx
    m["settlement_price"] = m["forecast_price"]
    m["off_costs"] = m["import_gbp_mwh"]
    m["inj_costs"] = m["export_gbp_mwh"]
    m["site_MW"] = m["pv_mw"] - m["cons_mw"]

    t0 = pd.Timestamp(bess["startDate"], tz="UTC")
    t1 = pd.Timestamp(bess["endDate"] + " 23:59:59", tz="UTC")
    m = m[(m[UTC_COL] >= t0) & (m[UTC_COL] <= t1)].copy()
    m = m.sort_values(UTC_COL).reset_index(drop=True)
    return m


def build_raw_df_auction(base: pd.DataFrame, ctx: BessContext) -> pd.DataFrame:
    """Expand the half-hour stack into auction-training rows: UK local time + five horizon copies.

    **Meaning:** The MILP sees, for each timestamp, rows labelled ``horizon_days_ahead`` 1…5 so the
    rolling window in :func:`auction_loop` can select consistent day-ahead-style subsets. Also adds
    ``timestamp_UTC``, naive ``datetime_UK``, ``zone``, and ``auction`` metadata.

    **Used by:** ``run_optimisation_from_study.py`` between :func:`load_half_hour_stack` and
    :func:`auction_loop`.
    """
    base = base.copy()
    base["timestamp_UTC"] = base[UTC_COL]
    base["datetime_UK"] = (
        base["timestamp_UTC"].dt.tz_convert("Europe/London").dt.tz_localize(None)
    )
    base["zone"] = ctx.zone_da
    base["auction"] = "day-ahead"

    horizon_chunks = []
    for h in range(1, 6):
        chunk = base.copy()
        chunk["horizon_days_ahead"] = h
        horizon_chunks.append(chunk)

    raw = pd.concat(horizon_chunks, ignore_index=True)
    return raw.sort_values(["timestamp_UTC", "horizon_days_ahead"]).reset_index(drop=True)


def _format_results_for_csv(df: pd.DataFrame) -> pd.DataFrame:
    """Map MILP output columns to the CSV schema consumed by the results API / charts.

    **Meaning:** Renames internal fields (e.g. ``pv_mw`` → ``ov_MW``, offtake/injection costs) and
    adds half-hour GBP cashflows for site net power with and without BESS action, plus ``*_added``
    deltas. Column order matches what ``ResultsPage`` / ``bessResultsCore`` expect.

    **Used by:** Only :func:`auction_loop` (final step before CSV write).
    """
    # Base columns (rename from the internal dataframe naming).
    out = pd.DataFrame(
        {
            "timestamp_UTC": df["timestamp_UTC"],
            # "datetime_UK" is timezone-naive already (Europe/London local time).
            "timestamp_UK": df["datetime_UK"],
            # Generation column is PV in our internal model, but the UI expects "ov".
            "ov_MW": df["pv_mw"],
            "cons_MW": df["cons_mw"],
            "site_MW": df["site_MW"],
            "settlement_price": df["settlement_price"],
            # Objective uses "off_costs" for import (offtake) and "inj_costs" for export (injection).
            "export_costs": df["inj_costs"],
            "import_costs": df["off_costs"],
            "energy_mwh": df["energy_MWh"],
            # Keep percentage values as-is (UI labels it "soc").
            "soc": df["soc_pct"],
            "charge": df["charge_power_MW"],
            "discharge": df["discharge_power_MW"],
            "action": df["action_MW"],
        }
    )

    # Cashflows are computed on 30-minute intervals:
    #   cashflow [GBP] = price [GBP/MWh] * MW * 0.5h  => MW / 2.
    site_wo = out["site_MW"]
    site_w_bess = out["site_MW"] + out["action"]

    out["wholesale"] = out["settlement_price"] * site_wo / 2
    out["import"] = out["import_costs"] * np.minimum(0, site_wo) / 2
    out["export"] = out["export_costs"] * np.maximum(0, site_wo) / 2

    out["wholesale_bess"] = out["settlement_price"] * site_w_bess / 2
    out["import_bess"] = out["import_costs"] * np.minimum(0, site_w_bess) / 2
    out["export_bess"] = out["export_costs"] * np.maximum(0, site_w_bess) / 2

    # Added value = (with BESS) - (without optimisation).
    out["wholesale_added"] = out["wholesale_bess"] - out["wholesale"]
    out["import_added"] = out["import_bess"] - out["import"]
    out["export_added"] = out["export_bess"] - out["export"]

    cols = [
        "timestamp_UTC",
        "timestamp_UK",
        "ov_MW",
        "cons_MW",
        "site_MW",
        "settlement_price",
        "export_costs",
        "import_costs",
        "energy_mwh",
        "soc",
        "charge",
        "discharge",
        "action",
        "wholesale",
        "import",
        "export",
        "wholesale_bess",
        "import_bess",
        "export_bess",
        "wholesale_added",
        "import_added",
        "export_added",
    ]
    return out[cols]


def auction_loop(raw_df_auction: pd.DataFrame, ctx: BessContext) -> pd.DataFrame:
    """Rolling multi-day optimisation: for each decision day and auction, solve MILP and stitch results.

    **Meaning:** Walks unique UK ``day`` values, slices a window of ``nb_days_per_period`` days,
    keeps rows whose ``horizon_days_ahead`` matches the offset from the decision day, carries SOC
    from the previous block’s last interval into the next solve via ``energy_level_0``, and
    concatenates the “current day” slice from each solve. Drops duplicate UTC column if present,
    derives ``action_MW`` and ``soc_pct``, then exports via :func:`_format_results_for_csv`.

    **Used by:** ``run_optimisation_from_study.py`` (last pipeline step before writing ``results/*.csv``).
    """
    raw_df_auction = raw_df_auction.copy()
    raw_df_auction["day"] = (
        raw_df_auction["datetime_UK"].dt.dayofyear
        + raw_df_auction["datetime_UK"].dt.year * 366
    )

    chunks: list[pd.DataFrame] = []
    prev_tail: pd.Series | None = None
    nb = ctx.nb_days_per_period

    for day_no in raw_df_auction["day"].unique():
        for auction in ctx.auctions:
            df = raw_df_auction[
                (raw_df_auction["day"] >= day_no)
                & (raw_df_auction["day"] < day_no + nb)
                & (
                    raw_df_auction["horizon_days_ahead"]
                    == raw_df_auction["day"] - day_no + 1
                )
                & (raw_df_auction["auction"] == auction)
            ].reset_index(drop=True)
            if df.empty:
                continue

            if prev_tail is not None:
                dt = ctx.milp_params.interval_hours
                energy_level_0 = float(prev_tail["energy_MWh"]) + dt * (
                    float(prev_tail["charge_power_MW"]) * ctx.charging_efficiency
                    - float(prev_tail["discharge_power_MW"])
                    / ctx.discharging_efficiency
                )
            else:
                energy_level_0 = ctx.initial_soc * ctx.total_capacity_mwh

            temp_full = milp(df, energy_level_0, ctx.milp_params)
            sel = temp_full["day"] == day_no
            if not sel.any():
                continue
            block = temp_full.loc[sel].copy()
            chunks.append(block)
            prev_tail = block.iloc[-1]

    if not chunks:
        return pd.DataFrame()

    final_df = pd.concat(chunks, ignore_index=True)
    if UTC_COL in final_df.columns and "timestamp_UTC" in final_df.columns:
        final_df = final_df.drop(columns=[UTC_COL])
    final_df["action_MW"] = final_df["discharge_power_MW"] - final_df["charge_power_MW"]
    tc = ctx.total_capacity_mwh
    final_df["soc_pct"] = (final_df["energy_MWh"] / tc) * 100.0
    return _format_results_for_csv(final_df)
