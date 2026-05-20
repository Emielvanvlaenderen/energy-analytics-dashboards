import { BRAND, BRAND_ACCENT, BRAND_ACCENT_MUTED } from './brand'
import { FlexbandSchematic } from './FlexbandSchematic'

const ext = { target: '_blank', rel: 'noopener noreferrer' }

/** Schematic: one plugged-in session with return SoC, target, and optional V2G discharge. */
function PlugSessionSchematic() {
  const yAxis = 88
  const x0 = 48
  const x1 = 512
  const socH = 72

  return (
    <figure className="methodology-page__figure">
      <svg viewBox="0 0 560 200" role="img" aria-labelledby="plug-title plug-desc">
        <title id="plug-title">Plugged-in session: SoC and dispatch</title>
        <desc id="plug-desc">
          Timeline showing vehicle away, then plugged in with state of charge resetting to return level,
          optimisation within the session, and target SoC before unplugging.
        </desc>

        <text x="8" y="18" fill="#52525b" fontSize="12" fontWeight="700">
          One plugged-in session (schematic)
        </text>

        {/* Away */}
        <rect x={x0} y={yAxis - 8} width={72} height={16} fill="#f3f4f6" stroke="#d4d4d8" rx={3} />
        <text x={x0 + 36} y={yAxis + 4} fill="#71717a" fontSize="9" textAnchor="middle">
          Away (out)
        </text>

        {/* Plugged in block */}
        <rect
          x={x0 + 80}
          y={yAxis - 28}
          width={x1 - x0 - 100}
          height={56}
          fill={BRAND_ACCENT_MUTED}
          opacity={0.35}
          stroke={BRAND_ACCENT}
          strokeWidth={1.2}
          rx={4}
        />
        <text x={x0 + 100} y={yAxis - 14} fill={BRAND_ACCENT} fontSize="10" fontWeight="700">
          Plugged in — one MILP solved for this block
        </text>

        {/* SoC curve */}
        <path
          d={`M ${x0 + 88} ${yAxis + socH - 8}
              L ${x0 + 120} ${yAxis + 20}
              Q ${x0 + 200} ${yAxis - 4} ${x0 + 280} ${yAxis + 12}
              Q ${x0 + 360} ${yAxis + 28} ${x1 - 48} ${yAxis + 8}`}
          fill="none"
          stroke={BRAND_ACCENT}
          strokeWidth="2.5"
        />
        <circle cx={x0 + 120} cy={yAxis + 20} r={4} fill={BRAND_ACCENT} />
        <text x={x0 + 120} y={yAxis + 36} fill={BRAND_ACCENT} fontSize="8.5" textAnchor="middle">
          Return SoC
        </text>
        <circle cx={x1 - 48} cy={yAxis + 8} r={4} fill={BRAND_ACCENT} />
        <text x={x1 - 48} y={yAxis - 6} fill={BRAND_ACCENT} fontSize="8.5" textAnchor="middle">
          Target SoC
        </text>

        <text x={x0 + 200} y={yAxis + 48} fill="#52525b" fontSize="9" textAnchor="middle">
          Charge / discharge only while plugged in; no action when away
        </text>
      </svg>
      <figcaption className="methodology-page__figcaption">
        Each contiguous block of “plugged in” half-hours is optimised separately. State of charge is set to
        the <strong>return</strong> level at the start of the block and must reach at least the{' '}
        <strong>target</strong> by the last interval before the vehicle leaves.
      </figcaption>
    </figure>
  )
}

export function V2gMethodology() {
  return (
    <div className="inputs-page methodology-page" id="methodology">
      <header className="page-head">
        <p className="page-head__eyebrow">{BRAND.tagline}</p>
        <h1 className="page-head__title">Methodology</h1>
        <p className="page-head__lead">
          This simulator estimates <strong>vehicle-to-grid (V2G) economics</strong> for UK charge points and
          depots behind the meter. You define when the vehicle is plugged in, grid tariffs and site load, then
          compare an optimised schedule against a <strong>plug-and-charge</strong> baseline that only charges
          to the departure target.
        </p>
      </header>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">1. Key assumptions</h2>
        <p className="methodology-page__p">
          The tool is for <strong>scenario comparison and business cases</strong>, not real-time fleet
          control. Main modelling choices:
        </p>
        <ul className="methodology-page__list">
          <li>
            <strong>Known plug-in schedule.</strong> You fix which half-hours the vehicle is at the charger
            (the V2G schedule matrix). The optimiser does not choose arrival or departure times.
          </li>
          <li>
            <strong>Session-based state of charge.</strong> At the start of each continuous plugged-in period,
            energy resets to the <strong>return SoC</strong> you enter. Between sessions the model does not
            carry SoC while the vehicle is away.
          </li>
          <li>
            <strong>Perfect foresight on day-ahead prices.</strong> Within each session, settlement prices are
            taken from the published day-ahead series, not from forecasts. That tends to overstate value versus
            gate-closure decisions in the real world.
          </li>
          <li>
            <strong>Deterministic site profile.</strong> Net site power (PV minus load) follows a single
            half-hourly trajectory. There is no uncertainty on when the driver needs the car or on site demand.
          </li>
          <li>
            <strong>Fixed DUoS and import add-ons.</strong> Time-of-use bands and £/MWh charges from the grid-tariffs
            step are known for every interval. Other pass-through costs are only included if you model them in
            those inputs.
          </li>
          <li>
            <strong>Linear vehicle battery.</strong> Capacity, power limits, efficiencies, and SoC bounds are
            enforced in a MILP. No degradation, auxiliary load, or charger downtime.
          </li>
          <li>
            <strong>No rolling multi-day horizon.</strong> Unlike the C&amp;I BESS simulator, each plugged-in
            block is solved in one shot over that block only (no three-day rolling window).
          </li>
        </ul>
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">2. Data sources</h2>
        <ul className="methodology-page__list">
          <li>
            <strong>Wholesale / settlement prices.</strong> GB day-ahead electricity prices from{' '}
            <a href="https://ember-energy.org/" {...ext}>
              Ember
            </a>
            , mapped to half-hours and converted to £/MWh (FX rate in{' '}
            <code>study_inputs.json</code>, default 0.85 £/€).
          </li>
          <li>
            <strong>Solar yield shape.</strong> National PV profile from the{' '}
            <a href="https://www.solar.sheffield.ac.uk/api/" {...ext}>
              PV_Live API (Sheffield Solar)
            </a>
            , scaled to installed capacity when you generate a synthetic PV series.
          </li>
          <li>
            <strong>Site load and generation.</strong> Half-hourly CSVs under <code>projects/v2g-uk/data/</code>{' '}
            (uploaded or constant-MW placeholders). Net site power is{' '}
            <code>site_mw = PV − consumption</code> at the connection point.
          </li>
          <li>
            <strong>Grid tariffs.</strong> DUoS green / amber / red bands (weekday vs weekend matrix) and
            import non-energy charges expand to per-interval <code>import_charge</code> and{' '}
            <code>export_charge</code> in the simulation table.
          </li>
          <li>
            <strong>Vehicle and study settings.</strong> Plug-in schedule, battery size, SoC limits, return and
            target SoC, efficiencies, dates, site import/export limits, and simulation type (V2G vs smart
            charging) are stored in <code>optimisation/study_inputs.json</code>.
          </li>
        </ul>
        <p className="methodology-page__p">
          The React UI, Node API, and Python optimiser run locally; outputs are written under{' '}
          <code>projects/v2g-uk/results/</code>.
        </p>
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">3. App workflow</h2>
        <p className="methodology-page__p">
          Typical path through the V2G UK platform:
        </p>
        <ol className="methodology-page__steps">
          <li>
            <strong>Grid tariffs</strong> — DUoS band matrix and £/MWh import/export add-ons by colour band.
          </li>
          <li>
            <strong>Site data</strong> — consumption and PV (CSV upload or synthetic), plus connection import/export
            limits.
          </li>
          <li>
            <strong>V2G schedule</strong> — which half-hours the vehicle is plugged in (rows = weekdays, columns =
            times). Multi-select, fill, and paste work like the DUoS matrix.
          </li>
          <li>
            <strong>V2G simulation</strong> — battery parameters, return/target SoC, study dates, and run the
            optimiser.
          </li>
          <li>
            <strong>Results</strong> — SoC and site flows versus plug-and-charge, and cumulative added value.
          </li>
        </ol>
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">4. Plug-in sessions</h2>
        <p className="methodology-page__p">
          The schedule marks each half-hour as <strong>in</strong> (plugged in) or <strong>out</strong> (away).
          The pipeline finds <strong>contiguous “in” blocks</strong> in time order. For each block it:
        </p>
        <ul className="methodology-page__list">
          <li>
            Sets initial stored energy to <strong>return SoC × battery energy (MWh)</strong>.
          </li>
          <li>
            Runs a MILP over only those intervals (charge and discharge allowed only when{' '}
            <code>bess_available = 1</code>).
          </li>
          <li>
            Requires final energy ≥ <strong>target SoC × capacity</strong> (soft penalty if infeasible).
          </li>
          <li>
            Forces zero charge and discharge in the last interval of the block (clean unplug).
          </li>
        </ul>
        <p className="methodology-page__p">
          When the vehicle is away, charge, discharge, and added value are zero; SoC shown in results is the
          last level carried from the previous session (not a driver-side model while parked elsewhere).
        </p>
        <PlugSessionSchematic />
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">5. Optimisation model (PuLP + CBC)</h2>
        <p className="methodology-page__p">
          For each plugged-in session the model is the same <strong>linear program structure as the C&amp;I
          BESS simulator</strong>: PuLP + CBC, with charge and discharge split into four non-negative flex-band
          pieces per half-hour so wholesale and DUoS import/export add-ons are priced correctly.
        </p>

        <h3 className="methodology-page__h3">Physical constraints</h3>
        <p className="methodology-page__p">
          The vehicle battery is a bucket of energy with your entered capacity (MWh). Each step stays between
          min and max SoC. Charging and discharging are limited by the inverter rating and by site import and
          export limits at the connection. Round-trip efficiencies link power (MW) to energy (MWh) over each
          30-minute step. A throughput cap limits how much energy can cycle over the session. At the start of
          each plugged-in block, stored energy is set to <strong>return SoC</strong>; by the last interval it
          must reach at least <strong>target SoC</strong>, with zero charge and discharge on unplug.
        </p>

        <h3 className="methodology-page__h3">Flex band: why four pieces, and which price applies</h3>
        <p className="methodology-page__p">
          At the meter, <strong>net site power</strong> is PV minus load before the vehicle acts. The charger
          can import or export on top of that. A megawatt of charging can either <strong>eat into export</strong>{' '}
          (power you would have sent out) or <strong>add import</strong>. Discharge can{' '}
          <strong>reduce import</strong> or <strong>add export</strong>. Import and export face different DUoS
          add-ons, so the model splits charge and discharge into <strong>four non-negative parts</strong> per
          interval:
        </p>
        <ul className="methodology-page__list">
          <li>
            <strong>c1</strong> — charge that uses spare export headroom (priced with settlement minus export
            add-on).
          </li>
          <li>
            <strong>c2</strong> — additional import from charging (settlement plus import add-on).
          </li>
          <li>
            <strong>d1</strong> — discharge that reduces import (settlement plus import add-on).
          </li>
          <li>
            <strong>d2</strong> — additional export from discharge (settlement minus export add-on).
          </li>
        </ul>
        <p className="methodology-page__p">
          Upper bounds on each piece come from net site power and the connection limits, exactly as in the BESS
          model. When the vehicle is not plugged in, all four are forced to zero. In{' '}
          <strong>smart charging</strong> mode, discharge pieces are capped at zero (no V2G export).
        </p>
        <FlexbandSchematic title="Flex bands — bidirectional charger (schematic MW along the horizontal axis)" />

        <h3 className="methodology-page__h3">Objective and session scope</h3>
        <p className="methodology-page__p">
          Within each plugged-in block the MILP <strong>maximises</strong> the sum over half-hours of those
          four terms (each multiplied by 0.5 h), using <code>settlement_price</code>,{' '}
          <code>import_charge</code>, and <code>export_charge</code> from your grid-tariffs step. There is no
          multi-day rolling horizon: each contiguous plug-in period is solved once, with day-ahead prices treated
          as known for that block (perfect foresight within the session).
        </p>
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">6. Plug-and-charge baseline</h2>
        <p className="methodology-page__p">
          Added value is always versus <strong>plug-and-charge</strong>, not versus an empty site. In each
          plugged-in interval the baseline:
        </p>
        <ul className="methodology-page__list">
          <li>
            Starts from the same <strong>return SoC</strong> at the beginning of the session.
          </li>
          <li>
            <strong>Charges only</strong> (no discharge) at up to max power until stored energy reaches the{' '}
            <strong>target SoC</strong>, respecting site import/export limits on net power.
          </li>
          <li>
            Does not arbitrage wholesale or export power — it is the simple “fill the battery before you leave”
            behaviour.
          </li>
        </ul>
        <p className="methodology-page__p">
          V2G value is the extra benefit from shifting charge and (when enabled) discharging optimally inside
          the same plug-in windows and physical limits.
        </p>
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">7. Results and added value</h2>
        <p className="methodology-page__p">
          Each run writes a half-hourly CSV with settlement price, import/export charges, site power, SoC,
          optimised <code>action_MW</code> (discharge − charge), and plug-and-charge counterparts (
          <code>plugplay_*</code>).
        </p>
        <p className="methodology-page__p">
          For every interval, added value is the cashflow difference between optimised net site power and
          plug-and-charge net site power, split into:
        </p>
        <ul className="methodology-page__list">
          <li>
            <code>added_value_wholesale</code> — settlement price × change in net site energy (MWh).
          </li>
          <li>
            <code>added_value_import</code> — import add-on × change in import-only volume (negative net power).
          </li>
          <li>
            <code>added_value_export</code> — export add-on × change in export-only volume (positive net power).
          </li>
        </ul>
        <p className="methodology-page__p">
          <code>added_value_total</code> is the sum of the three. The results page plots optimised vs
          plug-and-charge SoC, cumulative total added value, and site power with and without the vehicle.
        </p>
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">8. Further improvements</h2>
        <ul className="methodology-page__list">
          <li>
            <strong>Stochastic or robust schedules</strong> when plug-in times or energy needed at departure
            are uncertain.
          </li>
          <li>
            <strong>Day-ahead price forecasts</strong> instead of realised prices for within-session decisions.
          </li>
          <li>
            <strong>Driver behaviour and minimum range</strong> constraints beyond a single target SoC at unplug.
          </li>
          <li>
            <strong>Intraday and balancing markets</strong> where fleet aggregation and bidding rules allow.
          </li>
          <li>
            <strong>Battery degradation and calendar ageing</strong> tied to throughput and depth of discharge.
          </li>
        </ul>
      </section>
    </div>
  )
}
