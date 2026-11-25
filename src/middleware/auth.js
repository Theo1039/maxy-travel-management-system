const { getAdminClient } = require('../config/supabase');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
    const supabase = getAdminClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Your session is invalid or has expired. Please log in again.' });
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single();
    if (profileError || !profile) return res.status(403).json({ error: 'Your user profile could not be found.' });
    req.user = { id: user.id, email: user.email, fullName: profile.full_name, role: profile.role };
    next();
  } catch (error) { next(error); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    next();
  };
}
module.exports = { authenticate, requireRole };
