import { BRAND } from './brand'
import { FlexbandSchematic } from './FlexbandSchematic'

const ext = { target: '_blank', rel: 'noopener noreferrer' }

export function CiBessMethodology() {
  return (
    <div className="inputs-page methodology-page" id="methodology">
      <header className="page-head">
        <p className="page-head__eyebrow">{BRAND.tagline}</p>
        <h1 className="page-head__title">Methodology</h1>
        <p className="page-head__lead">
          This application is a <strong>simulator for commercial &amp; industrial (C&amp;I) battery energy
          storage</strong>—behind-the-meter assets at factories, warehouses, offices, and similar sites. It
          ingests tariffs, half-hourly load and generation, connection limits, and BESS settings, then runs
          the optimisation engine to estimate dispatch, state of charge, and cashflow-style value over your
          chosen period.
        </p>
      </header>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">1. Key assumptions</h2>
        <p className="methodology-page__p">
          The simulator is built for <strong>scenario comparison</strong> on C&amp;I sites, not live trading.
          The main modelling choices are:
        </p>
        <ul className="methodology-page__list">
          <li>
            <strong>Perfect foresight on day-ahead prices.</strong> Future settlement prices in the rolling
            window are taken from the published day-ahead series, not from forecasts. That overstates value
            versus real gate-closure decisions.
          </li>
          <li>
            <strong>Deterministic site profile.</strong> Load and solar follow a single half-hourly trajectory
            (uploaded or synthetic). There is no uncertainty or reserve for forecast error.
          </li>
          <li>
            <strong>Fixed tariff add-ons.</strong> Import and export charges you configure (colour bands and
            £/MWh values) are known for every interval. Balancing, capacity, and other pass-through charges
            are only included where you enter them explicitly.
          </li>
          <li>
            <strong>Linear battery physics.</strong> Round-trip efficiency, SOC bounds, power limits, and a
            cycles-per-day cap are enforced in a MILP. No degradation, auxiliary load, or availability
            outages.
          </li>
          <li>
            <strong>Rolling horizon.</strong> The optimiser looks several days ahead but only commits the
            first day before rolling forward (default three-day window). Initial state of charge starts near
            the middle of your allowed range unless overridden in the saved inputs file.
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
            , resampled to half-hours and converted to £/MWh (euro-to-pound rate configurable in the saved
            inputs file).
          </li>
          <li>
            <strong>Solar yield shape.</strong> National PV profile from the{' '}
            <a href="https://www.solar.sheffield.ac.uk/api/" {...ext}>
              PV_Live API (Sheffield Solar / University of Sheffield)
            </a>
            , stored as yield per MW so you can scale to installed capacity. The app can also build a synthetic
            generation series from that yield curve.
          </li>
          <li>
            <strong>Site load and generation.</strong> User uploads or constant-MW placeholders written to{' '}
            <code>data/</code> as half-hourly CSVs. Import and export charge bands from the grid-tariffs step
            are expanded into <code>site_import_charges_timeseries.csv</code> and{' '}
            <code>site_export_charges_timeseries.csv</code>.
          </li>
          <li>
            <strong>BESS and connection settings.</strong> Power, duration, efficiency, SOC limits, cycling
            target, study dates, and site import/export limits are saved in{' '}
            <code>optimisation/study_inputs.json</code> and passed to the Python optimiser.
          </li>
        </ul>
        <p className="methodology-page__p">
          All inputs and outputs stay on your machine: the React UI, Node API, Python MILP, CSVs under{' '}
          <code>data/</code>, and results under <code>results/</code>.
        </p>
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">3. App workflow</h2>
        <p className="methodology-page__p">
          The interface is a <strong>React</strong> front end with a small <strong>Node</strong> API. When you
          run a simulation, the API calls the <strong>Python</strong> optimiser (PuLP + CBC). Typical steps:
        </p>
        <ul className="methodology-page__list">
          <li>
            <strong>Grid tariffs.</strong> Define how import and export add-ons vary by time (green / amber /
            red bands) and any fixed charges.
          </li>
          <li>
            <strong>Site data.</strong> Provide consumption and PV (upload or synthetic curves).
          </li>
          <li>
            <strong>BESS simulation.</strong> Set battery size, efficiency, SOC limits, cycling, dates, and
            connection limits, then run the optimiser.
          </li>
          <li>
            <strong>Results.</strong> Inspect dispatch, state of charge, and split “added value” versus a
            no-battery baseline.
          </li>
        </ul>
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">4. Optimisation model (linear program, PuLP + CBC)</h2>
        <p className="methodology-page__p">
          The battery schedule is derived using a linear optimisation model implemented in PuLP and solved
          with CBC. At each half-hour interval, the model determines the optimal charge or discharge level,
          subject to physical constraints such as storage capacity and energy balance. Revenues are calculated
          based on fixed prices for each time step.
        </p>

        <h3 className="methodology-page__h3">Physical constraints</h3>
        <p className="methodology-page__p">
          The battery is a bucket of energy with a maximum size (power rating × hours of duration). Each step
          must stay between your lower and upper state-of-charge. Charging and discharging are limited by the
          inverter and, if you entered them, by site import and export limits at the connection point.
          Charging and discharging waste a little energy—that is round-trip efficiency. There is also a cap on
          how much energy you can push through the battery over the optimisation block, so very heavy cycling
          is discouraged when you set a cycles-per-day target. The model chains half hours together: the
          energy left in the battery at the end of one step is the start of the next.
        </p>

        <h3 className="methodology-page__h3">Flex band: why four pieces, and which price applies</h3>
        <p className="methodology-page__p">
          At the meter, <strong>net site power</strong> is solar and other generation minus load, before the
          battery. The battery can push power in or out on top of that. The awkward part is pricing: a
          megawatt of charging can either <strong>eat into export</strong> (you would have sent power out)
          or <strong>add import</strong> (you pull more from the grid). Discharge is the mirror image: it can{' '}
          <strong>reduce import</strong> or <strong>add export</strong>. Import and export face different
          add-on charges, so the model splits charge and discharge into <strong>four non-negative parts</strong>{' '}
          (c1, c2, d1, d2). Each part gets the right day-ahead and add-on combination. The diagram below is
          schematic: it shows example PV, load, net export at the meter, the inverter envelope, and what
          each flex piece is trying to do economically.
        </p>
        <FlexbandSchematic />

        <h3 className="methodology-page__h3">Rolling horizon and day-ahead prices</h3>
        <p className="methodology-page__p">
          The full horizon is not solved in one go. The code steps through time with a <strong>rolling window</strong>
          : it looks about <strong>three days ahead</strong> (you can change “days per period” in the saved
          study settings, default 3). It picks the best schedule over that window, then <strong>only the first
          day is fixed</strong>. The battery’s energy is carried to the next window. That way tomorrow’s prices
          and tomorrow’s net load can influence what you do today—otherwise you might charge or discharge
          too much in the morning and miss a better spread the next day.
        </p>
        <p className="methodology-page__p">
          In live operation you would optimise against <strong>forecast</strong> day-ahead prices for future
          days. Here the model uses the <strong>published day-ahead series as if it were known in advance</strong>
          . That keeps the model simple and is fine for comparing scenarios. It is not a forecast-quality test:
          real forecasts would add error and usually lower value. The pipeline is set up so that each
          timestamp appears with multiple <code>horizon_days_ahead</code> labels for the rolling window; if
          you had forecast curves by horizon, you could feed those into the same structure instead of the
          realised prices used here—without changing how the rolling horizon works.
        </p>
        <p className="methodology-page__p">
          The first time the model runs, the battery starts from a sensible energy level in the middle of
          your allowed range unless you change that in the study file.
        </p>
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">5. Results and “added value”</h2>
        <p className="methodology-page__p">
          Each run writes a CSV with half-hourly timestamps, prices, tariffs, state of charge, charge and
          discharge power, and <strong>action</strong> (discharge minus charge, MW).
        </p>
        <p className="methodology-page__p">
          <strong>What the optimiser maximises (objective).</strong> In each half hour the model picks charge
          and discharge so as to maximise expected money from the <strong>wholesale (settlement) price</strong>,
          net of the <strong>import</strong> and <strong>export</strong> add-on charges you configured (the
          same inputs that drive the flex-band pricing in the MILP). In plain language it tries to align buying
          and selling power at the boundary with <strong>cheap versus expensive</strong> wholesale intervals
          and with <strong>cheaper versus dearer</strong> grid add-ons—not only raw megawatts.
        </p>
        <p className="methodology-page__p">
          <strong>Three parts of “added value.”</strong> The app compares cashflows <strong>without</strong> the
          battery and <strong>with</strong> it, and splits the improvement into three lines (
          <code>wholesale_added</code>, <code>import_added</code>, <code>export_added</code>). They usually
          mean the following:
        </p>
        <ul className="methodology-page__list">
          <li>
            <strong>Wholesale / settlement.</strong> Value from trading against the day-ahead price: the battery
            tends to <strong>discharge when the settlement price is high</strong> and{' '}
            <strong>charge when it is low</strong>, which lifts wholesale cashflow versus doing nothing.
            Charging in cheap periods also means <strong>less paid import (offtake)</strong> when you are
            drawing power to fill the battery then.
          </li>
          <li>
            <strong>Import add-ons.</strong> Often a gain because the schedule can{' '}
            <strong>avoid or trim import in costly periods</strong>—for example your time-of-use or “red” band
            when import charges are highest.
          </li>
          <li>
            <strong>Export add-ons.</strong> Often <strong>small or mixed</strong>: sometimes a bit more
            export-related cost if the battery pushes extra power out through the meter, but in other cases a
            small benefit when solar that would have been exported is kept for <strong>on-site use</strong>{' '}
            (self-consumption) via the battery—so injection or export add-ons move only a little. For many
            C&amp;I sites this component is minor next to wholesale and import added value.
          </li>
        </ul>
        <p className="methodology-page__p">
          Under the hood, each half hour uses net power <code>site_MW</code> without the BESS and{' '}
          <code>site_MW + action</code> with it; the three <code>*_added</code> columns are the differences.
          The web app plots these series, cumulative stacked added value (with zoom-aware restarts on the
          cumulative view), and monthly sums (UTC).
        </p>
      </section>

      <section className="panel inputs-panel methodology-page__section">
        <h2 className="methodology-page__h2">6. Further improvements</h2>
        <ul className="methodology-page__list">
          <li>
            Replace realised day-ahead with <strong>day-ahead price forecasts</strong> (and optionally
            quantiles) so rolling decisions reflect true information at gate closure.
          </li>
          <li>
            Add <strong>intraday</strong> and <strong>balancing mechanism</strong> value streams (and
            cross-product constraints) where data and bidding rules support them.
          </li>
          <li>
            Model <strong>forecast error</strong> for solar and load (stochastic or robust layers) instead
            of a single deterministic trajectory.
          </li>
        </ul>
      </section>
    </div>
  )
}
