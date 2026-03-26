import type { Message } from "discord.js";
import { ChannelType } from "discord.js";
import { updateGuild } from "../config.js";

export async function handleWelcomeCommands(message: Message): Promise<boolean> {
  if (!message.guild || !message.member) return false;

  const { content, guild, member } = message;
  const lower = content.toLowerCase().trim();

  if (!member.permissions.has("ManageGuild") && !member.permissions.has("Administrator")) {
    return false;
  }

  if (lower.startsWith("!setwelcomemsg")) {
    const text = content.slice("!setwelcomemsg".length).trim();
    if (!text) {
      await message.reply(
        "Usage: `!setwelcomemsg <message>`\nVariables: `{user}` `{server}` `{inviter}` `{inviteCount}`"
      );
      return true;
    }
    updateGuild(guild.id, { welcomeMessage: text });
    await message.reply("Welcome message updated!");
    return true;
  }

  if (lower.startsWith("!setwelcomecolor")) {
    const hex = content.slice("!setwelcomecolor".length).trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      await message.reply("Usage: `!setwelcomecolor #5865F2` (6-digit hex color)");
      return true;
    }
    const normalized = hex.startsWith("#") ? hex : `#${hex}`;
    updateGuild(guild.id, { welcomeColor: normalized });
    await message.reply(`Welcome embed color set to **${normalized}**`);
    return true;
  }

  if (lower.startsWith("!setwelcomeimage")) {
    const url = content.slice("!setwelcomeimage".length).trim();
    updateGuild(guild.id, { welcomeImage: url });
    if (url) {
      await message.reply("Welcome image updated!");
    } else {
      await message.reply("Welcome image cleared.");
    }
    return true;
  }

  if (lower.startsWith("!setwelcome ") || lower === "!setwelcome") {
    const channel = message.mentions.channels.first();
    if (!channel) {
      await message.reply("Please mention a channel: `!setwelcome #channel`");
      return true;
    }
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      await message.reply("Please mention a text channel (not a voice, forum, or other channel type).");
      return true;
    }
    updateGuild(guild.id, { welcomeChannel: channel.id });
    await message.reply(`Welcome channel set to <#${channel.id}>`);
    return true;
  }

  if (lower.startsWith("!setlogchannel")) {
    const channel = message.mentions.channels.first();
    if (!channel) {
      await message.reply("Please mention a channel: `!setlogchannel #channel`");
      return true;
    }
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      await message.reply("Please mention a text channel (not a voice, forum, or other channel type).");
      return true;
    }
    updateGuild(guild.id, { logChannel: channel.id });
    await message.reply(`Anti-nuke log channel set to <#${channel.id}>`);
    return true;
  }

  return false;
}
