// Carga server/.env (PORT, JWT_SECRET, WHATSAPP_AI_API_KEY, NODE_ENV) sin dependencias externas.
// Las variables ya definidas en el entorno (p. ej. por PM2) tienen prioridad.
(() => {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
})();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { getDb } = require('./db');
const { authMiddleware } = require('./auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
});

// Make io accessible in routes
app.io = io;

// Middleware
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));

// Initialize database
getDb();

// Public routes
app.use('/api/auth', require('./routes/auth'));

// Protected routes
app.use('/api/categories', authMiddleware, require('./routes/categories'));
app.use('/api/products', authMiddleware, require('./routes/products'));
app.use('/api/media', authMiddleware, require('./routes/media'));
app.use('/api/customers', authMiddleware, require('./routes/customers'));
app.use('/api/orders', authMiddleware, require('./routes/orders'));
app.use('/api/reports', authMiddleware, require('./routes/reports'));
app.use('/api/shifts', authMiddleware, require('./routes/shifts'));
app.use('/api/settings', authMiddleware, require('./routes/settings'));
app.use('/api/drivers', authMiddleware, require('./routes/drivers'));

// WhatsApp AI Integration (API Key authenticated)
app.use('/api/whatsapp-ai', require('./routes/whatsappAi'));

// Health check
app.get('/api/health', (req, res) => {
  let business = 'POS';
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'businessName'").get();
    if (row && row.value) business = row.value;
  } catch {}
  res.json({ status: 'ok', business });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  socket.on('disconnect', () => console.log('🔌 Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🍦 POS Backend running on http://localhost:${PORT}`);
});
