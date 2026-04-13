// routes/members.js
const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');

// Guard — returns false and sends 503 if Supabase not configured
function db(res) {
  if (!supabase) {
    res.status(503).json({
      success: false,
      error: 'Database not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Railway → Variables.'
    });
    return false;
  }
  return true;
}

// ── Field mappers ─────────────────────────────────────────────
function toDb(b) {
  return {
    first_name:      b.firstName     || null,
    middle_name:     b.middleName    || null,
    last_name:       b.lastName      || null,
    date_of_birth:   b.dob           || null,
    gender:          b.gender        || null,
    marital_status:  b.marital       || null,
    phone:           b.phone         || null,
    email:           b.email         || null,
    location:        b.location      || null,
    district:        b.district      || null,
    congregation:    b.congregation  || null,
    session_name:    b.session       || null,
    church_role:     b.role          || null,
    date_joined:     b.dateJoined    || null,
    member_type:     b.memberType    || null,
    family_unit:     b.familyUnit    || null,
    family_role:     b.familyRole    || null,
    group_primary:   b.group1        || null,
    group_secondary: b.group2        || null,
    group_other:     b.group3        || null,
    notes:           b.notes         || null,
  };
}

function fromDb(r) {
  return {
    id:           r.id,
    firstName:    r.first_name,
    middleName:   r.middle_name,
    lastName:     r.last_name,
    dob:          r.date_of_birth,
    gender:       r.gender,
    marital:      r.marital_status,
    phone:        r.phone,
    email:        r.email,
    location:     r.location,
    district:     r.district,
    congregation: r.congregation,
    session:      r.session_name,
    role:         r.church_role,
    dateJoined:   r.date_joined,
    memberType:   r.member_type,
    familyUnit:   r.family_unit,
    familyRole:   r.family_role,
    group1:       r.group_primary,
    group2:       r.group_secondary,
    group3:       r.group_other,
    notes:        r.notes,
    isActive:     r.is_active,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
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

// ── GET /api/members ──────────────────────────────────────────
router.get('/', async (req, res) => {
  if (!db(res)) return;
  try {
    const { search, district, role, limit = 500, offset = 0 } = req.query;
    let q = supabase
      .from('members').select('*')
      .eq('is_active', true)
      .order('last_name')
      .range(+offset, +offset + +limit - 1);
    if (district) q = q.eq('district', district);
    if (role)     q = q.eq('church_role', role);
    if (search)   q = q.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,` +
      `congregation.ilike.%${search}%,district.ilike.%${search}%`
    );
    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data: data.map(fromDb), count: data.length });
  } catch (err) {
    console.error('GET /members:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/members/stats ────────────────────────────────────
router.get('/stats', async (req, res) => {
  if (!db(res)) return;
  try {
    const [total, families, districts, groups] = await Promise.all([
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('members').select('family_unit').eq('is_active', true)
        .not('family_unit', 'is', null).neq('family_unit', ''),
      supabase.from('district_summary').select('*'),
      supabase.from('group_summary').select('*'),
    ]);
    const uniqueFamilies = new Set((families.data || []).map(r => r.family_unit));
    res.json({
      success: true,
      stats: {
        totalMembers:   total.count || 0,
        totalFamilies:  uniqueFamilies.size,
        totalDistricts: (districts.data || []).length,
        totalGroups:    (groups.data || []).length,
        districts:      districts.data || [],
        groups:         groups.data || [],
      }
    });
  } catch (err) {
    console.error('GET /stats:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/members/families ─────────────────────────────────
router.get('/families', async (req, res) => {
  if (!db(res)) return;
  try {
    const { data, error } = await supabase.from('family_summary').select('*');
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/members/groups ───────────────────────────────────
router.get('/groups', async (req, res) => {
  if (!db(res)) return;
  try {
    const { data: gd, error: ge } = await supabase.from('group_summary').select('*');
    if (ge) throw ge;
    const groups = await Promise.all((gd || []).map(async g => {
      const { data: mems } = await supabase
        .from('members')
        .select('id, first_name, last_name, district')
        .eq('is_active', true)
        .or(`group_primary.eq.${g.group_name},group_secondary.eq.${g.group_name},group_other.eq.${g.group_name}`);
      return { name: g.group_name, count: g.member_count, members: mems || [] };
    }));
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/members/:id ──────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (!db(res)) return;
  try {
    const { data, error } = await supabase
      .from('members').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ success: false, error: 'Member not found' });
    res.json({ success: true, data: fromDb(data) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/members ─────────────────────────────────────────
router.post('/', async (req, res) => {
  if (!db(res)) return;
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors });
  try {
    const { data, error } = await supabase
      .from('members').insert(toDb(req.body)).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data: fromDb(data), message: 'Member registered successfully' });
  } catch (err) {
    console.error('POST /members:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/members/:id ──────────────────────────────────────
router.put('/:id', async (req, res) => {
  if (!db(res)) return;
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors });
  try {
    const { data, error } = await supabase
      .from('members').update(toDb(req.body)).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data: fromDb(data), message: 'Member updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/members/:id (soft delete) ────────────────────
router.delete('/:id', async (req, res) => {
  if (!db(res)) return;
  try {
    const { error } = await supabase
      .from('members').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true, message: 'Member removed from registry' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

