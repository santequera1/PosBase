import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Edit2, Trash2, UsersRound, CalendarCheck, HandCoins, PiggyBank, FileSpreadsheet, Search, Banknote, ArrowLeftRight, CreditCard,
  CheckCircle2, Clock, AlertTriangle, Calculator, Link2, Info,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Modal, Chip, KpiCard, INPUT, LABEL, fmtDate, fmtTime, periodPresets } from '@/components/common/Primitives';

/* ------------------------------------------------------------------ */
/* Tipos y constantes                                                   */
/* ------------------------------------------------------------------ */
type Tab = 'colaboradores' | 'asistencia' | 'propinas' | 'anticipos' | 'liquidaciones';
type PayMode = 'monthly' | 'biweekly' | 'per_shift' | 'per_day' | 'hourly';

interface Employee {
  id: number; userId: number | null; name: string; document: string; phone: string; email: string; position: string;
  payMode: PayMode; payModeLabel: string; baseAmount: number; startDate: string | null; active: boolean; notes: string;
  monthAttendance: number; monthHours: number; unsettledAdvances: number;
}

const PAY_MODES: Array<{ id: PayMode; label: string; hint: string }> = [
  { id: 'per_shift', label: 'Por turno', hint: 'Se paga cada turno/asistencia registrada' },
  { id: 'per_day', label: 'Por día', hint: 'Igual que por turno, cuenta días asistidos' },
  { id: 'hourly', label: 'Por hora', hint: 'Se multiplican las horas registradas' },
  { id: 'biweekly', label: 'Quincenal fijo', hint: 'Sueldo fijo por quincena' },
  { id: 'monthly', label: 'Mensual fijo', hint: 'Sueldo fijo por mes' },
];
const POSITIONS = ['Cajero', 'Heladero', 'Administrador', 'Ayudante', 'Cocina', 'Domiciliario', 'Otro'];
const METHOD_META: Record<string, { label: string; icon: any }> = {
  cash: { label: 'Efectivo', icon: Banknote },
  transfer: { label: 'Transferencia', icon: ArrowLeftRight },
  card: { label: 'Tarjeta / datáfono', icon: CreditCard },
};

const unitLabel = (m: PayMode) => ({ monthly: 'mes', biweekly: 'quincena', per_shift: 'turno', per_day: 'día', hourly: 'hora' }[m]);

/* ------------------------------------------------------------------ */
/* Colaboradores                                                        */
/* ------------------------------------------------------------------ */
const EmployeeModal = ({ employee, users, onClose, onSaved }: { employee: Employee | null; users: any[]; onClose: () => void; onSaved: () => void }) => {
  const [form, setForm] = useState<any>({
    name: employee?.name || '', document: employee?.document || '', phone: employee?.phone || '', email: employee?.email || '',
    position: employee?.position || 'Cajero', payMode: employee?.payMode || 'per_shift', baseAmount: employee ? String(employee.baseAmount) : '',
    startDate: employee?.startDate || '', userId: employee?.userId || 0, notes: employee?.notes || '', active: employee ? employee.active : true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (p: any) => setForm((f: any) => ({ ...f, ...p }));
  const save = async () => {
    setSaving(true); setError('');
    try {
      const payload = { ...form, baseAmount: Number(form.baseAmount) || 0, userId: form.userId || null, startDate: form.startDate || null };
      if (employee) await api.updateEmployee(employee.id, payload); else await api.addEmployee(payload);
      onSaved();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  return (
    <Modal title={employee ? `Editar a ${employee.name}` : 'Nuevo colaborador'} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className={LABEL}>Nombre completo</label><input value={form.name} onChange={e => set({ name: e.target.value })} className={INPUT} /></div>
        <div><label className={LABEL}>Documento</label><input value={form.document} onChange={e => set({ document: e.target.value })} className={INPUT} /></div>
        <div><label className={LABEL}>Teléfono</label><input value={form.phone} onChange={e => set({ phone: e.target.value })} className={INPUT} /></div>
        <div><label className={LABEL}>Cargo</label>
          <select value={form.position} onChange={e => set({ position: e.target.value })} className={INPUT}>{POSITIONS.map(p => <option key={p}>{p}</option>)}</select></div>
        <div><label className={LABEL}>Fecha de ingreso</label><input type="date" value={form.startDate} onChange={e => set({ startDate: e.target.value })} className={INPUT} /></div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Modalidad de pago</label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {PAY_MODES.map(m => (
              <button key={m.id} type="button" onClick={() => set({ payMode: m.id })} className={cn('p-2 rounded-lg border text-left', form.payMode === m.id ? 'border-brand-primary bg-brand-primary/5' : 'border-border')}>
                <span className="block text-xs font-semibold text-brand-dark">{m.label}</span>
                <span className="block text-[10px] text-muted-foreground leading-tight">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div><label className={LABEL}>Valor por {unitLabel(form.payMode)}</label><input type="number" min={0} value={form.baseAmount} onChange={e => set({ baseAmount: e.target.value })} className={cn(INPUT, 'font-mono')} /></div>
        <div>
          <label className={cn(LABEL, 'flex items-center gap-1')}><Link2 size={12} /> Usuario del sistema (opcional)</label>
          <select value={form.userId} onChange={e => set({ userId: Number(e.target.value) })} className={INPUT}>
            <option value={0}>— Sin vincular —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>)}
          </select>
          <p className="text-[10px] text-muted-foreground mt-1">Si se vincula, la asistencia se registra sola al abrir y cerrar caja.</p>
        </div>
        <div className="sm:col-span-2"><label className={LABEL}>Notas</label><input value={form.notes} onChange={e => set({ notes: e.target.value })} className={INPUT} /></div>
        {employee && (
          <label className="sm:col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={form.active} onChange={e => set({ active: e.target.checked })} /> Colaborador activo</label>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={saving || form.name.trim().length < 2} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Guardando...' : 'Guardar'}</button>
    </Modal>
  );
};

const EmployeesTab = ({ employees, reload }: { employees: Employee[]; reload: () => void }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [modal, setModal] = useState<{ open: boolean; employee: Employee | null }>({ open: false, employee: null });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  useEffect(() => { api.getUsers().then(setUsers).catch(() => {}); }, []);
  const remove = async (e: Employee) => {
    if (confirmDelete !== e.id) { setConfirmDelete(e.id); setTimeout(() => setConfirmDelete(null), 3000); return; }
    try { await api.deleteEmployee(e.id); setConfirmDelete(null); reload(); } catch (err: any) { setError(err.message); }
  };
  const list = employees.filter(e => showInactive || e.active);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs text-muted-foreground flex items-center gap-1"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Mostrar inactivos</label>
        <button onClick={() => setModal({ open: true, employee: null })} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab"><Plus size={14} /> Nuevo colaborador</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map(e => (
          <div key={e.id} className={cn('bg-card rounded-xl border border-border p-4 shadow-card', !e.active && 'opacity-50')}>
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-full bg-brand-accent/30 text-brand-dark flex items-center justify-center text-base font-bold shrink-0">{e.name.split(' ').map(p => p[0]).slice(0, 2).join('')}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-brand-dark truncate">{e.name}</p>
                <p className="text-[11px] text-muted-foreground">{e.position}{e.userId ? ' · vinculado al sistema' : ''}</p>
                <p className="text-[11px] text-brand-primary font-semibold">{e.payModeLabel}: {formatPrice(e.baseAmount)}</p>
              </div>
              <div className="flex">
                <button onClick={() => setModal({ open: true, employee: e })} className="p-1.5 text-muted-foreground hover:text-brand-primary"><Edit2 size={14} /></button>
                <button onClick={() => remove(e)} className={cn('p-1.5 rounded-lg', confirmDelete === e.id ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-red-600')}><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
              <div className="bg-brand-card rounded-lg p-2"><p className="text-muted-foreground">Asistencias este mes</p><p className="font-bold text-brand-dark">{e.monthAttendance} {e.payMode === 'hourly' ? `· ${e.monthHours} h` : ''}</p></div>
              <div className={cn('rounded-lg p-2', e.unsettledAdvances > 0 ? 'bg-amber-50' : 'bg-brand-card')}><p className="text-muted-foreground">Anticipos por descontar</p><p className={cn('font-bold', e.unsettledAdvances > 0 ? 'text-amber-800' : 'text-brand-dark')}>{formatPrice(e.unsettledAdvances)}</p></div>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-xs text-muted-foreground">Aún no hay colaboradores registrados.</p>}
      </div>
      {modal.open && <EmployeeModal employee={modal.employee} users={users} onClose={() => setModal({ open: false, employee: null })} onSaved={() => { setModal({ open: false, employee: null }); reload(); }} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Asistencia                                                           */
/* ------------------------------------------------------------------ */
const AttendanceTab = ({ employees }: { employees: Employee[] }) => {
  const today = getColombiaTodayStr();
  const presets = periodPresets(today);
  const [from, setFrom] = useState(presets[2].from);
  const [to, setTo] = useState(today);
  const [employeeId, setEmployeeId] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ employeeId: employees[0]?.id || 0, date: today, checkIn: '', checkOut: '', hours: '', notes: '' });
  const [error, setError] = useState('');
  const load = () => api.getAttendance({ from, to, employeeId: employeeId || undefined }).then(setRows).catch(() => {});
  useEffect(() => { load(); }, [from, to, employeeId]);
  useEffect(() => { if (!form.employeeId && employees[0]) setForm(f => ({ ...f, employeeId: employees[0].id })); }, [employees]);
  const save = async () => {
    setError('');
    try { await api.addAttendance(form); setShow(false); load(); } catch (e: any) { setError(e.message); }
  };
  const remove = async (id: number) => { if (!window.confirm('¿Eliminar este registro de asistencia?')) return; await api.deleteAttendance(id); load(); };
  const byDate = useMemo(() => rows.reduce((acc: Record<string, any[]>, r) => { (acc[r.date] = acc[r.date] || []).push(r); return acc; }, {} as Record<string, any[]>), [rows]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {presets.map(p => <Chip key={p.label} active={from === p.from && to === p.to} onClick={() => { setFrom(p.from); setTo(p.to); }}>{p.label}</Chip>)}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
        <select value={employeeId} onChange={e => setEmployeeId(Number(e.target.value))} className={cn(INPUT, 'w-auto py-1.5 text-xs')}>
          <option value={0}>Todos</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button onClick={() => setShow(true)} className="ml-auto px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab"><Plus size={14} /> Registrar asistencia</button>
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Info size={11} /> Al abrir caja con un usuario vinculado a un colaborador, la asistencia del día se registra automáticamente; al cerrar se calculan las horas.</p>
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {rows.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">Sin registros en el rango.</p> : (
          <ul className="divide-y divide-border">
            {(Object.entries(byDate) as Array<[string, any[]]>).map(([date, list]) => (
              <li key={date} className="px-4 py-2.5">
                <p className="text-[11px] font-bold text-brand-primary mb-1.5">{fmtDate(date)}</p>
                <div className="flex flex-wrap gap-2">
                  {list.map(r => (
                    <div key={r.id} className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-brand-card border border-border text-xs">
                      <CalendarCheck size={13} className="text-emerald-600" />
                      <span className="font-semibold text-brand-dark">{r.employeeName}</span>
                      <span className="text-muted-foreground">{fmtTime(r.checkIn)}–{fmtTime(r.checkOut)}{r.hours ? ` · ${r.hours} h` : ''}{r.source === 'auto' ? ' · auto' : ''}</span>
                      <button onClick={() => remove(r.id)} className="w-6 h-6 rounded-full hover:bg-red-50 text-muted-foreground hover:text-red-600 flex items-center justify-center"><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {show && (
        <Modal title="Registrar asistencia" onClose={() => setShow(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={LABEL}>Colaborador</label>
              <select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: Number(e.target.value) })} className={INPUT}>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
            <div className="col-span-2"><label className={LABEL}>Fecha</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>Entrada</label><input type="time" value={form.checkIn} onChange={e => setForm({ ...form, checkIn: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>Salida</label><input type="time" value={form.checkOut} onChange={e => setForm({ ...form, checkOut: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>Horas (si no hay entrada/salida)</label><input type="number" step="0.5" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>Notas</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={INPUT} /></div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={save} disabled={!form.employeeId} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Guardar</button>
        </Modal>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Propinas                                                             */
/* ------------------------------------------------------------------ */
const TipsTab = ({ employees, isAdmin }: { employees: Employee[]; isAdmin: boolean }) => {
  const today = getColombiaTodayStr();
  const presets = periodPresets(today);
  const [from, setFrom] = useState(presets[2].from);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any>({ tips: [], total: 0, common: 0, direct: 0 });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ date: today, amount: '', employeeId: 0, method: 'cash', notes: '' });
  const [error, setError] = useState('');
  const load = () => api.getTips({ from, to }).then(setData).catch(() => {});
  useEffect(() => { load(); }, [from, to]);
  const save = async () => {
    setError('');
    try { await api.addTip({ ...form, amount: Number(form.amount), employeeId: form.employeeId || null }); setShow(false); setForm({ ...form, amount: '', notes: '' }); load(); } catch (e: any) { setError(e.message); }
  };
  const remove = async (id: number) => { if (!window.confirm('¿Eliminar esta propina?')) return; await api.deleteTip(id); load(); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {presets.map(p => <Chip key={p.label} active={from === p.from && to === p.to} onClick={() => { setFrom(p.from); setTo(p.to); }}>{p.label}</Chip>)}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
        <button onClick={() => setShow(true)} className="ml-auto px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab"><Plus size={14} /> Registrar propina</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total propinas" value={formatPrice(data.total)} />
        <KpiCard label="Comunes (se reparten)" value={formatPrice(data.common)} sub="Entre quienes asistieron ese día" />
        <KpiCard label="Directas" value={formatPrice(data.direct)} sub="Asignadas a una persona" />
      </div>
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {data.tips.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">Sin propinas en el rango.</p> : (
          <ul className="divide-y divide-border">
            {data.tips.map((t: any) => {
              const Icon = METHOD_META[t.method]?.icon || Banknote;
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-9 h-9 rounded-lg bg-brand-accent/25 text-brand-dark flex items-center justify-center shrink-0"><HandCoins size={16} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-dark">{t.employeeName || 'Propina común (bote)'}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtDate(t.date)} · <Icon size={11} className="inline" /> {METHOD_META[t.method]?.label}{t.notes ? ` · ${t.notes}` : ''}</p>
                  </div>
                  <p className="text-sm font-bold text-brand-primary">{formatPrice(t.amount)}</p>
                  {isAdmin && <button onClick={() => remove(t.id)} className="p-1.5 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {show && (
        <Modal title="Registrar propina" onClose={() => setShow(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Fecha</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>Monto</label><input type="number" min={0} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={cn(INPUT, 'font-mono')} /></div>
            <div className="col-span-2"><label className={LABEL}>Para</label>
              <select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: Number(e.target.value) })} className={INPUT}>
                <option value={0}>Propina común (se reparte entre quienes trabajaron ese día)</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select></div>
            <div className="col-span-2"><label className={LABEL}>Recibida por</label>
              <div className="flex gap-2">{Object.entries(METHOD_META).map(([k, m]) => <Chip key={k} active={form.method === k} onClick={() => setForm({ ...form, method: k })}>{m.label}</Chip>)}</div></div>
            <div className="col-span-2"><label className={LABEL}>Notas</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={INPUT} /></div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={save} disabled={!(Number(form.amount) > 0)} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Guardar</button>
        </Modal>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Anticipos                                                            */
/* ------------------------------------------------------------------ */
const AdvancesTab = ({ employees, isAdmin }: { employees: Employee[]; isAdmin: boolean }) => {
  const currentShift = useStore(s => s.currentShift);
  const refreshCurrentShift = useStore(s => s.refreshCurrentShift);
  const [employeeId, setEmployeeId] = useState(0);
  const [onlyUnsettled, setOnlyUnsettled] = useState(true);
  const [data, setData] = useState<any>({ advances: [], total: 0, unsettledTotal: 0 });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ employeeId: employees[0]?.id || 0, date: getColombiaTodayStr(), amount: '', fromCashRegister: true, notes: '' });
  const [error, setError] = useState('');
  const load = () => api.getAdvances({ employeeId: employeeId || undefined, unsettled: onlyUnsettled }).then(setData).catch(() => {});
  useEffect(() => { load(); }, [employeeId, onlyUnsettled]);
  useEffect(() => { if (!form.employeeId && employees[0]) setForm(f => ({ ...f, employeeId: employees[0].id })); }, [employees]);
  const save = async () => {
    setError('');
    try {
      await api.addAdvance({ ...form, amount: Number(form.amount), fromCashRegister: form.fromCashRegister && !!currentShift });
      if (form.fromCashRegister && currentShift) refreshCurrentShift();
      setShow(false); setForm({ ...form, amount: '', notes: '' }); load();
    } catch (e: any) { setError(e.message); }
  };
  const remove = async (a: any) => { if (!window.confirm('¿Eliminar este anticipo? Si salió de una caja abierta, se revierte el retiro.')) return; try { await api.deleteAdvance(a.id); refreshCurrentShift(); load(); } catch (e: any) { setError(e.message); } };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={employeeId} onChange={e => setEmployeeId(Number(e.target.value))} className={cn(INPUT, 'w-auto py-1.5 text-xs')}>
          <option value={0}>Todos los colaboradores</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label className="text-xs text-muted-foreground flex items-center gap-1"><input type="checkbox" checked={onlyUnsettled} onChange={e => setOnlyUnsettled(e.target.checked)} /> Solo pendientes por descontar</label>
        <button onClick={() => setShow(true)} className="ml-auto px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab"><Plus size={14} /> Nuevo anticipo</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Pendiente por descontar" value={formatPrice(data.unsettledTotal)} sub="Se resta automáticamente en la próxima liquidación" className="bg-amber-50 border-amber-200" />
        <KpiCard label="Total listado" value={formatPrice(data.total)} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {data.advances.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">Sin anticipos.</p> : (
          <ul className="divide-y divide-border">
            {data.advances.map((a: any) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-9 h-9 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0"><PiggyBank size={16} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-dark">{a.employeeName}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(a.date)}{a.fromCashRegister ? ' · salió de caja' : ''}{a.notes ? ` · ${a.notes}` : ''}</p>
                </div>
                {a.settled ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">Descontado</span> : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Pendiente</span>}
                <p className="text-sm font-bold text-brand-primary w-24 text-right">{formatPrice(a.amount)}</p>
                {isAdmin && !a.settled && <button onClick={() => remove(a)} className="p-1.5 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {show && (
        <Modal title="Nuevo anticipo de sueldo" onClose={() => setShow(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={LABEL}>Colaborador</label>
              <select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: Number(e.target.value) })} className={INPUT}>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
            <div><label className={LABEL}>Fecha</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>Monto</label><input type="number" min={0} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={cn(INPUT, 'font-mono')} /></div>
            <div className="col-span-2"><label className={LABEL}>Notas</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={INPUT} /></div>
            <label className={cn('col-span-2 flex items-start gap-2 p-3 rounded-lg border text-xs', currentShift ? 'border-brand-accent/40 bg-brand-card cursor-pointer' : 'border-border bg-muted/30 opacity-70')}>
              <input type="checkbox" disabled={!currentShift} checked={form.fromCashRegister && !!currentShift} onChange={e => setForm({ ...form, fromCashRegister: e.target.checked })} className="mt-0.5" />
              <span><span className="font-semibold text-brand-dark block">Sale de la caja abierta</span><span className="text-muted-foreground">{currentShift ? `Queda como retiro justificado en el turno de ${currentShift.cashierName} y se descuenta en la liquidación.` : 'No hay turno abierto: se registra el anticipo sin afectar la caja.'}</span></span>
            </label>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={save} disabled={!form.employeeId || !(Number(form.amount) > 0)} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Registrar anticipo</button>
        </Modal>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Liquidaciones                                                        */
/* ------------------------------------------------------------------ */
const SettlementsTab = ({ employees, onChanged }: { employees: Employee[]; onChanged: () => void }) => {
  const currentShift = useStore(s => s.currentShift);
  const refreshCurrentShift = useStore(s => s.refreshCurrentShift);
  const today = getColombiaTodayStr();
  const presets = periodPresets(today);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || 0);
  const [from, setFrom] = useState(presets[0].from);
  const [to, setTo] = useState(presets[0].to);
  const [preview, setPreview] = useState<any>(null);
  const [bonuses, setBonuses] = useState('');
  const [deductions, setDeductions] = useState('');
  const [notes, setNotes] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [paying, setPaying] = useState<any>(null);
  const [payMethod, setPayMethod] = useState('cash');
  const [payFromCash, setPayFromCash] = useState(true);

  const loadList = () => api.getSettlements({}).then(setList).catch(() => {});
  useEffect(() => { loadList(); }, []);
  useEffect(() => { if (!employeeId && employees[0]) setEmployeeId(employees[0].id); }, [employees]);

  const calculate = async () => {
    if (!employeeId) return;
    setCalculating(true); setError(''); setPreview(null);
    try { setPreview(await api.previewSettlement(employeeId, from, to)); } catch (e: any) { setError(e.message); }
    setCalculating(false);
  };
  const total = preview ? preview.baseTotal + preview.tipsTotal + (Number(bonuses) || 0) - preview.advancesTotal - (Number(deductions) || 0) : 0;
  const save = async () => {
    setError('');
    try {
      await api.createSettlement({ employeeId, from, to, bonuses: Number(bonuses) || 0, deductions: Number(deductions) || 0, notes });
      setPreview(null); setBonuses(''); setDeductions(''); setNotes(''); loadList(); onChanged();
    } catch (e: any) { setError(e.message); }
  };
  const pay = async () => {
    try {
      await api.paySettlement(paying.id, { paymentMethod: payMethod, fromCashRegister: payMethod === 'cash' && payFromCash && !!currentShift });
      if (payMethod === 'cash' && payFromCash) refreshCurrentShift();
      setPaying(null); loadList(); onChanged();
    } catch (e: any) { setError(e.message); }
  };
  const remove = async (s: any) => {
    if (!window.confirm(`¿Anular la liquidación de ${s.employeeName}? ${s.status === 'paid' ? 'Se eliminará también el gasto de nómina asociado.' : ''} Los anticipos vuelven a quedar pendientes.`)) return;
    try { await api.deleteSettlement(s.id); refreshCurrentShift(); loadList(); onChanged(); } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 space-y-3">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
          <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><Calculator size={15} /> Calcular liquidación</h3>
          <div className="grid sm:grid-cols-3 gap-2">
            <div className="sm:col-span-3"><label className={LABEL}>Colaborador</label>
              <select value={employeeId} onChange={e => { setEmployeeId(Number(e.target.value)); setPreview(null); }} className={INPUT}>{employees.map(e => <option key={e.id} value={e.id}>{e.name} · {e.payModeLabel}</option>)}</select></div>
            <div className="sm:col-span-3 flex flex-wrap gap-1.5">{presets.map(p => <Chip key={p.label} active={from === p.from && to === p.to} onClick={() => { setFrom(p.from); setTo(p.to); setPreview(null); }}>{p.label}</Chip>)}</div>
            <div><label className={LABEL}>Desde</label><input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreview(null); }} className={INPUT} /></div>
            <div><label className={LABEL}>Hasta</label><input type="date" value={to} onChange={e => { setTo(e.target.value); setPreview(null); }} className={INPUT} /></div>
            <div className="flex items-end"><button onClick={calculate} disabled={!employeeId || calculating} className="w-full py-2 rounded-lg bg-brand-primary text-brand-on-primary text-xs font-semibold disabled:opacity-40">{calculating ? 'Calculando...' : 'Calcular'}</button></div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}

          {preview && (
            <div className="rounded-xl border border-brand-accent/40 bg-brand-card p-4 space-y-2 text-sm">
              <p className="font-bold text-brand-dark">{preview.employee.name} · {preview.payModeLabel}</p>
              <p className="text-[11px] text-muted-foreground">Período {fmtDate(preview.periodStart)} a {fmtDate(preview.periodEnd)}</p>
              <div className="divide-y divide-border">
                <div className="flex justify-between py-1.5"><span>{preview.payMode === 'monthly' || preview.payMode === 'biweekly' ? `Sueldo fijo (${preview.unitLabel})` : `${preview.units} ${preview.unitLabel} × ${formatPrice(preview.unitAmount)}`}</span><span className="font-semibold">{formatPrice(preview.baseTotal)}</span></div>
                <div className="flex justify-between py-1.5"><span>Propinas directas</span><span>{formatPrice(preview.tipsDirect)}</span></div>
                <div className="flex justify-between py-1.5"><span>Propinas comunes (su parte)</span><span>{formatPrice(preview.tipsShared)}</span></div>
                {preview.advances.length > 0 && (
                  <div className="py-1.5">
                    <div className="flex justify-between text-red-700"><span>Anticipos por descontar ({preview.advances.length})</span><span>− {formatPrice(preview.advancesTotal)}</span></div>
                    <ul className="text-[11px] text-muted-foreground mt-1">{preview.advances.map((a: any) => <li key={a.id}>· {fmtDate(a.date)} {formatPrice(a.amount)}{a.notes ? ` (${a.notes})` : ''}</li>)}</ul>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 py-2">
                  <div><label className={LABEL}>Bonificaciones (+)</label><input type="number" min={0} value={bonuses} onChange={e => setBonuses(e.target.value)} className={cn(INPUT, 'font-mono')} /></div>
                  <div><label className={LABEL}>Descuentos (−)</label><input type="number" min={0} value={deductions} onChange={e => setDeductions(e.target.value)} className={cn(INPUT, 'font-mono')} /></div>
                </div>
                <div><label className={LABEL}>Notas</label><input value={notes} onChange={e => setNotes(e.target.value)} className={INPUT} /></div>
                <div className="flex justify-between py-2 text-base"><span className="font-bold text-brand-dark">Total a pagar</span><span className={cn('font-bold', total >= 0 ? 'text-emerald-700' : 'text-red-600')}>{formatPrice(total)}</span></div>
              </div>
              {preview.attendance.length > 0 && <p className="text-[11px] text-muted-foreground">Asistencias: {preview.attendance.map((a: any) => fmtDate(a.date).slice(0, 5)).join(', ')}</p>}
              {preview.units === 0 && (preview.payMode === 'per_shift' || preview.payMode === 'per_day' || preview.payMode === 'hourly') && (
                <p className="text-[11px] text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> No hay asistencias registradas en el período; el pago base es cero.</p>
              )}
              <button onClick={save} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold">Guardar liquidación (queda pendiente de pago)</button>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-2 space-y-3">
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-brand-card"><p className="text-xs font-bold text-brand-dark">Liquidaciones</p></div>
          {list.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">Aún no hay liquidaciones.</p> : (
            <ul className="divide-y divide-border max-h-[560px] overflow-y-auto">
              {list.map(s => (
                <li key={s.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-brand-dark truncate">{s.employeeName}</p>
                    {s.status === 'paid' ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1"><CheckCircle2 size={10} /> Pagada</span> : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold flex items-center gap-1"><Clock size={10} /> Pendiente</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)} · base {formatPrice(s.baseTotal)} + propinas {formatPrice(s.tipsTotal)}{s.advancesTotal ? ` − anticipos ${formatPrice(s.advancesTotal)}` : ''}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-brand-primary">{formatPrice(s.total)}</p>
                    <div className="flex gap-1">
                      {s.status === 'pending' && <button onClick={() => { setPaying(s); setPayMethod('cash'); setPayFromCash(true); }} className="px-3 py-1 rounded-lg bg-brand-primary text-brand-on-primary text-[11px] font-semibold">Pagar</button>}
                      <button onClick={() => remove(s)} className="p-1.5 text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {paying && (
        <Modal title={`Pagar a ${paying.employeeName}`} onClose={() => setPaying(null)}>
          <p className="text-2xl font-bold text-brand-primary">{formatPrice(paying.total)}</p>
          <p className="text-[11px] text-muted-foreground">El pago se registra como gasto de nómina en Finanzas y entra al estado de resultados.</p>
          <div><label className={LABEL}>Método</label><div className="flex gap-2">{Object.entries(METHOD_META).map(([k, m]) => <Chip key={k} active={payMethod === k} onClick={() => setPayMethod(k)}>{m.label}</Chip>)}</div></div>
          {payMethod === 'cash' && (
            <label className={cn('flex items-start gap-2 p-3 rounded-lg border text-xs', currentShift ? 'border-brand-accent/40 bg-brand-card cursor-pointer' : 'border-border bg-muted/30 opacity-70')}>
              <input type="checkbox" disabled={!currentShift} checked={payFromCash && !!currentShift} onChange={e => setPayFromCash(e.target.checked)} className="mt-0.5" />
              <span><span className="font-semibold text-brand-dark block">Sale de la caja abierta</span><span className="text-muted-foreground">{currentShift ? 'Se registra como retiro en el turno actual.' : 'No hay turno abierto.'}</span></span>
            </label>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={pay} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold">Confirmar pago</button>
        </Modal>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Página                                                               */
/* ------------------------------------------------------------------ */
const StaffPage = () => {
  const user = useStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<Tab>('colaboradores');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [search, setSearch] = useState('');

  const loadEmployees = () => api.getEmployees(true).then(setEmployees).catch(() => {});
  const loadSummary = () => { if (isAdmin) api.getStaffSummary().then(setSummary).catch(() => {}); };
  useEffect(() => { loadEmployees(); loadSummary(); }, []);
  const reloadAll = () => { loadEmployees(); loadSummary(); };

  const active = employees.filter(e => e.active);
  const filtered = search ? employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase())) : employees;

  const tabs: Array<{ id: Tab; label: string; icon: any; admin?: boolean }> = [
    { id: 'colaboradores', label: 'Colaboradores', icon: UsersRound },
    { id: 'asistencia', label: 'Asistencia', icon: CalendarCheck },
    { id: 'propinas', label: 'Propinas', icon: HandCoins },
    { id: 'anticipos', label: 'Anticipos', icon: PiggyBank },
    { id: 'liquidaciones', label: 'Liquidaciones', icon: FileSpreadsheet, admin: true },
  ];

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-dark">Personal y Nómina</h2>
          <p className="text-xs text-muted-foreground">Colaboradores, turnos trabajados, propinas, anticipos y liquidación por período.</p>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {tabs.filter(t => !t.admin || isAdmin).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap border transition-all',
                tab === t.id ? 'bg-brand-primary text-brand-on-primary border-brand-primary shadow-card' : 'bg-card text-brand-dark border-border hover:bg-muted/40')}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="Colaboradores activos" value={String(summary.activeEmployees)} sub={`${summary.presentToday} con asistencia hoy`} />
          <KpiCard label="Propinas del mes" value={formatPrice(summary.monthTips)} />
          <KpiCard label="Anticipos por descontar" value={formatPrice(summary.unsettledAdvances)} className={summary.unsettledAdvances > 0 ? 'bg-amber-50 border-amber-200' : ''} />
          <KpiCard label="Liquidaciones pendientes" value={formatPrice(summary.pendingSettlements.t)} sub={`${summary.pendingSettlements.c} por pagar`} />
          <KpiCard label="Nómina pagada este mes" value={formatPrice(summary.monthPayrollPaid)} />
        </div>
      )}

      {tab === 'colaboradores' && (
        <>
          <div className="relative max-w-sm"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar colaborador" className={cn(INPUT, 'pl-8')} /></div>
          {isAdmin ? <EmployeesTab employees={filtered} reload={reloadAll} /> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{filtered.filter(e => e.active).map(e => <div key={e.id} className="bg-card rounded-xl border border-border p-4 shadow-card"><p className="text-sm font-bold text-brand-dark">{e.name}</p><p className="text-[11px] text-muted-foreground">{e.position}</p></div>)}</div>
          )}
        </>
      )}
      {tab === 'asistencia' && <AttendanceTab employees={active} />}
      {tab === 'propinas' && <TipsTab employees={active} isAdmin={isAdmin} />}
      {tab === 'anticipos' && <AdvancesTab employees={active} isAdmin={isAdmin} />}
      {tab === 'liquidaciones' && isAdmin && <SettlementsTab employees={active} onChanged={reloadAll} />}
    </div>
  );
};

export default StaffPage;
