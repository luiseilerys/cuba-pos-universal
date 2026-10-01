import { useState, useEffect } from 'preact/hooks';
import { getSettings, saveSettings, AppSettings } from '../../lib/storage';
import { showToast } from '../../lib/toast';

export function Settings() {
  const [form, setForm] = useState<AppSettings>({
    businessName: '',
    businessPhone: '',
    rateUSDToCUP: 120,
    ticketFooter: 'Gracias por su compra',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then(s => setForm({
        businessName: s.businessName || '',
        businessPhone: s.businessPhone || '',
        rateUSDToCUP: s.rateUSDToCUP || 120,
        ticketFooter: s.ticketFooter != null && s.ticketFooter !== ''
          ? s.ticketFooter
          : 'Gracias por su compra',
      }))
      .catch(() => showToast('Error al cargar ajustes', 'error'));
  }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const footer = (form.ticketFooter ?? '').trim();
      await saveSettings({
        businessName: (form.businessName || '').trim(),
        businessPhone: (form.businessPhone || '').trim(),
        rateUSDToCUP: Number(form.rateUSDToCUP) || 120,
        ticketFooter: footer || 'Gracias por su compra',
      });
      showToast('Ajustes guardados', 'ok');
    } catch (e) {
      console.error(e);
      showToast('No se pudieron guardar los ajustes', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ height: 'calc(100% - 60px)', overflow: 'auto' }}>
      <div class="card">
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Ajustes</h1>

        <label class="muted">Nombre del negocio</label>
        <input
          class="input"
          value={form.businessName || ''}
          onInput={e => setForm({ ...form, businessName: (e.target as HTMLInputElement).value })}
          placeholder="Ej. Cafetería El Portal"
          style={{ marginBottom: 12 }}
        />

        <label class="muted">Teléfono</label>
        <input
          class="input"
          value={form.businessPhone || ''}
          onInput={e => setForm({ ...form, businessPhone: (e.target as HTMLInputElement).value })}
          placeholder="Opcional"
          style={{ marginBottom: 12 }}
        />

        <label class="muted">Tasa USD → CUP (ej. 120 o 24)</label>
        <input
          class="input"
          type="number"
          min="1"
          value={form.rateUSDToCUP || 120}
          onInput={e => setForm({ ...form, rateUSDToCUP: parseFloat((e.target as HTMLInputElement).value) || 120 })}
          style={{ marginBottom: 12 }}
        />

        <label class="muted">Pie del ticket</label>
        <textarea
          class="input"
          rows={3}
          value={form.ticketFooter || ''}
          onInput={e => setForm({ ...form, ticketFooter: (e.target as HTMLTextAreaElement).value })}
          placeholder="Gracias por su compra"
          style={{ marginBottom: 8, minHeight: 80, resize: 'vertical' }}
        />
        <p class="muted" style={{ marginBottom: 16 }}>
          Este texto aparece al final de cada ticket de venta.
        </p>

        <button type="button" class="btn btn-block" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      </div>

      <div class="card">
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Vista previa del pie</h3>
        <pre style={{
          whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13,
          background: '#f8fafc', padding: 12, borderRadius: 8, margin: 0,
        }}>
          {(form.businessName || 'Tu negocio') + '\n'}
          {'------------------------\n'}
          {'TOTAL: 100.00 CUP\n'}
          {(form.ticketFooter || 'Gracias por su compra')}
        </pre>
      </div>

      <div class="card">
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Sobre esta app</h3>
        <p class="muted">
          Cuba POS Universal · Offline-first · Multimoneda CUP/USD · Compatible Android 5+.
          Los datos se guardan en este dispositivo y se sincronizan cuando haya conexión.
        </p>
      </div>
    </div>
  );
}
