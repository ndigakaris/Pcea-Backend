// server.js — PCEA Church Registry API
// PORT pattern confirmed working on Railway (v3 diagnostic)
require('dotenv').config();

// ── Log immediately so Railway runtime shows activity ─────────
console.log('=== PCEA Registry API Starting ===');
console.log('Node:', process.version);
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ set' : '✗ NOT SET');
console.log('SUPABASE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ set' : '✗ NOT SET');

const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const app  = express();

// Use PORT exactly as Railway provides it — confirmed working
const PORT = process.env.PORT;
if (!PORT) {
  console.error('FATAL: PORT env var not provided by Railway');
  process.exit(1);
}

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
].filter(Boolean);

app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests.' },
}));

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check — registered first, no DB dependency ─────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    port: PORT,
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    supabase: process.env.SUPABASE_URL ? 'configured' : 'missing',
  });
});

app.get('/', (_req, res) => {
  res.status(200).json({ message: 'PCEA Church Registry API', version: '1.0.0' });
});

// ── Members routes ────────────────────────────────────────────
app.use('/api/members', require('./routes/members'));

// ── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start — same pattern as confirmed working v3 ──────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✝  PCEA Registry API LIVE on port ${PORT}\n`);
});

server.on('error', (err) => {
  console.error('Server bind error:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM — shutting down');
  server.close(() => process.exit(0));
});
