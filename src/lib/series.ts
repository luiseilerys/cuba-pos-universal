import { getAllSales, saleToCUP, Sale } from './storage';

export interface SeriesPoint {
  key: string;
  label: string;
  totalCUP: number;
  count: number;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pad2(n: number) {
  return n < 10 ? '0' + n : String(n);
}

const DAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Últimos N días (incluye hoy), del más antiguo al más reciente */
export async function seriesByDay(days: number, rate: number): Promise<SeriesPoint[]> {
  const sales = await getAllSales();
  const today = startOfDay(new Date());
  const points: SeriesPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const from = d.getTime();
    const to = from + 24 * 60 * 60 * 1000 - 1;
    const bucket = sales.filter(s => s.createdAt >= from && s.createdAt <= to);
    points.push({
      key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      label: `${DAY_NAMES[d.getDay()]} ${d.getDate()}`,
      totalCUP: bucket.reduce((sum, s) => sum + saleToCUP(s, rate), 0),
      count: bucket.length,
    });
  }
  return points;
}

/** Últimas N semanas (semana = 7 días, terminando hoy) */
export async function seriesByWeek(weeks: number, rate: number): Promise<SeriesPoint[]> {
  const sales = await getAllSales();
  const todayEnd = new Date();
  const points: SeriesPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(todayEnd);
    end.setDate(end.getDate() - i * 7);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const bucket = sales.filter(s => s.createdAt >= start.getTime() && s.createdAt <= end.getTime());
    points.push({
      key: `w-${start.getTime()}`,
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      totalCUP: bucket.reduce((sum, s) => sum + saleToCUP(s, rate), 0),
      count: bucket.length,
    });
  }
  return points;
}

/** Últimos N meses calendario */
export async function seriesByMonth(months: number, rate: number): Promise<SeriesPoint[]> {
  const sales = await getAllSales();
  const now = new Date();
  const points: SeriesPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = d.getTime();
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const bucket = sales.filter(s => s.createdAt >= from && s.createdAt <= to);
    points.push({
      key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`,
      label: `${MONTH_NAMES[d.getMonth()]}`,
      totalCUP: bucket.reduce((sum, s) => sum + saleToCUP(s, rate), 0),
      count: bucket.length,
    });
  }
  return points;
}

/** Últimos N años calendario */
export async function seriesByYear(years: number, rate: number): Promise<SeriesPoint[]> {
  const sales = await getAllSales();
  const yNow = new Date().getFullYear();
  const points: SeriesPoint[] = [];

  for (let i = years - 1; i >= 0; i--) {
    const y = yNow - i;
    const from = new Date(y, 0, 1).getTime();
    const to = new Date(y, 11, 31, 23, 59, 59, 999).getTime();
    const bucket = sales.filter(s => s.createdAt >= from && s.createdAt <= to);
    points.push({
      key: String(y),
      label: String(y),
      totalCUP: bucket.reduce((sum, s) => sum + saleToCUP(s, rate), 0),
      count: bucket.length,
    });
  }
  return points;
}

export function summarizeSeries(points: SeriesPoint[]) {
  const totalCUP = points.reduce((s, p) => s + p.totalCUP, 0);
  const count = points.reduce((s, p) => s + p.count, 0);
  const best = points.reduce(
    (b, p) => (p.totalCUP > b.totalCUP ? p : b),
    points[0] || { key: '', label: '—', totalCUP: 0, count: 0 }
  );
  return { totalCUP, count, avg: count > 0 ? totalCUP / count : 0, best };
}

export type InfoBlockKey =
  | 'kpiToday'
  | 'kpiWeek'
  | 'kpiMonth'
  | 'kpiYear'
  | 'chartDays'
  | 'chartWeeks'
  | 'chartMonths'
  | 'chartYears'
  | 'topProducts'
  | 'byPayment'
  | 'byCurrency'
  | 'shiftSummary'
  | 'lowStock'
  | 'inventoryValue';

export const INFO_BLOCK_OPTIONS: { key: InfoBlockKey; label: string; group: string }[] = [
  { key: 'kpiToday', label: 'Resumen numérico · Hoy', group: 'Números' },
  { key: 'kpiWeek', label: 'Resumen numérico · Semana', group: 'Números' },
  { key: 'kpiMonth', label: 'Resumen numérico · Mes', group: 'Números' },
  { key: 'kpiYear', label: 'Resumen numérico · Año', group: 'Números' },
  { key: 'chartDays', label: 'Gráfico · últimos 7 días', group: 'Gráficos' },
  { key: 'chartWeeks', label: 'Gráfico · últimas 8 semanas', group: 'Gráficos' },
  { key: 'chartMonths', label: 'Gráfico · últimos 12 meses', group: 'Gráficos' },
  { key: 'chartYears', label: 'Gráfico · últimos 5 años', group: 'Gráficos' },
  { key: 'topProducts', label: 'Productos más vendidos', group: 'Detalle' },
  { key: 'byPayment', label: 'Por forma de pago', group: 'Detalle' },
  { key: 'byCurrency', label: 'Por moneda', group: 'Detalle' },
  { key: 'shiftSummary', label: 'Resumen del turno', group: 'Detalle' },
  { key: 'lowStock', label: 'Stock bajo', group: 'Detalle' },
  { key: 'inventoryValue', label: 'Valor de inventario', group: 'Detalle' },
];

export const DEFAULT_VISIBLE_INFO: InfoBlockKey[] = [
  'kpiToday',
  'kpiWeek',
  'kpiMonth',
  'chartDays',
  'chartWeeks',
  'chartMonths',
  'topProducts',
  'shiftSummary',
  'lowStock',
];
