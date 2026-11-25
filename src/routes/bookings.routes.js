const router = require('express').Router();
const { getAdminClient } = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const { positiveInteger, dateOnly, email } = require('../utils/validation');
const columns = 'id,traveller_id,package_id,travel_date,passenger_count,contact_email,total_price,status,created_at,packages(destination,image_url,price_per_person,duration_days)';
function fail(error) { if (error) throw Object.assign(new Error(error.message), { status: 400 }); }
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const db = getAdminClient();
    let query = db.from('bookings').select(columns).order('created_at', { ascending: false });
    if (req.user.role !== 'admin') query = query.eq('traveller_id', req.user.id);
    const { data, error } = await query; fail(error); res.json({ bookings: data || [] });
  } catch (e) { next(e); }
});
router.post('/', requireRole('traveller', 'admin'), async (req, res, next) => {
  try {
    const packageId = req.body.package_id;
    if (!packageId || typeof packageId !== 'string') return res.status(400).json({ error: 'Select a travel package.' });
    const travelDate = dateOnly(req.body.travel_date);
    const passengerCount = positiveInteger(req.body.passenger_count, 'Passenger count', 20);
    const contactEmail = email(req.body.contact_email);
    const db = getAdminClient();
    const { data: pack, error: packageError } = await db.from('packages').select('id,price_per_person,is_active').eq('id', packageId).single();
    if (packageError || !pack || !pack.is_active) return res.status(404).json({ error: 'The selected package is unavailable.' });
    const totalPrice = Number((Number(pack.price_per_person) * passengerCount).toFixed(2));
    const { data, error } = await db.from('bookings').insert({ traveller_id: req.user.id, package_id: packageId, travel_date: travelDate, passenger_count: passengerCount, contact_email: contactEmail, total_price: totalPrice, status: 'pending' }).select(columns).single();
    fail(error); res.status(201).json({ booking: data });
  } catch (e) { next(e); }
});
router.put('/:id', requireRole('traveller', 'admin'), async (req, res, next) => {
  try {
    const db = getAdminClient();
    const { data: existing, error: findError } = await db.from('bookings').select('id,traveller_id,package_id,status').eq('id', req.params.id).single();
    if (findError || !existing) return res.status(404).json({ error: 'Booking not found.' });
    if (req.user.role !== 'admin' && existing.traveller_id !== req.user.id) return res.status(403).json({ error: 'You can only edit your own bookings.' });
    if (req.user.role !== 'admin' && existing.status !== 'pending') return res.status(409).json({ error: 'Only pending bookings can be edited.' });
    const updates = {};
    if (req.body.travel_date !== undefined) updates.travel_date = dateOnly(req.body.travel_date);
    if (req.body.passenger_count !== undefined) updates.passenger_count = positiveInteger(req.body.passenger_count, 'Passenger count', 20);
    if (req.body.contact_email !== undefined) updates.contact_email = email(req.body.contact_email);
    if (req.user.role === 'admin' && req.body.status !== undefined) {
      if (!['pending', 'confirmed', 'cancelled'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid booking status.' });
      updates.status = req.body.status;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Provide at least one field to update.' });
    if (updates.passenger_count !== undefined) {
      const { data: pack, error } = await db.from('packages').select('price_per_person').eq('id', existing.package_id).single();
      fail(error); updates.total_price = Number((Number(pack.price_per_person) * updates.passenger_count).toFixed(2));
    }
    const { data, error } = await db.from('bookings').update(updates).eq('id', req.params.id).select(columns).single();
    fail(error); res.json({ booking: data });
  } catch (e) { next(e); }
});
router.patch('/:id/cancel', requireRole('traveller', 'admin'), async (req, res, next) => {
  try {
    const db = getAdminClient();
    let query = db.from('bookings').update({ status: 'cancelled' }).eq('id', req.params.id);
    if (req.user.role !== 'admin') query = query.eq('traveller_id', req.user.id).eq('status', 'pending');
    const { data, error } = await query.select('id,status').single();
    if (error || !data) return res.status(404).json({ error: 'Booking not found, or it cannot be cancelled.' });
    res.json({ booking: data, message: 'Booking cancelled.' });
  } catch (e) { next(e); }
});
router.delete('/:id', requireRole('traveller', 'admin'), async (req, res, next) => {
  try {
    const db = getAdminClient();
    let query = db.from('bookings').delete().eq('id', req.params.id);
    if (req.user.role !== 'admin') query = query.eq('traveller_id', req.user.id);
    const { data, error } = await query.select('id').single();
    if (error || !data) return res.status(404).json({ error: 'Booking not found.' });
    res.json({ message: 'Booking deleted.' });
  } catch (e) { next(e); }
});
module.exports = router;
