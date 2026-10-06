import { useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { formatMoney, formatPct } from '../lib/format'
import { SERIES } from '../lib/chartColors'
import { compactCop } from '../lib/reports'

const GRID = '#2a2f3a'
const AXIS_TEXT = '#8a92a3'
const SURFACE = '#171a21'

const axisProps = {
  stroke: GRID,
  tick: { fill: AXIS_TEXT, fontSize: 12 },
  tickLine: false,
  minTickGap: 16,
} as const

type SeriesDef = { key: string; label: string; color: string }

export function ChartCard({
  title,
  subtitle,
  series,
  table,
  children,
}: {
  title: string
  subtitle?: ReactNode
  // Leyenda: solo cuando hay 2 o más series
  series?: SeriesDef[]
  table: ReactNode
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <div className="card chart-card">
      <div className="row chart-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
        <span className="spacer" />
        <button className="link-btn small" onClick={() => setShowTable(!showTable)}>
          {showTable ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </div>
      {series && series.length > 1 && !showTable && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key} className="legend-item">
              <span className="legend-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {showTable ? <div className="table-wrap chart-table">{table}</div> : children}
    </div>
  )
}

function TooltipBox({
  active,
  payload,
  label,
  format = (v: number) => formatMoney(v),
}: Partial<TooltipContentProps<number, string>> & { format?: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="chart-tooltip-row">
          <span className="legend-swatch" style={{ background: p.color }} />
          <span className="muted">{p.name}</span>
          <strong>{format(Number(p.value))}</strong>
        </div>
      ))}
    </div>
  )
}

// Columnas agrupadas (p. ej. ingresos vs. gastos por mes)
export function GroupedColumns({
  data,
  xKey,
  series,
  height = 280,
}: {
  data: object[]
  xKey: string
  series: SeriesDef[]
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        barGap={2}
        barCategoryGap="22%"
        margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
      >
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis {...axisProps} axisLine={false} tickFormatter={compactCop} width={60} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// Barras horizontales de una sola serie (p. ej. gasto por categoría)
export function HorizontalBars({
  data,
  labelKey,
  valueKey,
}: {
  data: object[]
  labelKey: string
  valueKey: string
}) {
  const height = Math.max(120, data.length * 34 + 30)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" {...axisProps} tickFormatter={compactCop} />
        <YAxis
          type="category"
          dataKey={labelKey}
          {...axisProps}
          axisLine={false}
          width={130}
          interval={0}
        />
        <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar
          dataKey={valueKey}
          name="Gasto"
          fill={SERIES[0]}
          maxBarSize={20}
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Una o varias líneas en la misma escala; con `area` agrega un velo del 10% bajo la primera
export function Lines({
  data,
  xKey,
  series,
  height = 260,
  percent = false,
  target,
  area = false,
}: {
  data: object[]
  xKey: string
  series: SeriesDef[]
  height?: number
  percent?: boolean
  // Línea de referencia (p. ej. la meta de ahorro)
  target?: { value: number; label: string }
  area?: boolean
}) {
  const format = percent ? formatPct : (v: number) => formatMoney(v)
  const yFormat = percent ? (v: number) => `${Math.round(v * 100)}%` : compactCop
  const common = (
    <>
      <CartesianGrid vertical={false} stroke={GRID} />
      <XAxis dataKey={xKey} {...axisProps} />
      <YAxis {...axisProps} axisLine={false} tickFormatter={yFormat} width={60} />
      <Tooltip
        content={<TooltipBox format={format} />}
        cursor={{ stroke: AXIS_TEXT, strokeWidth: 1 }}
      />
      {target && (
        <ReferenceLine
          y={target.value}
          stroke={AXIS_TEXT}
          strokeWidth={1}
          label={{ value: target.label, position: 'insideTopRight', fill: AXIS_TEXT, fontSize: 12 }}
        />
      )}
    </>
  )
  const dot = { r: 4, strokeWidth: 2, stroke: SURFACE }
  const activeDot = { r: 6, strokeWidth: 2, stroke: SURFACE }

  if (area) {
    const s = series[0]
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          {common}
          <Area
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            fill={s.color}
            fillOpacity={0.1}
            dot={data.length <= 24 ? { ...dot, fill: s.color } : false}
            activeDot={{ ...activeDot, fill: s.color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        {common}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ ...dot, fill: s.color }}
            activeDot={{ ...activeDot, fill: s.color }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
