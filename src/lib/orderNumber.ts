import { useStore } from '@/store/useStore';

/** Número de comprobante con el prefijo configurado en Ajustes → Negocio (ej. POS-1003). */
export function orderNumber(id: number | string | undefined | null): string {
  const prefix = useStore.getState().invoicePrefix || 'POS';
  return `${prefix}-${id ?? ''}`;
}

/** Datos del negocio configurados en Ajustes → Negocio, para encabezados de recibos. */
export function getBusinessInfo(branchId?: number) {
  const s = useStore.getState();
  const br = s.branches.find(b => b.id === (branchId || s.branchId));
  const many = s.branches.length > 1;
  return {
    name: s.businessName || 'Mi Negocio',
    hours: s.businessHours || '',
    slogan: [s.businessSlogan || '', many && br ? `Sede ${br.name}` : ''].filter(Boolean).join(' · '),
    address: (br && br.address) || s.businessAddress || '',
    phone: (br && br.phone) || s.businessPhone || '',
    nit: s.businessNit || '',
    prefix: s.invoicePrefix || 'POS',
    taxType: s.taxType || 'none',
    taxRate: s.taxType && s.taxType !== 'none' ? Number(s.taxRate) || 0 : 0,
    taxLabel: s.taxType === 'iva' ? 'IVA' : s.taxType === 'inc' ? 'INC' : '',
    dianResolution: s.dianResolution || '',
  };
}
