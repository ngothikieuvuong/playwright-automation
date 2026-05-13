import { BasePage } from "./BasePage.js";
import { BASE_URL, LOGIN_PATH } from "../../shared/config/config.js";

const LOGIN_URL = `${BASE_URL}${LOGIN_PATH}`;

/**
 * Selector strategy (in priority order):
 *   1. data-testid      — most stable, framework-agnostic
 *   2. formcontrolname  — Angular-specific attribute
 *   3. input[type]      — generic fallback
 *
 * Inspect DevTools on the live page to confirm and simplify to a single selector.
 */
const SELECTORS = {
  username: 'input[placeholder="Username"]',
  password: 'input[placeholder="Password"]',
  loginButton: 'button:has-text("Login")',
};

export class LoginPage extends BasePage {
  constructor(page) {
    super(page);
  }

  async goto() {
    await this.navigate(LOGIN_URL);
  }

  async login(username, password) {
    await this.fill(SELECTORS.username, username);
    await this.fill(SELECTORS.password, password);
    await this.click(SELECTORS.loginButton);
  }
}
