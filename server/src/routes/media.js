const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');

const PUBLIC_DIR = path.resolve(__dirname, '../../../public');
const DIST_DIR = path.resolve(__dirname, '../../../dist');

// Helper to format human-readable title from filename
function formatTitle(filename) {
  const base = path.basename(filename, path.extname(filename));
  return base
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// GET /api/media - List all available gallery images
router.get('/', (req, res) => {
  try {
    const mediaList = [];
    const scanFolders = [
      { dir: 'images/gelatos/vaso4oz', group: 'Vasos 4 oz (Café clarito)' },
      { dir: 'images/gelatos/conos', group: 'Conos Waffle' },
      { dir: 'images/gelatos/litro', group: 'Envases 1 Litro (Abiertos)' },
      { dir: 'images/gelatos', group: 'Vasos 6 oz (Tarrina azul)', recursive: false },
      { dir: 'images/products', group: 'Bebidas & Toppings', recursive: false },
      { dir: 'images/uploads', group: 'Mis Fotos Subidas' },
    ];

    scanFolders.forEach(({ dir, group, recursive }) => {
      const fullDir = path.join(PUBLIC_DIR, dir);
      if (fs.existsSync(fullDir)) {
        const files = fs.readdirSync(fullDir, { withFileTypes: true });
        files.forEach(f => {
          if (f.isFile() && /\.(png|webp|jpg|jpeg|svg)$/i.test(f.name)) {
            const relUrl = `/${dir}/${f.name}`.replace(/\\/g, '/');
            mediaList.push({
              id: `${dir}_${f.name}`.replace(/[\/\\]/g, '_'),
              name: formatTitle(f.name),
              filename: f.name,
              url: relUrl,
              group: group,
            });
          }
        });
      }
    });

    res.json({ success: true, count: mediaList.length, media: mediaList });
  } catch (error) {
    console.error('Error scanning media:', error);
    res.status(500).json({ error: 'Error al escanear la galería de medios' });
  }
});

// POST /api/media/upload - Upload a custom image (Base64 data URL)
router.post('/upload', (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!data || !filename) {
      return res.status(400).json({ error: 'Se requiere el nombre de archivo y datos de la imagen' });
    }

    // Match base64 data
    const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Formato de imagen inválido (debe ser base64)' });
    }

    const ext = path.extname(filename) || '.png';
    const cleanBaseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const newFilename = `${Date.now()}_${cleanBaseName}${ext}`;

    const uploadsPublicDir = path.join(PUBLIC_DIR, 'images', 'uploads');
    if (!fs.existsSync(uploadsPublicDir)) {
      fs.mkdirSync(uploadsPublicDir, { recursive: true });
    }

    const buffer = Buffer.from(matches[2], 'base64');
    const publicFilePath = path.join(uploadsPublicDir, newFilename);
    fs.writeFileSync(publicFilePath, buffer);

    // Also copy to dist if dist exists (so it's immediately served by production nginx without rebuilding)
    const uploadsDistDir = path.join(DIST_DIR, 'images', 'uploads');
    if (fs.existsSync(DIST_DIR)) {
      if (!fs.existsSync(uploadsDistDir)) {
        fs.mkdirSync(uploadsDistDir, { recursive: true });
      }
      fs.copyFileSync(publicFilePath, path.join(uploadsDistDir, newFilename));
    }

    const fileUrl = `/images/uploads/${newFilename}`;
    res.json({
      success: true,
      url: fileUrl,
      filename: newFilename,
      name: formatTitle(newFilename),
      group: 'Mis Fotos Subidas',
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Error al guardar la imagen' });
  }
});

// PATCH /api/media/product-image - Update product image directly
router.patch('/product-image', (req, res) => {
  try {
    const { productId, imageUrl } = req.body;
    if (!productId || !imageUrl) {
      return res.status(400).json({ error: 'productId e imageUrl son requeridos' });
    }

    const db = getDb();
    const info = db.prepare("UPDATE products SET image = ? WHERE id = ?").run(imageUrl, productId);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const updated = db.prepare("SELECT id, name, category_id AS categoryId, price, available, image, description, sizes, color_bg, color_accent FROM products WHERE id = ?").get(productId);
    if (updated) {
      updated.available = !!updated.available;
      updated.sizes = updated.sizes ? JSON.parse(updated.sizes) : null;
    }

    // Notify all connected clients via Socket.IO
    if (req.app.io) {
      req.app.io.emit('product:updated', updated);
    }

    res.json({ success: true, product: updated });
  } catch (error) {
    console.error('Error updating product image:', error);
    res.status(500).json({ error: 'Error al actualizar la foto del producto' });
  }
});

module.exports = router;
