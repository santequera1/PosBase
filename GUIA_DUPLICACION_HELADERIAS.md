# 🍦 Guía de Duplicación y Marca Blanca para Nuevas Heladerías

Esta guía contiene los pasos exactos para tomar este sistema POS, personalizarlo con la identidad de **otra heladería o gelatería** y tenerlo listo para demostración o puesta en marcha en menos de 15 minutos.

---

## 📋 Checklist Rápido de Duplicación

- [ ] **Paso 1:** Crear una copia limpia de la carpeta del proyecto.
- [ ] **Paso 2:** Personalizar datos de negocio (Nombre, NIT, Ciudad, Dirección, Teléfono).
- [ ] **Paso 3:** Adaptar paleta de colores y logotipo.
- [ ] **Paso 4:** Configurar presentaciones, tamaños y sabores del cliente.
- [ ] **Paso 5:** Reiniciar la base de datos para borrar ventas y comprobantes de prueba.
- [ ] **Paso 6:** Probar en local y subir a su propio repositorio Git.

---

## 🛠️ Paso a Paso Detallado

### 1. Clonar o copiar a una nueva carpeta de trabajo
Copia la carpeta del proyecto a una nueva ubicación para no mezclar clientes:
```powershell
# En Windows PowerShell (parte de la BASE de marca blanca; excluye node_modules, .git, la base de datos y el documento privado):
robocopy "C:\Users\STIVEN ANTEQUERA\Desktop\Antigravity\POS-base" "C:\Users\STIVEN ANTEQUERA\Desktop\POS_NUEVA_HELADERIA" /E /XD node_modules dist .git /XF data.db data.db-shm data.db-wal documentacionyclaves.md
cd "C:\Users\STIVEN ANTEQUERA\Desktop\POS_NUEVA_HELADERIA"
npm install
cd server; npm install; cd ..

# Crear las claves del backend a partir de la plantilla y cambiar JWT_SECRET y WHATSAPP_AI_API_KEY:
Copy-Item server\.env.example server\.env
```

---

### 2. Datos del Negocio (Ticket y Encabezados)
Los datos que se imprimen en los recibos térmicos y en el encabezado (nombre, eslogan, dirección, teléfono, NIT y prefijo de comprobante) se editan dentro de la app en **Ajustes → Negocio**, sin tocar código. Los valores iniciales de la semilla están en:
* **Archivo:** `server/src/db.js` (Líneas ~468 - 477 en `seedIfEmpty`):
```javascript
insertSetting.run('businessName', 'Mi Gelato Artesanal');
insertSetting.run('businessSlogan', 'El auténtico sabor tradicional');
insertSetting.run('businessAddress', 'Carrera 15 #85-30, Bogotá');
insertSetting.run('businessPhone', '+57 310 123 4567');
insertSetting.run('businessNit', '901.555.777-8');
insertSetting.run('invoicePrefix', 'GEL-POS');
```
> **Nota:** El administrador también puede cambiar estos campos en cualquier momento sin tocar código, ingresando a la sección **Ajustes** en la aplicación web.

---

### 3. Paletas de Colores Listas para Usar

Edita `tailwind.config.ts` en la sección `theme.extend.colors.gia`:

#### Opción A: Heladería Tropical / Frutal (Tonos Corozo, Mango, Mandarina)
```typescript
gia: {
  crema: "#FFF8F0",
  azul: "#E0533C",        // Rojo / Coral vibrante
  "azul-boton": "#C8432D",
  "azul-oscuro": "#381E19",
  oliva: "#F59E0B",       // Acento amarillo mango
  tarjeta: "#FFF3E6",
  pildora: "#FDE68A",
}
```

#### Opción B: Gelatería Moderna / Minimalista (Tonos Pistacho & Menta)
```typescript
gia: {
  crema: "#F8FAFC",
  azul: "#0F766E",        // Verde esmeralda profundo
  "azul-boton": "#115E59",
  "azul-oscuro": "#134E4A",
  oliva: "#14B8A6",       // Menta fresca
  tarjeta: "#F0FDFA",
  pildora: "#CCFBF1",
}
```

#### Opción C: Heladería Clásica Italiana (Vainilla, Crema y Chocolate)
```typescript
gia: {
  crema: "#FDFBF7",
  azul: "#4A2810",        // Café chocolate oscuro
  "azul-boton": "#381E0B",
  "azul-oscuro": "#231205",
  oliva: "#D97706",       // Caramelo dorado
  tarjeta: "#F7F2EA",
  pildora: "#FDE68A",
}
```

#### Logotipo
Sustituye los tres SVG de ejemplo por los del cliente (pueden ser PNG, ajustando la ruta en el código):
- `public/logo/logo-dark.svg` → barra lateral y header (`src/components/AppLayout.tsx`).
- `public/logo/logo-login.svg` → pantalla de acceso (`src/pages/LoginPage.tsx`).
- `public/logo.svg` → favicon (`index.html`).

---

### 4. Personalizar Sabores y Precios

En `server/src/db.js` busca el array `prods`:
```javascript
const prods = [
  // [id, 'Nombre', categoría, precio_base, 'ruta_imagen', 'descripción', tamaños_json, color_fondo, color_acento, destacado]
  [1, 'Pistacho Puro',     1, 14000, '/images/gelatos/pistacho.webp', 'Pistacho importado', gelatoSizes, '#E7EAD9', '#7C8455', 1],
  [2, 'Frutos Rojos',      2, 14000, '/images/gelatos/frutos.webp',   'Mora, fresa y agraz', gelatoSizes, '#F7D9DE', '#B03A5B', 1],
  [3, 'Café Moca',         3, 14000, '/images/gelatos/cafe.webp',     'Café y cacao suave',  gelatoSizes, '#EFE0D1', '#8B5E3C', 0],
];
```

Y define los tamaños y precios de la nueva heladería:
```javascript
const gelatoSizes = JSON.stringify([
  { name: 'Vaso Pequeño (1 sabor)', price: 14000 },
  { name: 'Vaso Mediano (2 sabores)', price: 19000 },
  { name: 'Litro Familiar (hasta 3 sabores)', price: 65000 },
]);
```

---

### 5. Reiniciar la Base de Datos a Cero

Para que la demostración comience limpia sin clientes ni ventas de prueba:
```powershell
# En la carpeta server:
cd server
Remove-Item data.db, data.db-shm, data.db-wal -ErrorAction SilentlyContinue
npm run start
```
Al iniciarse, el servidor ejecutará `seedIfEmpty()`, creando la base de datos limpia con tus nuevos datos de marca y productos.

---

### 6. Subir al Repositorio de la Nueva Heladería

```powershell
# Desde la raíz del nuevo proyecto:
git init
git add .
git commit -m "feat: configuracion inicial para nueva heladeria"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/NOMBRE_NUEVO_REPO.git
git push -u origin main
```
