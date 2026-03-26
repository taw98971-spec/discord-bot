import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  AuditLogEvent,
  type TextChannel,
} from "discord.js";
import { getGuild, addInviteCredit } from "./config.js";
import { cacheGuildInvites, findInviter } from "./inviteCache.js";
import { recordAction, punish } from "./antiNuke.js";
import { handleWelcomeCommands } from "./commands/welcome.js";
import { handleInviteCommands } from "./commands/invites.js";
import { handleAntiNukeCommands } from "./commands/antinuke.js";
import { handleModerationCommands } from "./commands/moderation.js";

const token = process.env["DISCORD_TOKEN"];
if (!token) {
  console.error("ERROR: DISCORD_TOKEN environment variable is not set.");
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
  console.log(`✅ Bot is ready! Logged in as ${c.user.tag}`);

  for (const guild of c.guilds.cache.values()) {
    getGuild(guild.id);
    await cacheGuildInvites(guild);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  getGuild(guild.id);
  await cacheGuildInvites(guild);
  console.log(`Joined guild: ${guild.name} (${guild.id})`);
});

client.on(Events.InviteCreate, async (invite) => {
  if (!invite.guild) return;
  const guild = client.guilds.cache.get(invite.guild.id);
  if (guild) await cacheGuildInvites(guild);
});

client.on(Events.InviteDelete, async (invite) => {
  if (!invite.guild) return;
  const guild = client.guilds.cache.get(invite.guild.id);
  if (guild) await cacheGuildInvites(guild);
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (!member.guild) return;
  const guild = member.guild;
  const cfg = getGuild(guild.id);

  const { inviterId, inviterTag } = await findInviter(guild);

  if (inviterId) {
    addInviteCredit(guild.id, inviterId);
  }

  const inviteCount = inviterId
    ? (cfg.invites[inviterId] ?? 0) + 1
    : 0;

  if (cfg.welcomeEnabled && cfg.welcomeChannel) {
    const channel = guild.channels.cache.get(cfg.welcomeChannel) as TextChannel | undefined;
    if (channel) {
      const msg = cfg.welcomeMessage
        .replace("{user}", `<@${member.id}>`)
        .replace("{server}", guild.name)
        .replace("{inviter}", inviterId ? `<@${inviterId}>` : inviterTag)
        .replace("{inviteCount}", String(inviteCount));

      const colorHex = cfg.welcomeColor.replace("#", "");
      const colorInt = parseInt(colorHex, 16);

      const embed = new EmbedBuilder()
        .setColor(isNaN(colorInt) ? 0x5865f2 : colorInt)
        .setTitle(`👋 Welcome to ${guild.name}!`)
        .setDescription(msg)
        .setThumbnail(member.user.displayAvatarURL());

      if (cfg.welcomeImage) {
        embed.setImage(cfg.welcomeImage);
      }

      embed.setTimestamp();

      try {
        await channel.send({ embeds: [embed] });
      } catch {
        console.error(`Failed to send welcome message in guild ${guild.id}`);
      }
    }
  }
});

const AUDIT_STALENESS_MS = 5_000;

function isRecentEntry(createdTimestamp: number): boolean {
  return Date.now() - createdTimestamp < AUDIT_STALENESS_MS;
}

client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  const guild = channel.guild;
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: 10, limit: 5 });
    const entry = auditLogs.entries.find(
      (e) => (e.target as { id?: string } | null)?.id === channel.id && isRecentEntry(e.createdTimestamp)
    );
    if (!entry?.executor) return;
    const exceeded = recordAction(guild.id, entry.executor.id, "channelCreate");
    if (exceeded) await punish(client, guild, entry.executor.id, "channelCreate");
  } catch (err) {
    console.error(`[anti-nuke] ChannelCreate audit fetch failed in guild ${guild.id}:`, err);
  }
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!("guild" in channel) || !channel.guild) return;
  const guild = channel.guild;
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: 12, limit: 5 });
    const entry = auditLogs.entries.find(
      (e) => (e.target as { id?: string } | null)?.id === channel.id && isRecentEntry(e.createdTimestamp)
    );
    if (!entry?.executor) return;
    const exceeded = recordAction(guild.id, entry.executor.id, "channelDelete");
    if (exceeded) await punish(client, guild, entry.executor.id, "channelDelete");
  } catch (err) {
    console.error(`[anti-nuke] ChannelDelete audit fetch failed in guild ${guild.id}:`, err);
  }
});

client.on(Events.GuildRoleCreate, async (role) => {
  const guild = role.guild;
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: 30, limit: 5 });
    const entry = auditLogs.entries.find(
      (e) => (e.target as { id?: string } | null)?.id === role.id && isRecentEntry(e.createdTimestamp)
    );
    if (!entry?.executor) return;
    const exceeded = recordAction(guild.id, entry.executor.id, "roleCreate");
    if (exceeded) await punish(client, guild, entry.executor.id, "roleCreate");
  } catch (err) {
    console.error(`[anti-nuke] GuildRoleCreate audit fetch failed in guild ${guild.id}:`, err);
  }
});

client.on(Events.GuildRoleDelete, async (role) => {
  const guild = role.guild;
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: 32, limit: 5 });
    const entry = auditLogs.entries.find(
      (e) => (e.target as { id?: string } | null)?.id === role.id && isRecentEntry(e.createdTimestamp)
    );
    if (!entry?.executor) return;
    const exceeded = recordAction(guild.id, entry.executor.id, "roleDelete");
    if (exceeded) await punish(client, guild, entry.executor.id, "roleDelete");
  } catch (err) {
    console.error(`[anti-nuke] GuildRoleDelete audit fetch failed in guild ${guild.id}:`, err);
  }
});

client.on(Events.GuildBanAdd, async (ban) => {
  const guild = ban.guild;
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: 22, limit: 5 });
    const entry = auditLogs.entries.find(
      (e) =>
        (e.target as { id?: string } | null)?.id === ban.user.id &&
        isRecentEntry(e.createdTimestamp)
    );
    if (!entry?.executor) return;
    if (entry.executor.id === client.user?.id) return;
    const exceeded = recordAction(guild.id, entry.executor.id, "ban");
    if (exceeded) await punish(client, guild, entry.executor.id, "ban");
  } catch (err) {
    console.error(`[anti-nuke] GuildBanAdd audit fetch failed in guild ${guild.id}:`, err);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (!member.guild) return;
  const guild = member.guild;
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: 20, limit: 5 });
    const entry = auditLogs.entries.find(
      (e) =>
        (e.target as { id?: string } | null)?.id === member.id &&
        isRecentEntry(e.createdTimestamp)
    );
    if (!entry?.executor) return;
    if (entry.executor.id === client.user?.id) return;
    const exceeded = recordAction(guild.id, entry.executor.id, "kick");
    if (exceeded) await punish(client, guild, entry.executor.id, "kick");
  } catch (err) {
    console.error(`[anti-nuke] GuildMemberRemove (kick) audit fetch failed in guild ${guild.id}:`, err);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (!member.user.bot) return;
  const guild = member.guild;
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: 28, limit: 5 });
    const entry = auditLogs.entries.find(
      (e) =>
        (e.target as { id?: string } | null)?.id === member.id &&
        isRecentEntry(e.createdTimestamp)
    );
    if (!entry?.executor) return;
    const exceeded = recordAction(guild.id, entry.executor.id, "botAdd");
    if (exceeded) await punish(client, guild, entry.executor.id, "botAdd");
  } catch (err) {
    console.error(`[anti-nuke] BotAdd audit fetch failed in guild ${guild.id}:`, err);
  }
});

client.on(Events.WebhooksUpdate, async (channel) => {
  if (!channel.guild) return;
  const guild = channel.guild;
  try {
    const auditLogs = await guild.fetchAuditLogs({ limit: 5 });
    const entry = auditLogs.entries.find(
      (e) =>
        e.action === AuditLogEvent.WebhookCreate &&
        isRecentEntry(e.createdTimestamp)
    );
    if (!entry?.executor) return;
    const exceeded = recordAction(guild.id, entry.executor.id, "webhookCreate");
    if (exceeded) await punish(client, guild, entry.executor.id, "webhookCreate");
  } catch (err) {
    console.error(`[anti-nuke] WebhooksUpdate audit fetch failed in guild ${guild.id}:`, err);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const handled =
    (await handleWelcomeCommands(message)) ||
    (await handleInviteCommands(message)) ||
    (await handleAntiNukeCommands(message)) ||
    (await handleModerationCommands(message));

  if (!handled && message.content.toLowerCase().startsWith("!help")) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📖 Bot Commands")
      .addFields(
        {
          name: "🎉 Welcome",
          value: [
            "`!setwelcome #channel` — Set welcome channel",
            "`!setwelcomemsg <text>` — Set welcome message",
            "`!setwelcomecolor <#hex>` — Set embed color",
            "`!setwelcomeimage <url>` — Set embed image",
            "`!setlogchannel #channel` — Set anti-nuke log channel",
          ].join("\n"),
        },
        {
          name: "📨 Invites",
          value: [
            "`!invites` — See your invite count",
            "`!leaderboard` — Top inviters",
          ].join("\n"),
        },
        {
          name: "🛡️ Anti-Nuke",
          value: [
            "`!antinuke ON/OFF` — Toggle anti-nuke",
            "`!antinuke status` — View current settings",
            "`!setlimit <action> <number>` — Set threshold",
            "`!addimmune @user/@role` — Grant Level 2 immunity",
            "`!removeimmune @user/@role` — Remove immunity",
            "Actions: `channelCreate` `channelDelete` `roleCreate` `roleDelete` `ban` `kick` `botAdd` `webhookCreate`",
          ].join("\n"),
        },
        {
          name: "🔨 Moderation",
          value: [
            "`!ban @user [reason]` — Ban a user",
            "`!kick @user [reason]` — Kick a user",
            "`!mute @user [duration] [reason]` — Timeout a user (e.g. `10m`, `1h`, `1d`)",
            "`!unmute @user` — Remove a timeout",
            "`!warn @user [reason]` — Warn a user",
            "`!warnings @user` — View warnings for a user",
            "`!clearwarnings @user` — Clear all warnings for a user",
          ].join("\n"),
        }
      )
      .setFooter({ text: "Welcome variables: {user} {server} {inviter} {inviteCount}" })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
});

client.login(token);
