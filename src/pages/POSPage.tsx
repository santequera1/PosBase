import { BRAND } from '@/lib/theme';
import React, { useState, useMemo, useEffect } from 'react';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Check,
  CreditCard,
  Banknote,
  QrCode,
  Sparkles,
  User,
  Search,
  X,
  ArrowRight,
  ArrowLeft,
  EyeOff,
  Eye,
  Shuffle,
  Layers,
  Percent,
  Tag,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { useStore, type OrderItem, type PaymentMethod, type Product, type PaymentSplit } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { PrintModal } from '@/components/PrintModal';
import { CheckoutModal } from '@/components/CheckoutModal';
import { printThermal, generateSalesTicketHtml } from '@/lib/thermalPrint';

export interface GelatoFormat {
  id: string;
  name: string;
  container: 'Vaso' | 'Cono' | 'Familiar';
  capacity: string;
  scoops: number;
  price: number;
  desc: string;
  emoji: string;
  image: string;
}

const GELATO_FORMATS: GelatoFormat[] = [
  { id: 'vaso_pequeno', name: 'Vaso 4 oz',   container: 'Vaso',     capacity: '4 oz',   scoops: 1, price: 15000, desc: '1 sabor (4 oz)',      emoji: '🍨', image: '/images/products/vaso-pequeno.webp' },
  { id: 'vaso_grande',  name: 'Vaso 6 oz',   container: 'Vaso',     capacity: '6 oz',   scoops: 2, price: 21000, desc: '2 sabores (6 oz)',     emoji: '🍨', image: '/images/products/vaso-6oz.webp' },
  { id: 'cono_pequeno', name: 'Cono 1 Sabor', container: 'Cono',    capacity: 'Cono',   scoops: 1, price: 15000, desc: '1 sabor en cono',      emoji: '🍦', image: '/images/products/cono-pequeno.webp' },
  { id: 'cono_grande',  name: 'Cono 2 Sabores', container: 'Cono',  capacity: 'Cono',   scoops: 2, price: 21000, desc: '2 sabores en cono',    emoji: '🍦', image: '/images/products/cono-grande.webp' },
  { id: 'litro',        name: 'Litro Familiar', container: 'Familiar', capacity: '1000 ml', scoops: 2, price: 70000, desc: '2 sabores (familiar)', emoji: '🧊', image: '/images/products/helado-litro.webp' },
];

const QUICK_CASH_AMOUNTS = [15000, 20000, 21000, 50000, 100000];

interface TabOrder {
  id: string;
  name: string;
  cart: OrderItem[];
  customer: {
    name: string;
    doc: string;
    email: string;
    phone: string;
    isElectronicInvoice: boolean;
  };
  notes: string;
  paymentMethod: PaymentMethod;
  paymentSplit?: PaymentSplit;
  cashReceived: string;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
}

const DEFAULT_CUSTOMER = {
  name: 'Consumidor Final',
  doc: '222222222222',
  email: '',
  phone: '3000000000',
  isElectronicInvoice: false,
};

const STORAGE_TABS_KEY = 'pos_held_tabs_v1';

export const POSPage: React.FC = () => {
  const {
    products,
    categories,
    customers,
    addOrder,
    currentShift,
    toggleProductAvailability,
    initialize,
  } = useStore();

  // Tabs / Precuentas State
  const [tabs, setTabs] = useState<TabOrder[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TABS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [
      {
        id: 'tab-1',
        name: 'Cuenta 1',
        cart: [],
        customer: { ...DEFAULT_CUSTOMER },
        notes: '',
        paymentMethod: 'cash',
        cashReceived: '',
        discountType: 'percent',
        discountValue: 0,
      },
    ];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id || 'tab-1');
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState<string>('');
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [renameModalTab, setRenameModalTab] = useState<TabOrder | null>(null);
  const [customRenameValue, setCustomRenameValue] = useState("");

  const PRESET_TAB_NAMES = [
    "Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5",
    "Para Llevar", "Barra", "Rappi", "Evento"
  ];

  // Auto-fetch if catalog is empty
  useEffect(() => {
    if (products.length === 0 || categories.length === 0) {
      initialize();
    }
  }, [products.length, categories.length, initialize]);

  const handleRefreshCatalog = async () => {
    setIsRefreshingCatalog(true);
    try {
      await initialize();
      toast.success("Catálogo de sabores y productos actualizado");
    } catch (e) {
      toast.error("Error al actualizar catálogo");
    } finally {
      setIsRefreshingCatalog(false);
    }
  };

  const openRenameModal = (tab: TabOrder) => {
    setRenameModalTab(tab);
    setCustomRenameValue(tab.name);
  };

  const handleApplyTabName = (newName: string) => {
    if (!renameModalTab) return;
    const finalName = newName.trim() || renameModalTab.name;
    setTabs(prev => prev.map(t => t.id === renameModalTab.id ? { ...t, name: finalName } : t));
    setRenameModalTab(null);
    toast.success(`Cuenta nombrada: ${finalName}`);
  };


  // Active Tab Data
  const currentTab = useMemo(() => {
    return tabs.find(t => t.id === activeTabId) || tabs[0];
  }, [tabs, activeTabId]);

  const cart = currentTab.cart;
  const customer = currentTab.customer;
  const paymentMethod = currentTab.paymentMethod;
  const paymentSplit = currentTab.paymentSplit || {
    method1: 'cash',
    amount1: 0,
    method2: 'card_debit',
    amount2: 0,
  };
  const cashReceived = currentTab.cashReceived;
  const orderNotes = currentTab.notes;
  const discountType = currentTab.discountType || 'percent';
  const discountValue = currentTab.discountValue || 0;

  // Persist tabs
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TABS_KEY, JSON.stringify(tabs));
    } catch (e) {}
  }, [tabs]);

  // Tab Helper Mutators
  const updateActiveTab = (updates: Partial<TabOrder>) => {
    setTabs(prev =>
      prev.map(t => (t.id === activeTabId ? { ...t, ...updates } : t))
    );
  };

  const startEditingTab = (tab: TabOrder) => {
    setEditingTabId(tab.id);
    setEditingTabName(tab.name);
  };

  const saveEditingTab = () => {
    if (editingTabId && editingTabName.trim()) {
      setTabs(prev =>
        prev.map(t => (t.id === editingTabId ? { ...t, name: editingTabName.trim() } : t))
      );
    }
    setEditingTabId(null);
  };

  const handleAddNewTab = () => {
    const nextNum = tabs.length + 1;
    const newTab: TabOrder = {
      id: `tab-${Date.now()}`,
      name: `Cuenta ${nextNum}`,
      cart: [],
      customer: { ...DEFAULT_CUSTOMER },
      notes: '',
      paymentMethod: 'cash',
      cashReceived: '',
      discountType: 'percent',
      discountValue: 0,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    toast.success(`Nueva cuenta abierta: ${newTab.name}`);
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tabToClose = tabs.find(t => t.id === tabId);
    if (!tabToClose) return;

    if (tabToClose.cart.length > 0) {
      if (!window.confirm(`¿Deseas descartar los ítems de "${tabToClose.name}"?`)) {
        return;
      }
    }

    if (tabs.length === 1) {
      // Reset the single tab
      const resetTab: TabOrder = {
        id: 'tab-1',
        name: 'Cuenta 1',
        cart: [],
        customer: { ...DEFAULT_CUSTOMER },
        notes: '',
        paymentMethod: 'cash',
        cashReceived: '',
        discountType: 'percent',
        discountValue: 0,
      };
      setTabs([resetTab]);
      setActiveTabId('tab-1');
      return;
    }

    const remaining = tabs.filter(t => t.id !== tabId);
    setTabs(remaining);
    if (activeTabId === tabId) {
      setActiveTabId(remaining[0].id);
    }
  };

  // POS State
  const [catalogTab, setCatalogTab] = useState<'gelato' | number | 'custom'>('gelato');
  const [selectedFormat, setSelectedFormat] = useState<GelatoFormat>(GELATO_FORMATS[0]);
  const [firstFlavor, setFirstFlavor] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState<'catalog' | 'cart'>('catalog');

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [custSearchQuery, setCustSearchQuery] = useState('');

  const [customItem, setCustomItem] = useState({ name: '', price: '' });
  const [affogatoModalProd, setAffogatoModalProd] = useState<Product | null>(null);
  const [lastOrder, setLastOrder] = useState<any | null>(null);
  const [countdown, setCountdown] = useState<number>(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Totals Calculation with Discount
  const subtotal = useMemo(() => cart.reduce((acc, item) => acc + item.price * item.quantity, 0), [cart]);

  const discountAmount = useMemo(() => {
    if (discountValue <= 0) return 0;
    if (discountType === 'percent') {
      return Math.round((subtotal * Math.min(100, discountValue)) / 100);
    }
    return Math.min(subtotal, discountValue);
  }, [subtotal, discountType, discountValue]);

  const total = Math.max(0, subtotal - discountAmount);
  const numericCash = Number(cashReceived) || 0;
  const change = paymentMethod === 'cash' && numericCash > 0 ? numericCash - total : 0;

  // Auto-sync split payment when total changes or split is selected
  useEffect(() => {
    if (paymentMethod === 'mixed') {
      const half = Math.round(total / 2);
      if (!currentTab.paymentSplit || currentTab.paymentSplit.amount1 + currentTab.paymentSplit.amount2 !== total) {
        updateActiveTab({
          paymentSplit: {
            method1: currentTab.paymentSplit?.method1 || 'cash',
            amount1: currentTab.paymentSplit?.amount1 || half,
            method2: currentTab.paymentSplit?.method2 || 'card_debit',
            amount2: total - (currentTab.paymentSplit?.amount1 || half),
          },
        });
      }
    }
  }, [total, paymentMethod]);

  // Products filtering
  const gelatoFlavors = useMemo(() => {
    return products.filter(p => {
      const catId = Number(p.categoryId || (p as any).category_id);
      const isGelatoCat = catId === 1 || catId === 2 || catId === 3;
      if (!isGelatoCat) return false;
      if (searchQuery.trim()) {
        return (
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
        );
      }
      return true;
    });
  }, [products, searchQuery]);

  const otherProducts = useMemo(() => {
    if (typeof catalogTab !== 'number') return [];
    return products.filter(p => {
      const catId = Number(p.categoryId || (p as any).category_id);
      if (catId !== catalogTab) return false;
      if (searchQuery.trim()) {
        return p.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [products, catalogTab, searchQuery]);

  // Cart operations
  const addItemToCart = (item: OrderItem) => {
    const prevCart = currentTab.cart;
    const idx = prevCart.findIndex(i => i.name === item.name && i.price === item.price);
    let updatedCart: OrderItem[];
    if (idx >= 0) {
      updatedCart = [...prevCart];
      updatedCart[idx] = { ...updatedCart[idx], quantity: updatedCart[idx].quantity + 1 };
    } else {
      updatedCart = [...prevCart, item];
    }
    updateActiveTab({ cart: updatedCart });
  };

  const updateQuantity = (index: number, delta: number) => {
    const prevCart = currentTab.cart;
    const updated = [...prevCart];
    const newQty = updated[index].quantity + delta;
    let newCart: OrderItem[];
    if (newQty <= 0) {
      newCart = updated.filter((_, i) => i !== index);
    } else {
      updated[index] = { ...updated[index], quantity: newQty };
      newCart = updated;
    }
    updateActiveTab({ cart: newCart });
  };

  const removeItem = (index: number) => {
    updateActiveTab({ cart: currentTab.cart.filter((_, i) => i !== index) });
  };

  const clearCart = () => {
    updateActiveTab({
      cart: [],
      cashReceived: '',
      notes: '',
      paymentSplit: undefined,
      paymentMethod: 'cash',
      discountType: 'percent',
      discountValue: 0,
      customer: { ...DEFAULT_CUSTOMER },
    });
    setFirstFlavor(null);
    setShowDiscountInput(false);
  };

  // Gelato pricing helper (handles proportional scoop pricing, e.g. Pistacho Sin Azúcar)
  const getGelatoItemPrice = (format: GelatoFormat, f1: Product, f2?: Product | null) => {
    const isSA = (p?: Product | null) => {
      if (!p) return false;
      const lower = p.name.toLowerCase();
      return lower.includes('sin azúcar') || lower.includes('sin azucar') || lower.includes('sa');
    };

    const f1IsSA = isSA(f1);
    const f2IsSA = isSA(f2);

    if (format.scoops === 1) {
      if (f1IsSA) return 17000;
      return format.price; // 15000
    }

    // 2 Scoops formats (Vaso 6 oz / Cono 2 Sabores)
    if (format.id === 'vaso_grande' || format.id === 'cono_grande') {
      if (f1IsSA && f2IsSA) {
        // Both scoops Sin Azúcar ($11.500 + $11.500) -> $23.000
        return 23000;
      }
      if (f1IsSA || f2IsSA) {
        // 1 scoop Normal ($10.500) + 1 scoop Sin Azúcar ($11.500) -> $22.000
        return 22000;
      }
      // Both scoops Normal ($10.500 + $10.500) -> $21.000
      return 21000;
    }

    // Litro Familiar format (2 sabores)
    if (format.id === 'litro') {
      if (f1IsSA && f2IsSA) {
        // Both flavors Sin Azúcar ($37.500 + $37.500) -> $75.000
        return 75000;
      }
      if (f1IsSA || f2IsSA) {
        // 1 flavor Normal ($35.000) + 1 flavor Sin Azúcar ($37.500) -> $72.500
        return 72500;
      }
      // Both flavors Normal ($35.000 + $35.000) -> $70.000
      return 70000;
    }

    return format.price;
  };

  // Gelato dynamic image helper (swaps between Cup and Cone based on selected format)
  const getFlavorDisplayImage = (flavor: Product, format: GelatoFormat) => {
    const nameLower = flavor.name.toLowerCase();
    let slug = '';
    if (nameLower.includes('sin azúcar') || nameLower.includes('sin azucar') || nameLower.includes('sa')) slug = 'pistacho-sin-azucar';
    else if (nameLower.includes('pistacho')) slug = 'pistacho';
    else if (nameLower.includes('chocolate')) slug = 'chocolate';
    else if (nameLower.includes('avellana')) slug = 'avellana';
    else if (nameLower.includes('vainilla')) slug = 'vainilla';
    else if (nameLower.includes('stracciatella')) slug = 'stracciatella';
    else if (nameLower.includes('maracuyá y corozo') || nameLower.includes('maracuya y corozo')) slug = 'maracuya-corozo';
    else if (nameLower.includes('maracuyá') || nameLower.includes('maracuya')) slug = 'maracuya';
    else if (nameLower.includes('corozo')) slug = 'corozo';
    else if (nameLower.includes('amarena')) slug = 'yogurt-amarenas';
    else if (nameLower.includes('milo')) slug = 'milo';
    else if (nameLower.includes('coco')) slug = 'coco-almendra';
    else if (nameLower.includes('queso') || nameLower.includes('bocadillo')) slug = 'queso-bocadillo';

    if (format.container === 'Cono') {
      if (slug) return `/images/gelatos/conos/${slug}.webp`;
    }

    if (format.id === 'vaso_pequeno') {
      if (slug) return `/images/gelatos/vaso4oz/${slug}.webp`;
    }

    if (format.id === 'litro' || format.container === 'Familiar') {
      if (slug) return `/images/gelatos/litro/${slug}.webp`;
    }

    return flavor.image;
  };

  // Flavors Dispatch Logic
  const handleFlavorClick = (flavor: Product) => {
    if (!flavor.available) {
      toast.error(`${flavor.name} no está disponible actualmente`);
      return;
    }

    if (selectedFormat.scoops === 1) {
      const itemPrice = getGelatoItemPrice(selectedFormat, flavor);
      const containerLabel = selectedFormat.container === 'Cono' ? 'Cono' : 'Vaso';
      addItemToCart({
        productId: flavor.id,
        name: `Gelato en ${containerLabel} (${selectedFormat.capacity}) — ${flavor.name}`,
        size: `${selectedFormat.name} (${selectedFormat.capacity})`,
        flavors: flavor.name,
        quantity: 1,
        price: itemPrice,
        notes: '',
      });
      toast.success(`Agregado: ${selectedFormat.name} (${flavor.name})`);
    } else {
      if (!firstFlavor) {
        setFirstFlavor(flavor);
      } else {
        const isSame = firstFlavor.id === flavor.id;
        const itemPrice = getGelatoItemPrice(selectedFormat, firstFlavor, flavor);
        const containerLabel = selectedFormat.container === 'Cono' ? 'Cono' : selectedFormat.container === 'Familiar' ? 'Litro Familiar' : 'Vaso';
        const combinationName = isSame
          ? `Gelato en ${containerLabel} (${selectedFormat.capacity}) — ${flavor.name}`
          : `Gelato en ${containerLabel} (${selectedFormat.capacity}) — ${firstFlavor.name} + ${flavor.name}`;

        const flavorsList = isSame ? `${flavor.name}` : `${firstFlavor.name}, ${flavor.name}`;

        addItemToCart({
          productId: firstFlavor.id,
          name: combinationName,
          size: `${selectedFormat.name} (${selectedFormat.capacity})`,
          flavors: flavorsList,
          quantity: 1,
          price: itemPrice,
          notes: '',
        });

        toast.success(`Agregado: ${combinationName}`);
        setFirstFlavor(null);
      }
    }
  };

  const handleAddFirstFlavorSolo = () => {
    if (!firstFlavor) return;
    const itemPrice = getGelatoItemPrice(selectedFormat, firstFlavor, firstFlavor);
    const containerLabel = selectedFormat.container === 'Cono' ? 'Cono' : selectedFormat.container === 'Familiar' ? 'Litro Familiar' : 'Vaso';
    addItemToCart({
      productId: firstFlavor.id,
      name: `Gelato en ${containerLabel} (${selectedFormat.capacity}) — ${firstFlavor.name}`,
      size: `${selectedFormat.name} (${selectedFormat.capacity})`,
      flavors: firstFlavor.name,
      quantity: 1,
      price: itemPrice,
      notes: '',
    });
    toast.success(`Agregado: ${selectedFormat.name} (${firstFlavor.name})`);
    setFirstFlavor(null);
  };

  const handleAddOtherProduct = (prod: Product) => {
    if (!prod.available) {
      toast.error(`${prod.name} no está disponible`);
      return;
    }

    if (prod.name.toLowerCase().includes('affogato clásico') || prod.name === 'Affogato Clásico' || (prod.category_id === 6 && !prod.name.toLowerCase().includes('sin azúcar'))) {
      setAffogatoModalProd(prod);
      return;
    }

    if (prod.name.toLowerCase().includes('affogato pistacho sin azúcar')) {
      addItemToCart({
        productId: prod.id,
        name: 'Affogato Pistacho Sin Azúcar',
        size: 'Affogato Pistacho SA',
        flavors: 'Pistacho Sin Azúcar',
        quantity: 1,
        price: prod.price || 22000,
        notes: '',
      });
      toast.success('Agregado: Affogato Pistacho Sin Azúcar');
      return;
    }

    addItemToCart({
      productId: prod.id,
      name: prod.name,
      size: undefined,
      flavors: undefined,
      quantity: 1,
      price: prod.price,
      notes: '',
    });
    toast.success(`Agregado: ${prod.name}`);
  };

  const handleAddCustomItem = () => {
    const priceNum = Number(customItem.price);
    if (!customItem.name.trim() || !priceNum || priceNum <= 0) {
      toast.error('Ingresa nombre y precio válido para el ítem');
      return;
    }
    addItemToCart({
      productId: 0,
      name: customItem.name.trim(),
      quantity: 1,
      price: priceNum,
      notes: 'Ítem personalizado',
    });
    setCustomItem({ name: '', price: '' });
    setCatalogTab('gelato');
    toast.success('Ítem agregado al carrito');
  };

  // Checkout Execution
  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }

    if (paymentMethod === 'cash') {
      if (numericCash > 0 && numericCash < total) {
        toast.error(`El monto recibido (${formatPrice(numericCash)}) es menor al total (${formatPrice(total)})`);
        return;
      }
    }

    if (paymentMethod === 'mixed') {
      const half = Math.round(total / 2);
      const split = paymentSplit || { method1: 'cash', amount1: half, method2: 'card_debit', amount2: total - half };
      const sum = Number(split.amount1 || 0) + Number(split.amount2 || 0);
      if (sum !== total) {
        toast.error(`La suma de los métodos de pago (${formatPrice(sum)}) debe ser igual al total (${formatPrice(total)})`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const half = Math.round(total / 2);
      const finalSplit = paymentMethod === 'mixed'
        ? (paymentSplit || { method1: 'cash', amount1: half, method2: 'card_debit', amount2: total - half })
        : undefined;

      const orderPayload = {
        type: 'pickup' as const,
        status: 'delivered' as const,
        customer: {
          name: customer.name.trim() || 'Consumidor Final',
          doc: customer.doc.trim() || '222222222222',
          email: customer.email.trim() || undefined,
          phone: customer.phone.trim() || undefined,
          isElectronicInvoice: customer.isElectronicInvoice,
        },
        items: cart,
        subtotal,
        deliveryFee: 0,
        discount: discountAmount,
        total,
        paymentMethod,
        paymentSplit: finalSplit,
        paymentStatus: 'paid' as const,
        cashReceived: paymentMethod === 'cash'
          ? (numericCash || total)
          : paymentMethod === 'mixed'
            ? (finalSplit?.method1 === 'cash' ? Number(finalSplit.amount1) : finalSplit?.method2 === 'cash' ? Number(finalSplit.amount2) : 0)
            : 0,
        cashChange: paymentMethod === 'cash' ? Math.max(0, change) : 0,
        notes: orderNotes,
        shiftId: currentShift?.id || undefined,
      };

      const newId = await addOrder(orderPayload);

      if (newId > 0) {
        setShowCheckoutModal(false);
        setShowDiscountInput(false);

        // Reset the completed tab into a fresh, clean account ready for the next customer
        const resetTab: TabOrder = {
          id: activeTabId,
          name: currentTab.name.startsWith('Cuenta') ? currentTab.name : 'Cuenta 1',
          cart: [],
          customer: { ...DEFAULT_CUSTOMER },
          notes: '',
          paymentMethod: 'cash',
          cashReceived: '',
          discountType: 'percent',
          discountValue: 0,
          paymentSplit: undefined,
        };

        setTabs(prev => prev.map(t => (t.id === activeTabId ? resetTab : t)));
        setFirstFlavor(null);
        setMobileView('catalog');
        toast.success(`¡Venta #${newId} registrada con éxito!`);
      } else {
        toast.error('No se pudo procesar la venta. Intenta nuevamente.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar la venta');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-brand-bg text-brand-primary overflow-hidden">
      {/* Mobile Top View Switcher */}
      <div className="lg:hidden flex bg-brand-dark p-1.5 gap-1.5 shrink-0 shadow-md">
        <button
          onClick={() => setMobileView('catalog')}
          className={cn(
            'flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 font-sans',
            mobileView === 'catalog' ? 'bg-brand-card text-brand-dark shadow-sm' : 'text-brand-bg/80 hover:text-white'
          )}
        >
          <span>🍨 Sabores & Productos</span>
        </button>
        <button
          onClick={() => setMobileView('cart')}
          className={cn(
            'flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 font-sans',
            mobileView === 'cart' ? 'bg-brand-card text-brand-dark shadow-sm' : 'text-brand-bg/80 hover:text-white'
          )}
        >
          <ShoppingCart size={14} />
          <span>{currentTab.name} ({cart.reduce((a, b) => a + b.quantity, 0)}) • {formatPrice(total)}</span>
        </button>
      </div>

      {/* LEFT COLUMN: Catalog & Fast Gelato Builder */}
      <div className={cn('flex-1 flex-col h-full overflow-hidden border-r border-brand-primary/10', mobileView === 'catalog' ? 'flex' : 'hidden lg:flex')}>
        {/* Top Navigation & Size Switcher Bar */}
        <div className="p-2.5 lg:p-3 bg-white/80 backdrop-blur border-b border-brand-primary/10 shrink-0 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-brand-card text-brand-primary border border-brand-accent/50 font-sans">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                {currentShift ? `Turno #${currentShift.id} • ${currentShift.cashierName}` : 'Caja Activa'}
              </span>
            </div>

            {/* Quick Search */}
            <div className="relative w-44 sm:w-60">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar sabor o producto..."
                className="w-full pl-7 pr-3 py-1 rounded-xl text-xs bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary font-sans"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => { setCatalogTab('gelato'); setFirstFlavor(null); }}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shadow-sm font-sans',
                catalogTab === 'gelato'
                  ? 'bg-brand-primary text-brand-bg shadow-md scale-[1.01]'
                  : 'bg-white hover:bg-brand-card text-brand-primary border border-brand-primary/10'
              )}
            >
              <span>🍨</span>
              <span>Gelatos Artesanales</span>
            </button>

            {/* Affogatos, Bebidas & Aguas, Adicionales */}
            {categories.filter(c => c.id === 6 || c.id === 4 || c.id === 5).map(cat => (
              <button
                key={cat.id}
                onClick={() => { setCatalogTab(cat.id); setFirstFlavor(null); }}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all font-sans',
                  catalogTab === cat.id
                    ? 'bg-brand-primary text-brand-bg shadow-md scale-[1.01]'
                    : 'bg-white hover:bg-brand-card text-brand-primary border border-brand-primary/10'
                )}
              >
                <span>{cat.emoji}</span>
                <span>{cat.id === 4 ? 'Bebidas' : cat.id === 5 ? 'Toppings' : cat.name}</span>
              </button>
            ))}

            <button
              onClick={() => setCatalogTab('custom')}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all font-sans',
                catalogTab === 'custom'
                  ? 'bg-brand-primary text-brand-bg shadow-md'
                  : 'bg-white hover:bg-brand-card text-brand-primary border border-brand-primary/10'
              )}
            >
              <Plus size={14} />
              <span>Personalizado</span>
            </button>
          </div>

          {/* Size & Container Formats Selector (5 presentations) */}
          {catalogTab === 'gelato' && (
            <div className="mt-2 pt-2 border-t border-brand-primary/10">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {GELATO_FORMATS.map((fmt) => {
                  const isSelected = selectedFormat.id === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => {
                        setSelectedFormat(fmt);
                        setFirstFlavor(null);
                      }}
                      className={cn(
                        'flex items-center justify-between p-1.5 sm:p-2 rounded-xl border transition-all text-left shadow-sm',
                        isSelected
                          ? 'bg-brand-card border-brand-primary ring-2 ring-brand-primary font-bold scale-[1.01]'
                          : 'bg-white/90 border-gray-200 hover:border-brand-accent hover:bg-white text-brand-primary'
                      )}
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-white/90 border border-brand-primary/10 flex items-center justify-center p-0.5 shrink-0 overflow-hidden shadow-xs">
                          <img src={fmt.image} alt={fmt.name} className="max-h-full max-w-full object-contain" />
                        </div>
                        <div className="leading-tight truncate">
                          <p className="font-sans font-bold text-[11px] text-brand-dark truncate">
                            {fmt.name}
                          </p>
                          <p className="font-sans font-bold text-[10.5px] text-brand-primary-strong">
                            {formatPrice(fmt.price)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Helper Banner */}
              {selectedFormat.scoops === 2 && (
                <div className="mt-1.5 px-2.5 py-1.5 rounded-xl bg-brand-card border border-brand-accent/40 flex items-center justify-between text-xs font-medium text-brand-primary">
                  {firstFlavor ? (
                    <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                      <span className="font-bold text-emerald-700 flex items-center gap-1 shrink-0 font-sans">
                        <Check size={13} /> {firstFlavor.name}
                      </span>
                      <ArrowRight size={11} className="text-brand-muted shrink-0" />
                      <span className="text-brand-primary-strong font-semibold truncate text-[11px] font-sans">
                        Toca el 2do sabor (o toca {firstFlavor.name} para 1 solo sabor)
                      </span>
                      <button
                        onClick={handleAddFirstFlavorSolo}
                        className="ml-1 px-2 py-0.5 rounded-lg bg-brand-primary text-brand-bg text-[10px] font-bold shrink-0 font-sans hover:bg-brand-dark"
                        title="Agregar con 1 solo sabor"
                      >
                        ✓ Dejar 1 Sabor
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] font-sans">
                      Paso 1: <strong className="text-brand-primary">Toca el 1er sabor</strong> <span className="text-gray-500 font-normal">({selectedFormat.desc})</span>
                    </span>
                  )}

                  {firstFlavor && (
                    <button
                      onClick={() => setFirstFlavor(null)}
                      className="text-xs text-red-600 hover:underline flex items-center gap-0.5 ml-2 shrink-0 font-sans"
                    >
                      <X size={11} /> Cancelar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Catalog Grid Area */}
        <div className="flex-1 overflow-y-auto p-3 lg:p-4">
          {catalogTab === 'gelato' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wider uppercase text-brand-muted">
                    Sabores disponibles ({gelatoFlavors.length} disponibles)
                  </span>
                  <button
                    onClick={handleRefreshCatalog}
                    disabled={isRefreshingCatalog}
                    className="p-1 px-2 text-[11px] rounded-lg bg-white border border-brand-primary/15 hover:bg-brand-card text-brand-primary font-semibold flex items-center gap-1 shadow-sm transition-all"
                    title="Recargar catálogo de sabores"
                  >
                    <RotateCcw size={12} className={cn(isRefreshingCatalog && "animate-spin")} />
                    <span>Actualizar</span>
                  </button>
                </div>
                <div className="relative w-48 lg:w-64">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar sabor..."
                    className="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-white border border-brand-primary/15 focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-2 lg:gap-2.5">
                {gelatoFlavors.map(flavor => {
                  const isCono = selectedFormat.container === 'Cono';
                  const isVaso4oz = selectedFormat.id === 'vaso_pequeno';
                  const isLitro = selectedFormat.id === 'litro' || selectedFormat.container === 'Familiar';
                  const isWhiteCard = isCono || isVaso4oz || isLitro;
                  const isFirstSelected = firstFlavor?.id === flavor.id;
                  const bgColor = isWhiteCard ? '#FFFFFF' : (flavor.color_bg || BRAND.card);
                  const isSinAzucar = flavor.name.toLowerCase().includes('sin azúcar');
                  const isQuesoBocadillo = flavor.name.toLowerCase().includes('queso') && flavor.name.toLowerCase().includes('bocadillo');
                  const isAmarenas = flavor.name.toLowerCase().includes('amarena');

                  return (
                    <div
                      key={flavor.id}
                      onClick={() => handleFlavorClick(flavor)}
                      className={cn(
                        'relative flex flex-col justify-between p-3 rounded-2xl cursor-pointer transition-all duration-200 select-none shadow-sm',
                        flavor.available
                          ? 'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]'
                          : 'opacity-50 grayscale cursor-not-allowed',
                        isWhiteCard && 'bg-white border border-brand-primary/15 hover:border-brand-accent',
                        !isWhiteCard && isQuesoBocadillo && 'border-2 border-[#B9382F]/40 bg-[#FFF5F2]',
                        !isWhiteCard && isAmarenas && 'border-2 border-[#8B1E3F]/40 bg-[#FDF2F4]',
                        isFirstSelected && 'ring-4 ring-brand-primary shadow-lg scale-[1.03]'
                      )}
                      style={{ backgroundColor: isWhiteCard ? '#FFFFFF' : (isQuesoBocadillo ? '#FFF5F2' : isAmarenas ? '#FDF2F4' : bgColor) }}
                    >
                      {/* Availability Quick Toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleProductAvailability(flavor.id);
                        }}
                        title={flavor.available ? 'Marcar como agotado' : 'Marcar como disponible'}
                        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-xs shadow-sm"
                      >
                        {flavor.available ? (
                          <Eye size={12} className="text-emerald-700" />
                        ) : (
                          <EyeOff size={12} className="text-red-600" />
                        )}
                      </button>

                      {/* Flavor Image (Dynamic Vaso 4oz, Vaso 6oz, Cono vs Litro) */}
                      {(() => {
                        const displayImg = getFlavorDisplayImage(flavor, selectedFormat);
                        return (
                          <div className={cn(
                            "w-full flex items-center justify-center my-1 overflow-hidden transition-all",
                            isCono ? "h-28 sm:h-32 lg:h-36" : (isVaso4oz || isLitro) ? "h-24 sm:h-28 lg:h-32" : "h-20 lg:h-24"
                          )}>
                            {displayImg ? (
                              <img
                                key={displayImg}
                                src={displayImg}
                                alt={flavor.name}
                                className={cn(
                                  "max-h-full max-w-full object-contain transition-all duration-300 hover:scale-105",
                                  isWhiteCard ? "drop-shadow-none" : "drop-shadow-md",
                                  isQuesoBocadillo && !isCono && !isVaso4oz && !isLitro && "hue-rotate-15 contrast-105"
                                )}
                              />
                            ) : (
                              <span className="text-4xl">{isQuesoBocadillo ? '🧀' : isAmarenas ? '🍒' : '🍨'}</span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Presentation format badge */}
                      <div className="mb-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1",
                          selectedFormat.container === 'Cono'
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : selectedFormat.id === 'litro'
                            ? "bg-blue-100 text-blue-900 border border-blue-300"
                            : "bg-brand-bg text-brand-primary border border-brand-accent/40"
                        )}>
                          <span>{selectedFormat.emoji}</span>
                          <span>{selectedFormat.name}</span>
                        </span>
                      </div>

                      {/* Details */}
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="font-sans font-bold text-sm lg:text-base text-brand-dark leading-tight truncate">
                            {flavor.name}
                          </h3>
                        </div>
                        {isSinAzucar && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                            🌿 Sin Azúcar ($17k)
                          </span>
                        )}
                        {isQuesoBocadillo && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-100 text-red-900 border border-red-200">
                            🧀 Dulce de Guayaba
                          </span>
                        )}
                        {isAmarenas && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-pink-100 text-pink-900 border border-pink-200">
                            🍒 Cereza Amarena
                          </span>
                        )}
                        <p className="font-sans text-[11px] text-[#6B5E4F] not-italic line-clamp-1 mt-0.5 font-normal">
                          {flavor.description || 'Gelato artesanal'}
                        </p>
                      </div>

                      {isFirstSelected && (
                        <div className="absolute inset-0 bg-brand-primary/20 rounded-2xl flex items-center justify-center">
                          <span className="bg-brand-primary text-brand-bg px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                            ✓ 1er Sabor
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Other Categories Grid (Affogatos, Bebidas, Toppings) */}
          {typeof catalogTab === 'number' && (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-2.5">
                {otherProducts.map(prod => (
                  <div
                    key={prod.id}
                    onClick={() => handleAddOtherProduct(prod)}
                    className={cn(
                      'p-3.5 rounded-2xl bg-white border border-brand-primary/10 hover:border-brand-accent hover:shadow-md cursor-pointer transition-all flex flex-col justify-between shadow-sm group',
                      !prod.available && 'opacity-50 grayscale'
                    )}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <h3 className="font-sans font-bold text-brand-primary text-sm lg:text-base leading-tight">{prod.name}</h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleProductAvailability(prod.id);
                          }}
                          className="p-1 rounded-md hover:bg-gray-100"
                        >
                          {prod.available ? <Eye size={14} className="text-emerald-600" /> : <EyeOff size={14} className="text-red-500" />}
                        </button>
                      </div>

                      {/* Product Image */}
                      {prod.image && (
                        <div className="w-full h-20 lg:h-24 flex items-center justify-center my-1.5">
                          <img
                            src={prod.image}
                            alt={prod.name}
                            className="max-h-full max-w-full object-contain drop-shadow-md transition-transform group-hover:scale-105"
                          />
                        </div>
                      )}

                      <p className="font-sans text-xs text-brand-muted not-italic my-1 line-clamp-2">{prod.description || 'Producto Gia'}</p>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                      <span className="font-sans font-bold text-sm lg:text-base text-brand-primary-strong">{formatPrice(prod.price)}</span>
                      <span className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-brand-primary text-brand-bg flex items-center justify-center text-sm font-bold shadow-sm group-hover:scale-105 transition-transform">
                        +
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Item Form */}
          {catalogTab === 'custom' && (
            <div className="max-w-md mx-auto p-6 bg-white rounded-3xl border border-brand-primary/10 shadow-sm mt-4">
              <h3 className="font-sans font-bold text-lg text-brand-primary mb-4">Agregar Ítem Especial</h3>
              <div className="space-y-4">
                <div>
                  <label className="font-sans text-xs font-semibold text-brand-muted">Descripción / Nombre</label>
                  <input
                    type="text"
                    value={customItem.name}
                    onChange={(e) => setCustomItem(ci => ({ ...ci, name: e.target.value }))}
                    placeholder="Ej. Topping extra, Combo especial..."
                    className="w-full mt-1 p-2.5 rounded-xl border border-brand-primary/20 text-sm font-sans focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
                <div>
                  <label className="font-sans text-xs font-semibold text-brand-muted">Precio (COP)</label>
                  <input
                    type="number"
                    value={customItem.price}
                    onChange={(e) => setCustomItem(ci => ({ ...ci, price: e.target.value }))}
                    placeholder="Ej. 10000"
                    className="w-full mt-1 p-2.5 rounded-xl border border-brand-primary/20 text-sm font-sans font-bold focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
                <button
                  onClick={handleAddCustomItem}
                  className="w-full py-3 rounded-xl bg-brand-primary text-brand-bg font-sans font-semibold text-sm hover:bg-brand-dark transition-all"
                >
                  Agregar al Carrito
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Floating Mobile Cart Bar */}
        {cart.length > 0 && (
          <div className="lg:hidden p-2.5 bg-white border-t border-brand-primary/15 shadow-xl shrink-0">
            <button
              onClick={() => setMobileView('cart')}
              className="w-full py-2.5 px-4 rounded-xl bg-brand-primary text-brand-bg font-bold text-xs flex items-center justify-between shadow-md active:scale-[0.99] font-sans"
            >
              <span className="flex items-center gap-2">
                <ShoppingCart size={15} />
                {currentTab.name} • {cart.reduce((a, b) => a + b.quantity, 0)} ítems
              </span>
              <span className="flex items-center gap-1 font-extrabold text-sm">
                Cobrar {formatPrice(total)} <ArrowRight size={15} />
              </span>
            </button>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Live Cart & Fast Checkout Panel */}
      <div className={cn('w-full lg:w-80 xl:w-96 bg-white flex-col h-full border-l border-brand-primary/10 shadow-xl shrink-0 font-sans', mobileView === 'cart' ? 'flex' : 'hidden lg:flex')}>
        {/* Precuentas / Multi-tabs Bar */}
        <div className="p-2 bg-brand-dark text-white flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-1 shrink-0 text-xs font-bold text-brand-accent pl-1 pr-2">
            <Layers size={14} />
            <span className="hidden sm:inline">Cuentas:</span>
          </div>

          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isEditing = editingTabId === tab.id;
            const itemCount = tab.cart.reduce((a, b) => a + b.quantity, 0);
            return (
              <div
                key={tab.id}
                onClick={() => {
                  if (!isEditing) setActiveTabId(tab.id);
                }}
                onDoubleClick={() => startEditingTab(tab)}
                className={cn(
                  'px-2.5 py-1 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all select-none whitespace-nowrap group',
                  isActive
                    ? 'bg-brand-bg text-brand-dark font-bold shadow-md'
                    : 'bg-white/10 text-brand-bg/80 hover:bg-white/20'
                )}
              >
                {isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    value={editingTabName}
                    onChange={(e) => setEditingTabName(e.target.value)}
                    onBlur={saveEditingTab}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEditingTab();
                      if (e.key === 'Escape') setEditingTabId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-24 px-1.5 py-0.5 text-xs text-brand-dark bg-white rounded-md border border-brand-accent outline-none font-bold"
                  />
                ) : (
                  <span className="flex items-center gap-1">
                    {tab.name}
                    {isActive && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameModal(tab);
                        }}
                        className="opacity-60 hover:opacity-100 p-0.5"
                        title="Renombrar cuenta (Ej. Mesa 4, Carlos...)"
                      >
                        <Pencil size={10} />
                      </button>
                    )}
                  </span>
                )}

                {itemCount > 0 && (
                  <span className={cn(
                    'px-1.5 py-0.2 text-[10px] rounded-full font-bold',
                    isActive ? 'bg-brand-primary text-brand-bg' : 'bg-white/20 text-white'
                  )}>
                    {itemCount}
                  </span>
                )}
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="hover:text-red-400 p-0.5 rounded-md"
                    title="Cerrar esta cuenta"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={handleAddNewTab}
            className="p-1 px-2 rounded-xl bg-brand-accent hover:bg-[#b8b070] text-brand-dark text-xs font-bold flex items-center gap-0.5 shrink-0 shadow-sm"
            title="Abrir otra cuenta en espera"
          >
            <Plus size={13} />
            <span className="text-[11px]">Nueva</span>
          </button>
        </div>

        {/* Cart Header */}
        <div className="p-2.5 bg-brand-card border-b border-brand-primary/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileView('catalog')}
              className="lg:hidden p-1 rounded-lg bg-white border border-brand-primary/20 text-brand-primary hover:bg-gray-50 flex items-center gap-1 text-xs font-bold font-sans"
              title="Volver al catálogo"
            >
              <ArrowLeft size={13} />
              <span>Sabores</span>
            </button>
            <ShoppingCart size={16} className="text-brand-primary" />

            {editingTabId === currentTab.id ? (
              <input
                type="text"
                autoFocus
                value={editingTabName}
                onChange={(e) => setEditingTabName(e.target.value)}
                onBlur={saveEditingTab}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEditingTab();
                  if (e.key === 'Escape') setEditingTabId(null);
                }}
                className="px-2 py-0.5 text-sm font-bold text-brand-dark bg-white rounded-lg border border-brand-accent outline-none"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openRenameModal(currentTab)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white hover:bg-gray-100 border border-brand-primary/20 text-brand-primary text-xs font-bold font-sans shadow-sm transition-all"
                  title="Cambiar nombre a esta cuenta (ej. Mesa 2, Carlos...)"
                >
                  <span>{currentTab.name}</span>
                  <span className="text-brand-muted font-normal">({cart.reduce((a, b) => a + b.quantity, 0)})</span>
                  <Pencil size={11} className="text-brand-accent ml-0.5" />
                </button>
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-red-600 hover:text-red-700 font-semibold font-sans flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={13} /> Vaciar
            </button>
          )}
        </div>

        {/* Customer Fast Selector Bar */}
        <div className="p-2.5 bg-white border-b border-brand-primary/10 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <User size={15} className="text-brand-accent shrink-0" />
            <div className="truncate">
              <span className="font-bold text-brand-primary font-sans">{customer.name}</span>
              <span className="text-brand-muted ml-1.5 font-mono">({customer.doc})</span>
            </div>
          </div>

          <button
            onClick={() => setShowCustomerModal(true)}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-brand-card hover:bg-brand-card-2 text-brand-primary font-semibold text-[11px] border border-brand-accent/50 font-sans"
          >
            {customer.isElectronicInvoice ? '⚡ F. Electrónica' : 'Cambiar / F.E.'}
          </button>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto min-h-0 p-2.5 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-brand-muted/70 p-4">
              <div className="w-12 h-12 rounded-full bg-brand-card flex items-center justify-center text-2xl mb-2">
                🍨
              </div>
              <p className="font-sans font-bold text-sm text-brand-primary">Cuenta sin ítems</p>
              <p className="text-xs text-brand-muted max-w-xs mt-1 font-sans">
                Selecciona sabores o productos en el catálogo para agregarlos a {currentTab.name}.
              </p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-2xl bg-brand-card border border-brand-primary/15 hover:border-brand-primary/30 transition-all shadow-xs space-y-1.5"
              >
                {/* Row 1: Presentation / Product Name + Subtotal + Remove */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-sans font-bold text-xs sm:text-sm text-brand-dark leading-tight block">
                      {item.size || item.name.replace(/—.*$/, '').trim()}
                    </span>
                    {item.size && item.name.includes('—') && (
                      <span className="text-[10px] text-gray-500 font-sans block truncate">
                        {item.name.replace(/^.*?—\s*/, '')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-sans font-bold text-xs sm:text-sm text-brand-primary-strong">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                    <button
                      onClick={() => removeItem(idx)}
                      className="text-gray-400 hover:text-red-500 p-0.5 rounded-md hover:bg-red-50 transition-colors"
                      title="Eliminar producto"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Row 2: Flavors (FULL DISPLAY, NO TRUNCATION) */}
                {item.flavors && (
                  <div className="p-1.5 rounded-xl bg-white border border-brand-accent/40 text-xs font-semibold text-brand-primary flex items-center gap-1.5">
                    <span className="text-xs shrink-0">🍨</span>
                    <span className="leading-snug break-words flex-1 font-sans">
                      {item.flavors.split(',').map(f => f.trim()).join('  +  ')}
                    </span>
                  </div>
                )}

                {/* Row 3: Unit Price & Quantity Stepper */}
                <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                  <span className="text-[11px] text-brand-muted font-medium font-sans">
                    {formatPrice(item.price)} c/u
                  </span>

                  <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-brand-primary/20 shadow-xs">
                    <button
                      onClick={() => updateQuantity(idx, -1)}
                      className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100 text-brand-primary active:scale-95 transition-transform"
                      title="Restar 1"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="w-5 text-center font-bold text-xs text-brand-primary font-sans">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(idx, 1)}
                      className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100 text-brand-primary active:scale-95 transition-transform"
                      title="Sumar 1"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Totals & Go to Checkout Button */}
        <div className="p-3 bg-brand-card border-t border-brand-primary/15 shrink-0 space-y-2.5">
          {/* Totals Summary */}
          <div className="space-y-1 text-xs">
            {discountAmount > 0 && (
              <>
                <div className="flex justify-between text-brand-muted">
                  <span>Subtotal:</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-red-600 font-bold">
                  <span>Descuento ({discountType === 'percent' ? `${discountValue}%` : 'Monto'}):</span>
                  <span>-{formatPrice(discountAmount)}</span>
                </div>
              </>
            )}
            <div className="flex items-baseline justify-between pt-0.5 text-sm sm:text-base font-sans font-bold text-brand-primary">
              <span>Total a Cobrar:</span>
              <span className="text-base sm:text-xl font-sans font-extrabold text-brand-dark">{formatPrice(total)}</span>
            </div>
          </div>

          {/* Primary Action Button -> Opens Dedicated Checkout Modal */}
          <button
            onClick={() => setShowCheckoutModal(true)}
            disabled={cart.length === 0}
            className={cn(
              'w-full py-3 sm:py-3.5 px-4 rounded-2xl font-sans font-bold text-sm sm:text-base text-brand-bg flex items-center justify-center gap-2 shadow-lg transition-all',
              cart.length > 0
                ? 'bg-gradient-to-r from-brand-primary to-brand-dark hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
                : 'bg-gray-400 cursor-not-allowed'
            )}
          >
            <Sparkles size={17} />
            <span>COBRAR {formatPrice(total)} ➔</span>
          </button>
        </div>
      </div>

      {/* Dedicated Checkout Modal (Step 2) */}
      <CheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        tabName={currentTab.name}
        cart={cart}
        customer={customer}
        subtotal={subtotal}
        discountAmount={discountAmount}
        discountType={discountType}
        discountValue={discountValue}
        total={total}
        paymentMethod={paymentMethod}
        paymentSplit={paymentSplit}
        cashReceived={cashReceived}
        orderNotes={orderNotes}
        isSubmitting={isSubmitting}
        onUpdateTab={updateActiveTab}
        onConfirmCheckout={handleCheckout}
      />

      {/* Customer Modal */}
      <AnimatePresence>
        {showCustomerModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-brand-primary/10"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-sans font-bold text-lg text-brand-primary">Datos del Cliente / Facturación</h3>
                <button onClick={() => setShowCustomerModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>

              <button
                onClick={() => {
                  updateActiveTab({ customer: { ...DEFAULT_CUSTOMER } });
                  setShowCustomerModal(false);
                }}
                className="w-full mb-4 py-2.5 px-3 rounded-xl bg-brand-card border border-brand-accent/50 text-xs font-bold text-brand-primary hover:bg-brand-card-2 flex items-center justify-center gap-2"
              >
                <span>👤 Restablecer a Consumidor Final (222222222222)</span>
              </button>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-brand-muted">Buscar Cliente Registrado</label>
                  <input
                    type="text"
                    value={custSearchQuery}
                    onChange={(e) => setCustSearchQuery(e.target.value)}
                    placeholder="Buscar por cédula o nombre..."
                    className="w-full mt-1 p-2 rounded-xl border border-gray-200 text-xs"
                  />
                  {custSearchQuery.length >= 2 && (
                    <div className="max-h-28 overflow-y-auto mt-1 border rounded-lg divide-y bg-gray-50">
                      {customers
                        .filter(c => c.name.toLowerCase().includes(custSearchQuery.toLowerCase()) || (c.documentId && c.documentId.includes(custSearchQuery)))
                        .map(c => (
                          <div
                            key={c.id}
                            onClick={() => {
                              const isDef = currentTab.name.startsWith('Cuenta');
                              updateActiveTab({
                                customer: {
                                  name: c.name,
                                  doc: c.documentId || '222222222222',
                                  email: c.email || '',
                                  phone: c.phone || '',
                                  isElectronicInvoice: true,
                                },
                                ...(isDef ? { name: c.name.split(' ')[0] } : {})
                              });
                              setCustSearchQuery('');
                              setShowCustomerModal(false);
                            }}
                            className="p-2 hover:bg-brand-card cursor-pointer"
                          >
                            <p className="font-bold text-brand-primary">{c.name}</p>
                            <p className="text-[10px] text-brand-muted">{c.documentId} — {c.email || c.phone}</p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-semibold text-brand-muted">Nombre o Razón Social</label>
                  <input
                    type="text"
                    value={customer.name}
                    onChange={(e) => updateActiveTab({ customer: { ...customer, name: e.target.value } })}
                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-brand-muted">Cédula / NIT</label>
                    <input
                      type="text"
                      value={customer.doc}
                      onChange={(e) => updateActiveTab({ customer: { ...customer, doc: e.target.value } })}
                      className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-brand-muted">Celular</label>
                    <input
                      type="text"
                      value={customer.phone}
                      onChange={(e) => updateActiveTab({ customer: { ...customer, phone: e.target.value } })}
                      className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-brand-muted">Correo Electrónico (para Factura Electrónica)</label>
                  <input
                    type="email"
                    value={customer.email}
                    onChange={(e) => updateActiveTab({ customer: { ...customer, email: e.target.value } })}
                    placeholder="cliente@ejemplo.com"
                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="fe-check"
                    checked={customer.isElectronicInvoice}
                    onChange={(e) => updateActiveTab({ customer: { ...customer, isElectronicInvoice: e.target.checked } })}
                    className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                  />
                  <label htmlFor="fe-check" className="font-semibold text-brand-primary">
                    Requiere Factura Electrónica formal
                  </label>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-brand-primary text-brand-bg font-semibold text-sm hover:bg-brand-dark"
                >
                  Guardar Datos
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Quick Rename Tab / Precuenta Modal */}
      <AnimatePresence>
        {renameModalTab && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-brand-primary/10 space-y-4 font-sans"
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="flex items-center gap-2">
                  <Pencil size={16} className="text-brand-primary" />
                  <h3 className="font-bold text-base text-brand-primary">
                    Nombre de la Cuenta
                  </h3>
                </div>
                <button
                  onClick={() => setRenameModalTab(null)}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-brand-muted block mb-1">
                    Escribe un nombre personalizado:
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={customRenameValue}
                    onChange={(e) => setCustomRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyTabName(customRenameValue);
                      if (e.key === "Escape") setRenameModalTab(null);
                    }}
                    placeholder="Ej. Mesa 3, Stiven, Llevar..."
                    className="w-full p-2.5 rounded-xl border border-brand-primary/20 text-sm font-bold text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-brand-muted block mb-1.5">
                    O selecciona un acceso rápido:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {PRESET_TAB_NAMES.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleApplyTabName(preset)}
                        className="p-2 rounded-xl bg-brand-card hover:bg-brand-primary hover:text-brand-bg text-brand-primary text-xs font-bold border border-brand-accent/40 transition-all text-center truncate shadow-sm"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => setRenameModalTab(null)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleApplyTabName(customRenameValue)}
                  className="flex-1 py-2 rounded-xl bg-brand-primary text-brand-bg text-xs font-bold hover:bg-brand-dark shadow-sm"
                >
                  Guardar Nombre
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Affogato Flavor Selection Modal */}
      <AnimatePresence>
        {affogatoModalProd && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-brand-primary/10 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-brand-card border border-brand-accent/50 flex items-center justify-center text-xl">
                    ☕
                  </div>
                  <div>
                    <h3 className="font-sans font-bold text-lg text-brand-primary">
                      {affogatoModalProd.name} ({formatPrice(affogatoModalProd.price)})
                    </h3>
                    <p className="text-xs text-brand-muted">
                      Selecciona el sabor de gelato para preparar el Affogato con espresso caliente:
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAffogatoModalProd(null)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
                {gelatoFlavors.filter(f => f.available).map((flavor) => (
                  <button
                    key={flavor.id}
                    onClick={() => {
                      addItemToCart({
                        productId: affogatoModalProd.id,
                        name: `${affogatoModalProd.name} — ${flavor.name}`,
                        size: 'Affogato Clásico',
                        flavors: flavor.name,
                        quantity: 1,
                        price: affogatoModalProd.price || 21000,
                        notes: '',
                      });
                      toast.success(`Agregado: ${affogatoModalProd.name} (${flavor.name})`);
                      setAffogatoModalProd(null);
                    }}
                    className="p-3 rounded-2xl border border-gray-200 hover:border-brand-primary hover:shadow-md transition-all flex flex-col items-center justify-between text-center gap-1.5 active:scale-95 shadow-xs cursor-pointer"
                    style={{ backgroundColor: flavor.color_bg || BRAND.card }}
                  >
                    <div className="w-12 h-12 flex items-center justify-center">
                      {flavor.image ? (
                        <img src={flavor.image} alt={flavor.name} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-2xl">🍨</span>
                      )}
                    </div>
                    <span className="font-sans font-bold text-xs text-brand-dark leading-tight">
                      {flavor.name}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Post-Payment Print Modal */}
      <PrintModal
        isOpen={!!lastOrder}
        onClose={() => setLastOrder(null)}
        order={lastOrder}
      />
    </div>
  );
};

export default POSPage;