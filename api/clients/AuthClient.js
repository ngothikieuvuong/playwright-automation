import { BaseClient } from './BaseClient.js';

/**
 * Auth API client for the FID stack.
 *
 * Endpoint: POST /fid-auth
 * Response shape:
 *   { login: { status, mid, uid, fid, host, port, mode, session } }
 *
 * `session` is the bearer for subsequent REST calls; `fid` is used to upgrade
 * to the websocket channel (`ws://<host>/fid-<fid>`).
 */
export class AuthClient extends BaseClient {
  constructor(request) {
    super(request);
    this.session = null;
    this.fid = null;
    this.uid = null;
  }

  async login(email, password) {
    const response = await this.post('/fid-auth', { login: { email, password } });
    const body = await response.json();
    const login = body?.login;
    if (login?.status === 'Success') {
      this.session = login.session;
      this.fid     = login.fid;
      this.uid     = login.uid;
      this.setToken(login.session);
    }
    return { response, body };
  }
}
