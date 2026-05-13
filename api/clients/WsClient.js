import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

/**
 * Generic WebSocket client for the FID `Async:` protocol.
 *
 * Wire format (matches the a-stack BML format used by Postman / saved scripts):
 *
 *   #
 *   $$.Message.Type: json
 *   Async:
 *     ApiName:
 *       mid: "<uuid>"
 *       ...args
 *
 * The leading `#` marks the message as a BML stream for the a-stack engine —
 * JSON-only envelopes (without `#`) are rejected by some action handlers.
 *
 * Responses come back as JSON:
 *   {"Status": "Async"}                                          ← ack, ignored
 *   {"ApiName": {"mid": "<uuid>", "status": "Success", ...}}     ← real payload
 *
 * Correlated by the echoed `mid`; multiple requests can be in flight on the
 * same socket.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Serialise an args object to YAML lines at the given indent depth.
 * Handles strings (quoted), numbers, booleans, null, and nested objects.
 */
function emitYamlArgs(obj, indent) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      lines.push(`${indent}${k}: null`);
    } else if (typeof v === 'object') {
      lines.push(`${indent}${k}:`);
      lines.push(emitYamlArgs(v, indent + '  '));
    } else if (typeof v === 'string') {
      lines.push(`${indent}${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${indent}${k}: ${v}`);
    }
  }
  return lines.join('\n');
}

function buildEnvelope(apiName, args) {
  const body = emitYamlArgs(args, '    ');
  return `#\n$$.Message.Type: json\nAsync:\n  ${apiName}:\n${body}\n`;
}

export class WsClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.pending = new Map();
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.once('open', () => {
        this.connected = true;
        resolve();
      });
      ws.once('error', reject);
      ws.on('message', (raw) => this._onMessage(raw));
      ws.on('close', () => { this.connected = false; });
      this.ws = ws;
    });
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    // Drop the protocol ack — every Async-wrapped send produces one.
    if (msg && msg.Status === 'Async') return;
    // Resolve by echoed mid. Response envelope can be:
    //   single API:  { ApiName: { mid, status, ... } }
    //   BML script:  { ApiOne: { mid: null, ... }, ApiTwo: { mid: <ours>, ... } }
    for (const [apiName, body] of Object.entries(msg)) {
      const mid = body?.mid;
      if (mid && this.pending.has(mid)) {
        const entry = this.pending.get(mid);
        clearTimeout(entry.timer);
        this.pending.delete(mid);
        // For BML scripts the caller wants the full envelope; for single calls
        // the legacy `{apiName, ...body}` shape is preserved.
        entry.resolve(entry.raw ? msg : { apiName, ...body });
        return;
      }
    }
    // Unknown / unsolicited frame — surface as a warning so it's visible in logs.
    console.warn('[WsClient] Unmatched frame:', JSON.stringify(msg).slice(0, 200));
  }

  /**
   * Send an `Async:` request and resolve with the matching response body.
   * The returned object is the inner `body` plus an `apiName` field.
   */
  call(apiName, args = {}, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    if (!this.connected || !this.ws) {
      throw new Error('WsClient is not connected — call connect() first');
    }
    const mid = args.mid ?? randomUUID();
    const envelope = buildEnvelope(apiName, { ...args, mid });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(mid);
        reject(new Error(`WS ${apiName} timed out after ${timeout}ms (mid=${mid})`));
      }, timeout);
      this.pending.set(mid, { resolve, reject, timer, apiName, raw: false });
      this.ws.send(envelope);
    });
  }

  /**
   * Send a raw BML script (chained calls in one frame) and resolve with the
   * FULL response envelope. Use this when one script invokes multiple APIs
   * (e.g. `$org = GetOrgs(); SetOrg($args)` in a single message) — the BE
   * runs them in a single execution scope, which is what populates fid-local
   * state like `$F.AFI-LOCAL`. Sending the same calls as two separate Async
   * messages does NOT populate that state.
   *
   * The `correlationMid` must match a `mid` field inside the script so the
   * response can be matched back. Returns the entire `{Api1:{...},Api2:{...}}`
   * object.
   */
  sendBml(scriptString, correlationMid, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    if (!this.connected || !this.ws) {
      throw new Error('WsClient is not connected — call connect() first');
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(correlationMid);
        reject(new Error(`BML script timed out after ${timeout}ms (mid=${correlationMid})`));
      }, timeout);
      this.pending.set(correlationMid, { resolve, reject, timer, apiName: '<bml>', raw: true });
      this.ws.send(scriptString);
    });
  }

  async close() {
    if (this.ws) this.ws.close();
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('WsClient closed before response was received'));
    }
    this.pending.clear();
    this.connected = false;
  }
}
