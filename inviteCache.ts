import { Collection, type Guild, type Invite } from "discord.js";

const cache = new Map<string, Collection<string, Invite>>();

export async function cacheGuildInvites(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    cache.set(guild.id, invites);
  } catch (err) {
    console.error(`[invites] Failed to cache invites for guild ${guild.id}:`, err);
    cache.set(guild.id, new Collection());
  }
}

export function getCachedInvites(guildId: string): Collection<string, Invite> {
  return cache.get(guildId) ?? new Collection();
}

export function setCachedInvites(guildId: string, invites: Collection<string, Invite>): void {
  cache.set(guildId, invites);
}

export async function findInviter(guild: Guild): Promise<{ inviterId: string | null; inviterTag: string }> {
  const oldInvites = getCachedInvites(guild.id);
  try {
    const newInvites = await guild.invites.fetch();
    setCachedInvites(guild.id, newInvites);

    const usedInvite = newInvites.find((inv) => {
      const old = oldInvites.get(inv.code);
      return (inv.uses ?? 0) > (old?.uses ?? 0);
    });

    if (usedInvite?.inviter) {
      return {
        inviterId: usedInvite.inviter.id,
        inviterTag: usedInvite.inviter.tag,
      };
    }
  } catch (err) {
    console.error(`[invites] Failed to fetch invites for guild ${guild.id}:`, err);
  }

  return { inviterId: null, inviterTag: "Unknown" };
}
