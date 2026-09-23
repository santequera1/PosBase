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
};
