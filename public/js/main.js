/* Maxy Travel frontend. The Supabase service-role key is NEVER sent to the browser. */
const $ = (selector) => document.querySelector(selector);
const money = (amount) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(amount || 0));
let supabaseClient;
let currentUser = null;
let currentPackage = null;
let packagesCache = [];
let editingBookingModal;
let authMode = 'login';

function showMessage(selector, message, type = 'danger') {
  const el = $(selector); if (!el) return;
  el.className = `alert alert-${type}`; el.textContent = message; el.classList.remove('d-none');
}
function clearMessage(selector) { const el = $(selector); if (el) { el.classList.add('d-none'); el.textContent = ''; } }
function setBusy(button, busy, busyText = 'Please wait…') {
  if (!button) return;
  if (busy) { button.dataset.originalText = button.textContent; button.disabled = true; button.textContent = busyText; }
  else { button.disabled = false; button.textContent = button.dataset.originalText || button.textContent; }
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (currentUser?.access_token) headers.set('Authorization', `Bearer ${currentUser.access_token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && currentUser) await signOut(false);
    throw new Error(result.error || 'The request could not be completed.');
  }
  return result;
}
function updateNavigation() {
  const signedIn = Boolean(currentUser);
  $('#authNav').hidden = signedIn;
  $('#userNav').hidden = !signedIn;
  $('#itineraryNav').hidden = !signedIn;
  $('#adminNav').hidden = !signedIn || currentUser.profile?.role !== 'admin';
  $('#navUserName').textContent = currentUser?.profile?.fullName || currentUser?.user?.email || '';
}
async function refreshProfile() {
  if (!currentUser?.access_token) return;
  const result = await api('/api/auth/me');
  currentUser.profile = result.user;
  updateNavigation();
}
async function loadPackages(search = '') {
  const grid = $('#packageGrid');
  try {
    const result = await api(`/api/packages${search ? `?search=${encodeURIComponent(search)}` : ''}`);
    packagesCache = result.packages || [];
    if (!packagesCache.length) { grid.innerHTML = '<div class="col-12"><div class="text-center py-5 muted-copy">No packages found. Try another destination.</div></div>'; return; }
    grid.innerHTML = packagesCache.map((item) => `
      <div class="col-md-6 col-lg-4"><article class="package-card">
        <img class="package-image" src="${escapeHtml(item.image_url || 'https://placehold.co/900x600/e7eeeb/29465c?text=Maxy+Travel')}" alt="${escapeHtml(item.destination)}" loading="lazy">
        <div class="package-card-body"><h3>${escapeHtml(item.destination)}</h3><p class="muted-copy mb-2">${escapeHtml(item.description || '')}</p>
        <div class="package-meta"><span>◷ ${Number(item.duration_days)} days</span><span>Per traveller</span></div>
        <div class="d-flex justify-content-between align-items-center"><span class="package-price">${money(item.price_per_person)}</span><button class="btn btn-brand btn-sm book-package" data-id="${escapeHtml(item.id)}">Book trip</button></div></div></article></div>`).join('');
    document.querySelectorAll('.book-package').forEach((button) => button.addEventListener('click', () => startBooking(button.dataset.id)));
  } catch (error) { grid.innerHTML = `<div class="col-12"><div class="alert alert-danger">${escapeHtml(error.message)}</div></div>`; }
}
function startBooking(packageId) {
  if (!currentUser) { showMessage('#authMessage', 'Please sign in or create an account before booking.'); location.hash = 'login'; return; }
  currentPackage = packagesCache.find((item) => item.id === packageId);
  if (!currentPackage) return;
  $('#bookingPackageId').value = currentPackage.id;
  $('#bookingDestination').value = currentPackage.destination;
  $('#bookingPackageSummary').textContent = `${currentPackage.duration_days} days · ${money(currentPackage.price_per_person)} per person`;
  $('#travelDate').min = new Date().toISOString().slice(0, 10);
  $('#passengerCount').value = 1;
  $('#contactEmail').value = currentUser.user?.email || '';
  updateBookingTotal(); clearMessage('#bookingMessage'); location.hash = 'booking';
}
function updateBookingTotal() {
  const count = Math.max(1, Number($('#passengerCount')?.value || 1));
  $('#bookingTotal').textContent = currentPackage ? money(Number(currentPackage.price_per_person) * count) : '—';
}
async function submitBooking(event) {
  event.preventDefault(); clearMessage('#bookingMessage');
  const button = $('#bookingSubmit'); setBusy(button, true, 'Submitting…');
  try {
    await api('/api/bookings', { method: 'POST', body: JSON.stringify({ package_id: $('#bookingPackageId').value, travel_date: $('#travelDate').value, passenger_count: Number($('#passengerCount').value), contact_email: $('#contactEmail').value }) });
    showMessage('#bookingMessage', 'Your booking has been submitted successfully.', 'success');
    $('#bookingForm').reset(); currentPackage = null;
    setTimeout(() => { location.hash = 'itinerary'; loadItinerary(); }, 900);
  } catch (error) { showMessage('#bookingMessage', error.message); }
  finally { setBusy(button, false); }
}
function statusBadge(status) { return `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(status)}</span>`; }
async function loadItinerary() {
  if (!currentUser) return;
  try {
    const { bookings } = await api('/api/bookings');
    const rows = $('#itineraryRows');
    if (!bookings.length) { rows.innerHTML = '<tr><td colspan="6" class="text-center muted-copy py-4">You have not made any bookings yet.</td></tr>'; return; }
    rows.innerHTML = bookings.map((booking) => {
      const pack = Array.isArray(booking.packages) ? booking.packages[0] : booking.packages;
      const canEdit = booking.status === 'pending';
      return `<tr><td><strong>${escapeHtml(pack?.destination || 'Package unavailable')}</strong></td><td>${escapeHtml(booking.travel_date)}</td><td>${booking.passenger_count}</td><td>${money(booking.total_price)}</td><td>${statusBadge(booking.status)}</td><td class="text-nowrap">${canEdit ? `<button class="btn btn-sm btn-outline-primary edit-booking" data-booking="${escapeHtml(booking.id)}">Edit</button>` : ''} ${booking.status !== 'cancelled' ? `<button class="btn btn-sm btn-outline-warning cancel-booking" data-booking="${escapeHtml(booking.id)}">Cancel</button>` : ''} <button class="btn btn-sm btn-outline-danger delete-booking" data-booking="${escapeHtml(booking.id)}">Delete</button></td></tr>`;
    }).join('');
    document.querySelectorAll('.edit-booking').forEach((button) => button.addEventListener('click', () => openEditBooking(bookings.find((b) => b.id === button.dataset.booking))));
    document.querySelectorAll('.cancel-booking').forEach((button) => button.addEventListener('click', () => cancelBooking(button.dataset.booking)));
    document.querySelectorAll('.delete-booking').forEach((button) => button.addEventListener('click', () => deleteBooking(button.dataset.booking)));
  } catch (error) { showMessage('#itineraryMessage', error.message); }
}
function openEditBooking(booking) {
  if (!booking) return;
  $('#editBookingId').value = booking.id; $('#editTravelDate').value = booking.travel_date;
  $('#editPassengerCount').value = booking.passenger_count; $('#editContactEmail').value = booking.contact_email;
  const pack = Array.isArray(booking.packages) ? booking.packages[0] : booking.packages;
  $('#editBookingPrice').textContent = `Current package: ${pack?.destination || 'Travel package'}. Total will be recalculated when passenger count changes.`;
  clearMessage('#editBookingMessage'); editingBookingModal.show();
}
async function saveBookingEdit() {
  clearMessage('#editBookingMessage'); const button = $('#saveBookingChanges'); setBusy(button, true, 'Saving…');
  try {
    await api(`/api/bookings/${encodeURIComponent($('#editBookingId').value)}`, { method: 'PUT', body: JSON.stringify({ travel_date: $('#editTravelDate').value, passenger_count: Number($('#editPassengerCount').value), contact_email: $('#editContactEmail').value }) });
    editingBookingModal.hide(); await loadItinerary(); showMessage('#itineraryMessage', 'Booking updated successfully.', 'success');
  } catch (error) { showMessage('#editBookingMessage', error.message); }
  finally { setBusy(button, false); }
}
async function cancelBooking(id) {
  if (!confirm('Cancel this booking?')) return;
  try { await api(`/api/bookings/${encodeURIComponent(id)}/cancel`, { method: 'PATCH' }); await loadItinerary(); showMessage('#itineraryMessage', 'Booking cancelled.', 'success'); }
  catch (error) { showMessage('#itineraryMessage', error.message); }
}
async function deleteBooking(id) {
  if (!confirm('Permanently delete this booking? This cannot be undone.')) return;
  try { await api(`/api/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadItinerary(); showMessage('#itineraryMessage', 'Booking deleted.', 'success'); }
  catch (error) { showMessage('#itineraryMessage', error.message); }
}
function setAuthMode(mode) {
  authMode = mode; const registering = mode === 'register';
  $('#authTitle').textContent = registering ? 'Create your account' : 'Sign in to continue';
  $('#nameField').hidden = !registering; $('#fullName').required = registering;
  $('#authPassword').autocomplete = registering ? 'new-password' : 'current-password';
  $('#authSubmit').textContent = registering ? 'Create account' : 'Sign in';
  $('#authSwitchText').textContent = registering ? 'Already have an account?' : 'New to Maxy Travel?';
  $('#authSwitch').textContent = registering ? 'Sign in' : 'Create an account'; clearMessage('#authMessage');
}
async function handleAuth(event) {
  event.preventDefault(); clearMessage('#authMessage'); const button = $('#authSubmit'); setBusy(button, true);
  try {
    const email = $('#authEmail').value.trim(); const password = $('#authPassword').value;
    if (authMode === 'register') {
      const fullName = $('#fullName').value.trim();
      const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      if (error) throw error;
      if (!data.session) { showMessage('#authMessage', 'Account created. Check your email to confirm your address, then sign in.', 'success'); return; }
      currentUser = { access_token: data.session.access_token, user: data.user };
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = { access_token: data.session.access_token, user: data.user };
    }
    await refreshProfile(); updateNavigation(); showMessage('#authMessage', 'You are signed in.', 'success');
    setTimeout(() => { location.hash = currentUser.profile.role === 'admin' ? 'admin' : 'packages'; }, 500);
  } catch (error) { showMessage('#authMessage', error.message || 'Unable to sign in.'); }
  finally { setBusy(button, false); }
}
async function signOut(showNotice = true) {
  try { if (supabaseClient) await supabaseClient.auth.signOut(); } catch (_) { /* Local session is cleared regardless. */ }
  currentUser = null; updateNavigation();
  if (showNotice) { showMessage('#authMessage', 'You have signed out.', 'success'); location.hash = 'home'; }
}
function resetPackageForm() { $('#packageForm').reset(); $('#editPackageId').value = ''; $('#packageFormTitle').textContent = 'Add a package'; $('#packageImage').required = true; $('#packageSaveBtn').textContent = 'Save package'; clearMessage('#adminMessage'); }
async function loadAdminPackages() {
  const { packages } = await api('/api/packages');
  $('#adminPackages').innerHTML = packages.length ? packages.map((item) => `<div class="admin-package-item"><img src="${escapeHtml(item.image_url)}" alt=""><div class="item-copy"><strong>${escapeHtml(item.destination)}</strong><span class="small muted-copy">${money(item.price_per_person)} · ${item.duration_days} days</span></div><button class="btn btn-sm btn-outline-primary edit-package" data-id="${escapeHtml(item.id)}">Edit</button><button class="btn btn-sm btn-outline-danger archive-package" data-id="${escapeHtml(item.id)}">Remove</button></div>`).join('') : '<p class="muted-copy">No packages have been added yet.</p>';
  document.querySelectorAll('.edit-package').forEach((button) => button.addEventListener('click', () => {
    const item = packages.find((p) => p.id === button.dataset.id); if (!item) return;
    $('#editPackageId').value = item.id; $('#packageDestination').value = item.destination; $('#packageDescription').value = item.description;
    $('#packagePrice').value = item.price_per_person; $('#packageDays').value = item.duration_days;
    $('#packageFormTitle').textContent = `Edit ${item.destination}`; $('#packageImage').required = false; $('#packageSaveBtn').textContent = 'Update package'; window.scrollTo({ top: $('#packageForm').getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' });
  }));
  document.querySelectorAll('.archive-package').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Remove this package from the public catalogue? Existing bookings will be retained.')) return;
    try { await api(`/api/packages/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' }); await loadAdminData(); showMessage('#adminMessage', 'Package removed from the catalogue.', 'success'); }
    catch (error) { showMessage('#adminMessage', error.message); }
  }));
}
async function submitPackage(event) {
  event.preventDefault(); clearMessage('#adminMessage'); const button = $('#packageSaveBtn'); setBusy(button, true, 'Saving…');
  try {
    const body = new FormData(); body.append('destination', $('#packageDestination').value.trim()); body.append('description', $('#packageDescription').value.trim());
    body.append('price_per_person', $('#packagePrice').value); body.append('duration_days', $('#packageDays').value);
    if ($('#packageImage').files[0]) body.append('image', $('#packageImage').files[0]);
    const id = $('#editPackageId').value;
    await api(id ? `/api/packages/${encodeURIComponent(id)}` : '/api/packages', { method: id ? 'PUT' : 'POST', body });
    resetPackageForm(); await loadAdminData(); await loadPackages(); showMessage('#adminMessage', 'Package saved successfully.', 'success');
  } catch (error) { showMessage('#adminMessage', error.message); }
  finally { setBusy(button, false); }
}
async function loadAdminBookings() {
  const { bookings } = await api('/api/bookings');
  $('#adminBookingRows').innerHTML = bookings.length ? bookings.map((b) => {
    const pack = Array.isArray(b.packages) ? b.packages[0] : b.packages;
    return `<tr><td>${escapeHtml(pack?.destination || 'Package unavailable')}</td><td>${escapeHtml(b.contact_email)}</td><td>${escapeHtml(b.travel_date)}</td><td>${b.passenger_count}</td><td>${money(b.total_price)}</td><td>${statusBadge(b.status)}</td><td><select class="form-select form-select-sm admin-status" data-id="${escapeHtml(b.id)}" aria-label="Update booking status"><option value="pending" ${b.status === 'pending' ? 'selected' : ''}>Pending</option><option value="confirmed" ${b.status === 'confirmed' ? 'selected' : ''}>Confirmed</option><option value="cancelled" ${b.status === 'cancelled' ? 'selected' : ''}>Cancelled</option></select></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="text-center muted-copy">No bookings yet.</td></tr>';
  document.querySelectorAll('.admin-status').forEach((select) => select.addEventListener('change', async () => {
    try { await api(`/api/bookings/${encodeURIComponent(select.dataset.id)}`, { method: 'PUT', body: JSON.stringify({ status: select.value }) }); showMessage('#adminMessage', 'Booking status updated.', 'success'); }
    catch (error) { showMessage('#adminMessage', error.message); }
  }));
}
async function loadAdminData() {
  if (currentUser?.profile?.role !== 'admin') return;
  try { await Promise.all([loadAdminPackages(), loadAdminBookings()]); }
  catch (error) { showMessage('#adminMessage', error.message); }
}
function routePage() {
  const hash = (location.hash || '#home').slice(1);
  const pageMap = { booking: '#booking', itinerary: '#itinerary', admin: '#admin' };
  Object.entries(pageMap).forEach(([name, selector]) => { $(selector).hidden = hash !== name; });
  if (hash === 'itinerary' && currentUser) loadItinerary();
  if (hash === 'admin' && currentUser?.profile?.role === 'admin') loadAdminData();
  if (hash === 'booking' && !currentUser) location.hash = 'login';
  if (hash === 'admin' && currentUser?.profile?.role !== 'admin') location.hash = currentUser ? 'home' : 'login';
  if (['booking', 'itinerary', 'admin'].includes(hash)) window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function init() {
  $('#year').textContent = new Date().getFullYear();
  editingBookingModal = new bootstrap.Modal($('#editBookingModal'));
  $('#passengerCount').addEventListener('input', updateBookingTotal);
  $('#packageSearch').addEventListener('input', (event) => loadPackages(event.target.value.trim()));
  $('#searchBtn').addEventListener('click', () => loadPackages($('#packageSearch').value.trim()));
  $('#bookingForm').addEventListener('submit', submitBooking); $('#authForm').addEventListener('submit', handleAuth);
  $('#authSwitch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
  $('#logoutBtn').addEventListener('click', () => signOut()); $('#saveBookingChanges').addEventListener('click', saveBookingEdit);
  $('#packageForm').addEventListener('submit', submitPackage); $('#packageResetBtn').addEventListener('click', resetPackageForm);
  window.addEventListener('hashchange', routePage);
  try {
    const configResponse = await fetch('/api/config'); const config = await configResponse.json();
    if (!configResponse.ok) throw new Error(config.error || 'Supabase configuration is missing.');
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) { currentUser = { access_token: session.access_token, user: session.user }; try { await refreshProfile(); } catch (error) { console.warn(error.message); await signOut(false); } }
    supabaseClient.auth.onAuthStateChange((_event, sessionNow) => {
      if (!sessionNow) { currentUser = null; updateNavigation(); }
      else if (!currentUser || currentUser.access_token !== sessionNow.access_token) {
        currentUser = { access_token: sessionNow.access_token, user: sessionNow.user };
        setTimeout(() => refreshProfile().catch(console.error), 0);
      }
    });
    updateNavigation(); await loadPackages(); routePage();
  } catch (error) {
    showMessage('#packageMessage', `${error.message} Configure the environment variables and reload the page.`);
    $('#packageGrid').innerHTML = '<div class="col-12"><div class="alert alert-warning">The application needs its Supabase connection configured before it can load live packages.</div></div>';
  }
}
document.addEventListener('DOMContentLoaded', init);
