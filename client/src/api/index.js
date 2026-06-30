import axios from 'axios';

// Axios instance — base URL resolves through Vite proxy in dev,
// and same-origin in production.
const api = axios.create({ baseURL: '/api' });

// Attach JWT to every request — axios.create() does NOT inherit changes made
// to axios.defaults at runtime, so we use an interceptor on this instance.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('f3_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 (expired/invalid token) clear storage and redirect to login.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('f3_token');
      localStorage.removeItem('f3_user');
      localStorage.removeItem('f3_last_activity');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const login           = (d) => api.post('/auth/login', d);
export const getMe           = ()  => api.get('/auth/me');
export const changePassword  = (d) => api.post('/auth/change-password', d);
export const verifyPassword  = (d) => api.post('/auth/verify-password', d);
// Returns {id, name, role} for all active users — accessible to all roles (for dropdowns)
export const getActiveUsers  = ()  => api.get('/auth/users');

// ─── Airplanes ────────────────────────────────────────────────────────────────
export const getAirplanes    = (p) => api.get('/airplanes', { params: p });
export const getAirplane     = (id) => api.get(`/airplanes/${id}`);
export const createAirplane  = (d) => api.post('/airplanes', d);
export const updateAirplane  = (id, d) => api.put(`/airplanes/${id}`, d);
export const getAirplaneProgress = (id) => api.get(`/airplanes/${id}/progress`);

// ─── Stations ─────────────────────────────────────────────────────────────────
export const getStations     = () => api.get('/stations');

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const getTasks        = (airplaneId, stationId) => api.get(`/tasks/airplane/${airplaneId}/station/${stationId}`);
export const updateTask      = (id, d) => api.put(`/tasks/${id}`, d);
export const signOffTask     = (id, d) => api.post(`/tasks/${id}/signoff`, d);
export const getTaskSignoffs = (id) => api.get(`/tasks/${id}/signoffs`);

// ─── Time Logs ────────────────────────────────────────────────────────────────
export const startTimer      = (d) => api.post('/time-logs/start', d);
export const stopTimer       = (id) => api.put(`/time-logs/${id}/stop`);
export const getMyActiveTimers = () => api.get('/time-logs/my-active');
export const logLoss         = (d) => api.post('/time-logs/loss', d);
export const getTaskTimeLogs = (taskId) => api.get(`/time-logs/task/${taskId}`);

// ─── NCR ──────────────────────────────────────────────────────────────────────
export const getNcrs         = (p) => api.get('/ncr', { params: p });
export const createNcr       = (d) => api.post('/ncr', d);
export const getNcr          = (id) => api.get(`/ncr/${id}`);
export const updateNcr       = (id, d) => api.put(`/ncr/${id}`, d);

// ─── Admin ────────────────────────────────────────────────────────────────────
export const getUsers        = () => api.get('/admin/users');
export const createUser      = (d) => api.post('/admin/users', d);
export const updateUser      = (id, d) => api.put(`/admin/users/${id}`, d);
export const getRoles        = () => api.get('/admin/roles');
export const getRolePermissions = () => api.get('/admin/permissions');
export const updateRolePermissions = (role, permissions) => api.put(`/admin/permissions/${role}`, { permissions });
export const getComponentTypes    = ()        => api.get('/admin/component-types');
export const createComponentType  = (d)       => api.post('/admin/component-types', d);
export const updateComponentType  = (id, d)   => api.put(`/admin/component-types/${id}`, d);
export const deleteComponentType  = (id)      => api.delete(`/admin/component-types/${id}`);
export const getComponentNames    = ()        => api.get('/admin/component-names');
export const createComponentName  = (d)       => api.post('/admin/component-names', d);
export const updateComponentName  = (id, d)   => api.put(`/admin/component-names/${id}`, d);
export const deleteComponentName  = (id)      => api.delete(`/admin/component-names/${id}`);
export const getFleetComponentNames = ()      => api.get('/fleet/component-names');
export const getFleetComponentTypes = ()      => api.get('/fleet/component-types');
export const getFleetSettings     = ()        => api.get('/fleet/settings');
export const getAdminSettings     = ()        => api.get('/admin/settings');
export const updateAdminSettings  = (d)       => api.put('/admin/settings', d);
export const getFleetModelsAdmin = () => api.get('/admin/models');
export const createFleetModel = (d) => api.post('/admin/models', d);
export const updateFleetModel = (id, d) => api.put(`/admin/models/${id}`, d);
export const deleteFleetModel = (id) => api.delete(`/admin/models/${id}`);
export const getFleetBulletins        = ()        => api.get('/admin/bulletins');
export const getFleetBulletin         = (id)      => api.get(`/admin/bulletins/${id}`);
export const createFleetBulletin      = (d)       => api.post('/admin/bulletins', d);
export const updateFleetBulletin      = (id, d)   => api.put(`/admin/bulletins/${id}`, d);
export const deleteFleetBulletin      = (id)      => api.delete(`/admin/bulletins/${id}`);
export const getFleetBulletinAircraft = (id)      => api.get(`/admin/bulletins/${id}/aircraft`);
export const resolveFleetBulletinAircraft = (id, aircraftId, d) =>
  api.post(`/admin/bulletins/${id}/aircraft/${aircraftId}/resolve`, d);
export const getTaskTemplates = (p) => api.get('/admin/task-templates', { params: p });
export const getStationTemplates = (stationId) => api.get(`/admin/task-templates/station/${stationId}`);
export const createTemplate  = (d) => api.post('/admin/task-templates', d);
export const updateTemplate  = (id, d) => api.put(`/admin/task-templates/${id}`, d);
export const getAuditLog     = (p) => api.get('/admin/audit', { params: p });

// ─── Statistics ───────────────────────────────────────────────────────────────
export const getTimePerTask     = (p) => api.get('/statistics/time-per-task', { params: p });
export const getNcrFrequency    = (p) => api.get('/statistics/ncr-frequency', { params: p });
export const getLossBreakdown   = (p) => api.get('/statistics/loss-breakdown', { params: p });
export const getThroughput      = (p) => api.get('/statistics/throughput', { params: p });
export const getDashboardStats  = () => api.get('/statistics/dashboard');
export const exportCsv          = (p) => `/api/statistics/export/csv?${new URLSearchParams(p).toString()}`;

// ─── Fleet / F5 Service ───────────────────────────────────────────────────────
export const getFleetList        = ()        => api.get('/fleet');
export const getFleetModels      = ()        => api.get('/fleet/models');
export const createFleetAircraft = (d)       => api.post('/fleet', d);
export const getFleetAircraft    = (id)      => api.get(`/fleet/${id}`);
export const updateFleetAircraft = (id, d)   => api.put(`/fleet/${id}`, d);
export const saveFleetConfig     = (id, ids) => api.put(`/fleet/${id}/config`, { option_ids: ids });

export const getFleetConfigOptions   = ()        => api.get('/fleet/config-options');
export const createFleetConfigOption = (d)       => api.post('/fleet/config-options', d);
export const updateFleetConfigOption = (oid, d)  => api.put(`/fleet/config-options/${oid}`, d);
export const deleteFleetConfigOption = (oid)     => api.delete(`/fleet/config-options/${oid}`);

export const getFleetComponents         = (params)   => api.get('/fleet/components', { params });
export const getFleetServiceTemplates   = ()         => api.get('/fleet/service-templates');
export const createFleetServiceTemplate = (d)        => api.post('/fleet/service-templates', d);
export const updateFleetServiceTemplate = (tid, d)   => api.put(`/fleet/service-templates/${tid}`, d);
export const deleteFleetServiceTemplate = (tid)      => api.delete(`/fleet/service-templates/${tid}`);
export const completeFleetService       = (id, d)    => api.post(`/fleet/${id}/services`, d);
export const deleteFleetServiceRecord   = (id, rid)  => api.delete(`/fleet/${id}/services/${rid}`);
export const getFleetUpcomingServices   = ()         => api.get('/fleet/upcoming-services');
export const getFleetPlannedMaintenance = ()         => api.get('/fleet/planned-maintenance');
export const createFleetPlannedMaintenance = (id, d) => api.post(`/fleet/${id}/planned-maintenance`, d);
export const updateFleetPlannedMaintenance = (pid, d) => api.put(`/fleet/planned-maintenance/${pid}`, d);
export const deleteFleetPlannedMaintenance  = (pid)    => api.delete(`/fleet/planned-maintenance/${pid}`);
export const signOffFleetPlannedMaintenance = (pid, d) => api.post(`/fleet/planned-maintenance/${pid}/signoff`, d);
export const editCompletedFleetPlannedMaintenance = (pid, d) => api.patch(`/fleet/planned-maintenance/${pid}`, d);
export const unlockFleetPlannedMaintenance = (pid) => api.post(`/fleet/planned-maintenance/${pid}/unlock`);

export const addFleetContact    = (id, d)       => api.post(`/fleet/${id}/contacts`, d);
export const updateFleetContact = (id, cid, d)  => api.put(`/fleet/${id}/contacts/${cid}`, d);
export const deleteFleetContact = (id, cid)     => api.delete(`/fleet/${id}/contacts/${cid}`);

export const addFleetSerial       = (id, d)       => api.post(`/fleet/${id}/serials`, d);
export const updateFleetSerial    = (id, sid, d)  => api.put(`/fleet/${id}/serials/${sid}`, d);
export const deleteFleetSerial    = (id, sid)     => api.delete(`/fleet/${id}/serials/${sid}`);
export const uninstallFleetSerial = (id, sid, d)  => api.put(`/fleet/${id}/serials/${sid}/uninstall`, d);

// Legacy part-replacement endpoints (kept for backward compat; new flow uses uninstall above)
export const addFleetPartReplacement    = (id, d)      => api.post(`/fleet/${id}/part-replacements`, d);
export const updateFleetPartReplacement = (id, rid, d) => api.put(`/fleet/${id}/part-replacements/${rid}`, d);
export const deleteFleetPartReplacement = (id, rid)    => api.delete(`/fleet/${id}/part-replacements/${rid}`);

// Paint codes (multiple per aircraft)
export const addFleetPaint    = (id, d)       => api.post(`/fleet/${id}/paints`, d);
export const updateFleetPaint = (id, pid, d)  => api.put(`/fleet/${id}/paints/${pid}`, d);
export const deleteFleetPaint = (id, pid)     => api.delete(`/fleet/${id}/paints/${pid}`);

export const addFleetEvent     = (id, d)        => api.post(`/fleet/${id}/events`, d);
export const updateFleetEvent  = (id, eid, d)   => api.put(`/fleet/${id}/events/${eid}`, d);
export const deleteFleetEvent  = (id, eid)      => api.delete(`/fleet/${id}/events/${eid}`);

export const getFleetEventTypes    = ()        => api.get('/fleet/event-types');
export const createFleetEventType  = (d)       => api.post('/fleet/event-types', d);
export const updateFleetEventType  = (id, d)   => api.put(`/fleet/event-types/${id}`, d);
export const deleteFleetEventType  = (id)      => api.delete(`/fleet/event-types/${id}`);
export const getFleetGallery       = ()        => api.get('/fleet/gallery');

export const uploadFleetImage   = (id, formData) =>
  api.post(`/fleet/${id}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateFleetImageCaption = (id, iid, payload) =>
  api.put(`/fleet/${id}/images/${iid}/caption`, typeof payload === 'string' ? { caption: payload } : payload);
export const setFleetImageCover  = (id, iid)    => api.put(`/fleet/${id}/images/${iid}/cover`);
export const deleteFleetImage    = (id, iid)    => api.delete(`/fleet/${id}/images/${iid}`);

export const getFleetPaperwork    = (id)         => api.get(`/fleet/${id}/paperwork`);
export const uploadFleetPaperwork = (id, formData) =>
  api.post(`/fleet/${id}/paperwork`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateFleetPaperwork = (id, pid, d) => api.put(`/fleet/${id}/paperwork/${pid}`, d);
export const deleteFleetPaperwork = (id, pid)    => api.delete(`/fleet/${id}/paperwork/${pid}`);
export const paperworkDownloadUrl = (pid)        => `/api/fleet/paperwork/${pid}/download`;

// ─── CRM / Customers ─────────────────────────────────────────────────────────
export const getCustomers         = (p)        => api.get('/customers', { params: p });
export const getCustomerFollowups = ()         => api.get('/customers/followups');
export const getCustomer          = (id)       => api.get(`/customers/${id}`);
export const createCustomer       = (d)        => api.post('/customers', d);
export const updateCustomer       = (id, d)    => api.put(`/customers/${id}`, d);
export const archiveCustomer      = (id)       => api.delete(`/customers/${id}`);
export const updateCustomerPortal = (id, d)    => api.put(`/customers/${id}/portal`, d);
export const getMaintenanceRequests = ()       => api.get('/customers/maintenance-requests/all');
export const updateMaintenanceRequest = (rid, d) => api.put(`/customers/maintenance-requests/${rid}`, d);

// ─── Progress photos (customer-facing, per aircraft) ───────────────────────────
export const getProgressPhotos   = (id)        => api.get(`/fleet/${id}/progress-photos`);
export const uploadProgressPhoto = (id, formData) =>
  api.post(`/fleet/${id}/progress-photos`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteProgressPhoto = (id, pid)   => api.delete(`/fleet/${id}/progress-photos/${pid}`);

// ─── Portal admin (news + FAQ) ─────────────────────────────────────────────────
export const getPortalNews    = ()        => api.get('/admin/portal-news');
export const createPortalNews = (d)       => api.post('/admin/portal-news', d);
export const deletePortalNews = (id)      => api.delete(`/admin/portal-news/${id}`);
export const getPortalFaq     = ()        => api.get('/admin/faq');
export const createPortalFaq  = (d)       => api.post('/admin/faq', d);
export const updatePortalFaq  = (id, d)   => api.put(`/admin/faq/${id}`, d);
export const deletePortalFaq  = (id)      => api.delete(`/admin/faq/${id}`);

export const getCustomerLogs      = (id, p)    => api.get(`/customers/${id}/logs`, { params: p });
export const createCustomerLog    = (id, d)    => api.post(`/customers/${id}/logs`, d);
export const updateCustomerLog    = (id, lid, d) => api.put(`/customers/${id}/logs/${lid}`, d);
export const deleteCustomerLog    = (id, lid)  => api.delete(`/customers/${id}/logs/${lid}`);

export const getCustomerBookings  = (id)       => api.get(`/customers/${id}/bookings`);
export const createCustomerBooking = (id, d)   => api.post(`/customers/${id}/bookings`, d);

export const getCustomerQuotes    = (id)           => api.get(`/customers/${id}/quotes`);
export const createCustomerQuote  = (id, d)        => api.post(`/customers/${id}/quotes`, d);
export const updateCustomerQuote  = (id, qid, d)   => api.put(`/customers/${id}/quotes/${qid}`, d);
export const deleteCustomerQuote  = (id, qid)      => api.delete(`/customers/${id}/quotes/${qid}`);
export const sendCustomerQuoteEmail = (id, qid, d) => api.post(`/customers/${id}/quotes/${qid}/send-email`, d);

export const signOffMaintenanceItem = (itemId, d) => api.put(`/fleet/planned-maintenance/items/${itemId}/signoff`, d);
export const uploadMaintenanceItemPhoto = (itemId, formData) =>
  api.post(`/fleet/planned-maintenance/items/${itemId}/photos`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteMaintenanceItemPhoto = (itemId, photoId) =>
  api.delete(`/fleet/planned-maintenance/items/${itemId}/photos/${photoId}`);

// ─── PDF ──────────────────────────────────────────────────────────────────────
export const pdfTaskSheet    = (airplaneId, stationId) => `/api/pdf/task-sheet/${airplaneId}/${stationId}`;
export const pdfNcr          = (id) => `/api/pdf/ncr/${id}`;

export default api;
