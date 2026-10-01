import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import {
  getDB, getSettings, saveSettings, getAllProducts, getAllSales,
  getAllMovements, getAllShifts, Product, Sale, InventoryMovement, Shift,
  setOnboardingCompleted,
} from './storage';

const BACKUP_FILE = 'cuba-pos-backup.json';
const BACKUP_META_KEY = 'last_backup_at';

export interface BackupPayload {
  version: 1;
  exportedAt: number;
  onboardingDone: boolean;
  settings: any;
  products: Product[];
  sales: Sale[];
  movements: InventoryMovement[];
  shifts: Shift[];
  cashCounts: any[];
  activeShiftId?: string | null;
}

async function collectPayload(): Promise<BackupPayload> {
  const db = await getDB();
  const settings = await getSettings();
  const products = await getAllProducts();
  const sales = await getAllSales();
  const movements = await getAllMovements();
  const shifts = await getAllShifts();
  let cashCounts: any[] = [];
  try {
    cashCounts = await db.getAll('cashCounts');
  } catch { /* empty */ }

  const { value: onboarding } = await Preferences.get({ key: 'onboarding_done' });
  const { value: activeShiftId } = await Preferences.get({ key: 'active_shift_id' });

  return {
    version: 1,
    exportedAt: Date.now(),
    onboardingDone: onboarding === 'true',
    settings,
    products,
    sales,
    movements,
    shifts,
    cashCounts,
    activeShiftId: activeShiftId || null,
  };
}

/** Escribe el respaldo en almacenamiento del dispositivo (varias ubicaciones). */
export async function writeBackupToDevice(): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const payload = await collectPayload();
    const data = JSON.stringify(payload);

    await Preferences.set({ key: BACKUP_META_KEY, value: String(payload.exportedAt) });
    await Preferences.set({ key: 'backup_blob_v1', value: data });

    if (!Capacitor.isNativePlatform()) {
      try {
        localStorage.setItem('cuba_pos_backup_v1', data);
      } catch { /* quota */ }
      return { ok: true, path: 'Preferences + localStorage' };
    }

    const dirs = [Directory.Data, Directory.Documents, Directory.External, Directory.Cache];
    let lastPath = '';
    let wrote = false;

    for (const dir of dirs) {
      try {
        await Filesystem.writeFile({
          path: BACKUP_FILE,
          data,
          directory: dir,
          encoding: Encoding.UTF8,
          recursive: true,
        });
        lastPath = `${dir}/${BACKUP_FILE}`;
        wrote = true;
      } catch (e) {
        console.warn('backup write failed for', dir, e);
      }
    }

    if (wrote) return { ok: true, path: lastPath };
    return { ok: true, path: 'Preferences (solo interno)' };
  } catch (e: any) {
    console.error(e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Lee el respaldo más reciente disponible. */
export async function readBackupFromDevice(): Promise<BackupPayload | null> {
  try {
    const { value } = await Preferences.get({ key: 'backup_blob_v1' });
    if (value) {
      const parsed = JSON.parse(value) as BackupPayload;
      if (parsed && parsed.version === 1) return parsed;
    }
  } catch { /* continue */ }

  if (!Capacitor.isNativePlatform()) {
    try {
      const raw = localStorage.getItem('cuba_pos_backup_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as BackupPayload;
        if (parsed && parsed.version === 1) return parsed;
      }
    } catch { /* */ }
    return null;
  }

  const dirs = [Directory.Data, Directory.Documents, Directory.External, Directory.Cache];
  for (const dir of dirs) {
    try {
      const res = await Filesystem.readFile({
        path: BACKUP_FILE,
        directory: dir,
        encoding: Encoding.UTF8,
      });
      const text = typeof res.data === 'string' ? res.data : '';
      if (text) {
        const parsed = JSON.parse(text) as BackupPayload;
        if (parsed && parsed.version === 1) return parsed;
      }
    } catch {
      // no file
    }
  }
  return null;
}

/** Restaura productos, ventas, turnos, etc. desde un payload. */
export async function restoreFromPayload(payload: BackupPayload): Promise<void> {
  if (!payload || payload.version !== 1) {
    throw new Error('Respaldo inválido');
  }

  const db = await getDB();
  const storeNames = ['products', 'sales', 'inventoryMovements', 'shifts', 'cashCounts', 'outbox'] as const;
  for (const name of storeNames) {
    try {
      if (db.objectStoreNames.contains(name)) {
        await db.clear(name);
      }
    } catch (e) {
      console.warn('clear', name, e);
    }
  }

  if (payload.settings) {
    await saveSettings(payload.settings);
  }

  for (const p of payload.products || []) {
    await db.put('products', p);
  }
  for (const s of payload.sales || []) {
    await db.put('sales', s);
  }
  for (const m of payload.movements || []) {
    await db.put('inventoryMovements', m);
  }
  for (const sh of payload.shifts || []) {
    await db.put('shifts', sh);
  }
  for (const c of payload.cashCounts || []) {
    if (c && c.id) await db.put('cashCounts', c);
  }

  if (payload.onboardingDone) {
    await setOnboardingCompleted();
  }
  if (payload.activeShiftId) {
    await Preferences.set({ key: 'active_shift_id', value: payload.activeShiftId });
  } else {
    await Preferences.remove({ key: 'active_shift_id' });
  }

  await Preferences.set({ key: 'backup_blob_v1', value: JSON.stringify(payload) });
  await Preferences.set({ key: BACKUP_META_KEY, value: String(Date.now()) });
}

export async function exportBackupText(): Promise<string> {
  await writeBackupToDevice();
  const payload = await collectPayload();
  return JSON.stringify(payload, null, 2);
}

export async function importBackupText(text: string): Promise<void> {
  const payload = JSON.parse(text) as BackupPayload;
  await restoreFromPayload(payload);
  await writeBackupToDevice();
}

/** Si la BD está vacía pero hay respaldo, devolver el payload. */
export async function detectEmptyDbWithBackup(): Promise<BackupPayload | null> {
  const products = await getAllProducts();
  const sales = await getAllSales();
  if (products.length > 0 || sales.length > 0) return null;
  return readBackupFromDevice();
}

let autoBackupTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutoBackup() {
  if (autoBackupTimer) clearTimeout(autoBackupTimer);
  autoBackupTimer = setTimeout(() => {
    writeBackupToDevice().catch(e => console.warn('auto backup', e));
  }, 3000);
}

export async function getLastBackupAt(): Promise<number | null> {
  const { value } = await Preferences.get({ key: BACKUP_META_KEY });
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
