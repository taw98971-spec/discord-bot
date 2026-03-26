import type { Message } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getInvites } from "../config.js";

export async function handleInviteCommands(message: Message): Promise<boolean> {
  if (!message.guild || !message.member) return false;

  const { content, guild } = message;
  const lower = content.toLowerCase().trim();

  if (lower === "!invites") {
    const invites = getInvites(guild.id);
    const count = invites[message.author.id] ?? 0;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Your Invites")
      .setDescription(`You have **${count}** invite(s) in **${guild.name}**.`)
      .setThumbnail(message.author.displayAvatarURL())
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return true;
  }

  if (lower === "!leaderboard") {
    const invites = getInvites(guild.id);

    const sorted = Object.entries(invites)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (sorted.length === 0) {
      await message.reply("No invite data yet for this server.");
      return true;
    }

    const lines = sorted.map(([userId, count], i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
      return `${medal} <@${userId}> — **${count}** invite(s)`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`🏆 Invite Leaderboard — ${guild.name}`)
      .setDescription(lines.join("\n"))
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return true;
  }

  return false;
}
