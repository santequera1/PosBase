import { Fragment, useEffect, useState } from 'react';
import { Download, Printer, BookOpen, Receipt, ShoppingCart, Users, Wallet, CalendarClock, Info, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Chip, KpiCard, INPUT, fmtDate } from '@/components/common/Primitives';
import { downloadXlsx, xlsxDate as csvDate } from '@/lib/xlsx';

type Period = 'today' | 'week' | 'month' | 'last_month' | 'year' | 'custom';
const monthStart = () => `${getColombiaTodayStr().slice(0, 7)}-01`;

const PART_LABEL: Record<string, string> = { cash: 'Efectivo', debit: 'Tarjeta débito', credit: 'Tarjeta crédito', transfer: 'Transferencia / QR' };
const PART_KEYS = ['cash', 'debit', 'credit', 'transfer'];

/** Texto con el detalle del pago: para pagos mixtos muestra cada medio con su valor. */
const paymentDetail = (o: any): string => {
  const parts = o.parts || {};
  const used = PART_KEYS.filter(k => Number(parts[k]) > 0);
  if (used.length <= 1) return o.method;
  return used.map(k => `${PART_LABEL[k]} ${formatPrice(parts[k])}`).join(' + ');
};
const isMixed = (o: any) => PART_KEYS.filter(k => Number(o.parts?.[k]) > 0).length > 1;

const Section = ({ title, icon: Icon, children, right }: { title: string; icon: any; children: any; right?: any }) => (
  <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden break-inside-avoid">
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-brand-card">
      <h3 className="text-sm font-bold text-brand-dark flex items-center gap-1.5"><Icon size={14} /> {title}</h3>
      {right}
    </div>
    {children}
  </section>
);

const cellCls = (align: Array<'l' | 'r'> | undefined, i: number, pad = 'py-1.5') => cn('px-3 whitespace-nowrap', pad, (align?.[i] || (i === 0 ? 'l' : 'r')) === 'r' ? 'text-right' : 'text-left');

const Table = ({ headers, rows, footer, align }: { headers: string[]; rows: Array<Array<any>>; footer?: Array<any>; align?: Array<'l' | 'r'> }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-muted-foreground bg-muted/30">
          {headers.map((h, i) => <th key={i} className={cn('font-semibold', cellCls(align, i))}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={headers.length} className="px-3 py-4 text-center text-muted-foreground">Sin registros en el período.</td></tr>}
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            {r.map((c, j) => <td key={j} className={cellCls(align, j)}>{c}</td>)}
          </tr>
        ))}
      </tbody>
      {footer && (
        <tfoot>
          <tr className="border-t-2 border-brand-primary/30 font-bold text-brand-dark bg-brand-card">
            {footer.map((c, j) => <td key={j} className={cellCls(align, j, 'py-2')}>{c}</td>)}
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);

/** Tabla con filas que se abren al hacer clic y muestran los comprobantes que la componen. */
const ExpandableTable = ({ headers, rows, footer, align, renderDetail, hint }: {
  headers: string[]; rows: Array<{ key: string; cells: any[]; detail: any[] }>; footer?: any[]; align?: Array<'l' | 'r'>;
  renderDetail: (items: any[]) => any; hint?: string;
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [all, setAll] = useState(false);
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const isOpen = (k: string) => all || !!open[k];
  return (
    <div className="overflow-x-auto">
      {rows.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border print:hidden">
          <span className="flex items-center gap-1"><Info size={11} /> {hint || 'Haz clic en una fila para ver los comprobantes que la componen.'}</span>
          <button onClick={() => { setAll(a => !a); setOpen({}); }} className="font-semibold text-brand-primary hover:underline">{all ? 'Cerrar todos' : 'Abrir todos'}</button>
        </div>
      )}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-muted-foreground bg-muted/30">
            {headers.map((h, i) => <th key={i} className={cn('font-semibold', cellCls(align, i))}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={headers.length} className="px-3 py-4 text-center text-muted-foreground">Sin registros en el período.</td></tr>}
          {rows.map(r => (
            <Fragment key={r.key}>
              <tr onClick={() => r.detail.length && toggle(r.key)} className={cn('border-t border-border', r.detail.length ? 'cursor-pointer hover:bg-brand-button/5' : '')} title={r.detail.length ? `Ver ${r.detail.length} comprobante(s)` : undefined}>
                {r.cells.map((c, j) => (
                  <td key={j} className={cellCls(align, j)}>
                    {j === 0 ? <span className="inline-flex items-center gap-1">{r.detail.length ? (isOpen(r.key) ? <ChevronDown size={12} className="text-brand-primary print:hidden" /> : <ChevronRight size={12} className="text-muted-foreground print:hidden" />) : <span className="w-3 inline-block" />}{c}</span> : c}
                  </td>
                ))}
              </tr>
              {isOpen(r.key) && r.detail.length > 0 && (
                <tr className="bg-muted/20">
                  <td colSpan={headers.length} className="px-3 py-2">{renderDetail(r.detail)}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="border-t-2 border-brand-primary/30 font-bold text-brand-dark bg-brand-card">
              {footer.map((c, j) => <td key={j} className={cellCls(align, j, 'py-2')}>{c}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

/** Lista de comprobantes dentro de una fila abierta. `amountOf` permite mostrar solo la parte pagada con un medio. */
const VoucherList = ({ items, amountOf, showMethod = true }: { items: any[]; amountOf?: (o: any) => number; showMethod?: boolean }) => (
  <div className="rounded-lg border border-border bg-card overflow-hidden">
    <table className="w-full text-[11px]">
      <thead><tr className="text-muted-foreground bg-muted/30"><th className="px-2 py-1 text-left font-semibold">Comprobante</th><th className="px-2 py-1 text-left font-semibold">Hora</th><th className="px-2 py-1 text-left font-semibold">Cliente</th><th className="px-2 py-1 text-left font-semibold">Vendedor</th>{showMethod && <th className="px-2 py-1 text-left font-semibold">Pago</th>}<th className="px-2 py-1 text-right font-semibold">Valor</th></tr></thead>
      <tbody>
        {items.map(o => (
          <tr key={o.id} className="border-t border-border">
            <td className="px-2 py-1 font-mono">{o.number}{o.status === 'Anulado' && <span className="ml-1 text-[9px] px-1 rounded bg-red-100 text-red-700 font-semibold">Anulado</span>}</td>
            <td className="px-2 py-1">{o.time}</td>
            <td className="px-2 py-1 truncate max-w-[180px]">{o.customer}</td>
            <td className="px-2 py-1">{o.seller || '—'}</td>
            {showMethod && <td className="px-2 py-1">{isMixed(o) ? <span><span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 font-semibold mr-1">Mixto</span>{paymentDetail(o)}</span> : o.method}</td>}
            <td className="px-2 py-1 text-right font-semibold">{formatPrice(amountOf ? amountOf(o) : o.total)}{amountOf && isMixed(o) && <span className="text-[9px] text-muted-foreground font-normal"> de {formatPrice(o.total)}</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ExportBtn = ({ onClick, children }: { onClick: () => void; children: any }) => (
  <button onClick={onClick} className="px-2.5 py-1.5 rounded-lg border border-border bg-white text-[11px] font-semibold text-brand-primary hover:bg-brand-button/5 flex items-center gap-1 print:hidden"><Download size={12} /> {children}</button>
);

const AccountingTab = () => {
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(getColombiaTodayStr());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllOrders, setShowAllOrders] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getAccounting({ period, from, to }).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [period, from, to]);

  const periods: Array<[Period, string]> = [['today', 'Hoy'], ['week', '7 días'], ['month', 'Este mes'], ['last_month', 'Mes anterior'], ['year', 'Este año'], ['custom', 'Personalizado']];
  const fileSuffix = data ? `${data.period.from}_a_${data.period.to}` : '';
  const taxName = data?.tax?.type === 'none' ? 'Impuesto' : (data?.tax?.type || '').toUpperCase();

  const kindName: Record<string, string> = { cogs: 'Insumos', opex: 'Operativo', payroll: 'Nómina', other: 'Otro' };
  const sheetSalesByDay = () => ({ name: 'Ventas diario', headers: ['Fecha', 'Comprobantes', 'Base', taxName, 'Total', 'Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Transferencia'],
    rows: data.sales.byDay.map((d: any) => [csvDate(d.date), d.count, d.base, d.tax, d.total, d.cash, d.debit, d.credit, d.transfer]) });
  const sheetOrders = () => ({ name: 'Comprobantes', headers: ['Fecha', 'Hora', 'Comprobante', 'Vendedor', 'Turno', 'Cliente', 'Documento', 'Medio de pago', 'Detalle del pago', 'Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Transferencia', 'Estado', 'Subtotal', 'Descuento', 'Base', taxName, 'Total', 'Factura electrónica'],
    rows: data.sales.orders.map((o: any) => [csvDate(o.date), o.time, o.number, o.seller || '', o.shift || '', o.customer, o.doc, isMixed(o) ? 'Mixto' : o.method, paymentDetail(o), o.parts?.cash || 0, o.parts?.debit || 0, o.parts?.credit || 0, o.parts?.transfer || 0, o.status, o.subtotal, o.discount, o.base, o.tax, o.total, o.electronic ? 'Sí' : 'No']) });
  const sheetPurchases = () => ({ name: 'Compras y gastos', headers: ['Fecha', 'Categoría', 'Tipo', 'Proveedor', 'NIT', 'Factura', 'Descripción', 'Medio de pago', 'Estado', 'Vence', 'Base', 'IVA', 'Total'],
    rows: data.purchases.rows.map((e: any) => [csvDate(e.date), e.category, kindName[e.kind] || e.kind, e.supplier || '', e.supplierNit || '', e.invoice || '', e.description, e.methodLabel, e.statusLabel, csvDate(e.dueDate), e.base, e.taxAmount, e.amount]) });
  const sheetPayroll = () => ({ name: 'Nómina', headers: ['Pagado el', 'Colaborador', 'Documento', 'Período desde', 'Período hasta', 'Base', 'Extras y recargos', 'Auxilio transporte', 'Propinas', 'Anticipos', 'Salud y pensión', 'Bonificaciones', 'Descuentos', 'Total', 'Medio'],
    rows: data.payroll.rows.map((r: any) => [csvDate(r.paidAt), r.employee, r.document || '', csvDate(r.periodStart), csvDate(r.periodEnd), r.baseTotal, r.extrasTotal || 0, r.allowanceTotal || 0, r.tipsTotal, r.advancesTotal, r.legalDeductionsTotal || 0, r.bonuses, r.deductions, r.total, r.method]) });
  const sheetCash = () => ({ name: 'Cierres de caja', headers: ['Cierre', 'Cajero', 'Ventas', 'Efectivo en ventas', 'Base inicial', 'Esperado', 'Contado', 'Diferencia', 'Observaciones'],
    rows: data.cash.shifts.map((s: any) => [csvDate(s.closedAt), s.cashier, s.totalSales, s.cashSales, s.initialCash, s.expectedCash, s.actualCash, s.difference, s.notes || '']) });
  const sheetSummary = () => ({ name: 'Resumen', headers: ['Concepto', 'Valor'], rows: [
    ['Negocio', data.business.name], ['NIT', data.business.nit], ['Período', `${csvDate(data.period.from)} a ${csvDate(data.period.to)}`], ['Régimen', `${data.tax.label}${data.tax.rate ? ' ' + data.tax.rate + '%' : ''}`],
    ['Ventas', data.sales.totals.gross], ['Base gravable', data.sales.totals.base], [`${taxName} generado`, data.sales.totals.tax], ['Comprobantes válidos', data.sales.totals.count], ['Comprobantes anulados', data.sales.totals.cancelledCount],
    ['Compras y gastos', data.purchases.totals.total], ['IVA en compras', data.purchases.totals.tax], ['Costo de insumos', data.pnl.cogs], ['Gastos operativos', data.pnl.opex + data.pnl.other], ['Nómina', data.pnl.payroll],
    ['Utilidad neta', data.pnl.net], ['Margen neto %', data.pnl.netMargin], ['Cuentas por pagar (saldo)', data.payables.total], ['Retiros de caja', data.cash.withdrawals], ['Depósitos en caja', data.cash.deposits],
  ] });
  const exportSalesByDay = () => downloadXlsx(`libro_ventas_diario_${fileSuffix}`, [sheetSalesByDay(), sheetOrders()]);
  const exportOrders = () => downloadXlsx(`comprobantes_${fileSuffix}`, [sheetOrders()]);
  const exportPurchases = () => downloadXlsx(`compras_gastos_${fileSuffix}`, [sheetPurchases()]);
  const exportPayroll = () => downloadXlsx(`nomina_${fileSuffix}`, [sheetPayroll()]);
  const exportAll = () => downloadXlsx(`informe_contable_${fileSuffix}`, [sheetSummary(), sheetSalesByDay(), sheetOrders(), sheetPurchases(), sheetPayroll(), sheetCash()]);

  // Activa las reglas de impresión del informe solo durante este diálogo de impresión
  const printReport = () => {
    document.body.classList.add('print-report');
    const cleanup = () => { document.body.classList.remove('print-report'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 50);
    setTimeout(cleanup, 60000);
  };

  const kindLabel: Record<string, string> = { cogs: 'Insumos', opex: 'Operativo', payroll: 'Nómina', other: 'Otro' };
  const ordersToShow = data ? (showAllOrders ? data.sales.orders : data.sales.orders.slice(0, 50)) : [];
  const validOrders: any[] = data ? data.sales.orders.filter((o: any) => o.status !== 'Anulado') : [];

  return (
    <div className="space-y-4 print-area">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {periods.map(([p, l]) => <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>{l}</Chip>)}
        {period === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
            <span className="text-xs text-muted-foreground">a</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={exportAll} disabled={!data} className="px-3 py-1.5 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"><Download size={13} /> Exportar todo (Excel)</button>
          <button onClick={printReport} disabled={!data} className="px-3 py-1.5 rounded-lg border border-border bg-white text-xs font-semibold text-brand-dark flex items-center gap-1.5 disabled:opacity-40"><Printer size={13} /> Imprimir / PDF</button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {loading || !data ? <p className="text-xs text-muted-foreground">{loading ? 'Preparando el informe...' : 'Sin datos'}</p> : (
        <>
          {/* Encabezado del informe */}
          <div className="bg-card rounded-xl border border-border p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Informe contable del período</p>
                <h3 className="font-display font-bold text-lg text-brand-dark">{data.business.name}</h3>
                <p className="text-xs text-muted-foreground">{data.business.nit ? `NIT ${data.business.nit} · ` : ''}{data.business.address}{data.business.phone ? ` · Tel. ${data.business.phone}` : ''}</p>
              </div>
              <div className="text-right text-xs">
                <p className="font-semibold text-brand-dark">{fmtDate(data.period.from)} al {fmtDate(data.period.to)}</p>
                <p className="text-muted-foreground">Régimen de impuesto: {data.tax.label}{data.tax.rate ? ` ${data.tax.rate}%` : ''}</p>
                <p className="text-muted-foreground">Comprobantes con prefijo {data.business.prefix}</p>
                {data.business.dianResolution && <p className="text-muted-foreground max-w-xs">{data.business.dianResolution}</p>}
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Ventas del período" value={formatPrice(data.sales.totals.gross)} sub={`${data.sales.totals.count} comprobantes válidos · ${data.sales.totals.cancelledCount} anulados`} />
            <KpiCard label={data.tax.type === 'none' ? 'Base (sin impuesto configurado)' : `Base gravable / ${taxName} generado`} value={data.tax.type === 'none' ? formatPrice(data.sales.totals.base) : `${formatPrice(data.sales.totals.base)} / ${formatPrice(data.sales.totals.tax)}`} sub={data.tax.type === 'none' ? 'Configura el impuesto en Ajustes → Negocio' : `Tarifa ${data.tax.rate}% incluida en los precios`} />
            <KpiCard label="Compras y gastos" value={formatPrice(data.purchases.totals.total)} sub={`IVA en compras ${formatPrice(data.purchases.totals.tax)} · ${data.purchases.totals.count} registros`} />
            <KpiCard label="Utilidad neta" value={formatPrice(data.pnl.net)} sub={`Margen ${data.pnl.netMargin}% · nómina pagada ${formatPrice(data.payroll.total)}`} className={data.pnl.net >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} />
          </div>

          {/* Libro de ventas diario (cada día se abre y muestra sus comprobantes) */}
          <Section title="Libro de ventas (resumen diario)" icon={BookOpen} right={<ExportBtn onClick={exportSalesByDay}>Excel</ExportBtn>}>
            <ExpandableTable
              headers={['Fecha', 'Compr.', 'Base', taxName, 'Total', 'Efectivo', 'T. débito', 'T. crédito', 'Transf.']}
              hint="Haz clic en un día para ver sus comprobantes uno a uno."
              rows={data.sales.byDay.map((d: any) => ({
                key: d.date,
                cells: [fmtDate(d.date), d.count, formatPrice(d.base), formatPrice(d.tax), <b key="t">{formatPrice(d.total)}</b>, formatPrice(d.cash), formatPrice(d.debit), formatPrice(d.credit), formatPrice(d.transfer)],
                detail: data.sales.orders.filter((o: any) => o.date === d.date),
              }))}
              footer={['Total', data.sales.totals.count, formatPrice(data.sales.totals.base), formatPrice(data.sales.totals.tax), formatPrice(data.sales.totals.gross), ...data.sales.byPayment.map((p: any) => formatPrice(p.total))]}
              renderDetail={items => <VoucherList items={items} />}
            />
          </Section>

          {/* Impuestos y medios de pago */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="Resumen de impuestos" icon={Receipt}>
              <div className="p-4 text-xs space-y-1.5">
                {data.tax.type === 'none' ? (
                  <p className="text-muted-foreground flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0" /> No hay impuesto configurado. En Ajustes → Negocio puedes activar INC (impuesto al consumo, típico 8% en heladerías y restaurantes) o IVA para que el sistema desglose base e impuesto en recibos e informes.</p>
                ) : (
                  <>
                    <div className="flex justify-between"><span>Ventas brutas (impuesto incluido)</span><span className="font-semibold">{formatPrice(data.sales.totals.gross)}</span></div>
                    <div className="flex justify-between"><span>Base gravable</span><span className="font-semibold">{formatPrice(data.sales.totals.base)}</span></div>
                    <div className="flex justify-between text-brand-primary"><span>{data.tax.label} generado ({data.tax.rate}%)</span><span className="font-bold">{formatPrice(data.sales.totals.tax)}</span></div>
                    <div className="flex justify-between border-t border-border pt-1.5 mt-1.5"><span>IVA pagado en compras (descontable si aplica)</span><span className="font-semibold">{formatPrice(data.purchases.totals.tax)}</span></div>
                    <p className="text-[10px] text-muted-foreground pt-1">Descuentos aplicados en el período: {formatPrice(data.sales.totals.discounts)}. Comprobantes marcados para factura electrónica: {data.sales.totals.electronicCount}.</p>
                  </>
                )}
              </div>
            </Section>
            <Section title="Ventas por medio de pago" icon={Wallet}>
              <ExpandableTable
                headers={['Medio', 'Comprobantes', 'Total', '% del total']}
                hint="Haz clic en un medio para ver qué comprobantes se pagaron con él (los mixtos muestran solo su parte)."
                rows={data.sales.byPayment.map((p: any) => ({
                  key: p.key,
                  cells: [p.label, p.count, formatPrice(p.total), `${data.sales.totals.gross ? Math.round((p.total / data.sales.totals.gross) * 100) : 0}%`],
                  detail: validOrders.filter((o: any) => Number(o.parts?.[p.key]) > 0),
                }))}
                footer={['Total', data.sales.totals.count, formatPrice(data.sales.totals.gross), '100%']}
                renderDetail={items => {
                  const key = PART_KEYS.find(k => items.every(o => Number(o.parts?.[k]) > 0)) || PART_KEYS.find(k => items.some(o => Number(o.parts?.[k]) > 0)) || 'cash';
                  return <VoucherList items={items} amountOf={o => Number(o.parts?.[key]) || 0} />;
                }}
              />
            </Section>
          </div>

          {/* Comprobantes */}
          <Section title={`Comprobantes del período (${data.sales.orders.length})`} icon={Receipt} right={<ExportBtn onClick={exportOrders}>Excel</ExportBtn>}>
            <Table
              headers={['Fecha', 'Hora', 'Comprobante', 'Vendedor', 'Cliente', 'Documento', 'Medio', 'Estado', 'Base', taxName, 'Total']}
              align={['l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'r', 'r', 'r']}
              rows={ordersToShow.map((o: any) => [fmtDate(o.date), o.time, <span key="n" className="font-mono">{o.number}</span>, o.seller || '—', o.customer, o.doc,
                isMixed(o) ? <span key="m"><span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 font-semibold mr-1">Mixto</span><span className="whitespace-normal">{paymentDetail(o)}</span></span> : o.method,
                <span key="s" className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', o.status === 'Anulado' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800')}>{o.status}</span>,
                formatPrice(o.base), formatPrice(o.tax), <b key="t">{formatPrice(o.total)}</b>])}
            />
            {data.sales.orders.length > 50 && (
              <button onClick={() => setShowAllOrders(v => !v)} className="w-full py-2 text-xs font-semibold text-brand-primary border-t border-border flex items-center justify-center gap-1 print:hidden">
                {showAllOrders ? <><ChevronUp size={13} /> Mostrar solo los primeros 50</> : <><ChevronDown size={13} /> Mostrar los {data.sales.orders.length} comprobantes</>}
              </button>
            )}
          </Section>

          {/* Compras y gastos */}
          <Section title="Libro de compras y gastos" icon={ShoppingCart} right={<ExportBtn onClick={exportPurchases}>Excel</ExportBtn>}>
            <Table
              headers={['Fecha', 'Categoría', 'Proveedor / NIT', 'Factura', 'Descripción', 'Medio', 'Estado', 'Base', 'IVA', 'Total']}
              align={['l', 'l', 'l', 'l', 'l', 'l', 'l', 'r', 'r', 'r']}
              rows={data.purchases.rows.map((e: any) => [fmtDate(e.date), <span key="c">{e.category} <span className="text-[9px] text-muted-foreground">({kindLabel[e.kind] || e.kind})</span></span>,
                e.supplier ? <span key="s">{e.supplier}{e.supplierNit ? <span className="text-muted-foreground"> · {e.supplierNit}</span> : ''}</span> : <span key="s" className="text-muted-foreground">—</span>,
                e.invoice || '—', <span key="d" className="max-w-[220px] inline-block truncate align-bottom" title={e.description}>{e.description}</span>, e.methodLabel,
                <span key="st" className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', e.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{e.statusLabel}</span>,
                formatPrice(e.base), formatPrice(e.taxAmount), <b key="t">{formatPrice(e.amount)}</b>])}
              footer={['Total', '', '', '', `${data.purchases.totals.count} registros`, '', `Pendiente ${formatPrice(data.purchases.totals.pending)}`, formatPrice(data.purchases.totals.base), formatPrice(data.purchases.totals.tax), formatPrice(data.purchases.totals.total)]}
            />
          </Section>

          {/* Nómina y caja */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="Nómina pagada en el período" icon={Users} right={<ExportBtn onClick={exportPayroll}>Excel</ExportBtn>}>
              <Table headers={['Pagado', 'Colaborador', 'Período', 'Base', 'Extras', 'Propinas', 'Deducciones', 'Total']} align={['l', 'l', 'l', 'r', 'r', 'r', 'r', 'r']}
                rows={data.payroll.rows.map((r: any) => [fmtDate(r.paidAt), r.employee, `${fmtDate(r.periodStart)}–${fmtDate(r.periodEnd)}`, formatPrice(r.baseTotal), formatPrice((r.extrasTotal || 0) + (r.allowanceTotal || 0)), formatPrice(r.tipsTotal), `−${formatPrice((r.advancesTotal || 0) + (r.legalDeductionsTotal || 0) + (r.deductions || 0))}`, <b key="t">{formatPrice(r.total)}</b>])}
                footer={['Total', `${data.payroll.rows.length} pagos`, '', '', '', '', '', formatPrice(data.payroll.total)]} />
            </Section>
            <Section title="Cierres de caja (arqueos)" icon={Wallet}>
              <Table headers={['Cierre', 'Cajero', 'Ventas', 'Esperado', 'Contado', 'Diferencia', 'Observaciones']} align={['l', 'l', 'r', 'r', 'r', 'r', 'l']}
                rows={data.cash.shifts.map((s: any) => [fmtDate(s.closedAt), s.cashier, formatPrice(s.totalSales), formatPrice(s.expectedCash), formatPrice(s.actualCash), <span key="d" className={cn('font-semibold', s.difference < 0 ? 'text-red-600' : s.difference > 0 ? 'text-amber-700' : 'text-emerald-700')}>{formatPrice(s.difference)}</span>,
                  s.notes ? <span key="n" className="whitespace-normal max-w-[220px] inline-block text-muted-foreground" title={s.notes}>{s.notes}</span> : <span key="n" className="text-muted-foreground">—</span>])}
                footer={['Total', `${data.cash.shifts.length} cierres`, '', `Retiros ${formatPrice(data.cash.withdrawals)}`, `Depósitos ${formatPrice(data.cash.deposits)}`, formatPrice(data.cash.difference), '']} />
            </Section>
          </div>

          {/* Estado de resultados y cuentas por pagar */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="Estado de resultados del período" icon={BookOpen}>
              <div className="p-4 text-xs space-y-1.5">
                <div className="flex justify-between"><span>Ventas</span><span className="font-semibold">{formatPrice(data.pnl.sales)}</span></div>
                <div className="flex justify-between"><span>(−) Costo de insumos</span><span>{formatPrice(data.pnl.cogs)}</span></div>
                <div className="flex justify-between"><span>(−) Gastos operativos</span><span>{formatPrice(data.pnl.opex + data.pnl.other)}</span></div>
                <div className="flex justify-between"><span>(−) Nómina</span><span>{formatPrice(data.pnl.payroll)}</span></div>
                <div className={cn('flex justify-between border-t border-border pt-1.5 mt-1.5 text-sm font-bold', data.pnl.net >= 0 ? 'text-emerald-700' : 'text-red-600')}><span>Utilidad neta</span><span>{formatPrice(data.pnl.net)} ({data.pnl.netMargin}%)</span></div>
                <p className="text-[10px] text-muted-foreground pt-1">Los gastos se toman por su fecha (causación), pagados o pendientes. La nómina entra cuando se paga la liquidación.</p>
              </div>
            </Section>
            <Section title="Cuentas por pagar (saldo a hoy)" icon={CalendarClock}>
              <div className="p-4 text-xs space-y-1.5">
                <div className="flex justify-between"><span>Facturas pendientes</span><span className="font-semibold">{data.payables.count}</span></div>
                <div className="flex justify-between text-sm font-bold text-brand-dark"><span>Saldo por pagar</span><span>{formatPrice(data.payables.total)}</span></div>
                <p className="text-[10px] text-muted-foreground pt-1">El detalle con vencimientos está en la pestaña Por pagar.</p>
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  );
};

export default AccountingTab;
