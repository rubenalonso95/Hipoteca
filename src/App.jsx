import { useState, useMemo, useRef, useEffect } from 'react'
import './App.css'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const FRECUENCIAS = ['Mensual', 'Bimensual', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual']

function getPaymentsPerYear(frecuencia) {
  return { Mensual: 12, Bimensual: 6, Trimestral: 4, Cuatrimestral: 3, Semestral: 2, Anual: 1 }[frecuencia] ?? 12
}

function getEffectiveRate(nominalRate, frecuencia) {
  const n = getPaymentsPerYear(frecuencia)
  if (frecuencia === 'Anual') return nominalRate
  return Math.pow(1 + nominalRate, 1 / n) - 1
}

function pmt(rate, nper, pv) {
  if (rate === 0) return pv / nper
  return (pv * rate * Math.pow(1 + rate, nper)) / (Math.pow(1 + rate, nper) - 1)
}

// Devuelve el número de períodos entre dos fechas YYYY-MM según la frecuencia
function calcTotalPagos(fechaInicio, fechaFin, frecuencia) {
  const [y1, m1] = fechaInicio.split('-').map(Number)
  const [y2, m2] = fechaFin.split('-').map(Number)
  const totalMeses = (y2 - y1) * 12 + (m2 - m1)
  if (totalMeses <= 0) return 0
  const mesesPorPago = 12 / getPaymentsPerYear(frecuencia)
  return Math.round(totalMeses / mesesPorPago)
}

function calcularAmortizacion(params, amortCuota, amortPlazo, recCuota, recPlazo) {
  const { capital, tasa1, tasa2, tasa7, frecuencia, fechaInicio, fechaFin } = params
  const paymentsPerYear = getPaymentsPerYear(frecuencia)
  const totalPagos = calcTotalPagos(fechaInicio, fechaFin, frecuencia)
  if (totalPagos <= 0) return []

  const rate1 = getEffectiveRate(tasa1, frecuencia)
  const rate2 = getEffectiveRate(tasa2, frecuencia)
  const rate7 = getEffectiveRate(tasa7, frecuencia)

  const threshold2 = paymentsPerYear
  const threshold7 = 6 * paymentsPerYear

  const [y0, m0] = fechaInicio.split('-').map(Number)

  const rows = []
  let capitalVivo = capital
  let capitalRef  = capital
  let capitalAmortizado = 0

  for (let periodo = 1; periodo <= totalPagos; periodo++) {
    if (capitalVivo <= 0.01) break

    const rate = periodo <= threshold2 ? rate1 : periodo <= threshold7 ? rate2 : rate7

    // Mes calendario de este período (1-12)
    const mesesPorPago = 12 / paymentsPerYear
    const mesAbs = m0 - 1 + (periodo - 1) * mesesPorPago
    const mesCalendario = Math.floor(mesAbs) % 12 + 1  // 1-12

    const manualCuota = amortCuota[periodo] || 0
    const manualPlazo = amortPlazo[periodo] || 0
    const recCuotaVal = (recCuota.importe > 0 && mesCalendario === recCuota.mes) ? recCuota.importe : 0
    const recPlazoVal  = (recPlazo.importe  > 0 && mesCalendario === recPlazo.mes)  ? recPlazo.importe  : 0

    const eCuota = Math.min(manualCuota + recCuotaVal, capitalVivo)
    const ePlazo  = Math.min(manualPlazo + recPlazoVal,  Math.max(0, capitalVivo - eCuota))

    const cuotaBase  = pmt(rate, totalPagos - (periodo - 1), capitalRef)
    const intereses  = capitalVivo * rate
    const amortizacion = cuotaBase - intereses
    const cuotaTotal = cuotaBase + eCuota + ePlazo

    capitalVivo = Math.max(0, capitalVivo - amortizacion - eCuota - ePlazo)
    capitalAmortizado += amortizacion + eCuota + ePlazo

    const amortRef = cuotaBase - capitalRef * rate
    capitalRef = Math.max(0, capitalRef - amortRef - eCuota)

    // Fecha real del período
    const año = y0 + Math.floor(mesAbs / 12)
    const mes = MESES[Math.floor(mesAbs) % 12]

    rows.push({ periodo, año, mes, cuotaTotal, cuotaBase, intereses, amortizacion, eCuota, ePlazo, capitalVivo, capitalAmortizado })
  }

  return rows
}

function fmt(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcDuracion(nPagos, frecuencia) {
  const mesesPorPago = 12 / getPaymentsPerYear(frecuencia)
  const totalMeses = Math.round(nPagos * mesesPorPago)
  return { años: Math.floor(totalMeses / 12), meses: totalMeses % 12 }
}

function useAmortMap() {
  const [map, setMap] = useState({})
  function set(periodo, value) {
    const num = parseFloat(value)
    setMap(prev => {
      const next = { ...prev }
      if (!value || isNaN(num) || num <= 0) delete next[periodo]
      else next[periodo] = num
      return next
    })
  }
  return [map, set]
}

// ── Input de porcentaje editable libremente ────────────────────────────────────
// value: número decimal (ej. 0.012)  |  onChange: (newDecimal) => void
function PercentInput({ value, onChange }) {
  const [localVal, setLocalVal] = useState(() => (value * 100).toFixed(2))
  const [focused, setFocused]   = useState(false)

  // Cuando cambia el valor externo y el campo no está enfocado, sincroniza
  if (!focused) {
    const external = (value * 100).toFixed(2)
    if (localVal !== external) setLocalVal(external)
  }

  function handleBlur() {
    setFocused(false)
    const n = parseFloat(localVal.replace(',', '.'))
    if (!isNaN(n) && n >= 0) {
      const fixed = n.toFixed(2)
      setLocalVal(fixed)
      onChange(n / 100)
    } else {
      setLocalVal((value * 100).toFixed(2))
    }
  }

  return (
    <div className="input-pct">
      <input
        type="text"
        inputMode="decimal"
        value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
      />
      <span>%</span>
    </div>
  )
}
// ──────────────────────────────────────────────────────────────────────────────

// ── Selector mes + año personalizado ──────────────────────────────────────────
// value: "YYYY-MM"  |  onChange: (newValue: "YYYY-MM") => void
function MonthYearPicker({ value, onChange, min }) {
  const [editingYear, setEditingYear] = useState(false)
  const [yearInput, setYearInput]     = useState('')
  const yearRef = useRef(null)

  const [yyyy, mm] = value.split('-').map(Number)

  function setDate(newYear, newMonth) {
    const y = String(newYear).padStart(4, '0')
    const m = String(newMonth).padStart(2, '0')
    onChange(`${y}-${m}`)
  }

  function handleYearClick() {
    setYearInput(String(yyyy))
    setEditingYear(true)
    setTimeout(() => yearRef.current?.select(), 0)
  }

  function commitYear() {
    const n = parseInt(yearInput, 10)
    if (!isNaN(n) && n > 1900 && n < 2200) setDate(n, mm)
    setEditingYear(false)
  }

  function handleYearKey(e) {
    if (e.key === 'Enter') commitYear()
    if (e.key === 'Escape') setEditingYear(false)
  }

  const minYear = min ? Number(min.split('-')[0]) : null
  const minMonth = min ? Number(min.split('-')[1]) : null

  return (
    <div className="myp">
      <select
        className="myp-month"
        value={mm}
        onChange={e => setDate(yyyy, Number(e.target.value))}
      >
        {MESES.map((nombre, i) => {
          const disabled = minYear && yyyy === minYear && (i + 1) < minMonth
          return <option key={i} value={i + 1} disabled={disabled}>{nombre}</option>
        })}
      </select>

      <div className="myp-year-wrap">
        <button className="myp-arrow" onClick={() => setDate(yyyy - 1, mm)}
          disabled={minYear ? yyyy - 1 < minYear : false}>‹</button>

        {editingYear ? (
          <input
            ref={yearRef}
            className="myp-year-input"
            value={yearInput}
            onChange={e => setYearInput(e.target.value)}
            onBlur={commitYear}
            onKeyDown={handleYearKey}
            maxLength={4}
          />
        ) : (
          <span className="myp-year" onClick={handleYearClick} title="Haz click para editar">
            {yyyy}
          </span>
        )}

        <button className="myp-arrow" onClick={() => setDate(yyyy + 1, mm)}>›</button>
      </div>
    </div>
  )
}
// ──────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'hipoteca-params-v1'

const DEFAULT_PARAMS = {
  capital: 0,
  tasa1: 0.012,
  tasa2: 0.014,
  tasa7: 0.014,
  frecuencia: 'Mensual',
  fechaInicio: '2025-03',
  fechaFin: '2050-03',
}

function loadParams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_PARAMS, ...JSON.parse(raw) } : DEFAULT_PARAMS
  } catch {
    return DEFAULT_PARAMS
  }
}

const ROWS_PER_PAGE = 24

export default function App() {
  const [params, setParams] = useState(loadParams)
  const [saved, setSaved] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [filtroAno, setFiltroAno] = useState('')
  const [amortCuota, setAmortCuota] = useAmortMap()
  const [amortPlazo, setAmortPlazo] = useAmortMap()
  const [recCuota, setRecCuota] = useState({ importe: 0, mes: 1 })
  const [recPlazo, setRecPlazo]  = useState({ importe: 0, mes: 1 })

  const emptyRec = { importe: 0, mes: 1 }

  const tabla = useMemo(
    () => calcularAmortizacion(params, amortCuota, amortPlazo, recCuota, recPlazo),
    [params, amortCuota, amortPlazo, recCuota, recPlazo]
  )

  const tablaBase = useMemo(
    () => calcularAmortizacion(params, {}, {}, emptyRec, emptyRec),
    [params]
  )

  const tieneAmort = Object.keys(amortCuota).length > 0 || Object.keys(amortPlazo).length > 0
    || recCuota.importe > 0 || recPlazo.importe > 0

  const paymentsPerYear = getPaymentsPerYear(params.frecuencia)
  const cuota1 = tabla[0]?.cuotaBase ?? 0
  const cuota2 = tabla[paymentsPerYear]?.cuotaBase ?? 0
  const cuota7 = tabla[6 * paymentsPerYear]?.cuotaBase ?? 0
  const sumaCuotas    = tabla.reduce((s, r) => s + r.cuotaTotal, 0)
  const sumaIntereses = tabla.reduce((s, r) => s + r.intereses, 0)

  const sumaInteresesBase  = tablaBase.reduce((s, r) => s + r.intereses, 0)
  const interesesAhorrados = sumaInteresesBase - sumaIntereses
  const mesesQuitados      = tablaBase.length - tabla.length

  const años = [...new Set(tabla.map(r => r.año))]
  const tablaFiltrada = filtroAno ? tabla.filter(r => r.año === Number(filtroAno)) : tabla
  const totalPages = Math.ceil(tablaFiltrada.length / ROWS_PER_PAGE)
  const currentRows = tablaFiltrada.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  function handleChange(field, value) {
    setParams(p => ({ ...p, [field]: value }))
    setPage(1)
    setSaved(false)
  }

  function handleFiltroAno(val) {
    setFiltroAno(val)
    setPage(1)
  }

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setSidebarOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  function handleGuardar() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="layout">
      <header className="topbar">
        <button className="topbar-hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Menú">
          <span className={`hamburger-icon${sidebarOpen ? ' open' : ''}`}>
            <span /><span /><span />
          </span>
        </button>
        <span className="topbar-icon">🏠</span>
        <h1>Simulador de Hipoteca</h1>
      </header>

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="body">
        <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
          <section className="sidebar-section">
            <h2>Parámetros</h2>

            <div className="param-group">
              <label>Cuantía (€)</label>
              <input type="number" value={params.capital} min={0}
                onChange={e => handleChange('capital', Number(e.target.value))} />
            </div>

            <div className="param-group">
              <label>Fecha inicio</label>
              <MonthYearPicker
                value={params.fechaInicio}
                onChange={v => handleChange('fechaInicio', v)}
              />
            </div>

            <div className="param-group">
              <label>Fecha fin</label>
              <MonthYearPicker
                value={params.fechaFin}
                min={params.fechaInicio}
                onChange={v => handleChange('fechaFin', v)}
              />
            </div>

            <div className="param-group">
              <label>Interés año 1</label>
              <PercentInput value={params.tasa1} onChange={v => handleChange('tasa1', v)} />
            </div>

            <div className="param-group">
              <label>Interés año 2</label>
              <PercentInput value={params.tasa2} onChange={v => handleChange('tasa2', v)} />
            </div>

            <div className="param-group">
              <label>Interés año 7</label>
              <PercentInput value={params.tasa7} onChange={v => handleChange('tasa7', v)} />
            </div>

          </section>

          <section className="sidebar-section">
            <h2>Amort. voluntaria recurrente</h2>

            <div className="rec-label">En cuota</div>
            <div className="rec-row">
              <div className="param-group rec-importe">
                <label>Importe (€)</label>
                <input type="number" min={0} value={recCuota.importe || ''}
                  placeholder="0"
                  onChange={e => setRecCuota(r => ({ ...r, importe: Number(e.target.value) || 0 }))} />
              </div>
              <div className="param-group rec-mes">
                <label>Mes</label>
                <select value={recCuota.mes}
                  onChange={e => setRecCuota(r => ({ ...r, mes: Number(e.target.value) }))}>
                  {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="rec-label">En plazo</div>
            <div className="rec-row">
              <div className="param-group rec-importe">
                <label>Importe (€)</label>
                <input type="number" min={0} value={recPlazo.importe || ''}
                  placeholder="0"
                  onChange={e => setRecPlazo(r => ({ ...r, importe: Number(e.target.value) || 0 }))} />
              </div>
              <div className="param-group rec-mes">
                <label>Mes</label>
                <select value={recPlazo.mes}
                  onChange={e => setRecPlazo(r => ({ ...r, mes: Number(e.target.value) }))}>
                  {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="sidebar-section">
            <button className={`btn-guardar${saved ? ' btn-guardado' : ''}`} onClick={handleGuardar}>
              {saved ? '✓ Guardado' : 'Guardar valores por defecto'}
            </button>
          </section>

          <section className="sidebar-section summary-section">
            <h2>Resumen</h2>
            {(() => {
              const base = calcDuracion(tablaBase.length, params.frecuencia)
              const real = calcDuracion(tabla.length, params.frecuencia)
              const fmtD = ({ años, meses }) => `${años}a ${meses}m`
              return tieneAmort ? (
                <>
                  <div className="summary-row">
                    <span>Duración original</span>
                    <strong>{fmtD(base)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Duración restante</span>
                    <strong className="c-green">{fmtD(real)}</strong>
                  </div>
                </>
              ) : (
                <div className="summary-row">
                  <span>Duración</span>
                  <strong>{fmtD(base)}</strong>
                </div>
              )
            })()}
            <div className="summary-row">
              <span>Cuota año 1</span>
              <strong className="c-blue">{fmt(cuota1)} €</strong>
            </div>
            <div className="summary-row">
              <span>Cuota año 2</span>
              <strong className="c-purple">{fmt(cuota2)} €</strong>
            </div>
            <div className="summary-row">
              <span>Cuota año 7</span>
              <strong className="c-purple">{fmt(cuota7)} €</strong>
            </div>
            <div className="summary-divider" />
            <div className="summary-row">
              <span>Suma cuotas</span>
              <strong className="c-orange">{fmt(sumaCuotas)} €</strong>
            </div>
            <div className="summary-row">
              <span>Intereses totales</span>
              <strong className="c-red">{fmt(sumaIntereses)} €</strong>
            </div>

            {tieneAmort && (
              <>
                <div className="summary-divider" />
                <div className="summary-row">
                  <span>Meses quitados</span>
                  <strong className="c-green">-{mesesQuitados} meses</strong>
                </div>
                <div className="summary-row">
                  <span>Intereses ahorrados</span>
                  <strong className="c-green">-{fmt(interesesAhorrados)} €</strong>
                </div>
              </>
            )}

            {(() => {
              const base = params.capital + sumaInteresesBase
              return (
                <div className="cost-bar">
                  <div className="cost-bar-capital"
                    style={{ width: `${(params.capital / base) * 100}%` }}
                    title={`Capital: ${fmt(params.capital)} €`} />
                  <div className="cost-bar-interest"
                    style={{ width: `${(sumaIntereses / base) * 100}%` }}
                    title={`Intereses: ${fmt(sumaIntereses)} €`} />
                  {tieneAmort && (
                    <div className="cost-bar-saved"
                      style={{ width: `${(interesesAhorrados / base) * 100}%` }}
                      title={`Ahorrado: ${fmt(interesesAhorrados)} €`} />
                  )}
                </div>
              )
            })()}

            <div className="cost-bar-legend">
              <span><i className="dot dot-capital" />Capital</span>
              <span><i className="dot dot-interest" />Intereses</span>
              {tieneAmort && <span><i className="dot dot-saved" />Ahorrado</span>}
            </div>
          </section>
        </aside>

        <main className="content">
          <div className="table-card">
            <div className="table-topbar">
              <h2>Cuadro de amortización</h2>
              <div className="table-filters">
                <label>Año:</label>
                <select value={filtroAno} onChange={e => handleFiltroAno(e.target.value)}>
                  <option value="">Todos</option>
                  {años.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Año</th>
                    <th>Mes</th>
                    <th>Cuota</th>
                    <th>Intereses</th>
                    <th>Amortización</th>
                    <th>Amort. en Cuota</th>
                    <th>Amort. en Plazo</th>
                    <th>Capital vivo</th>
                    <th>Capital amortizado</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map(row => (
                    <tr key={row.periodo} className={row.periodo % 2 === 0 ? 'even' : ''}>
                      <td className="center">{row.periodo}</td>
                      <td className="center">{row.año}</td>
                      <td>{row.mes}</td>
                      <td className="num">{fmt(row.cuotaTotal)}</td>
                      <td className="num interest">{fmt(row.intereses)}</td>
                      <td className="num amort">{fmt(row.amortizacion)}</td>
                      <td className="num-input">
                        <input type="number" className="av-input av-cuota" min={0}
                          value={amortCuota[row.periodo] ?? ''} placeholder="0"
                          onChange={e => setAmortCuota(row.periodo, e.target.value)} />
                      </td>
                      <td className="num-input">
                        <input type="number" className="av-input av-plazo" min={0}
                          value={amortPlazo[row.periodo] ?? ''} placeholder="0"
                          onChange={e => setAmortPlazo(row.periodo, e.target.value)} />
                      </td>
                      <td className="num">{fmt(row.capitalVivo)}</td>
                      <td className="num">{fmt(row.capitalAmortizado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button onClick={() => setPage(1)} disabled={page === 1}>««</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                <span>Página {page} de {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>»»</button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
