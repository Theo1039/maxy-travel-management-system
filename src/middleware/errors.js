function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}
function apiErrorHandler(err, req, res, _next) {
  console.error({ message: err.message, path: req.originalUrl, method: req.method, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
  if (res.headersSent) return;
  const status = Number(err.status) || (err.name === 'MulterError' ? 400 : (err.message && err.message.includes('Only JPG, PNG') ? 400 : 500));
  res.status(status).json({ error: status >= 500 && process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : err.message || 'Internal server error.' });
}
module.exports = { notFound, apiErrorHandler };
