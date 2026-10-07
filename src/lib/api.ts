const API_URL = import.meta.env.VITE_API_URL || '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(localStorage.getItem('pos-branch') ? { 'X-Branch-Id': String(localStorage.getItem('pos-branch')) } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

const qstr = (params: Record<string, any> = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
  const s = qs.toString();
  return s ? '?' + s : '';
};

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: { id?: number; name: string; role: string; profile?: string; perms?: { views: string[]; actions: string[] } } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  // Categories
  getCategories: () => request<any[]>('/categories'),
  addCategory: (data: any) => request<any>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: number, data: any) => request<any>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: number) => request<any>(`/categories/${id}`, { method: 'DELETE' }),

  // Products
  getProducts: (params?: { category?: number; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', String(params.category));
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return request<any[]>(`/products${q ? '?' + q : ''}`);
  },
  addProduct: (data: any) => request<any>('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: number, data: any) => request<any>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleAvailability: (id: number) => request<any>(`/products/${id}/availability`, { method: 'PATCH' }),
  deleteProduct: (id: number) => request<any>(`/products/${id}`, { method: 'DELETE' }),
  adjustStock: (id: number, data: { delta?: number; set?: number; reason?: string }) => request<{ product: any; change: number }>(`/products/${id}/stock`, { method: 'POST', body: JSON.stringify(data) }),
  getStockMovements: (id: number) => request<any[]>(`/products/${id}/movements`),
  getLowStock: () => request<any[]>('/products/low-stock'),

  // Media Gallery & File Manager
  getMedia: () => request<{ success: boolean; count: number; media: any[] }>('/media'),
  uploadMedia: (filename: string, data: string) =>
    request<{ success: boolean; url: string; filename: string; name: string; group: string }>('/media/upload', {
      method: 'POST',
      body: JSON.stringify({ filename, data }),
    }),
  updateProductImage: (productId: number, imageUrl: string) =>
    request<{ success: boolean; product: any }>('/media/product-image', {
      method: 'PATCH',
      body: JSON.stringify({ productId, imageUrl }),
    }),

  // Customers
  getCustomers: (search?: string) => {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<any[]>(`/customers${q}`);
  },
  getCustomer: (id: number) => request<any>(`/customers/${id}`),
  findCustomerByPhone: (phone: string) => request<any>(`/customers/phone/${encodeURIComponent(phone)}`),
  findCustomerByDoc: (doc: string) => request<any>(`/customers/doc/${encodeURIComponent(doc)}`),
  addCustomer: (data: any) => request<any>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: number, data: any) => request<any>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (id: number) => request<any>(`/customers/${id}`, { method: 'DELETE' }),

  // Orders
  getOrders: (params?: { status?: string; search?: string; branch?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.branch) qs.set('branch', params.branch);
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return request<any[]>(`/orders${q ? '?' + q : ''}`);
  },
  getOrder: (id: number) => request<any>(`/orders/${id}`),
  addOrder: (data: any) => request<any>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  updateOrderStatus: (id: number, status: string) =>
    request<any>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updatePaymentStatus: (id: number, paymentStatus: string, paymentMethod?: string) =>
    request<any>(`/orders/${id}/payment`, { method: 'PATCH', body: JSON.stringify({ paymentStatus, paymentMethod }) }),
  updateOrderCustomer: (id: number, data: { name?: string; phone?: string; address?: string; doc?: string; email?: string }) =>
    request<any>(`/orders/${id}/customer`, { method: 'PATCH', body: JSON.stringify(data) }),
  uploadReceipt: (id: number, receiptImage: string) =>
    request<any>(`/orders/${id}/receipt`, { method: 'PATCH', body: JSON.stringify({ receiptImage }) }),
  updateOrderNotes: (id: number, notes: string) =>
    request<any>(`/orders/${id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  assignDriver: (orderId: number, driverId: number) =>
    request<any>(`/orders/${orderId}/driver`, { method: 'PATCH', body: JSON.stringify({ driverId }) }),
  deleteOrder: (id: number) =>
    request<any>(`/orders/${id}`, { method: 'DELETE' }),
  issueTestInvoice: (id: number) => request<any>(`/orders/${id}/electronic-invoice`, { method: 'POST' }),

  // Shifts / Cierre de Caja
  getCurrentShift: () => request<any>('/shifts/current'),
  openShift: (data: { initialCash: number; cashierName?: string; notes?: string }) =>
    request<any>('/shifts/open', { method: 'POST', body: JSON.stringify(data) }),
  getShiftReport: (id: number) => request<any>(`/shifts/${id}/report`),
  closeShift: (data: { shiftId?: number; actualCash?: number; counted?: { cash: number; transfer: number; card: number }; notes?: string }) =>
    request<any>('/shifts/close', { method: 'POST', body: JSON.stringify(data) }),
  getShiftsHistory: () => request<any[]>('/shifts/history'),
  getCajaSales: (params: Record<string, any> = {}) => request<any>(`/caja/sales${qstr(params)}`),
  getCajaTips: (params: Record<string, any> = {}) => request<any>(`/caja/tips${qstr(params)}`),
  getCajaDiscounts: (params: Record<string, any> = {}) => request<any>(`/caja/discounts${qstr(params)}`),
  getCajaMovements: (params: Record<string, any> = {}) => request<any>(`/caja/movements${qstr(params)}`),
  getCajaShifts: (params: Record<string, any> = {}) => request<any[]>(`/caja/shifts${qstr(params)}`),
  getCajaSale: (id: number) => request<any>(`/caja/sales/${id}`),
  editSalePayment: (id: number, data: any) => request<any>(`/caja/sales/${id}/payment`, { method: 'POST', body: JSON.stringify(data) }),
  editSaleTip: (id: number, data: any) => request<any>(`/caja/sales/${id}/tip`, { method: 'POST', body: JSON.stringify(data) }),
  getDiscountCatalog: (params: Record<string, any> = {}) => request<any>(`/caja/discounts-catalog${qstr(params)}`),
  saveDiscount: (data: any, id?: number) => request<any>(id ? `/caja/discounts-catalog/${id}` : '/caja/discounts-catalog', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }),
  deleteDiscount: (id: number) => request<any>(`/caja/discounts-catalog/${id}`, { method: 'DELETE' }),
  reconcileShift: (id: number, data: any) => request<any>(`/caja/shifts/${id}/reconcile`, { method: 'POST', body: JSON.stringify(data) }),
  undoReconcile: (id: number) => request<any>(`/caja/shifts/${id}/reconcile`, { method: 'DELETE' }),
  cancelSale: (id: number, reason: string) => request<any>(`/restaurant/orders/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'cancelled', reason }) }),
  cancelItem: (id: number, itemId: number, reason: string) => request<any>(`/restaurant/orders/${id}/items/${itemId}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' }),
  addCashMovement: (data: { shiftId?: number; amount: number; reason: string; type?: 'withdrawal' | 'deposit'; cashierName?: string }) =>
    request<any>('/shifts/movement', { method: 'POST', body: JSON.stringify(data) }),
  getCashMovements: (shiftId?: number) =>
    request<any[]>(`/shifts/movements${shiftId ? '?shiftId=' + shiftId : ''}`),

  // Drivers
  getDrivers: () => request<any[]>('/drivers'),
  addDriver: (data: any) => request<any>('/drivers', { method: 'POST', body: JSON.stringify(data) }),
  updateDriver: (id: number, data: any) => request<any>(`/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDriver: (id: number) => request<any>(`/drivers/${id}`, { method: 'DELETE' }),

  // Reports
  getReportSummary: (period?: string) => request<any>(`/reports/summary${period ? '?period=' + period : ''}`),
  getTopProducts: (period?: string) => request<any[]>(`/reports/top-products${period ? '?period=' + period : ''}`),
  getByPayment: (period?: string) => request<any[]>(`/reports/by-payment${period ? '?period=' + period : ''}`),
  getByType: (period?: string) => request<any[]>(`/reports/by-type${period ? '?period=' + period : ''}`),
  getByHour: (period?: string) => request<any[]>(`/reports/by-hour${period ? '?period=' + period : ''}`),
  getTopDrivers: (period?: string) => request<any[]>(`/reports/top-drivers${period ? '?period=' + period : ''}`),

  // Settings
  me: () => request<{ id: number; name: string; role: string; profile: string; perms: { views: string[]; actions: string[] }; token?: string }>('/auth/me'),
  getSettings: () => request<any>('/settings'),
  getIntegration: () => request<any>('/settings/integration'),
  updateSettings: (data: any) => request<any>('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Marca (público, sin sesión: pantalla de acceso, favicon y tema)
  getPublicBranding: () => request<any>('/public/branding'),

  // Marca (solo admin)
  saveTheme: (theme: any) => request<{ success: boolean; theme: any }>('/branding/theme', { method: 'PUT', body: JSON.stringify({ theme }) }),
  uploadBrandingImage: (kind: 'logo' | 'logoLogin' | 'favicon' | 'appleIcon', filename: string, data: string) =>
    request<{ success: boolean; url: string; key: string }>('/branding/image', { method: 'POST', body: JSON.stringify({ kind, filename, data }) }),
  removeBrandingImage: (kind: string) => request<any>(`/branding/image/${kind}`, { method: 'DELETE' }),
  uploadFont: (family: string, filename: string, data: string) =>
    request<{ success: boolean; font: { family: string; url: string }; customFonts: any[] }>('/branding/font', { method: 'POST', body: JSON.stringify({ family, filename, data }) }),
  deleteFont: (family: string) => request<{ success: boolean; customFonts: any[] }>(`/branding/font/${encodeURIComponent(family)}`, { method: 'DELETE' }),

  // Usuarios (solo admin)
  getUsers: () => request<any[]>('/users'),
  createUser: (data: any) => request<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, data: any) => request<any>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: number) => request<any>(`/users/${id}`, { method: 'DELETE' }),

  // Finanzas: categorías de gasto
  getExpenseCategories: () => request<any[]>('/finance/categories'),
  addExpenseCategory: (data: any) => request<any>('/finance/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateExpenseCategory: (id: number, data: any) => request<any>(`/finance/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpenseCategory: (id: number) => request<any>(`/finance/categories/${id}`, { method: 'DELETE' }),
  // Finanzas: proveedores
  getSuppliers: (search?: string, all?: boolean) => {
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (all) qs.set('all', '1');
    const q = qs.toString();
    return request<any[]>(`/finance/suppliers${q ? '?' + q : ''}`);
  },
  addSupplier: (data: any) => request<any>('/finance/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id: number, data: any) => request<any>(`/finance/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSupplier: (id: number) => request<any>(`/finance/suppliers/${id}`, { method: 'DELETE' }),
  // Finanzas: gastos y cuentas por pagar
  getExpenses: (params: { from?: string; to?: string; categoryId?: number; supplierId?: number; status?: string; search?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
    const q = qs.toString();
    return request<{ expenses: any[]; total: number; count: number }>(`/finance/expenses${q ? '?' + q : ''}`);
  },
  addExpense: (data: any) => request<any>('/finance/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id: number, data: any) => request<any>(`/finance/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  payExpense: (id: number, data: { paymentMethod: string; fromCashRegister?: boolean; paidAt?: string; amount?: number; notes?: string }) => request<any>(`/finance/expenses/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
  getExpensePayments: (id: number) => request<any>(`/finance/expenses/${id}/payments`),
  deleteExpensePayment: (id: number, pid: number) => request<any>(`/finance/expenses/${id}/payments/${pid}`, { method: 'DELETE' }),
  issueSupportDoc: (id: number) => request<any>(`/finance/expenses/${id}/support-doc`, { method: 'POST' }),
  deleteExpense: (id: number) => request<any>(`/finance/expenses/${id}`, { method: 'DELETE' }),
  getPayables: () => request<any>('/finance/payables'),
  // Finanzas: estado de resultados
  getFinanceSummary: (params: { period?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    const q = qs.toString();
    return request<any>(`/finance/summary${q ? '?' + q : ''}`);
  },
  getPnl: (months = 6) => request<any[]>(`/finance/pnl?months=${months}`),
  getAccounting: (params: { period?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    const q = qs.toString();
    return request<any>(`/finance/accounting${q ? '?' + q : ''}`);
  },

  // Contabilidad: plan de cuentas, parametrización, libro diario, balances, cartera y terceros
  getAcctConfig: () => request<any>('/accounting/config'),
  updateAcctConfig: (data: any) => request<any>('/accounting/config', { method: 'PUT', body: JSON.stringify(data) }),
  getAccounts: (all?: boolean) => request<any[]>(`/accounting/accounts${all ? '?all=1' : ''}`),
  addAccount: (data: any) => request<any>('/accounting/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (code: string, data: any) => request<any>(`/accounting/accounts/${code}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (code: string) => request<any>(`/accounting/accounts/${code}`, { method: 'DELETE' }),
  getJournal: (params: Record<string, any> = {}) => request<any>(`/accounting/entries${qstr(params)}`),
  addJournalEntry: (data: any) => request<any>('/accounting/entries', { method: 'POST', body: JSON.stringify(data) }),
  voidJournalEntry: (id: number, reason: string) => request<any>(`/accounting/entries/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
  syncLedger: () => request<any>('/accounting/sync', { method: 'POST' }),
  rebuildLedger: (data: { from?: string; to?: string }) => request<any>('/accounting/rebuild', { method: 'POST', body: JSON.stringify(data) }),
  getAcctSummary: (params: Record<string, any> = {}) => request<any>(`/accounting/summary${qstr(params)}`),
  getTrialBalance: (params: Record<string, any> = {}) => request<any>(`/accounting/trial-balance${qstr(params)}`),
  getLedgerAccount: (params: Record<string, any> = {}) => request<any>(`/accounting/ledger${qstr(params)}`),
  getBalanceSheet: (date?: string) => request<any>(`/accounting/balance-sheet${qstr({ date })}`),
  getIncomeStatementLedger: (from: string, to: string) => request<any>(`/accounting/income-statement${qstr({ from, to })}`),
  getReceivablesAging: (date?: string, third?: string) => request<any>(`/accounting/receivables${qstr({ date, third })}`),
  getPayablesAging: (date?: string, third?: string) => request<any>(`/accounting/payables${qstr({ date, third })}`),
  getThirdParties: (from: string, to: string) => request<any>(`/accounting/third-parties${qstr({ from, to })}`),
  // Abonos de clientes (ventas a crédito y plataformas)
  getOrderPayments: (id: number) => request<any>(`/orders/${id}/payments`),
  addOrderPayment: (id: number, data: { amount?: number; method: string; date?: string; notes?: string }) => request<any>(`/orders/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  deleteOrderPayment: (id: number, pid: number) => request<any>(`/orders/${id}/payments/${pid}`, { method: 'DELETE' }),
  // Facturación electrónica (Factus)
  getFeConfig: () => request<any>('/einvoicing/config'),
  updateFeConfig: (data: any) => request<any>('/einvoicing/config', { method: 'PUT', body: JSON.stringify(data) }),
  testFeConnection: () => request<any>('/einvoicing/test', { method: 'POST' }),
  getFeMunicipalities: (q: string) => request<any[]>(`/einvoicing/municipalities${qstr({ q })}`),
  getFePreview: (orderId: number) => request<any>(`/einvoicing/preview/${orderId}`),

  // Personal y nómina
  // Restaurante: mesas, cuentas abiertas, cocina, domicilios
  getRestaurantConfig: () => request<any>('/restaurant/config'),
  updateRestaurantConfig: (data: any) => request<any>('/restaurant/config', { method: 'PUT', body: JSON.stringify(data) }),
  getRooms: () => request<any[]>('/restaurant/rooms'),
  getTablesState: () => request<any[]>('/restaurant/tables/state'),
  addRoom: (name: string) => request<any>('/restaurant/rooms', { method: 'POST', body: JSON.stringify({ name }) }),
  updateRoom: (id: number, name: string) => request<any>(`/restaurant/rooms/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteRoom: (id: number) => request<any>(`/restaurant/rooms/${id}`, { method: 'DELETE' }),
  addTable: (data: any) => request<any>('/restaurant/tables', { method: 'POST', body: JSON.stringify(data) }),
  updateTable: (id: number, data: any) => request<any>(`/restaurant/tables/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTable: (id: number) => request<any>(`/restaurant/tables/${id}`, { method: 'DELETE' }),
  saveTableLayout: (tables: Array<{ id: number; x: number; y: number; w?: number; h?: number }>) => request<any[]>('/restaurant/tables/layout', { method: 'PUT', body: JSON.stringify({ tables }) }),
  openRestaurantOrder: (data: any) => request<any>('/restaurant/orders', { method: 'POST', body: JSON.stringify(data) }),
  getActiveOrders: (type?: string) => request<any[]>(`/restaurant/orders/active${type ? '?type=' + type : ''}`),
  setOrderItems: (id: number, items: any[]) => request<any>(`/restaurant/orders/${id}/items`, { method: 'PUT', body: JSON.stringify({ items }) }),
  removeSentItem: (id: number, itemId: number) => request<any>(`/restaurant/orders/${id}/items/${itemId}`, { method: 'DELETE' }),
  sendToKitchen: (id: number) => request<any>(`/restaurant/orders/${id}/send`, { method: 'POST' }),
  updateOrderHeader: (id: number, data: any) => request<any>(`/restaurant/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  setRestaurantStatus: (id: number, status: string, driverId?: number) => request<any>(`/restaurant/orders/${id}/status`, { method: 'POST', body: JSON.stringify({ status, driverId }) }),
  closeRestaurantOrder: (id: number, data: any) => request<any>(`/restaurant/orders/${id}/close`, { method: 'POST', body: JSON.stringify(data) }),
  moveTable: (id: number, tableId: number) => request<any>(`/restaurant/orders/${id}/move`, { method: 'POST', body: JSON.stringify({ tableId }) }),
  splitOrder: (id: number, items: Array<{ itemId: number; quantity: number }>, people = 1) => request<{ split: any; parent: any }>(`/restaurant/orders/${id}/split`, { method: 'POST', body: JSON.stringify({ items, people }) }),
  unsplitOrder: (id: number) => request<any>(`/restaurant/orders/${id}/unsplit`, { method: 'POST' }),
  mergeOrders: (id: number, intoOrderId: number) => request<any>(`/restaurant/orders/${id}/merge`, { method: 'POST', body: JSON.stringify({ intoOrderId }) }),
  getKitchen: (station?: string) => request<any[]>(`/restaurant/kitchen${station ? '?station=' + station : ''}`),
  kitchenAction: (orderId: number, batch: number, action: 'start' | 'ready' | 'undo', station?: string) => request<any>(`/restaurant/kitchen/${orderId}/${batch}`, { method: 'POST', body: JSON.stringify({ action, station }) }),
  getMyDeliveries: () => request<any>('/restaurant/my-deliveries'),
  courierAction: (id: number, action: 'shipped' | 'delivered', body?: any) => request<any>(`/restaurant/my-deliveries/${id}/${action}`, { method: 'POST', body: JSON.stringify(body || {}) }),
  getRestaurantStats: (from: string, to: string) => request<any>(`/restaurant/stats?from=${from}&to=${to}`),
  getCourierReport: (driverId: number, from: string, to: string) => request<any>(`/restaurant/couriers/${driverId}?from=${from}&to=${to}`),
  getStaffSummary: () => request<any>('/staff/summary'),
  getPayrollConfig: () => request<any>('/staff/payroll-config'),
  updatePayrollConfig: (data: any) => request<any>('/staff/payroll-config', { method: 'PUT', body: JSON.stringify(data) }),
  getEmployees: (all?: boolean) => request<any[]>(`/staff/employees${all ? '?all=1' : ''}`),
  addEmployee: (data: any) => request<any>('/staff/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id: number, data: any) => request<any>(`/staff/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmployee: (id: number) => request<any>(`/staff/employees/${id}`, { method: 'DELETE' }),
  getAttendance: (params: { from?: string; to?: string; employeeId?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    const q = qs.toString();
    return request<any[]>(`/staff/attendance${q ? '?' + q : ''}`);
  },
  addAttendance: (data: any) => request<any>('/staff/attendance', { method: 'POST', body: JSON.stringify(data) }),
  deleteAttendance: (id: number) => request<any>(`/staff/attendance/${id}`, { method: 'DELETE' }),
  getTips: (params: { from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    const q = qs.toString();
    return request<any>(`/staff/tips${q ? '?' + q : ''}`);
  },
  addTip: (data: any) => request<any>('/staff/tips', { method: 'POST', body: JSON.stringify(data) }),
  deleteTip: (id: number) => request<any>(`/staff/tips/${id}`, { method: 'DELETE' }),
  getAdvances: (params: { employeeId?: number; unsettled?: boolean; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.employeeId) qs.set('employeeId', String(params.employeeId));
    if (params.unsettled) qs.set('unsettled', '1');
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const q = qs.toString();
    return request<any>(`/staff/advances${q ? '?' + q : ''}`);
  },
  addAdvance: (data: any) => request<any>('/staff/advances', { method: 'POST', body: JSON.stringify(data) }),
  deleteAdvance: (id: number) => request<any>(`/staff/advances/${id}`, { method: 'DELETE' }),
  previewSettlement: (employeeId: number, from: string, to: string, loans: { skipLoans?: number[]; payoffLoans?: number[] } = {}) =>
    request<any>(`/staff/settlements/preview?employeeId=${employeeId}&from=${from}&to=${to}&skipLoans=${(loans.skipLoans || []).join(',')}&payoffLoans=${(loans.payoffLoans || []).join(',')}`),
  getLoans: (params: Record<string, any> = {}) => request<any>(`/staff/loans${qstr(params)}`),
  addLoan: (data: any) => request<any>('/staff/loans', { method: 'POST', body: JSON.stringify(data) }),
  deleteLoan: (id: number) => request<any>(`/staff/loans/${id}`, { method: 'DELETE' }),
  getLoanPayments: (id: number) => request<any[]>(`/staff/loans/${id}/payments`),
  getNoveltyTasks: () => request<any[]>('/staff/novelties/tasks'),
  saveNoveltyTasks: (tasks: any[]) => request<any[]>('/staff/novelties/tasks', { method: 'PUT', body: JSON.stringify({ tasks }) }),
  getSettlements: (params: { employeeId?: number; status?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    const q = qs.toString();
    return request<any[]>(`/staff/settlements${q ? '?' + q : ''}`);
  },
  createSettlement: (data: any) => request<any>('/staff/settlements', { method: 'POST', body: JSON.stringify(data) }),
  paySettlement: (id: number, data: { paymentMethod: string; fromCashRegister?: boolean }) => request<any>(`/staff/settlements/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
  deleteSettlement: (id: number) => request<any>(`/staff/settlements/${id}`, { method: 'DELETE' }),
  // Propinas por colaborador (saldo, abonos, liquidación) y novedades de nómina
  getTipsConfig: () => request<any>('/staff/tips/config'),
  updateTipsConfig: (data: any) => request<any>('/staff/tips/config', { method: 'PUT', body: JSON.stringify(data) }),
  getTipStatement: (from: string, to: string) => request<any>(`/staff/tips/statement?from=${from}&to=${to}`),
  getTipPayouts: (params: Record<string, any> = {}) => request<any>(`/staff/tips/payouts${qstr(params)}`),
  addTipPayout: (data: any) => request<any>('/staff/tips/payouts', { method: 'POST', body: JSON.stringify(data) }),
  settleTips: (data: any) => request<any>('/staff/tips/settle', { method: 'POST', body: JSON.stringify(data) }),
  deleteTipPayout: (id: number) => request<any>(`/staff/tips/payouts/${id}`, { method: 'DELETE' }),
  getNoveltyTypes: () => request<any[]>('/staff/novelties/types'),
  getNovelties: (params: Record<string, any> = {}) => request<any[]>(`/staff/novelties${qstr(params)}`),
  previewNovelty: (data: any) => request<any>('/staff/novelties/preview', { method: 'POST', body: JSON.stringify(data) }),
  addNovelty: (data: any) => request<any>('/staff/novelties', { method: 'POST', body: JSON.stringify(data) }),
  deleteNovelty: (id: number) => request<any>(`/staff/novelties/${id}`, { method: 'DELETE' }),
  // Impresión en red (agente del restaurante)
  getPrintingMode: () => request<any>('/printing/mode'),
  getPrintingConfig: () => request<any>('/printing/config'),
  setPrintingMode: (mode: 'browser' | 'agent') => request<any>('/printing/mode', { method: 'PUT', body: JSON.stringify({ mode }) }),
  addPrinter: (data: any) => request<any>('/printing/printers', { method: 'POST', body: JSON.stringify(data) }),
  updatePrinter: (id: number, data: any) => request<any>(`/printing/printers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePrinter: (id: number) => request<any>(`/printing/printers/${id}`, { method: 'DELETE' }),
  testPrinter: (id: number) => request<any>(`/printing/printers/${id}/test`, { method: 'POST' }),
  samplePrinter: (id: number) => request<{ queued: number }>(`/printing/printers/${id}/samples`, { method: 'POST' }),
  createPrintAgent: (name: string) => request<{ id: number; token: string }>('/printing/agents', { method: 'POST', body: JSON.stringify({ name }) }),
  deletePrintAgent: (id: number) => request<any>(`/printing/agents/${id}`, { method: 'DELETE' }),
  scanPrinters: (agentId: number) => request<any>(`/printing/agents/${agentId}/scan`, { method: 'POST' }),
  identifyPrinter: (ip: string, port = 9100) => request<any>('/printing/identify', { method: 'POST', body: JSON.stringify({ ip, port }) }),
  retryPrintJob: (id: number) => request<any>(`/printing/jobs/${id}/retry`, { method: 'POST' }),
  netPrint: (kind: 'receipt' | 'prebill' | 'kitchen' | 'shift-report', data: any) => request<any>(`/printing/${kind}`, { method: 'POST', body: JSON.stringify(data) }),
  voidExpense: (id: number, reason: string) => request<any>(`/finance/expenses/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getBranches: (all = false) => request<any>(`/branches${all ? '?all=1' : ''}`),
  addBranch: (data: any) => request<any>('/branches', { method: 'POST', body: JSON.stringify(data) }),
  updateBranch: (id: number, data: any) => request<any>(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  assignCategoryBranches: (assign: Record<number, number | null>) => request<any>('/branches/categories/assign', { method: 'PUT', body: JSON.stringify({ assign }) }),
  importEmployees: (rows: any[], dryRun: boolean) => request<any>('/staff/employees/import', { method: 'POST', body: JSON.stringify({ rows, dryRun }) }),
};
