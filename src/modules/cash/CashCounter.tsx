import { useState, useMemo, useEffect } from 'preact/hooks';
import { enqueue } from '../../offline/syncEngine';
import {
  getOpenShift, getShiftSalesTotalCUP, closeOpenShift, getSettings,
} from '../../lib/storage';
import { showToast } from '../../lib/toast';
import { newId } from '../../lib/id';

const CUP_DENOMS = [
  { value: 1000, label: '1000' }, { value: 500, label: '500' }, { value: 200, label: '200' },
  { value: 100, label: '100' }, { value: 50, label: '50' }, { value: 20, label: '20' },
  { value: 10, label: '10' }, { value: 5, label: '5' }, { value: 3, label: '3' },
  { value: 1, label: '1' }, { value: 0.05, label: '5¢' }, { value: 0.01, label: '1¢' },
];

const USD_DENOMS = [
  { value: 100, label: '100' }, { value: 50, label: '50' }, { value: 20, label: '20' },
  { value: 10, label: '10' }, { value: 5, label: '5' }, { value: 1, label: '1' },
  { value: 0.25, label: '25¢' }, { value: 0.10, label: '10¢' }, { value: 0.05, label: '5¢' },
  { value: 0.01, label: '1¢' },
];

export function CashCounter() {
  const [currency, setCurrency] = useState<'CUP' | 'USD'>('CUP');
  const [counts, setCounts] = useState<Record<number, number>>({});
  /** Esperado siempre en la moneda seleccionada */
  const [expected, setExpected] = useState(0);
  /** Esperado del turno en CUP (base) */
  const [expectedCUP, setExpectedCUP] = useState(0);
  const [rate, setRate] = useState(120);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [openingFloat, setOpeningFloat] = useState(0);
  const [busy, setBusy] = useState(false);

  const refreshShift = async () => {
    try {
      const shift = await getOpenShift();
      const s = await getSettings();
      const r = s.rateUSDToCUP || 120;
      setRate(r);
      if (shift) {
        setShiftOpen(true);
        setOpeningFloat(shift.openingFloatCUP);
        const salesCUP = await getShiftSalesTotalCUP(shift.id, r);
        const cup = Math.round((shift.openingFloatCUP + salesCUP) * 100) / 100;
        setExpectedCUP(cup);
        // Mostrar esperado en la moneda activa
        setExpected(currency === 'USD' && r > 0 ? Math.round((cup / r) * 100) / 100 : cup);
      } else {
        setShiftOpen(false);
        setOpeningFloat(0);
        setExpectedCUP(0);
      }
    } catch (e) {
      console.error(e);
      showToast('Error al leer el turno', 'error');
    }
  };

  useEffect(() => {
    refreshShift();
  }, []);

  const switchCurrency = (next: 'CUP' | 'USD') => {
    setCurrency(next);
    setCounts({});
    // Convertir esperado entre monedas
    if (next === 'USD' && rate > 0) {
      setExpected(Math.round((expectedCUP / rate) * 100) / 100);
    } else {
      setExpected(expectedCUP);
    }
  };

  const denoms = currency === 'CUP' ? CUP_DENOMS : USD_DENOMS;

  const total = useMemo(() => {
    return denoms.reduce((sum, d) => sum + (counts[d.value] || 0) * d.value, 0);
  }, [counts, currency]);

  const diff = total - expected;
  const status = Math.abs(diff) < 0.05 ? 'ok' : Math.abs(diff) < 50 ? 'warn' : 'bad';

  const setQty = (value: number, qty: number) => {
    setCounts(prev => ({ ...prev, [value]: Math.max(0, qty) }));
  };

  const save = async (andClose: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const shift = await getOpenShift();
      const count = {
        id: newId(),
        shiftId: shift?.id || null,
        currency,
        total,
        expected,
        difference: diff,
        denominations: { ...counts },
        createdAt: Date.now(),
      };
      await enqueue('cash_count', count);

      if (andClose) {
        const closed = await closeOpenShift();
        setShiftOpen(false);
        if (closed) {
          showToast('Arqueo guardado y turno cerrado', 'ok');
        } else {
          showToast('Arqueo guardado (no había turno abierto)', 'info');
        }
      } else {
        showToast(`Arqueo guardado · dif. ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} ${currency}`, 'ok');
      }
    } catch (e) {
      console.error(e);
      showToast('Error al guardar el arqueo', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onlyClose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const closed = await closeOpenShift();
      if (closed) {
        setShiftOpen(false);
        showToast('Turno cerrado', 'ok');
      } else {
        showToast('No hay turno abierto', 'info');
        setShiftOpen(false);
      }
    } catch (e) {
      console.error(e);
      showToast('No se pudo cerrar el turno', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ height: 'calc(100% - 60px)', overflow: 'auto' }}>
      <div class={shiftOpen ? 'shift-banner' : 'shift-banner closed'}>
        {shiftOpen
          ? `● Turno abierto · Fondo ${openingFloat} CUP`
          : '○ No hay turno abierto'}
      </div>

      <div class="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18 }}>Arqueo de caja</h2>
          <div class="grid-2" style={{ width: 130 }}>
            <button type="button" class={`btn btn-sm ${currency === 'CUP' ? '' : 'btn-secondary'}`}
              onClick={() => switchCurrency('CUP')}>CUP</button>
            <button type="button" class={`btn btn-sm ${currency === 'USD' ? '' : 'btn-secondary'}`}
              onClick={() => switchCurrency('USD')}>USD</button>
          </div>
        </div>

        <p class="muted" style={{ marginTop: 8 }}>
          {shiftOpen
            ? 'El monto esperado se rellena con fondo + ventas del turno (convertido si usas USD).'
            : 'Puedes arquear igual. Abre turno en POS si quieres vincularlo.'}
        </p>

        <div style={{ margin: '12px 0' }}>
          <label class="muted">Monto esperado ({currency})</label>
          <input class="input" type="number" value={expected || ''}
            onInput={e => setExpected(parseFloat((e.target as HTMLInputElement).value) || 0)}
            placeholder="0.00" />
        </div>

        {shiftOpen && (
          <button type="button" class="btn btn-danger btn-block" disabled={busy} onClick={onlyClose}>
            {busy ? 'Cerrando…' : 'Cerrar turno ahora'}
          </button>
        )}
        {!shiftOpen && (
          <button type="button" class="btn btn-secondary btn-block" onClick={refreshShift}>
            Actualizar estado del turno
          </button>
        )}
      </div>

      <div class="card">
        {denoms.map(d => (
          <div key={d.value} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 48, fontWeight: 600 }}>{d.label}</span>
            <button type="button" class="btn btn-secondary btn-sm" onClick={() => setQty(d.value, (counts[d.value] || 0) - 1)}>−</button>
            <input class="input" style={{ width: 64, textAlign: 'center', minHeight: 40 }}
              type="number" min="0" value={counts[d.value] || 0}
              onInput={e => setQty(d.value, parseInt((e.target as HTMLInputElement).value) || 0)} />
            <button type="button" class="btn btn-secondary btn-sm" onClick={() => setQty(d.value, (counts[d.value] || 0) + 1)}>+</button>
            <span style={{ marginLeft: 'auto', fontWeight: 600, minWidth: 70, textAlign: 'right' }}>
              {((counts[d.value] || 0) * d.value).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <div class="card" style={{
        background: status === 'ok' ? '#dcfce7' : status === 'warn' ? '#fef3c7' : '#fee2e2',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
          <span>Total contado</span>
          <span>{total.toFixed(2)} {currency}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span>Diferencia</span>
          <span style={{
            fontWeight: 700,
            color: status === 'ok' ? 'var(--success)' : status === 'warn' ? 'var(--warning)' : 'var(--danger)',
          }}>
            {diff >= 0 ? '+' : ''}{diff.toFixed(2)} {currency}
          </span>
        </div>
        <button type="button" class="btn btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => save(false)}>
          Guardar arqueo
        </button>
        <button type="button" class="btn btn-secondary btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={() => save(true)}>
          Guardar y cerrar turno
        </button>
      </div>
    </div>
  );
}
