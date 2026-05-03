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
export const createFleetAircraft = (d)       => api.post('/fleet', d);
export const getFleetAircraft    = (id)      => api.get(`/fleet/${id}`);
export const updateFleetAircraft = (id, d)   => api.put(`/fleet/${id}`, d);
export const saveFleetConfig     = (id, ids) => api.put(`/fleet/${id}/config`, { option_ids: ids });

export const getFleetConfigOptions   = ()        => api.get('/fleet/config-options');
export const createFleetConfigOption = (d)       => api.post('/fleet/config-options', d);
export const updateFleetConfigOption = (oid, d)  => api.put(`/fleet/config-options/${oid}`, d);
export const deleteFleetConfigOption = (oid)     => api.delete(`/fleet/config-options/${oid}`);

export const getFleetServiceTemplates   = ()         => api.get('/fleet/service-templates');
export const createFleetServiceTemplate = (d)        => api.post('/fleet/service-templates', d);
export const updateFleetServiceTemplate = (tid, d)   => api.put(`/fleet/service-templates/${tid}`, d);
export const deleteFleetServiceTemplate = (tid)      => api.delete(`/fleet/service-templates/${tid}`);
export const completeFleetService       = (id, d)    => api.post(`/fleet/${id}/services`, d);
export const deleteFleetServiceRecord   = (id, rid)  => api.delete(`/fleet/${id}/services/${rid}`);
export const getFleetUpcomingServices   = ()         => api.get('/fleet/upcoming-services');

export const addFleetContact    = (id, d)       => api.post(`/fleet/${id}/contacts`, d);
export const updateFleetContact = (id, cid, d)  => api.put(`/fleet/${id}/contacts/${cid}`, d);
export const deleteFleetContact = (id, cid)     => api.delete(`/fleet/${id}/contacts/${cid}`);

export const addFleetSerial    = (id, d)        => api.post(`/fleet/${id}/serials`, d);
export const updateFleetSerial = (id, sid, d)   => api.put(`/fleet/${id}/serials/${sid}`, d);
export const deleteFleetSerial = (id, sid)      => api.delete(`/fleet/${id}/serials/${sid}`);

export const addFleetEvent     = (id, d)        => api.post(`/fleet/${id}/events`, d);
export const deleteFleetEvent  = (id, eid)      => api.delete(`/fleet/${id}/events/${eid}`);

export const uploadFleetImage   = (id, formData) =>
  api.post(`/fleet/${id}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateFleetImageCaption = (id, iid, caption) =>
  api.put(`/fleet/${id}/images/${iid}/caption`, { caption });
export const deleteFleetImage   = (id, iid)     => api.delete(`/fleet/${id}/images/${iid}`);

// ─── PDF ──────────────────────────────────────────────────────────────────────
export const pdfTaskSheet    = (airplaneId, stationId) => `/api/pdf/task-sheet/${airplaneId}/${stationId}`;
export const pdfNcr          = (id) => `/api/pdf/ncr/${id}`;

export default api;
