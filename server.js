// server.js — PCEA Church Registry API (single file, no local requires)
require('dotenv').config();

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
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT;

if (!PORT) {
  console.error('FATAL: PORT not set');
  process.exit(1);
}

// ── Supabase client ───────────────────────────────────────────
const sbUrl = process.env.SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = (sbUrl && sbKey) ? createClient(sbUrl, sbKey, { auth: { persistSession: false } }) : null;
if (!supabase) console.warn('⚠  Supabase not configured — DB calls will return 503');

// ── Middleware ────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5500'].filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || process.env.NODE_ENV !== 'production') return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked'));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));

app.use(rateLimit({ windowMs: 15*60*1000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── DB guard ──────────────────────────────────────────────────
function dbGuard(res) {
  if (!supabase) {
    res.status(503).json({ success: false, error: 'DB not configured. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Railway Variables.' });
    return false;
  }
  return true;
}

// ── Mappers ───────────────────────────────────────────────────
function toDb(b) {
  return {
    first_name: b.firstName||null, middle_name: b.middleName||null,
    last_name: b.lastName||null, date_of_birth: b.dob||null,
    gender: b.gender||null, marital_status: b.marital||null,
    phone: b.phone||null, email: b.email||null, location: b.location||null,
    district: b.district||null, congregation: b.congregation||null,
    session_name: b.session||null, church_role: b.role||null,
    date_joined: b.dateJoined||null, member_type: b.memberType||null,
    family_unit: b.familyUnit||null, family_role: b.familyRole||null,
    group_primary: b.group1||null, group_secondary: b.group2||null,
    group_other: b.group3||null, notes: b.notes||null,
  };
}

function fromDb(r) {
  return {
    id: r.id, firstName: r.first_name, middleName: r.middle_name,
    lastName: r.last_name, dob: r.date_of_birth, gender: r.gender,
    marital: r.marital_status, phone: r.phone, email: r.email,
    location: r.location, district: r.district, congregation: r.congregation,
    session: r.session_name, role: r.church_role, dateJoined: r.date_joined,
    memberType: r.member_type, familyUnit: r.family_unit, familyRole: r.family_role,
    group1: r.group_primary, group2: r.group_secondary, group3: r.group_other,
    notes: r.notes, isActive: r.is_active, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function validate(b) {
  const e = [];
  if (!b.firstName?.trim())    e.push('First name is required');
  if (!b.lastName?.trim())     e.push('Last name is required');
  if (!b.district?.trim())     e.push('District is required');
  if (!b.congregation?.trim()) e.push('Congregation is required');
  if (!b.gender)               e.push('Gender is required');
  return e;
}

// ── Routes ────────────────────────────────────────────────────

// Health — always responds, no DB needed
app.get('/health', (_req, res) => res.status(200).json({
  status: 'ok', port: PORT, time: new Date().toISOString(),
  supabase: supabase ? 'configured' : 'missing',
}));

app.get('/', (_req, res) => res.status(200).json({ message: 'PCEA Church Registry API', version: '1.0.0' }));

// GET /api/members
app.get('/api/members', async (req, res) => {
  if (!dbGuard(res)) return;
  try {
    const { search, district, role, limit=500, offset=0 } = req.query;
    let q = supabase.from('members').select('*').eq('is_active',true)
      .order('last_name').range(+offset, +offset + +limit - 1);
    if (district) q = q.eq('district', district);
    if (role)     q = q.eq('church_role', role);
    if (search)   q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,congregation.ilike.%${search}%,district.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data: data.map(fromDb), count: data.length });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/members/stats
app.get('/api/members/stats', async (req, res) => {
  if (!dbGuard(res)) return;
  try {
    const [total, fam, dist, grp] = await Promise.all([
      supabase.from('members').select('id',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('members').select('family_unit').eq('is_active',true).not('family_unit','is',null).neq('family_unit',''),
      supabase.from('district_summary').select('*'),
      supabase.from('group_summary').select('*'),
    ]);
    const families = new Set((fam.data||[]).map(r=>r.family_unit));
    res.json({ success:true, stats:{
      totalMembers: total.count||0, totalFamilies: families.size,
      totalDistricts: (dist.data||[]).length, totalGroups: (grp.data||[]).length,
      districts: dist.data||[], groups: grp.data||[],
    }});
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// GET /api/members/families
app.get('/api/members/families', async (req, res) => {
  if (!dbGuard(res)) return;
  try {
    const { data, error } = await supabase.from('family_summary').select('*');
    if (error) throw error;
    res.json({ success:true, data: data||[] });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// GET /api/members/groups
app.get('/api/members/groups', async (req, res) => {
  if (!dbGuard(res)) return;
  try {
    const { data:gd, error:ge } = await supabase.from('group_summary').select('*');
    if (ge) throw ge;
    const groups = await Promise.all((gd||[]).map(async g => {
      const { data:mems } = await supabase.from('members')
        .select('id,first_name,last_name,district').eq('is_active',true)
        .or(`group_primary.eq.${g.group_name},group_secondary.eq.${g.group_name},group_other.eq.${g.group_name}`);
      return { name:g.group_name, count:g.member_count, members:mems||[] };
    }));
    res.json({ success:true, data:groups });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// GET /api/members/:id
app.get('/api/members/:id', async (req, res) => {
  if (!dbGuard(res)) return;
  try {
    const { data, error } = await supabase.from('members').select('*').eq('id',req.params.id).single();
    if (error) return res.status(404).json({ success:false, error:'Member not found' });
    res.json({ success:true, data:fromDb(data) });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// POST /api/members
app.post('/api/members', async (req, res) => {
  if (!dbGuard(res)) return;
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ success:false, errors });
  try {
    const { data, error } = await supabase.from('members').insert(toDb(req.body)).select().single();
    if (error) throw error;
    res.status(201).json({ success:true, data:fromDb(data), message:'Member registered successfully' });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// PUT /api/members/:id
app.put('/api/members/:id', async (req, res) => {
  if (!dbGuard(res)) return;
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ success:false, errors });
  try {
    const { data, error } = await supabase.from('members').update(toDb(req.body)).eq('id',req.params.id).select().single();
    if (error) throw error;
    res.json({ success:true, data:fromDb(data), message:'Member updated' });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// DELETE /api/members/:id
app.delete('/api/members/:id', async (req, res) => {
  if (!dbGuard(res)) return;
  try {
    const { error } = await supabase.from('members').update({is_active:false}).eq('id',req.params.id);
    if (error) throw error;
    res.json({ success:true, message:'Member removed' });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// 404
app.use((_req, res) => res.status(404).json({ success:false, error:'Route not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success:false, error:'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✝  PCEA Registry API LIVE on port ${PORT}\n`);
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
