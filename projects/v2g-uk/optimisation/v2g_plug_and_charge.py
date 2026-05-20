"""Plug-and-charge baseline: greedy charge to target SoC while plugged in, no V2G discharge."""

from __future__ import annotations

import numpy as np
import pandas as pd

from v2g_milp import V2gMilpParams


def simulate_plug_and_charge(
    df: pd.DataFrame, energy_level_0: float, params: V2gMilpParams
) -> tuple[pd.DataFrame, float]:
    cap = params.energy_bess
    pmax = params.max_power_bess
    min_soc = params.min_soc
    max_soc = params.max_soc
    eta_c = params.charging_eff
    eta_d = params.discharging_eff
    dt_h = params.interval_hours
    target_e = params.target_soc * cap

    e = float(energy_level_0)
    plug_energy = []
    plug_action = []
    plug_soc = []

    max_imp = params.max_site_import
    max_exp = params.max_site_export

    for i in range(len(df)):
        avail = float(df.iloc[i]["bess_available"])
        site_i = float(df.iloc[i]["site_mw"])
        ch = 0.0
        dis = 0.0
        if avail >= 0.5 and e < target_e - 1e-12:
            need_rate = (target_e - e) / (eta_c * dt_h) if eta_c * dt_h > 1e-18 else 0.0
            ch_try = min(pmax, max(0.0, need_rate))
            ch_cap_site = site_i + max_imp
            ch_lb = max(0.0, site_i - max_exp)
            ch = float(max(ch_lb, min(ch_try, ch_cap_site)))

        plug_energy.append(e)
        plug_action.append(dis - ch)
        plug_soc.append(e / cap * 100.0 if cap > 0 else 0.0)

        e = e + eta_c * ch * dt_h - (dis / eta_d) * dt_h
        e = float(np.clip(e, cap * min_soc, cap * max_soc))

    out = pd.DataFrame(
        {
            "plugplay_energy_MWh": plug_energy,
            "plugplay_action_MW": plug_action,
            "plugplay_soc_percent": plug_soc,
        }
    )
    return out, e
