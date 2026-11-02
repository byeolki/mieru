import {
  hasRoleAtLeast,
  strongerRole,
  type AccessVia,
  type GrantableRole,
  type ModelAccess,
  type Role,
  type Visibility,
} from '@mieru/shared';

export interface ModelAccessRow {
  ownerId: string;
  visibility: Visibility;
  publicAllowDownload: boolean;
  takenDown: boolean;
}

export interface LinkGrant {
  role: GrantableRole;
  allowDownload: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface GrantInputs {
  model: ModelAccessRow;
  userId: string | null;
  isAdmin: boolean;
  share: { role: GrantableRole; allowDownload: boolean } | null;
  headerLink: LinkGrant | null;
  visitedLinks: readonly LinkGrant[];
  now: Date;
}

interface Candidate {
  role: Role;
  canDownload: boolean;
  via: AccessVia;
}

const LINK_VISIBILITIES: ReadonlySet<Visibility> = new Set(['link', 'public']);
const SHARE_VISIBILITIES: ReadonlySet<Visibility> = new Set(['users', 'link', 'public']);

function isLinkUsable(link: LinkGrant, now: Date): boolean {
  return link.revokedAt === null && (link.expiresAt === null || link.expiresAt > now);
}

/**
 * The permission rules of the product in one pure function (plan §7.3). Every grant source
 * contributes a candidate; the strongest role wins and download is allowed if any granting
 * source allows it. Returns null when nothing grants access, which callers turn into 404.
 */
export function combineGrants(inputs: GrantInputs): ModelAccess | null {
  const { model, userId, now } = inputs;
  const isOwner = userId !== null && userId === model.ownerId;

  if (model.takenDown) {
    if (isOwner) return { role: 'viewer', canDownload: false, via: 'owner' };
    if (inputs.isAdmin) return { role: 'viewer', canDownload: false, via: 'admin' };
    return null;
  }
  if (isOwner) return { role: 'owner', canDownload: true, via: 'owner' };

  const candidates: Candidate[] = [];
  if (inputs.share && SHARE_VISIBILITIES.has(model.visibility)) {
    const role = inputs.share.role;
    candidates.push({
      role,
      canDownload: role === 'editor' || inputs.share.allowDownload,
      via: 'share',
    });
  }
  if (LINK_VISIBILITIES.has(model.visibility)) {
    const links = [
      ...(inputs.headerLink ? [inputs.headerLink] : []),
      ...(userId ? inputs.visitedLinks : []),
    ];
    for (const link of links) {
      if (!isLinkUsable(link, now)) continue;
      // Editing needs an identity; anonymous link visitors can only view.
      const role: Role = userId ? link.role : 'viewer';
      candidates.push({ role, canDownload: role === 'editor' || link.allowDownload, via: 'link' });
    }
  }
  if (model.visibility === 'public') {
    candidates.push({ role: 'viewer', canDownload: model.publicAllowDownload, via: 'public' });
  }
  if (inputs.isAdmin) candidates.push({ role: 'viewer', canDownload: false, via: 'admin' });

  const [first, ...rest] = candidates;
  if (!first) return null;
  const best = rest.reduce(
    (winner, candidate) =>
      strongerRole(winner.role, candidate.role) === candidate.role && candidate.role !== winner.role
        ? candidate
        : winner,
    first,
  );
  const canDownload =
    hasRoleAtLeast(best.role, 'editor') || candidates.some((candidate) => candidate.canDownload);
  return { role: best.role, canDownload, via: best.via };
}
