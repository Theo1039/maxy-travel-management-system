const { createClient } = require('@supabase/supabase-js');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let adminClient;
function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return adminClient;
}

function getPublicClient() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
module.exports = { getAdminClient, getPublicClient };
