import { API_BASE_URL } from '../../shared/config/config.js';

/**
 * Base API client — extend per resource (AuthClient, BotsClient, ...).
 * Wraps Playwright's `request` context for setup/teardown and assertions.
 *
 * @example
 * class AuthClient extends BaseClient {
 *   login(username, password) {
 *     return this.post('/api/auth/login', { username, password });
 *   }
 * }
 */
export class BaseClient {
  constructor(request) {
    this.request = request;
    this.baseURL = API_BASE_URL;
    this.token = null;
  }

  setToken(token) {
    this.token = token;
    return this;
  }

  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async get(path, { headers } = {}) {
    return this.request.get(`${this.baseURL}${path}`, { headers: this._headers(headers) });
  }

  async post(path, data, { headers } = {}) {
    return this.request.post(`${this.baseURL}${path}`, { headers: this._headers(headers), data });
  }

  async put(path, data, { headers } = {}) {
    return this.request.put(`${this.baseURL}${path}`, { headers: this._headers(headers), data });
  }

  async patch(path, data, { headers } = {}) {
    return this.request.patch(`${this.baseURL}${path}`, { headers: this._headers(headers), data });
  }

  async delete(path, { headers } = {}) {
    return this.request.delete(`${this.baseURL}${path}`, { headers: this._headers(headers) });
  }
}
