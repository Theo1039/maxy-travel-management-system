const router = require('express').Router();
const multer = require('multer');
const { getAdminClient } = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const { text } = require('../utils/validation');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  cb(allowed.includes(file.mimetype) ? null : new Error('Only JPG, PNG and WebP images are allowed.'), allowed.includes(file.mimetype));
} });
function fail(error) { if (error) throw Object.assign(new Error(error.message), { status: 400 }); }
function verifyImage(file) {
  if (!file) return;
  const b = file.buffer;
  const png = b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp = b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !jpg && !webp) throw Object.assign(new Error('The uploaded file is not a valid JPG, PNG or WebP image.'), { status: 400 });
}

// Public catalogue; search is performed by destination.
router.get('/', async (req, res, next) => {
  try {
    const db = getAdminClient();
    let query = db.from('packages').select('id,destination,description,price_per_person,duration_days,image_url').eq('is_active', true).order('created_at', { ascending: false });
    const search = String(req.query.search || '').trim().slice(0, 100);
    if (search) query = query.ilike('destination', `%${search.replace(/[,%()]/g, '')}%`);
    const { data, error } = await query;
    fail(error); res.json({ packages: data || [] });
  } catch (e) { next(e); }
});
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await getAdminClient().from('packages').select('id,destination,description,price_per_person,duration_days,image_url').eq('id', req.params.id).eq('is_active', true).single();
    if (error || !data) return res.status(404).json({ error: 'Package not found.' });
    res.json({ package: data });
  } catch (e) { next(e); }
});
router.post('/', authenticate, requireRole('admin'), upload.single('image'), async (req, res, next) => {
  try {
    verifyImage(req.file);
    const destination = text(req.body.destination, 'Destination', 100);
    const description = text(req.body.description, 'Description', 2000);
    const price = Number(req.body.price_per_person);
    const days = Number(req.body.duration_days);
    if (!Number.isFinite(price) || price <= 0 || price > 1000000000) return res.status(400).json({ error: 'Price per person must be a positive amount.' });
    if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'Duration must be between 1 and 365 days.' });
    if (!req.file) return res.status(400).json({ error: 'A package image is required.' });
    const db = getAdminClient();
    const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
    const filePath = `${Date.now()}-${require('node:crypto').randomUUID()}.${ext}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'package-images';
    const { error: uploadError } = await db.storage.from(bucket).upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    fail(uploadError);
    const { data: publicData } = db.storage.from(bucket).getPublicUrl(filePath);
    const { data, error } = await db.from('packages').insert({ destination, description, price_per_person: price, duration_days: days, image_url: publicData.publicUrl, image_path: filePath }).select().single();
    if (error) { await db.storage.from(bucket).remove([filePath]); fail(error); }
    res.status(201).json({ package: data });
  } catch (e) { next(e); }
});
router.put('/:id', authenticate, requireRole('admin'), upload.single('image'), async (req, res, next) => {
  try {
    verifyImage(req.file);
    const db = getAdminClient();
    const updates = {};
    if (req.body.destination !== undefined) updates.destination = text(req.body.destination, 'Destination', 100);
    if (req.body.description !== undefined) updates.description = text(req.body.description, 'Description', 2000);
    if (req.body.price_per_person !== undefined) {
      const price = Number(req.body.price_per_person);
      if (!Number.isFinite(price) || price <= 0 || price > 1000000000) return res.status(400).json({ error: 'Price per person must be a positive amount.' });
      updates.price_per_person = price;
    }
    if (req.body.duration_days !== undefined) {
      const days = Number(req.body.duration_days);
      if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'Duration must be between 1 and 365 days.' });
      updates.duration_days = days;
    }
    if (req.file) {
      const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
      const filePath = `${Date.now()}-${require('node:crypto').randomUUID()}.${ext}`;
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'package-images';
      const { error: uploadError } = await db.storage.from(bucket).upload(filePath, req.file.buffer, { contentType: req.file.mimetype });
      fail(uploadError);
      updates.image_path = filePath;
      updates.image_url = db.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Provide at least one field to update.' });
    const { data, error } = await db.from('packages').update(updates).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Package not found or could not be updated.' });
    res.json({ package: data });
  } catch (e) { next(e); }
});
router.delete('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    // Archive rather than physically delete so historical bookings remain readable.
    const { data, error } = await getAdminClient().from('packages').update({ is_active: false }).eq('id', req.params.id).select('id').single();
    if (error || !data) return res.status(404).json({ error: 'Package not found.' });
    res.json({ message: 'Package removed from the catalogue.' });
  } catch (e) { next(e); }
});
module.exports = router;
