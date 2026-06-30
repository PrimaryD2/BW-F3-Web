import axios from 'axios';

// Separate axios instance for the customer portal — its own token, isolated from staff session.
const portalApi = axios.create({ baseURL: '/api/portal' });

export const PORTAL_TOKEN = 'bw_portal_token';
export const PORTAL_CUSTOMER = 'bw_portal_customer';

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(PORTAL_TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(PORTAL_TOKEN);
      localStorage.removeItem(PORTAL_CUSTOMER);
      if (!window.location.pathname.startsWith('/portal/login')) {
        window.location.href = '/portal/login';
      }
    }
    return Promise.reject(err);
  }
);

export const portalLogin          = (d) => portalApi.post('/login', d);
export const portalChangePassword = (d) => portalApi.post('/change-password', d);
export const portalGetMe          = ()  => portalApi.get('/me');
export const portalGetQuotes      = ()  => portalApi.get('/quotes');
export const portalGetAircraft    = ()  => portalApi.get('/aircraft');
export const portalGetNews        = ()  => portalApi.get('/news');
export const portalGetBulletins   = ()  => portalApi.get('/bulletins');
export const portalGetFaq         = ()  => portalApi.get('/faq');
export const portalGetRequests    = ()  => portalApi.get('/maintenance-requests');
export const portalCreateRequest  = (d) => portalApi.post('/maintenance-requests', d);

export default portalApi;
