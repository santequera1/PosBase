import { create } from 'zustand';
import { api, setToken } from '@/lib/api';
import { type ThemeInput, type CustomFont, resolveTheme, applyTheme, setFavicon } from '@/lib/theme';

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'shipped' | 'delivered' | 'cancelled';
export type OrderType = 'dine-in' | 'pickup' | 'delivery';
export type PaymentMethod = 'cash' | 'card_debit' | 'card_credit' | 'card' | 'transfer' | 'mixed';
export type UserRole = 'admin' | 'cashier' | 'kitchen';

export interface PaymentSplit {
  method1: PaymentMethod;
  amount1: number;
  method2: PaymentMethod;
  amount2: number;
}

export interface CashMovement {
  id: number;
  shift_id: number;
  type: 'withdrawal' | 'deposit';
  amount: number;
  reason: string;
  cashier_name?: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  emoji: string;
  color: string;
}

export interface ProductSize {
  name: string;
  price: number;
}

export interface Product {
  id: number;
  name: string;
  categoryId: number;
  price: number;
  available: boolean;
  image: string | null;
  description?: string;
  sizes?: ProductSize[] | null;
  color_bg?: string;
  color_accent?: string;
  featured?: boolean;
  trackStock?: boolean;
  stock?: number;
  minStock?: number;
}

export interface Customer {
  id: number;
  name: string;
  documentId?: string;
  email?: string;
  phone: string;
  address: string;
  notes: string;
  isCompany?: boolean;
  totalOrders: number;
  totalSpent: number;
  lastOrder: string;
  tag: 'frequent' | 'new' | 'regular';
}

export interface OrderItem {
  productId: number;
  name: string;
  size?: string;
  flavors?: string;
  quantity: number;
  price: number;
  notes: string;
}

export interface Order {
  id: number;
  type: OrderType;
  status: OrderStatus;
  customer: {
    name: string;
    doc?: string;
    email?: string;
    phone?: string;
    address?: string;
    isElectronicInvoice?: boolean;
  };
  tableNumber?: number;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount?: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentSplit?: PaymentSplit;
  paymentStatus: 'pending' | 'paid';
  cashReceived?: number;
  cashChange?: number;
  createdAt: string;
  driverId?: number;
  receiptImage?: string;
  notes?: string;
  shiftId?: number;
  electronicInvoice?: { number: string; cufe: string; status: string; issuedAt: string; test?: boolean };
}

export interface CashShift {
  id: number;
  userId?: number;
  cashierName: string;
  openedAt?: string;
  closedAt?: string;
  initialCash: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  cashSales: number;
  debitSales: number;
  creditSales: number;
  transferSales: number;
  totalSales: number;
  totalOrders: number;
  totalWithdrawals?: number;
  totalDeposits?: number;
  movements?: CashMovement[];
  status: 'open' | 'closed';
  notes?: string;
  flavorStats?: Array<{ name: string; size?: string; flavors?: string; qty: number; revenue: number }>;
}

export interface Driver {
  id: number;
  name: string;
  phone: string;
  available: boolean;
}

export interface Branding {
  logoUrl: string;
  logoLoginUrl: string;
  faviconUrl: string;
  appleIconUrl: string;
  theme: ThemeInput | null;
  customFonts: CustomFont[];
}

export const DEFAULT_BRANDING: Branding = { logoUrl: '', logoLoginUrl: '', faviconUrl: '', appleIconUrl: '', theme: null, customFonts: [] };

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value as T;
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

/** Construye el estado de marca a partir de la respuesta de /settings o /public/branding. */
export function brandingFromSettings(s: any): Branding {
  return {
    logoUrl: s?.logoUrl ? String(s.logoUrl) : '',
    logoLoginUrl: s?.logoLoginUrl ? String(s.logoLoginUrl) : '',
    faviconUrl: s?.faviconUrl ? String(s.faviconUrl) : '',
    appleIconUrl: s?.appleIconUrl ? String(s.appleIconUrl) : '',
    theme: parseJson<ThemeInput | null>(s?.theme, null),
    customFonts: parseJson<CustomFont[]>(s?.customFonts, []),
  };
}

/** Aplica tema, fuentes, favicon y título del documento. */
export function applyBranding(b: Branding, businessName?: string) {
  applyTheme(resolveTheme(b.theme), b.customFonts);
  setFavicon(b.faviconUrl || '/logo.svg', b.appleIconUrl || undefined);
  if (typeof document !== 'undefined' && businessName) document.title = `${businessName} — Punto de Venta`;
}

interface AppState {
  user: { name: string; role: UserRole } | null;
  restoring: boolean;
  categories: Category[];
  products: Product[];
  customers: Customer[];
  orders: Order[];
  drivers: Driver[];
  currentShift: CashShift | null;
  deliveryFee: number;
  tableCount: number;
  businessName: string;
  businessSlogan: string;
  businessAddress: string;
  businessPhone: string;
  businessNit: string;
  invoicePrefix: string;
  taxType: string;
  taxRate: number;
  dianResolution: string;
  branding: Branding;
  initialized: boolean;
  sidebarCollapsed: boolean;

  // Auth
  loginWithCredentials: (username: string, password: string) => Promise<void>;
  login: (role: UserRole) => void;
  logout: () => void;
  restoreSession: () => Promise<void>;

  // Data loading
  initialize: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshCurrentShift: () => Promise<void>;

  // Orders
  addOrder: (order: Omit<Order, 'id' | 'createdAt'>) => Promise<number>;
  updateOrderStatus: (id: number, status: OrderStatus) => void;
  updatePaymentStatus: (id: number, paymentStatus: 'pending' | 'paid', paymentMethod?: PaymentMethod) => void;
  updateOrderCustomer: (id: number, data: { name?: string; phone?: string; address?: string; doc?: string; email?: string }) => void;
  updateOrderNotes: (id: number, notes: string) => void;
  uploadReceipt: (id: number, receiptImage: string) => void;
  assignDriver: (orderId: number, driverId: number) => void;
  deleteOrder: (id: number) => void;
  deleteOrders: (ids: number[]) => void;
  updateOrdersStatus: (ids: number[], status: OrderStatus) => void;
  issueTestInvoice: (id: number) => Promise<void>;

  // Shifts
  openShift: (initialCash: number, cashierName?: string, notes?: string) => Promise<void>;
  closeShift: (actualCash: number, notes?: string) => Promise<CashShift>;
  addCashMovement: (amount: number, reason: string, type?: 'withdrawal' | 'deposit') => Promise<void>;

  // Products
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: number, data: Partial<Product>) => void;
  deleteProduct: (id: number) => void;
  toggleProductAvailability: (id: number) => void;
  adjustStock: (id: number, data: { delta?: number; set?: number; reason?: string }) => Promise<void>;

  // Categories
  addCategory: (category: Omit<Category, 'id'>) => void;
  updateCategory: (id: number, data: Partial<Category>) => void;
  deleteCategory: (id: number) => void;

  // Customers
  addCustomer: (customer: Omit<Customer, 'id' | 'totalOrders' | 'totalSpent' | 'lastOrder' | 'tag'>) => void;
  updateCustomer: (id: number, data: Partial<Customer>) => void;
  deleteCustomer: (id: number) => void;
  findCustomerByPhone: (phone: string) => Customer | undefined;
  findCustomerByDoc: (doc: string) => Customer | undefined;

  // Drivers
  addDriver: (driver: Omit<Driver, 'id'>) => void;
  updateDriver: (id: number, data: Partial<Driver>) => void;
  deleteDriver: (id: number) => void;

  // UI
  toggleSidebar: () => void;

  // Marca
  setBranding: (b: Partial<Branding>) => void;
  loadPublicBranding: () => Promise<void>;

  // Socket handler
  handleOrderEvent: (order: Order) => void;
  handleProductEvent: (product: Product) => void;
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  restoring: true,
  categories: [],
  products: [],
  customers: [],
  orders: [],
  drivers: [],
  currentShift: null,
  deliveryFee: 5000,
  tableCount: 8,
  businessName: 'Mi Heladería',
  businessSlogan: 'Helado artesanal',
  businessAddress: '',
  businessPhone: '',
  businessNit: '',
  invoicePrefix: 'POS',
  taxType: 'none',
  taxRate: 0,
  dianResolution: '',
  branding: DEFAULT_BRANDING,
  initialized: false,
  sidebarCollapsed: false,

  loginWithCredentials: async (username, password) => {
    const { token, user } = await api.login(username, password);
    setToken(token);
    set({ user: { name: user.name, role: user.role as UserRole } });
    await get().initialize();
  },

  login: (role) => {
    const creds: Record<string, [string, string]> = {
      admin: ['admin', 'admin123'],
      cashier: ['cajero', 'cajero123'],
      kitchen: ['cocina', 'cocina123'],
    };
    const [u, p] = creds[role];
    get().loginWithCredentials(u, p).catch(console.error);
  },

  logout: () => {
    setToken(null);
    set({
      user: null,
      restoring: false,
      initialized: false,
      categories: [],
      products: [],
      customers: [],
      orders: [],
      drivers: [],
      currentShift: null,
    });
  },

  restoreSession: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ restoring: false });
      return;
    }
    try {
      const b64 = token.split('.')[1];
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        setToken(null);
        set({ restoring: false });
        return;
      }
      set({ user: { name: payload.name, role: payload.role as UserRole }, restoring: false });
      await get().initialize();
    } catch {
      setToken(null);
      set({ restoring: false });
    }
  },

  initialize: async () => {
    try {
      const [categories, products, customers, orders, settings, drivers, shift] = await Promise.all([
        api.getCategories().catch(() => []),
        api.getProducts().catch(() => []),
        api.getCustomers().catch(() => []),
        api.getOrders().catch(() => []),
        api.getSettings().catch(() => ({})),
        api.getDrivers().catch(() => []),
        api.getCurrentShift().catch(() => null),
      ]);
      set({
        categories,
        products,
        customers,
        orders,
        drivers,
        currentShift: shift,
        deliveryFee: settings.deliveryFee ? Number(settings.deliveryFee) : 5000,
        tableCount: settings.tableCount ? Number(settings.tableCount) : 8,
        businessName: settings.businessName || 'Mi Heladería',
        businessSlogan: settings.businessSlogan || 'Helado artesanal',
        businessAddress: settings.businessAddress ? String(settings.businessAddress) : '',
        businessPhone: settings.businessPhone ? String(settings.businessPhone) : '',
        businessNit: settings.businessNit ? String(settings.businessNit) : '',
        invoicePrefix: settings.invoicePrefix ? String(settings.invoicePrefix) : 'POS',
        taxType: settings.taxType ? String(settings.taxType) : 'none',
        taxRate: Number(settings.taxRate) || 0,
        dianResolution: settings.dianResolution ? String(settings.dianResolution) : '',
        branding: brandingFromSettings(settings),
        initialized: true,
      });
      applyBranding(get().branding, get().businessName);
    } catch (err) {
      console.error('Error initializing data:', err);
    }
  },

  refreshOrders: async () => {
    try {
      const orders = await api.getOrders();
      set({ orders });
    } catch (err) {
      console.error('Error refreshing orders:', err);
    }
  },

  refreshCurrentShift: async () => {
    try {
      const shift = await api.getCurrentShift();
      set({ currentShift: shift });
    } catch (err) {
      console.error('Error refreshing shift:', err);
    }
  },

  addOrder: async (order) => {
    try {
      const created = await api.addOrder(order);
      set(s => {
        if (s.orders.some(o => o.id === created.id)) return s;
        return { orders: [created, ...s.orders] };
      });
      // Refresh shift stats in background
      get().refreshCurrentShift();
      return created.id;
    } catch (err) {
      console.error('Error creating order:', err);
      return -1;
    }
  },

  updateOrderStatus: (id, status) => {
    set(s => ({ orders: s.orders.map(o => o.id === id ? { ...o, status } : o) }));
    api.updateOrderStatus(id, status).then(() => {
      get().refreshCurrentShift();
    }).catch(err => {
      console.error('Error updating order status:', err);
      get().refreshOrders();
    });
  },

  updatePaymentStatus: (id, paymentStatus, paymentMethod) => {
    set(s => ({ orders: s.orders.map(o => o.id === id ? { ...o, paymentStatus, ...(paymentMethod ? { paymentMethod } : {}) } : o) }));
    api.updatePaymentStatus(id, paymentStatus, paymentMethod).then(() => {
      get().refreshCurrentShift();
    }).catch(err => {
      console.error('Error updating payment status:', err);
      get().refreshOrders();
    });
  },

  updateOrderCustomer: (id, data) => {
    set(s => ({ orders: s.orders.map(o => o.id === id ? { ...o, customer: { ...o.customer, ...data } } : o) }));
    api.updateOrderCustomer(id, data).catch(err => {
      console.error('Error updating order customer:', err);
      get().refreshOrders();
    });
  },

  uploadReceipt: (id, receiptImage) => {
    set(s => ({ orders: s.orders.map(o => o.id === id ? { ...o, receiptImage } : o) }));
    api.uploadReceipt(id, receiptImage).catch(err => {
      console.error('Error uploading receipt:', err);
    });
  },

  updateOrderNotes: (id, notes) => {
    set(s => ({ orders: s.orders.map(o => o.id === id ? { ...o, notes } : o) }));
    api.updateOrderNotes(id, notes).catch(err => {
      console.error('Error updating order notes:', err);
    });
  },

  assignDriver: (orderId, driverId) => {
    set(s => ({ orders: s.orders.map(o => o.id === orderId ? { ...o, driverId } : o) }));
    api.assignDriver(orderId, driverId).catch(console.error);
  },

  deleteOrder: (id) => {
    set(s => ({ orders: s.orders.filter(o => o.id !== id) }));
    api.deleteOrder(id).then(() => {
      get().refreshCurrentShift();
    }).catch(err => {
      console.error('Error deleting order:', err);
      get().refreshOrders();
    });
  },

  deleteOrders: (ids) => {
    set(s => ({ orders: s.orders.filter(o => !ids.includes(o.id)) }));
    Promise.all(ids.map(id => api.deleteOrder(id))).then(() => {
      get().refreshCurrentShift();
    }).catch(err => {
      console.error('Error deleting orders:', err);
      get().refreshOrders();
    });
  },

  updateOrdersStatus: (ids, status) => {
    set(s => ({ orders: s.orders.map(o => ids.includes(o.id) ? { ...o, status } : o) }));
    Promise.all(ids.map(id => api.updateOrderStatus(id, status))).then(() => {
      get().refreshCurrentShift();
    }).catch(err => {
      console.error('Error updating orders status:', err);
      get().refreshOrders();
    });
  },

  issueTestInvoice: async (id) => {
    const updated = await api.issueTestInvoice(id);
    set(s => ({ orders: s.orders.map(o => o.id === id ? { ...o, ...updated } : o) }));
  },

  openShift: async (initialCash, cashierName, notes) => {
    const shift = await api.openShift({ initialCash, cashierName, notes });
    set({ currentShift: shift });
  },

  closeShift: async (actualCash, notes) => {
    const shift = await api.closeShift({ actualCash, notes });
    set({ currentShift: null });
    return shift;
  },

  addCashMovement: async (amount, reason, type = 'withdrawal') => {
    const res = await api.addCashMovement({ amount, reason, type });
    if (res.shift) {
      set({ currentShift: res.shift });
    } else {
      get().refreshCurrentShift();
    }
  },

  addProduct: (product) => {
    api.addProduct(product).then(created => {
      set(s => ({ products: [...s.products, created] }));
    }).catch(console.error);
  },

  updateProduct: (id, data) => {
    set(s => ({ products: s.products.map(p => p.id === id ? { ...p, ...data } : p) }));
    api.updateProduct(id, data).catch(console.error);
  },

  toggleProductAvailability: (id) => {
    set(s => ({ products: s.products.map(p => p.id === id ? { ...p, available: !p.available } : p) }));
    api.toggleAvailability(id).catch(console.error);
  },

  adjustStock: async (id, data) => {
    const r = await api.adjustStock(id, data);
    set(s => ({ products: s.products.map(p => p.id === id ? { ...p, ...r.product } : p) }));
  },

  deleteProduct: (id) => {
    set(s => ({ products: s.products.filter(p => p.id !== id) }));
    api.deleteProduct(id).catch(console.error);
  },

  addCategory: (category) => {
    api.addCategory(category).then(created => {
      set(s => ({ categories: [...s.categories, created] }));
    }).catch(console.error);
  },

  updateCategory: (id, data) => {
    set(s => ({ categories: s.categories.map(c => c.id === id ? { ...c, ...data } : c) }));
    api.updateCategory(id, data).catch(console.error);
  },

  deleteCategory: (id) => {
    set(s => ({ categories: s.categories.filter(c => c.id !== id) }));
    api.deleteCategory(id).catch(console.error);
  },

  addCustomer: (customer) => {
    api.addCustomer(customer).then(created => {
      set(s => ({ customers: [...s.customers, created] }));
    }).catch(console.error);
  },

  updateCustomer: (id, data) => {
    set(s => ({ customers: s.customers.map(c => c.id === id ? { ...c, ...data } : c) }));
    api.updateCustomer(id, data).catch(console.error);
  },

  deleteCustomer: (id) => {
    set(s => ({ customers: s.customers.filter(c => c.id !== id) }));
    api.deleteCustomer(id).catch(console.error);
  },

  findCustomerByPhone: (phone) => {
    return get().customers.find(c => c.phone === phone);
  },

  findCustomerByDoc: (doc) => {
    return get().customers.find(c => c.documentId === doc);
  },

  addDriver: (driver) => {
    api.addDriver(driver).then(created => {
      set(s => ({ drivers: [...s.drivers, created] }));
    }).catch(console.error);
  },

  updateDriver: (id, data) => {
    set(s => ({ drivers: s.drivers.map(d => d.id === id ? { ...d, ...data } : d) }));
    api.updateDriver(id, data).catch(console.error);
  },

  deleteDriver: (id) => {
    set(s => ({ drivers: s.drivers.filter(d => d.id !== id) }));
    api.deleteDriver(id).catch(console.error);
  },

  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setBranding: (b) => {
    set(s => ({ branding: { ...s.branding, ...b } }));
    applyBranding(get().branding, get().businessName);
  },

  loadPublicBranding: async () => {
    try {
      const pb = await api.getPublicBranding();
      const branding = brandingFromSettings(pb);
      set(s => ({
        branding,
        businessName: pb.businessName || s.businessName,
        businessSlogan: pb.businessSlogan || s.businessSlogan,
      }));
      applyBranding(branding, get().businessName);
    } catch {
      applyBranding(get().branding, get().businessName);
    }
  },

  handleOrderEvent: (order) => {
    set(s => {
      const idx = s.orders.findIndex(o => o.id === order.id);
      if (idx >= 0) {
        const updated = [...s.orders];
        updated[idx] = order;
        return { orders: updated };
      }
      return { orders: [order, ...s.orders] };
    });
    get().refreshCurrentShift();
  },

  handleProductEvent: (product) => {
    set(s => ({ products: s.products.some(p => p.id === product.id) ? s.products.map(p => p.id === product.id ? { ...p, ...product } : p) : [...s.products, product] }));
  },
}));
