import { BRAND, BRAND_ACCENT, BRAND_ACCENT_MUTED } from './brand'

function BatteryIcon({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`} aria-hidden>
      <rect x={0} y={0} width={22} height={12} rx={2} fill="#e4e4e7" stroke="#a1a1aa" strokeWidth={1} />
      <rect x={22} y={3} width={3} height={6} rx={1} fill="#a1a1aa" />
      <text x={11} y={9} fill="#52525b" fontSize={7} fontWeight={700} textAnchor="middle">
        10
      </text>
    </g>
  )
}

function PowerAxis({ cx, xAt, y, mwTicks, netMw, netLabel }) {
  const x0 = xAt(mwTicks[0])
  const x1 = xAt(mwTicks[mwTicks.length - 1])
  return (
    <g>
      <text x={cx} y={y - 36} fill="#a1a1aa" fontSize="9" textAnchor="middle">
        Power at connection (MW)
      </text>
      <line x1={x0} y1={y} x2={x1} y2={y} stroke="#d4d4d8" strokeWidth="2" />
      {mwTicks.map((mw) => (
        <g key={mw}>
          <line x1={xAt(mw)} y1={y} x2={xAt(mw)} y2={y + 6} stroke="#a1a1aa" strokeWidth="1" />
          <text x={xAt(mw)} y={y + 18} fill="#71717a" fontSize="8.5" textAnchor="middle">
            {mw === 0 ? '0' : mw > 0 ? `+${mw}` : `${mw}`}
          </text>
        </g>
      ))}
      <line x1={cx} y1={y - 12} x2={cx} y2={y + 12} stroke="#64748b" strokeWidth="1.5" />
      <text x={cx - 6} y={y - 18} fill="#64748b" fontSize="8" textAnchor="end">
        Import
      </text>
      <text x={cx + 6} y={y - 18} fill="#64748b" fontSize="8" textAnchor="start">
        Export
      </text>
      <line
        x1={xAt(netMw)}
        y1={y - 28}
        x2={xAt(netMw)}
        y2={y + 28}
        stroke={BRAND_ACCENT}
        strokeWidth="2.5"
      />
      <text x={xAt(netMw)} y={y - 34} fill={BRAND_ACCENT} fontSize="9" fontWeight={700} textAnchor="middle">
        {netLabel}
      </text>
    </g>
  )
}

/** Flex-band schematic: band positions per spec; legend below. */
export function FlexbandSchematic({ title = 'Flex bands — BESS inverter 10 MW (schematic MW along the horizontal axis)' }) {
  const cx = 292
  const s = 12.5
  const xAt = (mw) => cx + mw * s

  const y1 = 112
  const y2 = 248
  const axisTicks = [-15, -10, -5, 0, 5, 10, 15]

  const bandH = 20
  const bandTop = (y) => y - bandH / 2

  return (
    <figure className="methodology-page__figure methodology-page__figure--flexband">
      <svg viewBox="0 0 560 288" role="img" aria-labelledby="flexband-title flexband-desc">
        <title id="flexband-title">Flex bands: net export and net import examples</title>
        <desc id="flexband-desc">
          Example one: blue negative import, green zero to five export, yellow five to fifteen export.
          Example two: blue negative fifteen to five import, green negative five to zero, yellow zero to five
          export.
        </desc>

        <text x="8" y="18" fill="#52525b" fontSize="12" fontWeight="700">
          {title}
        </text>

        <BatteryIcon x={8} y={34} />
        <text x="36" y="44" fill="#18181b" fontSize="11" fontWeight="700">
          Example 1 — net export
        </text>
        <text x="8" y="62" fill="#71717a" fontSize="10">
          PV 15 MW · Site (load) 10 MW → net at meter +5 MW export
        </text>

        <PowerAxis cx={cx} xAt={xAt} y={y1} mwTicks={axisTicks} netMw={5} netLabel="Net +5" />

        <rect
          x={xAt(5)}
          y={bandTop(y1)}
          width={xAt(15) - xAt(5)}
          height={bandH}
          fill="#facc15"
          opacity={0.9}
          stroke="#ca8a04"
          strokeWidth={1.2}
          rx={2}
        />
        <rect
          x={xAt(-5)}
          y={bandTop(y1)}
          width={xAt(0) - xAt(-5)}
          height={bandH}
          fill="#2563eb"
          opacity={0.88}
          stroke="#1d4ed8"
          strokeWidth={1.2}
          rx={2}
        />
        <rect
          x={xAt(0)}
          y={bandTop(y1)}
          width={xAt(5) - xAt(0)}
          height={bandH}
          fill={BRAND_ACCENT_MUTED}
          opacity={0.9}
          stroke={BRAND_ACCENT}
          strokeWidth={1.2}
          rx={2}
        />
        <text x={xAt(-2.5)} y={y1 + 5} fill="#fff" fontSize="9" fontWeight={700} textAnchor="middle">
          c2
        </text>
        <text x={xAt(2.5)} y={y1 + 5} fill="#fff" fontSize="9" fontWeight={700} textAnchor="middle">
          c1
        </text>
        <text x={xAt(10)} y={y1 + 5} fill="#422006" fontSize="9" fontWeight={700} textAnchor="middle">
          +export
        </text>

        <BatteryIcon x={8} y={170} />
        <text x="36" y="180" fill="#18181b" fontSize="11" fontWeight="700">
          Example 2 — net import
        </text>
        <text x="8" y="198" fill="#71717a" fontSize="10">
          PV 5 MW · Site (load) 10 MW → net at meter −5 MW import
        </text>

        <PowerAxis cx={cx} xAt={xAt} y={y2} mwTicks={axisTicks} netMw={-5} netLabel="Net −5" />

        <rect
          x={xAt(-15)}
          y={bandTop(y2)}
          width={xAt(-5) - xAt(-15)}
          height={bandH}
          fill="#2563eb"
          opacity={0.88}
          stroke="#1d4ed8"
          strokeWidth={1.2}
          rx={2}
        />
        <rect
          x={xAt(-5)}
          y={bandTop(y2)}
          width={xAt(0) - xAt(-5)}
          height={bandH}
          fill="#22c55e"
          opacity={0.9}
          stroke="#15803d"
          strokeWidth={1.2}
          rx={2}
        />
        <rect
          x={xAt(0)}
          y={bandTop(y2)}
          width={xAt(5) - xAt(0)}
          height={bandH}
          fill="#facc15"
          opacity={0.95}
          stroke="#ca8a04"
          strokeWidth={1.2}
          rx={2}
        />
        <text x={xAt(-10)} y={y2 + 5} fill="#fff" fontSize="8.5" fontWeight={700} textAnchor="middle">
          +import
        </text>
        <text x={xAt(-2.5)} y={y2 + 5} fill="#fff" fontSize="9" fontWeight={700} textAnchor="middle">
          d1
        </text>
        <text x={xAt(2.5)} y={y2 + 5} fill="#422006" fontSize="9" fontWeight={700} textAnchor="middle">
          d2
        </text>
      </svg>

      <div className="methodology-page__legend">
        <p className="methodology-page__legend-title">Legend — what each colour means</p>
        <ul className="methodology-page__legend-list">
          <li>
            <span className="methodology-page__legend-swatch methodology-page__legend-swatch--export" />
            <span>
              <strong>Green</strong> — “eats away” export: charge that uses spare export first (here 0…5 MW
              in example 1). Label <strong>c1</strong>.
            </span>
          </li>
          <li>
            <span className="methodology-page__legend-swatch methodology-page__legend-swatch--blue" />
            <span>
              <strong>Blue</strong> — additional import from charging (example 1: −5…0 MW; example 2: −15…−5
              MW). Label <strong>c2</strong>.
            </span>
          </li>
          <li>
            <span className="methodology-page__legend-swatch methodology-page__legend-swatch--yellow" />
            <span>
              <strong>Yellow</strong> — additional export (example 1: 5…15 MW). Extra power pushed toward
              export beyond the net site position.
            </span>
          </li>
          <li>
            <span className="methodology-page__legend-swatch methodology-page__legend-swatch--green" />
            <span>
              <strong>Green</strong> — “eats away” import: discharge that reduces paid import (example 2:
              −5…0 MW). Label <strong>d1</strong>.
            </span>
          </li>
          <li>
            <span className="methodology-page__legend-swatch methodology-page__legend-swatch--yellow" />
            <span>
              <strong>Yellow</strong> — additional export from discharge (example 2: 0…+5 MW). Label{' '}
              <strong>d2</strong>.
            </span>
          </li>
        </ul>
      </div>
    </figure>
  )
}
