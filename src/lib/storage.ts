import { Preferences } from '@capacitor/preferences';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { newId } from './id';

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category?: string;
  unit?: string;
  priceCUP: number;
  priceUSD: number;
  costCUP?: number;
  stock: number;
  minStock?: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  type: 'in' | 'out' | 'adjust';
  quantity: number;
  reason: string;
  note?: string;
  userId?: string;
  createdAt: number;
  synced?: boolean;
}

export interface SaleItem {
  id: string;
  name: string;
  priceCUP: number;
  priceUSD: number;
  qty: number;
}

export interface Sale {
  id: string;
  shiftId?: string;
  items: SaleItem[];
  currency: 'CUP' | 'USD';
  subtotal: number;
  discount: number;
  total: number;
  paidCUP: number;
  paidUSD: number;
  changeCUP: number;
  paymentMethod: string;
  createdAt: number;
}

export interface Shift {
  id: string;
  openedAt: number;
  closedAt?: number;
  openingFloatCUP: number;
  openingFloatUSD: number;
  status: 'open' | 'closed';
  notes?: string;
}

export type StatKey =
  | 'totalSales'
  | 'salesCount'
  | 'avgTicket'
  | 'totalDiscount'
  | 'paidCUP'
  | 'paidUSD'
  | 'topProducts'
  | 'byPayment'
  | 'byCurrency'
  | 'shiftSummary'
  | 'lowStock'
  | 'inventoryValue';

export interface AppSettings {
  businessName?: string;
  businessPhone?: string;
  rateUSDToCUP?: number;
  ticketFooter?: string;
  visibleStats?: StatKey[];
  visibleInfo?: string[];
  /** Tipo de gráfico en Info: barras o líneas */
  chartType?: 'bar' | 'line';
}

interface CubaPOSDB extends DBSchema {
  settings: { key: string; value: any };
  products: {
    key: string;
    value: Product;
    indexes: { 'by-sku': string; 'by-barcode': string };
  };
  sales: { key: string; value: Sale };
  cashCounts: { key: string; value: any };
  inventoryMovements: { key: string; value: InventoryMovement };
  shifts: { key: string; value: Shift };
  outbox: { key: string; value: any };
}

const ACTIVE_SHIFT_KEY = 'active_shift_id';

let dbPromise: Promise<IDBPDatabase<CubaPOSDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<CubaPOSDB>('cuba-pos-v3', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('settings');
          const products = db.createObjectStore('products', { keyPath: 'id' });
          products.createIndex('by-sku', 'sku', { unique: false });
          products.createIndex('by-barcode', 'barcode', { unique: false });
          db.createObjectStore('sales', { keyPath: 'id' });
          db.createObjectStore('cashCounts', { keyPath: 'id' });
          db.createObjectStore('outbox', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('inventoryMovements')) {
            db.createObjectStore('inventoryMovements', { keyPath: 'id' });
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('shifts')) {
            db.createObjectStore('shifts', { keyPath: 'id' });
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function isOnboardingCompleted(): Promise<boolean> {
  const { value } = await Preferences.get({ key: 'onboarding_done' });
  return value === 'true';
}

export async function setOnboardingCompleted() {
  await Preferences.set({ key: 'onboarding_done', value: 'true' });
}

export async function saveFiscalProfile(profile: any) {
  const db = await getDB();
  await db.put('settings', profile, 'fiscal_profile');
  await Preferences.set({ key: 'fiscal_profile', value: JSON.stringify(profile) });
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB();
  return ((await db.get('settings', 'app_settings')) as AppSettings) || {};
}

export async function saveSettings(settings: AppSettings) {
  const db = await getDB();
  const current = await getSettings();
  await db.put('settings', { ...current, ...settings }, 'app_settings');
}

export async function addToOutbox(operation: any) {
  const db = await getDB();
  const id = operation.id || newId();
  await db.put('outbox', { ...operation, id, createdAt: operation.createdAt || Date.now() });
}

export async function getOutbox() {
  const db = await getDB();
  return db.getAll('outbox');
}

export async function removeFromOutbox(id: string) {
  const db = await getDB();
  await db.delete('outbox', id);
}

export async function getAllProducts(): Promise<Product[]> {
  const db = await getDB();
  return db.getAll('products');
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const db = await getDB();
  return db.get('products', id);
}

export async function saveProduct(product: Product) {
  const db = await getDB();
  product.updatedAt = Date.now();
  await db.put('products', product);
}

export async function deleteProduct(id: string) {
  const db = await getDB();
  await db.delete('products', id);
}

export async function addMovement(mov: InventoryMovement) {
  const db = await getDB();
  await db.put('inventoryMovements', mov);
  const product = await db.get('products', mov.productId);
  if (product) {
    if (mov.type === 'in') product.stock += mov.quantity;
    else if (mov.type === 'out') product.stock = Math.max(0, product.stock - mov.quantity);
    else if (mov.type === 'adjust') product.stock = mov.quantity;
    product.updatedAt = Date.now();
    await db.put('products', product);
  }
}

export async function getMovementsByProduct(productId: string): Promise<InventoryMovement[]> {
  const db = await getDB();
  const all = await db.getAll('inventoryMovements');
  return all.filter(m => m.productId === productId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAllMovements(): Promise<InventoryMovement[]> {
  const db = await getDB();
  return (await db.getAll('inventoryMovements')).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getOpenShift(): Promise<Shift | undefined> {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains('shifts')) return undefined;
    const all = await db.getAll('shifts');
    const open = all.find(s => s.status === 'open');
    if (open) return open;
    const { value } = await Preferences.get({ key: ACTIVE_SHIFT_KEY });
    if (value) {
      const s = await db.get('shifts', value);
      if (s && s.status === 'open') return s;
    }
  } catch (e) {
    console.error('getOpenShift', e);
  }
  return undefined;
}

export async function getAllShifts(): Promise<Shift[]> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('shifts')) return [];
  return (await db.getAll('shifts')).sort((a, b) => b.openedAt - a.openedAt);
}

export async function openShift(openingFloatCUP: number = 0, openingFloatUSD: number = 0): Promise<Shift> {
  const existing = await getOpenShift();
  if (existing) {
    await Preferences.set({ key: ACTIVE_SHIFT_KEY, value: existing.id });
    return existing;
  }
  const floatCUP = Number(openingFloatCUP);
  const floatUSD = Number(openingFloatUSD);
  const shift: Shift = {
    id: newId(),
    openedAt: Date.now(),
    openingFloatCUP: Number.isFinite(floatCUP) ? Math.max(0, floatCUP) : 0,
    openingFloatUSD: Number.isFinite(floatUSD) ? Math.max(0, floatUSD) : 0,
    status: 'open',
  };
  const db = await getDB();
  await db.put('shifts', shift);
  await Preferences.set({ key: ACTIVE_SHIFT_KEY, value: shift.id });
  return shift;
}

export async function closeShift(shiftId: string): Promise<void> {
  const db = await getDB();
  const shift = await db.get('shifts', shiftId);
  if (shift) {
    shift.status = 'closed';
    shift.closedAt = Date.now();
    await db.put('shifts', shift);
  }
  const { value } = await Preferences.get({ key: ACTIVE_SHIFT_KEY });
  if (value === shiftId || value) {
    await Preferences.remove({ key: ACTIVE_SHIFT_KEY });
  }
}

export async function closeOpenShift(): Promise<Shift | null> {
  const open = await getOpenShift();
  if (!open) {
    await Preferences.remove({ key: ACTIVE_SHIFT_KEY });
    return null;
  }
  await closeShift(open.id);
  return { ...open, status: 'closed', closedAt: Date.now() };
}

export async function saveSale(sale: Sale) {
  const db = await getDB();
  await db.put('sales', sale);
}

export async function getAllSales(): Promise<Sale[]> {
  const db = await getDB();
  return (await db.getAll('sales')).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSalesForShift(shiftId: string): Promise<Sale[]> {
  const all = await getAllSales();
  return all.filter(s => s.shiftId === shiftId);
}

export async function getTodaySales(): Promise<Sale[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const all = await getAllSales();
  return all.filter(s => s.createdAt >= start.getTime());
}

export async function getSalesInRange(fromMs: number, toMs: number): Promise<Sale[]> {
  const all = await getAllSales();
  return all.filter(s => s.createdAt >= fromMs && s.createdAt <= toMs);
}

export function saleToCUP(s: Sale, rate: number): number {
  if (s.currency === 'CUP') return s.total;
  return s.total * rate;
}

export async function getShiftSalesTotalCUP(shiftId: string, rate = 120): Promise<number> {
  const sales = await getSalesForShift(shiftId);
  return sales.reduce((sum, s) => sum + saleToCUP(s, rate), 0);
}

export async function deductStockForSale(items: SaleItem[]) {
  for (const item of items) {
    await addMovement({
      id: newId(),
      productId: item.id,
      type: 'out',
      quantity: item.qty,
      reason: 'Venta',
      createdAt: Date.now(),
    });
  }
}

export async function getLowStockProducts(): Promise<Product[]> {
  const products = await getAllProducts();
  return products.filter(p => p.active !== false && p.stock <= (p.minStock ?? 0));
}

export async function getDashboardStats(rate = 120) {
  const today = await getTodaySales();
  const salesCount = today.length;
  const totalCUP = today.reduce((sum, s) => sum + saleToCUP(s, rate), 0);
  const avgTicket = salesCount > 0 ? totalCUP / salesCount : 0;
  const lowStock = await getLowStockProducts();
  const openShift = await getOpenShift();
  return { salesCount, totalCUP, avgTicket, lowStockCount: lowStock.length, openShift };
}

export type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'shift' | 'all';

export function periodRange(period: PeriodKey): { from: number; to: number } {
  const now = new Date();
  const to = now.getTime();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  if (period === 'today') return { from: startOfDay(now), to };
  if (period === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const from = startOfDay(y);
    return { from, to: from + 24 * 60 * 60 * 1000 - 1 };
  }
  if (period === 'week') {
    const from = startOfDay(now) - 6 * 24 * 60 * 60 * 1000;
    return { from, to };
  }
  if (period === 'month') {
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    return { from, to };
  }
  return { from: 0, to };
}

export interface BuiltStats {
  salesCount: number;
  totalCUP: number;
  avgTicket: number;
  totalDiscount: number;
  paidCUP: number;
  paidUSD: number;
  topProducts: { name: string; qty: number; amountCUP: number }[];
  byPayment: { method: string; count: number; amountCUP: number }[];
  byCurrency: { CUP: number; USD: number; countCUP: number; countUSD: number };
  shiftInfo: { open: boolean; openedAt?: number; floatCUP?: number; salesCUP?: number; salesCount?: number } | null;
  lowStock: Product[];
  inventoryValueCUP: number;
}

export async function buildStats(period: PeriodKey, rate = 120): Promise<BuiltStats> {
  let sales: Sale[];
  if (period === 'shift') {
    const open = await getOpenShift();
    sales = open ? await getSalesForShift(open.id) : [];
  } else if (period === 'all') {
    sales = await getAllSales();
  } else {
    const { from, to } = periodRange(period);
    sales = await getSalesInRange(from, to);
  }

  const salesCount = sales.length;
  const totalCUP = sales.reduce((s, x) => s + saleToCUP(x, rate), 0);
  const avgTicket = salesCount > 0 ? totalCUP / salesCount : 0;
  const totalDiscount = sales.reduce((s, x) => {
    const d = x.discount || 0;
    return s + (x.currency === 'CUP' ? d : d * rate);
  }, 0);
  const paidCUP = sales.reduce((s, x) => s + (x.paidCUP || 0), 0);
  const paidUSD = sales.reduce((s, x) => s + (x.paidUSD || 0), 0);

  const productMap = new Map<string, { name: string; qty: number; amountCUP: number }>();
  for (const sale of sales) {
    for (const it of sale.items || []) {
      const prev = productMap.get(it.id) || { name: it.name, qty: 0, amountCUP: 0 };
      const line = (sale.currency === 'CUP' ? it.priceCUP : it.priceUSD * rate) * it.qty;
      prev.qty += it.qty;
      prev.amountCUP += line;
      productMap.set(it.id, prev);
    }
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.amountCUP - a.amountCUP)
    .slice(0, 10);

  const payMap = new Map<string, { method: string; count: number; amountCUP: number }>();
  for (const sale of sales) {
    const m = sale.paymentMethod || 'otro';
    const prev = payMap.get(m) || { method: m, count: 0, amountCUP: 0 };
    prev.count += 1;
    prev.amountCUP += saleToCUP(sale, rate);
    payMap.set(m, prev);
  }
  const byPayment = Array.from(payMap.values()).sort((a, b) => b.amountCUP - a.amountCUP);

  let countCUP = 0, countUSD = 0, sumCUP = 0, sumUSD = 0;
  for (const sale of sales) {
    if (sale.currency === 'USD') {
      countUSD++;
      sumUSD += sale.total;
    } else {
      countCUP++;
      sumCUP += sale.total;
    }
  }

  const open = await getOpenShift();
  let shiftInfo: BuiltStats['shiftInfo'] = null;
  if (open) {
    const shiftSales = await getSalesForShift(open.id);
    shiftInfo = {
      open: true,
      openedAt: open.openedAt,
      floatCUP: open.openingFloatCUP,
      salesCount: shiftSales.length,
      salesCUP: shiftSales.reduce((s, x) => s + saleToCUP(x, rate), 0),
    };
  } else {
    shiftInfo = { open: false };
  }

  const lowStock = await getLowStockProducts();
  const products = await getAllProducts();
  const inventoryValueCUP = products.reduce((s, p) => s + (p.stock * (p.costCUP || p.priceCUP || 0)), 0);

  return {
    salesCount,
    totalCUP,
    avgTicket,
    totalDiscount,
    paidCUP,
    paidUSD,
    topProducts,
    byPayment,
    byCurrency: { CUP: sumCUP, USD: sumUSD, countCUP, countUSD },
    shiftInfo,
    lowStock,
    inventoryValueCUP,
  };
}

export const DEFAULT_VISIBLE_STATS: StatKey[] = [
  'totalSales', 'salesCount', 'avgTicket', 'topProducts', 'shiftSummary', 'lowStock',
];
