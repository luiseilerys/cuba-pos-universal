import { useState, useEffect } from 'preact/hooks';
import {
  buildStats, BuiltStats, getSettings,
} from '../../lib/storage';
import {
  seriesByDay, seriesByWeek, seriesByMonth, seriesByYear,
  summarizeSeries, SeriesPoint, InfoBlockKey, DEFAULT_VISIBLE_INFO,
} from '../../lib/series';
import { showToast } from '../../lib/toast';

const PAY_LABELS: Record<string, string> = {
  efectivo_cup: 'Efectivo CUP',
  efectivo_usd: 'Efectivo USD',
  mixto: 'Pago mixto',
  cash: 'Efectivo',
};

function BarChart({ points, unit }: { points: SeriesPoint[]; unit: string }) {
  const max = Math.max(...points.map(p => p.totalCUP), 1);
  return (
    <div class="bar-chart">
      {points.map(p => {
        const h = Math.max(4, Math.round((p.totalCUP / max) * 100));
        return (
          <div class="bar-col" key={p.key} title={`${p.label}: ${p.totalCUP.toFixed(0)} ${unit} · ${p.count} ventas`}>
            <div class="bar-value">{p.totalCUP >= 1000 ? `${(p.totalCUP / 1000).toFixed(1)}k` : p.totalCUP.toFixed(0)}</div>
            <div class="bar-track">
              <div class="bar-fill" style={{ height: h + '%' }} />
            </div>
            <div class="bar-label">{p.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function KpiRow({ title, total, count, avg }: { title: string; total: number; count: number; avg: number }) {
  return (
    <div class="card">
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>{title}</h3>
      <div class="grid-3">
        <div>
          <div class="muted">Vendido</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{total.toFixed(0)}</div>
          <div class="muted">CUP</div>
        </div>
        <div>
          <div class="muted">Ventas</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{count}</div>
        </div>
        <div>
          <div class="muted">Promedio</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{avg.toFixed(0)}</div>
          <div class="muted">CUP</div>
        </div>
      </div>
    </div>
  );
}

export function Stats() {
  const [rate, setRate] = useState(120);
  const [visible, setVisible] = useState<InfoBlockKey[]>(DEFAULT_VISIBLE_INFO);
  const [stats, setStats] = useState<BuiltStats | null>(null);
  const [days, setDays] = useState<SeriesPoint[]>([]);
  const [weeks, setWeeks] = useState<SeriesPoint[]>([]);
  const [months, setMonths] = useState<SeriesPoint[]>([]);
  const [years, setYears] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const show = (key: InfoBlockKey) => visible.indexOf(key) >= 0;

  const load = async () => {
    setLoading(true);
    try {
      const s = await getSettings();
      const r = s.rateUSDToCUP || 120;
      setRate(r);
      const vis =
        s.visibleInfo && s.visibleInfo.length > 0
          ? (s.visibleInfo as InfoBlockKey[])
          : DEFAULT_VISIBLE_INFO;
      setVisible(vis);

      const [st, d, w, m, y] = await Promise.all([
        buildStats('today', r),
        seriesByDay(7, r),
        seriesByWeek(8, r),
        seriesByMonth(12, r),
        seriesByYear(5, r),
      ]);
      setStats(st);
      setDays(d);
      setWeeks(w);
      setMonths(m);
      setYears(y);
    } catch (e) {
      console.error(e);
      showToast('Error al cargar información', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sumDays = summarizeSeries(days);
  const sumWeeks = summarizeSeries(weeks);
  const sumMonths = summarizeSeries(months);
  const sumYears = summarizeSeries(years);

  const yearNow = years.length ? years[years.length - 1] : { totalCUP: 0, count: 0 };
  const monthNow = months.length ? months[months.length - 1] : { totalCUP: 0, count: 0 };
  const weekNow = weeks.length ? weeks[weeks.length - 1] : { totalCUP: 0, count: 0 };

  return (
    <div style={{ height: 'calc(100% - 60px)', overflow: 'auto' }}>
      <div class="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>Información</h1>
          <button type="button" class="btn btn-secondary btn-sm" onClick={load}>
            Actualizar
          </button>
        </div>
        <p class="muted" style={{ marginTop: 6 }}>
          Resúmenes y gráficos por día, semana, mes y año. Elige qué ver en Ajustes.
        </p>
      </div>

      {loading && <div class="card empty-state">Cargando…</div>}

      {!loading && (
        <>
          {show('kpiToday') && stats && (
            <KpiRow
              title="Hoy"
              total={stats.totalCUP}
              count={stats.salesCount}
              avg={stats.avgTicket}
            />
          )}

          {show('kpiWeek') && (
            <KpiRow
              title="Esta semana (últimos 7 días del bloque)"
              total={weekNow.totalCUP}
              count={weekNow.count}
              avg={weekNow.count > 0 ? weekNow.totalCUP / weekNow.count : 0}
            />
          )}

          {show('kpiMonth') && (
            <KpiRow
              title="Este mes"
              total={monthNow.totalCUP}
              count={monthNow.count}
              avg={monthNow.count > 0 ? monthNow.totalCUP / monthNow.count : 0}
            />
          )}

          {show('kpiYear') && (
            <KpiRow
              title="Este año"
              total={yearNow.totalCUP}
              count={yearNow.count}
              avg={yearNow.count > 0 ? yearNow.totalCUP / yearNow.count : 0}
            />
          )}

          {show('chartDays') && (
            <div class="card">
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>Ventas · últimos 7 días</h3>
              <p class="muted" style={{ marginBottom: 10 }}>
                Total período: {sumDays.totalCUP.toFixed(0)} CUP · {sumDays.count} ventas
                {sumDays.best.totalCUP > 0 ? ` · Mejor: ${sumDays.best.label}` : ''}
              </p>
              <BarChart points={days} unit="CUP" />
            </div>
          )}

          {show('chartWeeks') && (
            <div class="card">
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>Ventas · últimas 8 semanas</h3>
              <p class="muted" style={{ marginBottom: 10 }}>
                Total: {sumWeeks.totalCUP.toFixed(0)} CUP · {sumWeeks.count} ventas
              </p>
              <BarChart points={weeks} unit="CUP" />
            </div>
          )}

          {show('chartMonths') && (
            <div class="card">
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>Ventas · últimos 12 meses</h3>
              <p class="muted" style={{ marginBottom: 10 }}>
                Total: {sumMonths.totalCUP.toFixed(0)} CUP · {sumMonths.count} ventas
              </p>
              <BarChart points={months} unit="CUP" />
            </div>
          )}

          {show('chartYears') && (
            <div class="card">
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>Ventas · últimos 5 años</h3>
              <p class="muted" style={{ marginBottom: 10 }}>
                Total: {sumYears.totalCUP.toFixed(0)} CUP · {sumYears.count} ventas
              </p>
              <BarChart points={years} unit="CUP" />
            </div>
          )}

          {show('inventoryValue') && stats && (
            <div class="card">
              <div class="muted">Valor de inventario</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.inventoryValueCUP.toFixed(0)} CUP</div>
            </div>
          )}

          {show('shiftSummary') && stats && stats.shiftInfo && (
            <div class="card">
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Turno actual</h3>
              {stats.shiftInfo.open ? (
                <>
                  <p>Estado: <span class="badge badge-ok">Abierto</span></p>
                  <p class="muted">Desde: {stats.shiftInfo.openedAt ? new Date(stats.shiftInfo.openedAt).toLocaleString('es-CU') : '—'}</p>
                  <p>Fondo: {stats.shiftInfo.floatCUP ?? 0} CUP</p>
                  <p>Ventas del turno: {stats.shiftInfo.salesCount} · {(stats.shiftInfo.salesCUP || 0).toFixed(0)} CUP</p>
                </>
              ) : (
                <p class="muted">No hay turno abierto.</p>
              )}
            </div>
          )}

          {show('byCurrency') && stats && (
            <div class="card">
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Por moneda (hoy)</h3>
              <div class="grid-2">
                <div>
                  <div class="muted">CUP</div>
                  <strong>{stats.byCurrency.CUP.toFixed(0)}</strong>
                  <span class="muted"> · {stats.byCurrency.countCUP}</span>
                </div>
                <div>
                  <div class="muted">USD</div>
                  <strong>{stats.byCurrency.USD.toFixed(2)}</strong>
                  <span class="muted"> · {stats.byCurrency.countUSD}</span>
                </div>
              </div>
              <p class="muted" style={{ marginTop: 8 }}>Tasa: 1 USD = {rate} CUP</p>
            </div>
          )}

          {show('byPayment') && stats && (
            <div class="card">
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Por forma de pago (hoy)</h3>
              {stats.byPayment.length === 0 && <p class="muted">Sin datos.</p>}
              {stats.byPayment.map(p => (
                <div key={p.method} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{PAY_LABELS[p.method] || p.method} · {p.count}</span>
                  <strong>{p.amountCUP.toFixed(0)} CUP</strong>
                </div>
              ))}
            </div>
          )}

          {show('topProducts') && stats && (
            <div class="card">
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Más vendidos (hoy)</h3>
              {stats.topProducts.length === 0 && <p class="muted">Sin ventas hoy.</p>}
              {stats.topProducts.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{i + 1}. {p.name} × {p.qty}</span>
                  <strong>{p.amountCUP.toFixed(0)} CUP</strong>
                </div>
              ))}
            </div>
          )}

          {show('lowStock') && stats && (
            <div class="card">
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Stock bajo</h3>
              {stats.lowStock.length === 0 && <p class="muted">Ningún producto bajo el mínimo.</p>}
              {stats.lowStock.slice(0, 15).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{p.name}</span>
                  <span class="badge badge-danger">{p.stock} / {p.minStock || 0}</span>
                </div>
              ))}
            </div>
          )}

          <div class="card">
            <p class="muted" style={{ margin: 0 }}>
              Para mostrar u ocultar bloques, ve a <strong>Ajustes → Bloques de Información</strong>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
