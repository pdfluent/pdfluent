// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// GitHub App client for the one thing this Worker does on GitHub: open, read
// and blank an issue in the private tracker.
//
// Why an App and not a personal token: an App's installation token is scoped to
// the repositories it is installed on and to the permissions in its manifest
// (issues: write, metadata: read), expires after an hour, and is not tied to a
// person's account. A leaked Worker secret then opens issues in one repository
// and nothing else. See github-app-manifest.json.
//
// Secrets (wrangler secret put): GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID,
// GITHUB_APP_PRIVATE_KEY (PKCS#8 PEM). Var: GITHUB_REPO ("owner/name").

const API = 'https://api.github.com';
const USER_AGENT = 'pdfluent-report-worker';

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlJson(value) {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToDer(pem) {
  const body = String(pem)
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The short-lived JWT an App signs to ask for an installation token.
 * `iat` is backdated 60 s against clock skew; GitHub caps `exp` at 10 minutes.
 */
export async function createAppJwt(appId, privateKeyPem, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (String(privateKeyPem).includes('BEGIN RSA PRIVATE KEY')) {
    // GitHub hands out PKCS#1; WebCrypto only imports PKCS#8. Converting is a
    // one-line openssl step (README, owner steps), not something to do here.
    throw new Error('GITHUB_APP_PRIVATE_KEY must be PKCS#8 (BEGIN PRIVATE KEY), see README');
  }
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const header = base64urlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = base64urlJson({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: String(appId) });
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/**
 * A GitHub API call that answered with a non-2xx status. Carries the method,
 * the request path and the status so a caller can log the cause; never the
 * token, the key or the request body.
 */
export class GitHubHttpError extends Error {
  constructor(method, path, status) {
    super(`${method} ${path}: HTTP ${status}`);
    this.name = 'GitHubHttpError';
    this.method = method;
    this.path = path;
    this.status = status;
  }
}

function configured(env) {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_INSTALLATION_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_REPO);
}

export function githubConfigured(env) {
  return configured(env);
}

async function installationToken(env, fetchImpl) {
  const jwt = await createAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  const path = `/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`;
  const res = await fetchImpl(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new GitHubHttpError('POST', path, res.status);
  const data = await res.json();
  if (!data?.token) throw new Error('installation token: no token in response');
  return data.token;
}

async function call(env, fetchImpl, method, path, body) {
  const token = await installationToken(env, fetchImpl);
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new GitHubHttpError(method, path, res.status);
  return res.json();
}

/** Open an issue; resolves with its number. */
export async function createIssue(env, issue, fetchImpl = fetch) {
  if (!configured(env)) throw new Error('GitHub App not configured');
  const data = await call(env, fetchImpl, 'POST', `/repos/${env.GITHUB_REPO}/issues`, {
    title: issue.title,
    body: issue.body,
    labels: issue.labels,
  });
  if (typeof data?.number !== 'number') throw new Error('create issue: no number in response');
  return data.number;
}

/** `{ state, closedAt }` of an issue. */
export async function getIssue(env, number, fetchImpl = fetch) {
  const data = await call(env, fetchImpl, 'GET', `/repos/${env.GITHUB_REPO}/issues/${number}`);
  return { state: data.state, closedAt: data.closed_at ?? null };
}

/**
 * Replace an issue's title and body (used when a reporter asks for their report
 * to be removed: the title was built from their text too, so both go).
 */
export async function replaceIssueText(env, number, { title, body }, fetchImpl = fetch) {
  await call(env, fetchImpl, 'PATCH', `/repos/${env.GITHUB_REPO}/issues/${number}`, { title, body });
}
