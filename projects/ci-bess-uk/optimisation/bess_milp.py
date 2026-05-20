"""BESS wholesale MILP via PuLP + CBC.

Power variables are MW (average over the interval). Energy change over one
interval is ``interval_hours * (η_ch * P_charge - P_discharge / η_dis)`` MWh
(e.g. ``interval_hours=0.5`` for half-hourly series).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import pandas as pd
import pulp as pl


@dataclass(frozen=True)
class BessMilpParams:
    total_capacity_mwh: float
    minimum_soc: float
    maximum_soc: float
    initial_soc: float
    charging_efficiency: float
    discharging_efficiency: float
    max_abs_power_mw: float
    max_cycle_per_day: float
    nb_days_per_period: int
    #: Site connection limit (MW); if set, tightens max **charge** per interval vs net import.
    max_import_mw: Optional[float] = None
    #: Site connection limit (MW); if set, tightens max **discharge** per interval vs net export.
    max_export_mw: Optional[float] = None
    #: Length of each timestep in hours (0.5 for GB half-hourly data).
    interval_hours: float = 0.5


def _cap_charge_mw(site_mw: float, p: BessMilpParams) -> float:
    """Max allowable **charge** power (MW) this interval after inverter + import-connection headroom.

    **Meaning:** Starts at ``max_abs_power_mw``; if ``max_import_mw`` is set, caps charge so that
    extra import from charging does not exceed remaining import capacity given baseline site import
    ``max(0, -site_mw)``.
    """
    cap = p.max_abs_power_mw
    if p.max_import_mw is not None:
        # Room left on the import connection: mi - current_import, current_import = max(0, -site_mw).
        cap = min(cap, max(0.0, p.max_import_mw - max(0.0, -site_mw)))
    return cap


def _cap_discharge_mw(site_mw: float, p: BessMilpParams) -> float:
    """Max allowable **discharge** power (MW) after inverter + export-connection headroom.

    **Meaning:** Starts at ``max_abs_power_mw``; if ``max_export_mw`` is set, caps discharge so total
    site export ``site_mw + discharge`` does not exceed ``max_export_mw`` (headroom
    ``max(0, max_export_mw - site_mw)``).
    """
    cap = p.max_abs_power_mw
    if p.max_export_mw is not None:
        # Remaining export capacity: me - site_MW (clamp at 0); matches user spec vs site_MW directly.
        cap = min(cap, max(0.0, p.max_export_mw - site_mw))
    return cap


def _solver():
    """PuLP solver instance (CBC binary). Keeps logs quiet and sets a wall-clock limit.
    """
    return pl.PULP_CBC_CMD(msg=False, timeLimit=3600)


def milp(df: pd.DataFrame, energy_level_0: float, p: BessMilpParams) -> pd.DataFrame:
    """Solve the linear program: choose charge/discharge each interval to maximise wholesale value.

    **Meaning:** State ``E[i]`` is stored energy (MWh). Charge/discharge are split into four
    nonnegative variables per interval (``c1``, ``c2``, ``d1``, ``d2``) so the objective can
    separate wholesale + injection vs offtake + export price components (using ``forecast_price``,
    ``inj_costs``, ``off_costs`` from ``df``). Enforces energy balance, terminal SOC tying to
    ``initial_soc``, a sum cap on charge+discharge power, and a total **throughput** limit via
    ``max_cycle_per_day`` × horizon. Returns the input rows plus optimised ``energy_MWh``,
    ``charge_power_MW``, ``discharge_power_MW``.

    **Used by:** Only ``bess_pipeline.auction_loop`` (each rolling-horizon block).
    """
    n = len(df)
    tc = p.total_capacity_mwh
    prob = pl.LpProblem("BESS_MILP", pl.LpMaximize)

    E = {
        i: pl.LpVariable(
            f"E_{i}",
            lowBound=tc * p.minimum_soc,
            upBound=tc * p.maximum_soc,
        )
        for i in range(n)
    }
    c1, c2, d1, d2 = {}, {}, {}, {}
    for i in range(n):
        sm = float(df.site_MW.iat[i])
        cap_ch = _cap_charge_mw(sm, p)
        cap_dis = _cap_discharge_mw(sm, p)
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

    ce = p.charging_efficiency
    de = p.discharging_efficiency
    dt = p.interval_hours

    # Energy balance over interval dt (hours): ΔE = dt * (η_ch * P_ch - P_dis / η_dis) [MWh]
    def delta_e(i):
        return dt * (ce * ch(i) - dis(i) / de)

    prob += E[0] == energy_level_0
    prob += ch(n - 1) == 0
    prob += dis(n - 1) == 0
    prob += ch(n - 1) == (p.initial_soc * tc - E[n - 1]) / (ce * dt)
    prob += dis(n - 1) == (E[n - 1] - p.initial_soc * tc) * de / dt

    for i in range(1, n):
        prob += E[i] - E[i - 1] == delta_e(i - 1)
        prob += dis(i - 1) + ch(i - 1) <= p.max_abs_power_mw

    prob += (
        (
            pl.lpSum(ch(i) for i in range(n)) / ce
            + pl.lpSum(dis(i) * de for i in range(n))
        )
        * dt
        <= p.max_cycle_per_day * 2 * tc * p.nb_days_per_period
    )

    # Objective: prices £/MWh × energy MWh per interval = £/MWh × MW × dt
    obj = dt * pl.lpSum(
        -(df.forecast_price.iat[i] - df.inj_costs.iat[i]) * c1[i]
        - (df.forecast_price.iat[i] + df.off_costs.iat[i]) * c2[i]
        + (df.forecast_price.iat[i] + df.off_costs.iat[i]) * d1[i]
        + (df.forecast_price.iat[i] - df.inj_costs.iat[i]) * d2[i]
        for i in range(n)
    )
    prob += obj

    prob.solve(_solver())
    status = pl.LpStatus[prob.status]
    if status != "Optimal":
        raise RuntimeError(
            f"PuLP/CBC did not find an optimal solution (status={status})."
        )

    def _v(x: pl.LpVariable) -> float:
        v = pl.value(x)
        if v is None:
            raise RuntimeError("Missing variable value after solve.")
        return float(v)

    energy_df = pd.DataFrame({"energy_MWh": [_v(E[i]) for i in range(n)]})
    charge_power_mw = [_v(ch(i)) for i in range(n)]
    discharge_power_mw = [_v(dis(i)) for i in range(n)]
    charge_power_df = pd.DataFrame({"charge_power_MW": charge_power_mw})
    discharge_power_df = pd.DataFrame({"discharge_power_MW": discharge_power_mw})

    return pd.concat(
        [df.reset_index(drop=True), energy_df, charge_power_df, discharge_power_df],
        axis=1,
    )
