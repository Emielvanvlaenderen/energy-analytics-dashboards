"""V2G wholesale + DUoS MILP (PuLP + CBC) with flex-band charge/discharge split."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import pulp as pl


@dataclass(frozen=True)
class V2gMilpParams:
    energy_bess: float
    max_power_bess: float
    allow_v2g_discharge: bool
    min_soc: float
    max_soc: float
    target_soc: float
    charging_eff: float
    discharging_eff: float
    max_site_import: float
    max_site_export: float
    interval_hours: float = 0.5


def _solver():
    return pl.PULP_CBC_CMD(msg=False, timeLimit=3600)


def _cap_charge_mw(site_mw: float, p: V2gMilpParams) -> float:
    cap = p.max_power_bess
    cap = min(cap, max(0.0, p.max_site_import - max(0.0, -site_mw)))
    return cap


def _cap_discharge_mw(site_mw: float, p: V2gMilpParams) -> float:
    cap = p.max_power_bess if p.allow_v2g_discharge else 0.0
    cap = min(cap, max(0.0, p.max_site_export - site_mw))
    return cap


def milp(df: pd.DataFrame, energy_level_0: float, params: V2gMilpParams) -> pd.DataFrame:
    """Maximise wholesale + DUoS using four flex-band pieces per interval (c1, c2, d1, d2)."""
    cap = params.energy_bess
    pmax = params.max_power_bess
    min_soc = params.min_soc
    max_soc = params.max_soc
    target_soc = params.target_soc
    eta_c = params.charging_eff
    eta_d = params.discharging_eff
    dt_h = params.interval_hours
    n = len(df)

    prob = pl.LpProblem("V2G_MILP", pl.LpMaximize)
    e = {
        i: pl.LpVariable(
            f"e_{i}",
            lowBound=cap * min_soc,
            upBound=cap * max_soc,
        )
        for i in range(n)
    }
    c1, c2, d1, d2 = {}, {}, {}, {}

    for i in range(n):
        avail = float(df.iloc[i]["bess_available"])
        if avail < 0.5:
            ub_c1 = ub_c2 = ub_d1 = ub_d2 = 0.0
        else:
            sm = float(df.iloc[i]["site_mw"])
            cap_ch = _cap_charge_mw(sm, params)
            cap_dis = _cap_discharge_mw(sm, params)
            ub_c1 = min(max(sm, 0.0), cap_ch)
            ub_c2 = cap_ch - ub_c1
            ub_d1 = min(max(-sm, 0.0), cap_dis)
            ub_d2 = cap_dis - ub_d1
        c1[i] = pl.LpVariable(f"c1_{i}", lowBound=0, upBound=ub_c1)
        c2[i] = pl.LpVariable(f"c2_{i}", lowBound=0, upBound=ub_c2)
        d1[i] = pl.LpVariable(f"d1_{i}", lowBound=0, upBound=ub_d1)
        d2[i] = pl.LpVariable(f"d2_{i}", lowBound=0, upBound=ub_d2)

    def ch(i):
        return c1[i] + c2[i]

    def dis(i):
        return d1[i] + d2[i]

    s_target = pl.LpVariable("s_target", lowBound=0)

    prob += e[0] == energy_level_0
    prob += ch(n - 1) == 0
    prob += dis(n - 1) == 0
    prob += e[n - 1] + s_target >= target_soc * cap

    for i in range(n - 1):
        prob += e[i + 1] == e[i] + ch(i) * eta_c * dt_h - dis(i) / eta_d * dt_h
        prob += dis(i) + ch(i) <= pmax

    max_cycle_per_day = 1.5
    throughput = pl.lpSum(
        ch(i) * eta_c * dt_h + dis(i) / eta_d * dt_h for i in range(n)
    )
    prob += throughput <= max_cycle_per_day * 2 * cap * (n * dt_h / 24.0)

    obj = dt_h * pl.lpSum(
        -(df.iloc[i]["settlement_price"] - df.iloc[i]["export_charge"]) * c1[i]
        - (df.iloc[i]["settlement_price"] + df.iloc[i]["import_charge"]) * c2[i]
        + (df.iloc[i]["settlement_price"] + df.iloc[i]["import_charge"]) * d1[i]
        + (df.iloc[i]["settlement_price"] - df.iloc[i]["export_charge"]) * d2[i]
        for i in range(n)
    )
    prob += obj - s_target * 1e6

    status = prob.solve(_solver())
    if status != pl.LpStatusOptimal:
        raise RuntimeError(f"V2G optimisation failed (PuLP status {pl.LpStatus[status]})")

    def _v(x: pl.LpVariable) -> float:
        v = pl.value(x)
        if v is None:
            raise RuntimeError("Missing variable value after solve.")
        return float(v)

    out = df.copy()
    out["energy_MWh"] = [_v(e[i]) for i in range(n)]
    out["charge_power_MW"] = [_v(ch(i)) for i in range(n)]
    out["discharge_power_MW"] = [_v(dis(i)) for i in range(n)]
    out["action_MW"] = out["discharge_power_MW"] - out["charge_power_MW"]
    out["soc_percent"] = np.where(cap > 0, out["energy_MWh"] / cap * 100.0, 0.0)
    return out


def optimizer_end_energy(last_row: pd.Series, params: V2gMilpParams, dt_h: float = 0.5) -> float:
    eta_c = params.charging_eff
    eta_d = params.discharging_eff
    cap = params.energy_bess
    e_s = float(last_row["energy_MWh"])
    ch = float(last_row["charge_power_MW"])
    dis = float(last_row["discharge_power_MW"])
    e_end = e_s + eta_c * ch * dt_h - dis / eta_d * dt_h
    return float(np.clip(e_end, cap * params.min_soc, cap * params.max_soc))
