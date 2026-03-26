import type { Guild, GuildMember, TextChannel, Client } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getGuild, isImmune } from "./config.js";
import type { AntiNukeLimits } from "./config.js";

interface ActionRecord {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 10_000;

const actionMap = new Map<string, Map<string, ActionRecord>>();

function getKey(guildId: string, userId: string, action: keyof AntiNukeLimits): string {
  return `${guildId}:${userId}:${action}`;
}

export function recordAction(
  guildId: string,
  userId: string,
  action: keyof AntiNukeLimits
): boolean {
  const cfg = getGuild(guildId);
  if (!cfg.antiNuke.enabled) return false;

  const limit = cfg.antiNuke.limits[action];
  if (limit === undefined || limit <= 0) return false;

  const key = getKey(guildId, userId, action);
  if (!actionMap.has(key)) actionMap.set(key, new Map());
  const records = actionMap.get(key)!;

  const now = Date.now();
  const rec = records.get(action) ?? { count: 0, windowStart: now };

  if (now - rec.windowStart > WINDOW_MS) {
    rec.count = 1;
    rec.windowStart = now;
  } else {
    rec.count += 1;
  }

  records.set(action, rec);

  return rec.count >= limit;
}

export async function punish(
  client: Client,
  guild: Guild,
  targetId: string,
  action: keyof AntiNukeLimits
): Promise<void> {
  if (targetId === guild.ownerId) return;

  const cfg = getGuild(guild.id);
  let member: GuildMember | null = null;

  try {
    member = await guild.members.fetch(targetId);
  } catch (err) {
    console.error(`[anti-nuke] Failed to fetch member ${targetId} in guild ${guild.id}:`, err);
    return;
  }

  const memberRoleIds = [...member.roles.cache.keys()];
  if (isImmune(guild.id, targetId, memberRoleIds)) return;

  const reason = `Anti-nuke: exceeded limit for action "${action}"`;

  try {
    await member.roles.set([], reason);
    await member.kick(reason);
    console.log(`[anti-nuke] Kicked ${targetId} in guild ${guild.id} for action "${action}"`);
  } catch (kickErr) {
    console.error(`[anti-nuke] Kick failed for ${targetId}, attempting ban:`, kickErr);
    try {
      await guild.members.ban(targetId, { reason });
      console.log(`[anti-nuke] Banned ${targetId} in guild ${guild.id} for action "${action}"`);
    } catch (banErr) {
      console.error(`[anti-nuke] Ban also failed for ${targetId}:`, banErr);
    }
  }

  if (cfg.logChannel) {
    try {
      const channel = guild.channels.cache.get(cfg.logChannel) as TextChannel | undefined;
      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("🛡️ Anti-Nuke Action")
          .addFields(
            { name: "User", value: `<@${targetId}> (${targetId})`, inline: true },
            { name: "Action Triggered", value: action, inline: true },
            { name: "Punishment", value: "Roles removed + Kick (or Ban)", inline: false }
          )
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      }
    } catch (logErr) {
      console.error(`[anti-nuke] Failed to send log message in guild ${guild.id}:`, logErr);
    }
  }
}
