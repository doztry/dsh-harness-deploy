/**
 * dsh-auth-simple — optional username + password gate for the **web UI**.
 * See packages/dsh-auth — same module vendored for self-contained deploy.
 */
export { name, inject, apply, createAuthMiddleware, default } from '../../../packages/dsh-auth/lib/index.js'
