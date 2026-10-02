import { useState, useEffect } from 'preact/hooks';
import { getDashboardStats, getLowStockProducts, Product, getSettings } from '../../lib/storage';
import { Icon } from '../../components/Icon';

export function Dashboard() {
  const [totalCUP, setTotalCUP] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [avgTicket, setAvgTicket] = useState(0);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [businessName, setBusinessName] = useState('Cuba POS');
  const [shiftOpen, setShiftOpen] = useState(false);

  const load = async () => {
    const s = await getSettings();
    const rate = s.rateUSDToCUP || 120;
    if (s.businessName) setBusinessName(s.businessName);
    const stats = await getDashboardStats(rate);
    setTotalCUP(stats.totalCUP);
    setSalesCount(stats.salesCount);
    setAvgTicket(stats.avgTicket);
    setShiftOpen(!!stats.openShift);
    setLowStock(await getLowStockProducts());
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: 4, overflow: 'auto', height: 'calc(100% - 60px)' }}>
      <div style={{ padding: '14px 12px 0' }}>
        <h1 style={{ fontSize: 20, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span class="icon-wrap" style={{
            display: 'inline-flex', width: 36, height: 36, borderRadius: 10,
            background: '#ccfbf1', color: 'var(--primary)', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="star" size={18} />
          </span>
          {businessName}
        </h1>
        <p class="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={shiftOpen ? 'unlock' : 'lock'} size={14} />
          Resumen de hoy · {shiftOpen ? 'Turno abierto' : 'Turno cerrado'}
        </p>
      </div>

      <div class="grid-2">
        <div class="card stat-card">
          <Icon name="trending" size={20} class="stat-icon" />
          <div class="muted">Ventas de hoy</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{totalCUP.toFixed(0)} CUP</div>
        </div>
        <div class="card stat-card">
          <Icon name="receipt" size={20} class="stat-icon" />
          <div class="muted">Cantidad de ventas</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{salesCount}</div>
        </div>
        <div class="card stat-card">
          <Icon name="dollar" size={20} class="stat-icon" />
          <div class="muted">Ticket promedio</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{avgTicket.toFixed(0)} CUP</div>
        </div>
        <div class="card stat-card">
          <Icon name="alert" size={20} class="stat-icon" style={{ color: lowStock.length ? 'var(--danger)' : undefined, opacity: 0.45 }} />
          <div class="muted">Stock bajo</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: lowStock.length ? 'var(--danger)' : 'inherit' }}>
            {lowStock.length}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span class="icon-wrap"><Icon name="layers" size={16} /></span>
          Acciones rápidas
        </div>
        <div class="grid-2">
          <a href="/pos" class="btn" style={{ textDecoration: 'none' }}>
            <Icon name="cart" size={18} /> Vender
          </a>
          <a href="/cash" class="btn btn-secondary" style={{ textDecoration: 'none' }}>
            <Icon name="cash" size={18} /> Arquear
          </a>
          <a href="/inventory" class="btn btn-secondary" style={{ textDecoration: 'none' }}>
            <Icon name="box" size={18} /> Inventario
          </a>
          <a href="/settings" class="btn btn-secondary" style={{ textDecoration: 'none' }}>
            <Icon name="settings" size={18} /> Ajustes
          </a>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div class="card">
          <div class="card-title">
            <span class="icon-wrap" style={{ background: '#fee2e2', color: 'var(--danger)' }}>
              <Icon name="alert" size={16} />
            </span>
            Productos con stock bajo
          </div>
          {lowStock.slice(0, 8).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{p.name}</span>
              <span class="badge badge-danger">{p.stock} / mín {p.minStock || 0}</span>
            </div>
          ))}
        </div>
      )}

      {salesCount === 0 && lowStock.length === 0 && (
        <div class="card empty-state">
          <Icon name="cart" size={40} style={{ opacity: 0.35, marginBottom: 8 }} />
          <p>Aún no hay ventas hoy.</p>
          <p class="muted">Abre el turno en POS y registra la primera venta.</p>
          <a href="/pos" class="btn" style={{ textDecoration: 'none', display: 'inline-flex' }}>
            <Icon name="cart" size={18} /> Ir a vender
          </a>
        </div>
      )}
    </div>
  );
}
