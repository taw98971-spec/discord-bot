import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  AuditLogEvent,
  type Guild,
  type TextChannel,
} from "discord.js";

import { getGuild, addInviteCredit } from "./config";
import { cacheGuildInvites, findInviter } from "./inviteCache";
import { recordAction, punish } from "./antiNuke";
import { handleWelcomeCommands } from "./commands/welcome";
import { handleInviteCommands } from "./commands/invites";
import { handleAntiNukeCommands } from "./commands/antinuke";
import { handleModerationCommands } from "./commands/moderation";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("❌ DISCORD_TOKEN not set");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildIntegrations,
  ],
  partials: [Partials.GuildMember],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);

  for (const guild of c.guilds.cache.values()) {
    getGuild(guild.id);
    await cacheGuildInvites(guild);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  getGuild(guild.id);
  await cacheGuildInvites(guild);
});

// ================= MEMBER JOIN =================

client.on(Events.GuildMemberAdd, async (member) => {
  const guild = member.guild;
  const cfg = getGuild(guild.id);

  const { inviterId, inviterTag } = await findInviter(guild);

  if (inviterId) addInviteCredit(guild.id, inviterId);

  if (!cfg.welcomeEnabled || !cfg.welcomeChannel) return;

  const channel = guild.channels.cache.get(
    cfg.welcomeChannel
  ) as TextChannel | undefined;

  if (!channel) return;

  const msg = cfg.welcomeMessage
    .replace("{user}", `<@${member.id}>`)
    .replace("{server}", guild.name)
    .replace("{inviter}", inviterId ? `<@${inviterId}>` : inviterTag);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`👋 Welcome to ${guild.name}`)
    .setDescription(msg)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await channel.send({ embeds: [embed] });
});

// ================= ANTINUKE =================

const AUDIT_STALENESS_MS = 5000;

const isRecent = (ts: number) =>
  Date.now() - ts < AUDIT_STALENESS_MS;

async function handleAudit(
  guild: Guild,
  actionType: AuditLogEvent,
  targetId: string,
  actionName: any
) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: actionType,
      limit: 5,
    });

    const entry = logs.entries.find(
      (e) =>
        (e.target as any)?.id === targetId &&
        isRecent(e.createdTimestamp)
    );

    if (!entry?.executor) return;

    const exceeded = recordAction(
      guild.id,
      entry.executor.id,
      actionName
    );

    if (exceeded) {
      await punish(client, guild, entry.executor.id, actionName);
    }
  } catch (err) {
    console.error("[AntiNuke error]", err);
  }
}

client.on(Events.ChannelCreate, (c) =>
  handleAudit(c.guild, AuditLogEvent.ChannelCreate, c.id, "channelCreate")
);

client.on(Events.ChannelDelete, (c) =>
  handleAudit(c.guild, AuditLogEvent.ChannelDelete, c.id, "channelDelete")
);

client.on(Events.GuildRoleCreate, (r) =>
  handleAudit(r.guild, AuditLogEvent.RoleCreate, r.id, "roleCreate")
);

client.on(Events.GuildRoleDelete, (r) =>
  handleAudit(r.guild, AuditLogEvent.RoleDelete, r.id, "roleDelete")
);

// ================= COMMAND HANDLER =================

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;

  const handled =
    (await handleWelcomeCommands(message)) ||
    (await handleInviteCommands(message)) ||
    (await handleAntiNukeCommands(message)) ||
    (await handleModerationCommands(message));

  if (!handled && message.content === "!help") {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📖 Commands")
      .setDescription("Bot is running correctly ✅");

    await message.reply({ embeds: [embed] });
  }
});

client.login(token);    
