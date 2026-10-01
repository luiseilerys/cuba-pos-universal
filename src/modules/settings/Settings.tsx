import { useState, useEffect } from 'preact/hooks';
import { getSettings, saveSettings, AppSettings } from '../../lib/storage';
import {
  InfoBlockKey, DEFAULT_VISIBLE_INFO, INFO_BLOCK_OPTIONS,
} from '../../lib/series';
import { showToast } from '../../lib/toast';
import {
  writeBackupToDevice, exportBackupText, importBackupText,
  getLastBackupAt, scheduleAutoBackup,
} from '../../lib/backup';

export function Settings() {
  const [form, setForm] = useState<AppSettings>({
    businessName: '',
    businessPhone: '',
    rateUSDToCUP: 120,
    ticketFooter: 'Gracias por su compra',
  });
  const [visibleInfo, setVisibleInfo] = useState<InfoBlockKey[]>(DEFAULT_VISIBLE_INFO);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [sellers, setSellers] = useState<string[]>([]);
  const [newSeller, setNewSeller] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [importText, setImportText] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const refreshBackupMeta = async () => {
    setLastBackup(await getLastBackupAt());
  };

  useEffect(() => {
    getSettings()
      .then(s => {
        setForm({
          businessName: s.businessName || '',
          businessPhone: s.businessPhone || '',
          rateUSDToCUP: s.rateUSDToCUP || 120,
          ticketFooter: s.ticketFooter != null && s.ticketFooter !== ''
            ? s.ticketFooter
            : 'Gracias por su compra',
        });
        if (s.visibleInfo && s.visibleInfo.length > 0) {
          setVisibleInfo(s.visibleInfo as InfoBlockKey[]);
        }
        setChartType(s.chartType === 'line' ? 'line' : 'bar');
        setSellers(Array.isArray(s.sellers) ? s.sellers.filter(Boolean) : []);
      })
      .catch(() => showToast('Error al cargar ajustes', 'error'));
    refreshBackupMeta();
  }, []);

  const toggleInfo = (key: InfoBlockKey) => {
    setVisibleInfo(prev =>
      prev.indexOf(key) >= 0 ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const addSeller = () => {
    const name = newSeller.trim();
    if (!name) {
      showToast('Escribe el nombre del vendedor', 'info');
      return;
    }
    const exists = sellers.some(s => s.toLowerCase() === name.toLowerCase());
    if (exists) {
      showToast('Ese vendedor ya está en la lista', 'info');
      return;
    }
    setSellers(prev => [...prev, name]);
    setNewSeller('');
  };

  const removeSeller = (name: string) => {
    setSellers(prev => prev.filter(s => s !== name));
  };

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
        visibleInfo,
        chartType,
        sellers,
      });
      scheduleAutoBackup();
      showToast('Ajustes guardados', 'ok');
    } catch (e) {
      console.error(e);
      showToast('No se pudieron guardar los ajustes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const doBackupNow = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const r = await writeBackupToDevice();
      await refreshBackupMeta();
      if (r.ok) showToast('Respaldo guardado en el dispositivo', 'ok');
      else showToast(r.error || 'Error al respaldar', 'error');
    } catch (e) {
      console.error(e);
      showToast('Error al respaldar', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const doExportCopy = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const text = await exportBackupText();
      await refreshBackupMeta();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showToast('Respaldo copiado al portapapeles', 'ok');
      } else {
        setImportText(text);
        setShowImport(true);
        showToast('Copia el texto del respaldo manualmente', 'info');
      }
    } catch (e) {
      console.error(e);
      showToast('Error al exportar', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const doImport = async () => {
    if (backupBusy) return;
    const text = importText.trim();
    if (!text) {
      showToast('Pega el JSON del respaldo', 'info');
      return;
    }
    setBackupBusy(true);
    try {
      await importBackupText(text);
      setShowImport(false);
      setImportText('');
      await refreshBackupMeta();
      showToast('Datos restaurados. Reinicia la pantalla si hace falta.', 'ok');
    } catch (e) {
      console.error(e);
      showToast('JSON inválido o corrupto', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const groups = ['Números', 'Gráficos', 'Detalle'];

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
      </div>

      <div class="card">
        <h2 style={{ fontSize: 17, marginBottom: 6 }}>Datos y respaldos</h2>
        <p class="muted" style={{ marginBottom: 10 }}>
          Los datos se guardan en este teléfono. Al <strong>actualizar</strong> la app se conservan.
          Antes de <strong>desinstalar</strong>, exporta un respaldo y guárdalo (WhatsApp, notas, USB).
        </p>
        {lastBackup && (
          <p class="muted" style={{ marginBottom: 10 }}>
            Último respaldo automático: {new Date(lastBackup).toLocaleString('es-CU')}
          </p>
        )}
        <button type="button" class="btn btn-block" disabled={backupBusy} onClick={doBackupNow}>
          {backupBusy ? 'Guardando…' : 'Guardar respaldo ahora'}
        </button>
        <button type="button" class="btn btn-secondary btn-block" style={{ marginTop: 8 }} disabled={backupBusy} onClick={doExportCopy}>
          Copiar respaldo (JSON)
        </button>
        <button type="button" class="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={() => setShowImport(true)}>
          Restaurar desde texto JSON
        </button>
      </div>

      <div class="card">
        <h2 style={{ fontSize: 17, marginBottom: 6 }}>Vendedores</h2>
        <p class="muted" style={{ marginBottom: 12 }}>
          Lista de vendedores para elegir al abrir el turno. El nombre aparece en el ticket.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            class="input"
            style={{ flex: 1, marginBottom: 0 }}
            value={newSeller}
            placeholder="Nombre del vendedor"
            onInput={e => setNewSeller((e.target as HTMLInputElement).value)}
            onKeyDown={e => {
              if ((e as KeyboardEvent).key === 'Enter') {
                e.preventDefault();
                addSeller();
              }
            }}
          />
          <button type="button" class="btn" style={{ flexShrink: 0, minWidth: 90 }} onClick={addSeller}>
            Añadir
          </button>
        </div>

        {sellers.length === 0 && (
          <p class="muted">No hay vendedores. Añade al menos uno para usarlo al abrir turno.</p>
        )}
        {sellers.map(name => (
          <div
            key={name}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', marginBottom: 8, borderRadius: 10,
              border: '1px solid var(--border)', background: '#fff',
            }}
          >
            <span style={{ fontWeight: 600 }}>{name}</span>
            <button type="button" class="btn btn-danger btn-sm" onClick={() => removeSeller(name)}>
              Quitar
            </button>
          </div>
        ))}
      </div>

      <div class="card">
        <h2 style={{ fontSize: 17, marginBottom: 6 }}>Tipo de gráfico</h2>
        <p class="muted" style={{ marginBottom: 12 }}>
          Cómo se muestran los gráficos en la pestaña Info.
        </p>
        <div class="grid-2">
          <button
            type="button"
            class={`btn ${chartType === 'bar' ? '' : 'btn-secondary'}`}
            onClick={() => setChartType('bar')}
          >
            Barras
          </button>
          <button
            type="button"
            class={`btn ${chartType === 'line' ? '' : 'btn-secondary'}`}
            onClick={() => setChartType('line')}
          >
            Líneas
          </button>
        </div>
      </div>

      <div class="card">
        <h2 style={{ fontSize: 17, marginBottom: 6 }}>Bloques de Información</h2>
        <p class="muted" style={{ marginBottom: 12 }}>
          Marca qué resúmenes y gráficos quieres ver en la pestaña Info.
        </p>

        {groups.map(g => (
          <div key={g} style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {g}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {INFO_BLOCK_OPTIONS.filter(o => o.group === g).map(opt => {
                const on = visibleInfo.indexOf(opt.key) >= 0;
                return (
                  <label
                    key={opt.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10, fontWeight: 600, fontSize: 14,
                      background: on ? '#ccfbf1' : '#fff',
                      border: on ? '1px solid #0f766e' : '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleInfo(opt.key)}
                      style={{ width: 18, height: 18 }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div class="card">
        <button type="button" class="btn btn-block" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      </div>

      <div class="card">
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Sobre esta app</h3>
        <p class="muted">
          Cuba POS Universal · Offline-first · Multimoneda CUP/USD · Compatible Android 5+.
        </p>
      </div>

      {showImport && (
        <div class="modal-backdrop">
          <div class="modal-sheet">
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Restaurar respaldo</h2>
            <p class="muted" style={{ marginBottom: 10 }}>
              Pega aquí el JSON del respaldo (copiado antes). Esto reemplaza los datos actuales.
            </p>
            <textarea
              class="input"
              rows={8}
              value={importText}
              onInput={e => setImportText((e.target as HTMLTextAreaElement).value)}
              placeholder="{ ... }"
              style={{ marginBottom: 12, minHeight: 140, fontFamily: 'monospace', fontSize: 12 }}
            />
            <div class="grid-2">
              <button type="button" class="btn btn-secondary" onClick={() => setShowImport(false)} disabled={backupBusy}>Cancelar</button>
              <button type="button" class="btn" onClick={doImport} disabled={backupBusy}>
                {backupBusy ? 'Restaurando…' : 'Restaurar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
