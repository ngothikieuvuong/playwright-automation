/**
 * Wraps the `GetSchemeBasedOrganization` Async API.
 *
 * The response shape (per ticket CT-14315):
 *   { Message: { AnyOrgNodeType: { <nodeId>: { name, ... }, ... } } }
 *
 * We look up a node id by display name. If the server changes the shape,
 * a deep-walk fallback still finds any `{id, name}` pair.
 */
export class OrganizationClient {
  constructor(wsClient) {
    this.ws = wsClient;
  }

  async getSchemeBasedOrganization(args = {}) {
    return this.ws.call('GetSchemeBasedOrganization', args);
  }

  async findNodeIdByName(name) {
    const resp = await this.getSchemeBasedOrganization();
    if (resp.status !== 'Success') {
      const detail = resp.error ?? resp.message ?? '';
      throw new Error(`GetSchemeBasedOrganization failed — status="${resp.status}" detail=${JSON.stringify(detail)}`);
    }
    // AnyOrgNodeType is an array of node descriptors `{ id, name, ... }`.
    // (Older docs implied it was an object map — handle both for safety.)
    const anyOrg = resp?.Message?.AnyOrgNodeType;
    const candidates = Array.isArray(anyOrg) ? anyOrg : Object.values(anyOrg ?? {});
    for (const node of candidates) {
      if (node?.name === name && node?.id) return node.id;
    }
    // Deep walk fallback: the node may be nested inside child collections.
    const stack = [resp?.Message];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object') continue;
      if (typeof cur.name === 'string' && typeof cur.id === 'string' && cur.name === name) {
        return cur.id;
      }
      for (const v of Object.values(cur)) stack.push(v);
    }
    throw new Error(`No node found with name "${name}" in GetSchemeBasedOrganization response`);
  }
}
