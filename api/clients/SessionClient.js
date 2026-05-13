import { randomUUID } from 'node:crypto';

/**
 * Performs the post-connect WS handshake required before any business API call.
 *
 * IMPORTANT: must be sent as a single BML script, not two separate Async
 * messages. The BE only populates fid-local state (`$F.AFI-LOCAL`, the user's
 * `assignedOrgNodes`, etc.) when GetOrgs + SetOrg run inside the same BML
 * execution scope. Two separate Async calls return Success but leave that
 * state empty, and every downstream topology/metric API then 500s.
 *
 *   #
 *   $org = GetOrgs().Orgs.getFirst()
 *   $args.mid = '<uuid>'
 *   $args.id = useof $org.owner defto $org.id
 *   $args.timeZone = 'Asia/Saigon'
 *   SetOrg($args)
 */
const DEFAULT_TIMEZONE = 'Asia/Saigon';

export class SessionClient {
  constructor(wsClient) {
    this.ws = wsClient;
    this.org = null;
  }

  async setActiveOrgFromFirst({ timeZone = DEFAULT_TIMEZONE } = {}) {
    const mid = randomUUID();
    const script = `#
$org = GetOrgs().Orgs.getFirst()
$args.mid = '${mid}'
$args.id = useof $org.owner defto $org.id
$args.timeZone = '${timeZone}'
SetOrg($args)
`;
    const resp = await this.ws.sendBml(script, mid);
    const setOrg = resp?.SetOrg;
    if (!setOrg || setOrg.status !== 'Success') {
      throw new Error(`SessionClient: BML handshake failed — ${JSON.stringify(setOrg)}`);
    }
    this.org = { id: setOrg?.Org?.id, timeZone, raw: setOrg?.Org };
    return this.org;
  }
}
