import { Fragment, useEffect, useMemo, useState } from 'react';
import { BookMarked, Plus, Search, ChevronDown, ChevronRight, Download, Ban, RefreshCw, Trash2, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Chip, Modal, INPUT, LABEL, fmtDate } from '@/components/common/Primitives';
import { downloadXlsx } from '@/lib/xlsx';

const monthStart = () => `${getColombiaTodayStr().slice(0, 7)}-01`;
const SOURCES: Array<[string, string]> = [['', 'Todos'], ['sale', 'Ventas'], ['payment_in', 'Recibos de caja'], ['expense', 'Compras y gastos'], ['payment_out', 'Egresos'], ['payroll', 'Nómina'], ['advance', 'Anticipos'], ['shift', 'Cierres de caja'], ['cash', 'Movimientos de caja'], ['manual', 'Manuales']];

interface Line { id?: number; account: string; accountName?: string; debit: number; credit: number; thirdDoc?: string; thirdName?: string; description?: string; docRef?: string }
interface Entry { id: number; number: string; date: string; source: string; sourceLabel: string; sourceId: number | null; description: string; status: 'posted' | 'void'; voidReason?: string; createdBy?: string; lines: Line[]; total: number }

/** Libro diario: asientos automáticos (ventas, compras, pagos, nómina, caja) y comprobantes de contabilidad manuales. */
const JournalTab = () => {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(getColombiaTodayStr());
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('posted');
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [showNew, setShowNew] = useState(false);
  const [voiding, setVoiding] = useState<Entry | null>(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  const load = () => {
    setLoading(true);
    api.getJournal({ from, to, source, status, search, limit: 500 }).then(r => setEntries(r.entries)).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [from, to, source, status, search]);

  const totals = useMemo(() => entries.filter(e => e.status === 'posted').reduce((a, e) => a + e.total, 0), [entries]);
  const sync = async () => { setSyncing(true); try { const r = await api.syncLedger(); if (r.errors?.length) setError(r.errors.join(' · ')); load(); } catch (e: any) { setError(e.message); } setSyncing(false); };
  const exportXlsx = () => downloadXlsx(`libro_diario_${from}_${to}`, [
    { name: 'Libro diario', headers: ['Comprobante', 'Fecha', 'Tipo', 'Descripción', 'Cuenta', 'Nombre cuenta', 'Tercero', 'Nombre tercero', 'Detalle', 'Débito', 'Crédito', 'Estado'],
      rows: entries.flatMap(e => e.lines.map(l => [e.number, e.date, e.sourceLabel, e.description, l.account, l.accountName || '', l.thirdDoc || '', l.thirdName || '', l.description || '', l.debit || 0, l.credit || 0, e.status === 'void' ? 'Anulado' : 'Vigente'])), widths: [12, 11, 18, 40, 10, 32, 14, 28, 30, 14, 14, 10] },
  ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className={LABEL}>Desde</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')} /></div>
        <div><label className={LABEL}>Hasta</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')} /></div>
        <div><label className={LABEL}>Tipo</label><select value={source} onChange={e => setSource(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className={LABEL}>Estado</label><select value={status} onChange={e => setStatus(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')}><option value="posted">Vigentes</option><option value="void">Anulados</option><option value="all">Todos</option></select></div>
        <div className="flex-1 min-w-[160px]"><label className={LABEL}>Buscar</label><div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Número, descripción o # de documento" className={cn(INPUT, 'py-1.5 text-xs pl-8')} /></div></div>
        <button onClick={sync} disabled={syncing} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40" title="Contabiliza los documentos que falten"><RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Actualizar</button>
        <button onClick={exportXlsx} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5"><Download size={13} /> Excel</button>
        <button onClick={() => setShowNew(true)} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab"><Plus size={14} /> Comprobante manual</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-brand-card">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><BookMarked size={13} /> {entries.length} asiento(s) · clic en una fila para ver el detalle</p>
          <p className="text-sm font-bold text-brand-dark">Movimiento: {formatPrice(totals)}</p>
        </div>
        {loading ? <p className="p-4 text-xs text-muted-foreground">Cargando...</p> : entries.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">No hay asientos en este rango.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-muted-foreground bg-muted/30"><th className="px-3 py-2 text-left font-semibold">Comprobante</th><th className="px-3 py-2 text-left font-semibold">Fecha</th><th className="px-3 py-2 text-left font-semibold">Tipo</th><th className="px-3 py-2 text-left font-semibold">Descripción</th><th className="px-3 py-2 text-right font-semibold">Valor</th><th className="px-3 py-2 font-semibold">Estado</th><th /></tr></thead>
              <tbody>
                {entries.map(e => (
                  <Fragment key={e.id}>
                    <tr onClick={() => setOpen(o => ({ ...o, [e.id]: !o[e.id] }))} className={cn('border-t border-border cursor-pointer hover:bg-brand-button/5', e.status === 'void' && 'opacity-60')}>
                      <td className="px-3 py-1.5 font-mono whitespace-nowrap"><span className="inline-flex items-center gap-1">{open[e.id] ? <ChevronDown size={12} className="text-brand-primary" /> : <ChevronRight size={12} className="text-muted-foreground" />}{e.number}</span></td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{e.sourceLabel}</td>
                      <td className="px-3 py-1.5">{e.description}{e.status === 'void' && e.voidReason ? <span className="text-red-600"> · {e.voidReason}</span> : ''}</td>
                      <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap">{formatPrice(e.total)}</td>
                      <td className="px-3 py-1.5 text-center"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', e.status === 'void' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800')}>{e.status === 'void' ? 'Anulado' : 'Vigente'}</span></td>
                      <td className="px-2 py-1 text-right">{e.source === 'manual' && e.status === 'posted' && <button onClick={ev => { ev.stopPropagation(); setVoiding(e); }} title="Anular" className="p-1 rounded text-muted-foreground hover:text-red-600"><Ban size={13} /></button>}</td>
                    </tr>
                    {open[e.id] && (
                      <tr className="bg-muted/20"><td colSpan={7} className="px-3 py-2">
                        <table className="w-full text-[11px] rounded-lg overflow-hidden border border-border bg-card">
                          <thead><tr className="text-muted-foreground"><th className="px-2 py-1 text-left font-semibold">Cuenta</th><th className="px-2 py-1 text-left font-semibold">Nombre</th><th className="px-2 py-1 text-left font-semibold">Tercero</th><th className="px-2 py-1 text-left font-semibold">Detalle</th><th className="px-2 py-1 text-right font-semibold">Débito</th><th className="px-2 py-1 text-right font-semibold">Crédito</th></tr></thead>
                          <tbody>
                            {e.lines.map((l, i) => (
                              <tr key={l.id || i} className="border-t border-border">
                                <td className="px-2 py-1 font-mono">{l.account}</td><td className="px-2 py-1">{l.accountName}</td>
                                <td className="px-2 py-1">{l.thirdName ? `${l.thirdName}${l.thirdDoc ? ` (${l.thirdDoc})` : ''}` : ''}</td>
                                <td className="px-2 py-1 text-muted-foreground">{l.description}{l.docRef ? ` · ${l.docRef}` : ''}</td>
                                <td className="px-2 py-1 text-right">{l.debit ? formatPrice(l.debit) : ''}</td><td className="px-2 py-1 text-right">{l.credit ? formatPrice(l.credit) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot><tr className="border-t border-border font-bold bg-brand-card"><td colSpan={4} className="px-2 py-1 text-[10px] text-muted-foreground">{e.createdBy ? `Registrado por ${e.createdBy}` : ''}</td><td className="px-2 py-1 text-right">{formatPrice(e.lines.reduce((a, l) => a + (l.debit || 0), 0))}</td><td className="px-2 py-1 text-right">{formatPrice(e.lines.reduce((a, l) => a + (l.credit || 0), 0))}</td></tr></tfoot>
                        </table>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Info size={11} /> Los asientos automáticos se anulan desde el documento que los originó (anular el pedido, eliminar el gasto o el abono). Si un documento se modifica, el asiento anterior queda anulado y se genera uno nuevo.</p>
      {showNew && <ManualEntryModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {voiding && <VoidModal entry={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); load(); }} />}
    </div>
  );
};

const VoidModal = ({ entry, onClose, onDone }: { entry: Entry; onClose: () => void; onDone: () => void }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const go = async () => { try { await api.voidJournalEntry(entry.id, reason); onDone(); } catch (e: any) { setError(e.message); } };
  return (
    <Modal title={`Anular ${entry.number}`} onClose={onClose}>
      <p className="text-xs text-muted-foreground">{entry.description}</p>
      <div><label className={LABEL}>Motivo</label><input value={reason} onChange={e => setReason(e.target.value)} className={INPUT} placeholder="Ej: error de digitación" /></div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={go} disabled={reason.trim().length < 3} className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-40">Anular comprobante</button>
    </Modal>
  );
};

const emptyLine = (): Line => ({ account: '', debit: 0, credit: 0, thirdDoc: '', thirdName: '', description: '' });

const ManualEntryModal = ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [date, setDate] = useState(getColombiaTodayStr());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.getAccounts().then(a => setAccounts(a.filter((x: any) => x.level >= 6))).catch(() => {}); }, []);
  const upd = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const debits = lines.reduce((a, l) => a + (Number(l.debit) || 0), 0), credits = lines.reduce((a, l) => a + (Number(l.credit) || 0), 0);
  const balanced = debits === credits && debits > 0;
  const save = async () => {
    setSaving(true); setError('');
    try { await api.addJournalEntry({ date, description, lines: lines.filter(l => l.account).map(l => ({ ...l, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) }); onSaved(); } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  return (
    <Modal title="Comprobante de contabilidad" onClose={onClose} wide>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={LABEL}>Fecha</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} /></div>
        <div className="col-span-2"><label className={LABEL}>Descripción</label><input value={description} onChange={e => setDescription(e.target.value)} className={INPUT} placeholder="Ej: Aporte de capital, ajuste de inventario, depreciación" /></div>
      </div>
      <div className="space-y-1.5">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
            <select value={l.account} onChange={e => upd(i, { account: e.target.value })} className={cn(INPUT, 'col-span-4 py-1.5 text-xs font-mono')}>
              <option value="">Cuenta…</option>{accounts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
            <input type="number" min={0} value={l.debit || ''} onChange={e => upd(i, { debit: Number(e.target.value), credit: Number(e.target.value) > 0 ? 0 : l.credit })} placeholder="Débito" className={cn(INPUT, 'col-span-2 py-1.5 text-xs font-mono text-right')} />
            <input type="number" min={0} value={l.credit || ''} onChange={e => upd(i, { credit: Number(e.target.value), debit: Number(e.target.value) > 0 ? 0 : l.debit })} placeholder="Crédito" className={cn(INPUT, 'col-span-2 py-1.5 text-xs font-mono text-right')} />
            <input value={l.thirdDoc} onChange={e => upd(i, { thirdDoc: e.target.value })} placeholder="NIT/CC" className={cn(INPUT, 'col-span-2 py-1.5 text-xs')} />
            <input value={l.thirdName} onChange={e => upd(i, { thirdName: e.target.value })} placeholder="Tercero" className={cn(INPUT, 'col-span-1 py-1.5 text-xs')} />
            <button onClick={() => setLines(ls => ls.length > 2 ? ls.filter((_, j) => j !== i) : ls)} className="col-span-1 p-1.5 rounded text-muted-foreground hover:text-red-600 justify-self-end"><Trash2 size={13} /></button>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setLines(ls => [...ls, emptyLine()])} className="text-xs text-brand-primary font-semibold flex items-center gap-1"><Plus size={13} /> Agregar línea</button>
          <p className={cn('text-xs font-semibold', balanced ? 'text-emerald-700' : 'text-red-600')}>Débitos {formatPrice(debits)} · Créditos {formatPrice(credits)} {balanced ? '· cuadrado' : debits || credits ? `· diferencia ${formatPrice(Math.abs(debits - credits))}` : ''}</p>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={saving || !balanced || description.trim().length < 3} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Guardando...' : 'Registrar comprobante'}</button>
    </Modal>
  );
};

export { Chip };
export default JournalTab;
