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
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: { name: string; role: string } }>('/auth/login', {
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
  getOrders: (params?: { status?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
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

  // Shifts / Cierre de Caja
  getCurrentShift: () => request<any>('/shifts/current'),
  openShift: (data: { initialCash: number; cashierName?: string; notes?: string }) =>
    request<any>('/shifts/open', { method: 'POST', body: JSON.stringify(data) }),
  closeShift: (data: { shiftId?: number; actualCash: number; notes?: string }) =>
    request<any>('/shifts/close', { method: 'POST', body: JSON.stringify(data) }),
  getShiftsHistory: () => request<any[]>('/shifts/history'),
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
  payExpense: (id: number, data: { paymentMethod: string; fromCashRegister?: boolean; paidAt?: string }) => request<any>(`/finance/expenses/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
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

  // Personal y nómina
  getStaffSummary: () => request<any>('/staff/summary'),
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
  previewSettlement: (employeeId: number, from: string, to: string) => request<any>(`/staff/settlements/preview?employeeId=${employeeId}&from=${from}&to=${to}`),
  getSettlements: (params: { employeeId?: number; status?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    const q = qs.toString();
    return request<any[]>(`/staff/settlements${q ? '?' + q : ''}`);
  },
  createSettlement: (data: any) => request<any>('/staff/settlements', { method: 'POST', body: JSON.stringify(data) }),
  paySettlement: (id: number, data: { paymentMethod: string; fromCashRegister?: boolean }) => request<any>(`/staff/settlements/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
  deleteSettlement: (id: number) => request<any>(`/staff/settlements/${id}`, { method: 'DELETE' }),
};
