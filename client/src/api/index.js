import axios from 'axios';

// Axios instance — base URL resolves through Vite proxy in dev,
// and same-origin in production.
const api = axios.create({ baseURL: '/api' });

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

// ─── PDF ──────────────────────────────────────────────────────────────────────
export const pdfTaskSheet    = (airplaneId, stationId) => `/api/pdf/task-sheet/${airplaneId}/${stationId}`;
export const pdfNcr          = (id) => `/api/pdf/ncr/${id}`;

export default api;
