"""V2G data load + plug-session optimisation loop (PuLP + CBC)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from v2g_milp import V2gMilpParams, milp, optimizer_end_energy
from v2g_plug_and_charge import simulate_plug_and_charge

UTC_COL = "Datetime (UTC)"
LOCAL_TZ = "Europe/London"
WEEKDAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


@dataclass
class V2gContext:
    study: dict
    v2g: dict
    params: V2gMilpParams
    start_date: str
    end_date: str


def _parse_pct(v, default: float) -> float:
    x = float(v)
    return x / 100.0 if x > 1.0 else x


def schedule_long_df(v2g_schedule: dict) -> pd.DataFrame:
    """Convert UI schedule matrix to long form (weekday_name, hhmm, value in|out)."""
    rows = v2g_schedule.get("rows") or []
    long_rows = []
    for row in rows:
        hhmm = str(row.get("hhmm", "")).strip()
        if not hhmm:
            continue
        for day in WEEKDAYS:
            v = str(row.get(day, "out")).strip().lower()
            if v not in ("in", "out"):
                v = "in" if v in ("yes", "1", "true", "plugged") else "out"
            long_rows.append({"weekday_name": day, "hhmm": hhmm, "value": v})
    return pd.DataFrame(long_rows)


def duos_rates_from_study(study: dict) -> dict:
    gt = study.get("gridTariffs") or {}
    duos = gt.get("duos") or {}
    ne = float(gt.get("importNonEnergy") or 0)

    def band_rate(colour: str, direction: str) -> float:
        cell = duos.get(colour) or {}
        raw = cell.get(direction, 0)
        try:
            return float(raw)
        except (TypeError, ValueError):
            return 0.0

    return {
        "non_energy_costs": ne,
        "duos_import_green": band_rate("green", "import"),
        "duos_import_amber": band_rate("amber", "import"),
        "duos_import_red": band_rate("red", "import"),
        "duos_export_green": band_rate("green", "export"),
        "duos_export_amber": band_rate("amber", "export"),
        "duos_export_red": band_rate("red", "export"),
    }


def band_matrix_long(study: dict) -> pd.DataFrame:
    bm = study.get("gridTariffs", {}).get("bandMatrix")
    if not bm or len(bm) != 2:
        raise ValueError("gridTariffs.bandMatrix must have weekday and weekend rows.")
    weekday_row, weekend_row = bm
    long_rows = []
    for slot_i in range(48):
        hh = slot_i // 2
        mm = "00" if slot_i % 2 == 0 else "30"
        hhmm = f"{hh:02d}:{mm}"
        for day in WEEKDAYS[:5]:
            long_rows.append(
                {
                    "weekday_name": day,
                    "hhmm": hhmm,
                    "duos_band": str(weekday_row[slot_i]).lower(),
                }
            )
        for day in WEEKDAYS[5:]:
            long_rows.append(
                {
                    "weekday_name": day,
                    "hhmm": hhmm,
                    "duos_band": str(weekend_row[slot_i]).lower(),
                }
            )
    return pd.DataFrame(long_rows)


def load_context(study_path: Path) -> V2gContext:
    with open(study_path, encoding="utf-8") as f:
        study = json.load(f)
    v2g = study["v2gSimulationCommitted"]
    limits = study.get("siteImportExportLimitsMw") or {}

    sim_type = str(v2g.get("simulationType", "V2G")).lower()
    allow_v2g = "smart" not in sim_type

    params = V2gMilpParams(
        energy_bess=float(v2g["energyBessMwh"]),
        max_power_bess=float(v2g["maxPowerBessMw"]),
        allow_v2g_discharge=allow_v2g,
        min_soc=_parse_pct(v2g["socLowerPct"], 0.2),
        max_soc=_parse_pct(v2g["socUpperPct"], 0.9),
        target_soc=_parse_pct(v2g["targetSocPct"], 0.9),
        charging_eff=_parse_pct(v2g["chargingEfficiencyPct"], 0.9),
        discharging_eff=_parse_pct(v2g["dischargingEfficiencyPct"], 0.9),
        max_site_import=float(limits.get("maxImportMw", v2g.get("maxSiteImportMw", 9999))),
        max_site_export=float(limits.get("maxExportMw", v2g.get("maxSiteExportMw", 9999))),
    )

    return V2gContext(
        study=study,
        v2g=v2g,
        params=params,
        start_date=v2g["startDate"],
        end_date=v2g["endDate"],
    )


def load_site_mw(data_dir: Path) -> pd.DataFrame:
    """Net site MW from PV − consumption CSVs (same layout as C&I BESS)."""
    pv_path = data_dir / "site_pv_generation_synthetic_mw.csv"
    cons_path = data_dir / "site_consumption_constant_mw.csv"
    if not pv_path.is_file() or not cons_path.is_file():
        raise FileNotFoundError(
            "Missing site_pv_generation_synthetic_mw.csv or site_consumption_constant_mw.csv in data/"
        )
    pv = pd.read_csv(pv_path)
    cons = pd.read_csv(cons_path)
    for df in (pv, cons):
        df[UTC_COL] = pd.to_datetime(df[UTC_COL], utc=True)
    pv = pv.rename(columns={"Power (MW)": "pv_mw"})
    cons = cons.rename(columns={"Power (MW)": "cons_mw"})
    m = pv[[UTC_COL, "pv_mw"]].merge(cons[[UTC_COL, "cons_mw"]], on=UTC_COL, how="inner")
    m["site_mw"] = m["pv_mw"] - m["cons_mw"]
    return m[[UTC_COL, "site_mw"]].rename(columns={UTC_COL: "timestamp_utc"})


def load_day_ahead_gbp(data_dir: Path, fx: float = 0.85) -> pd.DataFrame:
    da_path = data_dir / "day-ahead-prices.csv"
    if not da_path.is_file():
        raise FileNotFoundError("Missing day-ahead-prices.csv in data/")
    da = pd.read_csv(da_path)
    da[UTC_COL] = pd.to_datetime(da[UTC_COL], utc=True)
    price_col = "Price (EUR/MWhe)" if "Price (EUR/MWhe)" in da.columns else da.columns[-1]
    da = da.rename(columns={UTC_COL: "timestamp_utc", price_col: "da_eur_mwh"})
    da["hour_key"] = da["timestamp_utc"].dt.floor("h")
    da_h = da.groupby("hour_key", as_index=False)["da_eur_mwh"].first()
    da_h["settlement_price"] = da_h["da_eur_mwh"] * fx
    return da_h[["hour_key", "settlement_price"]]


def build_simulation_table(ctx: V2gContext, data_dir: Path) -> pd.DataFrame:
    v2g = ctx.v2g
    study = ctx.study
    rates = duos_rates_from_study(study)

    start = pd.Timestamp(f"{ctx.start_date} 00:00:00", tz="UTC")
    end = pd.Timestamp(f"{ctx.end_date} 23:30:00", tz="UTC")
    idx = pd.date_range(start=start, end=end, freq="30min", tz="UTC")
    sim = pd.DataFrame({"timestamp_utc": idx})
    sim["datetime_UK"] = sim["timestamp_utc"].dt.tz_convert(LOCAL_TZ)
    sim["weekday_name"] = sim["datetime_UK"].dt.day_name().str.lower()
    sim["hhmm"] = sim["datetime_UK"].dt.strftime("%H:%M")

    duos_long = band_matrix_long(study)
    sim = sim.merge(duos_long, on=["weekday_name", "hhmm"], how="left")
    sim["duos_band"] = sim["duos_band"].fillna("green").str.lower()

    v2g_long = schedule_long_df(study.get("v2gSchedule") or {})
    if len(v2g_long):
        sim = sim.merge(
            v2g_long.rename(columns={"value": "v2g_flag"}),
            on=["weekday_name", "hhmm"],
            how="left",
        )
    else:
        sim["v2g_flag"] = "in"
    sim["bess_available"] = sim["v2g_flag"].fillna("out").astype(str).str.lower().eq("in").astype(int)

    import_map = {
        "green": rates["duos_import_green"],
        "amber": rates["duos_import_amber"],
        "red": rates["duos_import_red"],
    }
    export_map = {
        "green": rates["duos_export_green"],
        "amber": rates["duos_export_amber"],
        "red": rates["duos_export_red"],
    }
    sim["import_charge"] = (
        sim["duos_band"].map(import_map).fillna(rates["duos_import_green"])
        + rates["non_energy_costs"]
    )
    sim["export_charge"] = sim["duos_band"].map(export_map).fillna(rates["duos_export_green"])

    site = load_site_mw(data_dir)
    prices = load_day_ahead_gbp(data_dir, float(study.get("fxGbpPerEur", 0.85)))

    sim = sim.merge(site, on="timestamp_utc", how="left")
    sim["hour_key"] = sim["timestamp_utc"].dt.floor("h")
    sim = sim.merge(prices, on="hour_key", how="left")
    sim["site_mw"] = sim["site_mw"].fillna(0.0)
    sim["forecast_price"] = sim["settlement_price"].ffill().bfill()
    sim["settlement_price"] = sim["forecast_price"]

    return sim[
        [
            "timestamp_utc",
            "datetime_UK",
            "forecast_price",
            "settlement_price",
            "import_charge",
            "export_charge",
            "site_mw",
            "bess_available",
        ]
    ]


def run_plug_session_loop(raw_df: pd.DataFrame, ctx: V2gContext) -> pd.DataFrame:
    """Optimise each contiguous plugged-in session; baseline = plug-and-charge."""
    params = ctx.params
    raw_df = raw_df.sort_values("timestamp_utc").reset_index(drop=True)
    n = len(raw_df)
    if n == 0:
        return pd.DataFrame()

    avail_arr = raw_df["bess_available"].astype(float).to_numpy()
    dt_h = params.interval_hours
    cap = params.energy_bess
    e_return = _parse_pct(ctx.v2g["returnSocPct"], 0.3) * cap

    carry_opt = e_return
    carry_pp = e_return
    rows_out = []
    i = 0

    while i < n:
        if avail_arr[i] < 0.5:
            r = raw_df.iloc[i].to_dict()
            r["charge_power_MW"] = 0.0
            r["discharge_power_MW"] = 0.0
            r["action_MW"] = 0.0
            r["energy_MWh"] = carry_opt
            r["soc_percent"] = carry_opt / cap * 100.0 if cap > 0 else 0.0
            r["plugplay_action_MW"] = 0.0
            r["plugplay_energy_MWh"] = carry_pp
            r["plugplay_soc_percent"] = carry_pp / cap * 100.0 if cap > 0 else 0.0
            r["added_value_wholesale"] = 0.0
            r["added_value_import"] = 0.0
            r["added_value_export"] = 0.0
            rows_out.append(r)
            i += 1
        else:
            j = i
            while j < n and avail_arr[j] >= 0.5:
                j += 1
            dfp = raw_df.iloc[i:j].reset_index(drop=True)

            solved = milp(dfp, e_return, params)
            pp_side, carry_pp = simulate_plug_and_charge(dfp, e_return, params)

            solved["plugplay_action_MW"] = pp_side["plugplay_action_MW"].values
            solved["plugplay_energy_MWh"] = pp_side["plugplay_energy_MWh"].values
            solved["plugplay_soc_percent"] = pp_side["plugplay_soc_percent"].values

            da = solved["settlement_price"]
            imp = solved["import_charge"]
            exp_ch = solved["export_charge"]
            site = solved["site_mw"]
            site_opt = site + solved["action_MW"]
            site_pp = site + solved["plugplay_action_MW"]

            solved["added_value_wholesale"] = da * (site_opt - site_pp) * dt_h
            solved["added_value_import"] = imp * (
                np.minimum(0.0, site_opt) - np.minimum(0.0, site_pp)
            ) * dt_h
            solved["added_value_export"] = (-exp_ch) * (
                np.maximum(0.0, site_opt) - np.maximum(0.0, site_pp)
            ) * dt_h

            for k in range(len(solved)):
                rows_out.append(solved.iloc[k].to_dict())

            carry_opt = optimizer_end_energy(solved.iloc[-1], params, dt_h)
            i = j

    out = pd.DataFrame(rows_out)
    out["added_value_total"] = (
        out["added_value_wholesale"]
        + out["added_value_import"]
        + out["added_value_export"]
    )
    return out
