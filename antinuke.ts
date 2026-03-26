import type { Message } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { setAntiNuke, setAntiNukeLimit, getGuild, addImmuneUser, removeImmuneUser, addImmuneRole, removeImmuneRole } from "../config.js";
import type { AntiNukeLimits } from "../config.js";

const VALID_ACTIONS: (keyof AntiNukeLimits)[] = [
  "channelCreate",
  "channelDelete",
  "roleCreate",
  "roleDelete",
  "ban",
  "kick",
  "botAdd",
  "webhookCreate",
];

export async function handleAntiNukeCommands(message: Message): Promise<boolean> {
  if (!message.guild || !message.member) return false;

  const { content, guild, member } = message;
  const lower = content.toLowerCase().trim();

  if (!member.permissions.has("ManageGuild") && !member.permissions.has("Administrator")) {
    return false;
  }

  if (lower === "!antinuke on") {
    setAntiNuke(guild.id, true);
    await message.reply("✅ Anti-nuke is now **enabled** for this server.");
    return true;
  }

  if (lower === "!antinuke off") {
    setAntiNuke(guild.id, false);
    await message.reply("⛔ Anti-nuke is now **disabled** for this server.");
    return true;
  }

  if (lower === "!antinuke status") {
    const cfg = getGuild(guild.id);
    const status = cfg.antiNuke.enabled ? "✅ Enabled" : "⛔ Disabled";
    const limitsText = VALID_ACTIONS.map((a) => {
      const val = cfg.antiNuke.limits[a];
      return `\`${a}\`: ${val ?? "not set"}`;
    }).join("\n");

    const immuneUsersText = cfg.antiNuke.immuneUsers.length
      ? cfg.antiNuke.immuneUsers.map((id) => `<@${id}>`).join(", ")
      : "None";
    const immuneRolesText = cfg.antiNuke.immuneRoles.length
      ? cfg.antiNuke.immuneRoles.map((id) => `<@&${id}>`).join(", ")
      : "None";

    const embed = new EmbedBuilder()
      .setColor(cfg.antiNuke.enabled ? 0x57f287 : 0xed4245)
      .setTitle("🛡️ Anti-Nuke Status")
      .addFields(
        { name: "Status", value: status, inline: false },
        { name: "Limits (per 10 seconds)", value: limitsText, inline: false },
        { name: "Immune Users (Level 2)", value: immuneUsersText, inline: true },
        { name: "Immune Roles (Level 2)", value: immuneRolesText, inline: true }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return true;
  }

  if (lower.startsWith("!antinuke")) {
    await message.reply(
      "Usage: `!antinuke ON`, `!antinuke OFF`, or `!antinuke status`"
    );
    return true;
  }

  if (lower.startsWith("!setlimit")) {
    const parts = content.trim().split(/\s+/);
    if (parts.length !== 3) {
      await message.reply(
        `Usage: \`!setlimit <action> <number>\`\nValid actions: ${VALID_ACTIONS.join(", ")}`
      );
      return true;
    }

    const action = parts[1] as keyof AntiNukeLimits;
    const limitStr = parts[2];

    if (!VALID_ACTIONS.includes(action)) {
      await message.reply(`Invalid action. Valid actions: ${VALID_ACTIONS.join(", ")}`);
      return true;
    }

    const limit = parseInt(limitStr ?? "", 10);
    if (isNaN(limit) || limit < 1) {
      await message.reply("Limit must be a positive number.");
      return true;
    }

    setAntiNukeLimit(guild.id, action, limit);
    await message.reply(`✅ Anti-nuke limit for \`${action}\` set to **${limit}** per 10 seconds.`);
    return true;
  }

  if (lower.startsWith("!addimmune")) {
    const mentionedUser = message.mentions.users.first();
    const mentionedRole = message.mentions.roles.first();

    if (mentionedUser) {
      addImmuneUser(guild.id, mentionedUser.id);
      await message.reply(`✅ <@${mentionedUser.id}> is now **Level 2 immune** and will not be punished by anti-nuke.`);
    } else if (mentionedRole) {
      addImmuneRole(guild.id, mentionedRole.id);
      await message.reply(`✅ <@&${mentionedRole.id}> is now **Level 2 immune** — members with this role will not be punished by anti-nuke.`);
    } else {
      await message.reply("Usage: `!addimmune @user` or `!addimmune @role`");
    }
    return true;
  }

  if (lower.startsWith("!removeimmune")) {
    const mentionedUser = message.mentions.users.first();
    const mentionedRole = message.mentions.roles.first();

    if (mentionedUser) {
      removeImmuneUser(guild.id, mentionedUser.id);
      await message.reply(`✅ <@${mentionedUser.id}> is no longer immune from anti-nuke.`);
    } else if (mentionedRole) {
      removeImmuneRole(guild.id, mentionedRole.id);
      await message.reply(`✅ <@&${mentionedRole.id}> is no longer immune from anti-nuke.`);
    } else {
      await message.reply("Usage: `!removeimmune @user` or `!removeimmune @role`");
    }
    return true;
  }

  return false;
}
