# V2G charging (UK)

Vehicle-to-grid wholesale optimisation with a **plug-and-charge** baseline.

## Workflow (same steps as C&I BESS)

1. **Grid tariffs** — DUoS bands and charges (`data/site_import_charges_timeseries.csv`, etc.)
2. **Site data** — consumption / PV half-hourly CSVs
3. **V2G simulation** — plug-in schedule (half-hour × weekday), return/target SoC, battery limits
4. **Results** — SoC, added value vs plug-and-charge, site flows

## Optimisation

PuLP + CBC (`optimisation/v2g_pipeline.py`, `v2g_milp.py`, `v2g_plug_and_charge.py`).

Each **plugged-in session** is optimised separately; SoC resets to **return SoC** at arrival and should meet **target SoC** before unplugging.

```
data/
optimisation/   — study_inputs.json, Python pipeline
results/        — CSV outputs
```
