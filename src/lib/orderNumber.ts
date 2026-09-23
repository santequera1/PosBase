import { useStore } from '@/store/useStore';

/** Número de comprobante con el prefijo configurado en Ajustes → Negocio (ej. POS-1003). */
export function orderNumber(id: number | string | undefined | null): string {
  const prefix = useStore.getState().invoicePrefix || 'POS';
  return `${prefix}-${id ?? ''}`;
}

/** Datos del negocio configurados en Ajustes → Negocio, para encabezados de recibos. */
export function getBusinessInfo() {
  const s = useStore.getState();
  return {
    name: s.businessName || 'Mi Heladería',
    slogan: s.businessSlogan || '',
    address: s.businessAddress || '',
    phone: s.businessPhone || '',
    nit: s.businessNit || '',
    prefix: s.invoicePrefix || 'POS',
    taxType: s.taxType || 'none',
    taxRate: s.taxType && s.taxType !== 'none' ? Number(s.taxRate) || 0 : 0,
    taxLabel: s.taxType === 'iva' ? 'IVA' : s.taxType === 'inc' ? 'INC' : '',
    dianResolution: s.dianResolution || '',
  };
}
