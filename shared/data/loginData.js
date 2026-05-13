import { USERS } from '../config/config.js';

/**
 * UI login fixtures.
 *
 * `validUser` is re-exported from the env-aware `USERS.standard` in
 * shared/config/config.js — switches automatically with `TEST_ENV=local|dev`
 * and respects `USER_USERNAME` / `USER_PASSWORD` env overrides.
 */
export const loginData = {
  validUser: USERS.standard,
  invalidUser: {
    username: 'invalid@example.com',
    password: 'wrongpassword',
  },
};
