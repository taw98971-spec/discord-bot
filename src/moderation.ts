import type { Message } from "discord.js";
import { EmbedBuilder, PermissionsBitField } from "discord.js";
import { addWarning, getWarnings, clearWarnings } from "../config.js";

function parseDuration(str: string): number | null {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const amount = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * (multipliers[unit] ?? 0);
}

function successEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function errorEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("❌ Error")
    .setDescription(description)
    .setTimestamp();
}

export async function handleModerationCommands(message: Message): Promise<boolean> {
  if (!message.guild || !message.member) return false;

  const { content, guild, member, author } = message;
  const lower = content.toLowerCase().trim();

  if (lower.startsWith("!ban")) {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      try {
        await message.reply({ embeds: [errorEmbed("You need the **Ban Members** permission to use this command.")] });
      } catch (err) {
        console.error(`[mod] Failed to reply to !ban permission check:`, err);
      }
      return true;
    }

    const target = message.mentions.members?.first();
    if (!target) {
      await message.reply({ embeds: [errorEmbed("Please mention a user to ban: `!ban @user [reason]`")] });
      return true;
    }

    if (!target.bannable) {
      await message.reply({ embeds: [errorEmbed("I cannot ban that user. They may have a higher role than me.")] });
      return true;
    }

    const reason = content.slice(content.indexOf(target.toString()) + target.toString().length).trim() || "No reason provided";

    try {
      await target.send({ embeds: [errorEmbed(`You have been **banned** from **${guild.name}**.\nReason: ${reason}`)] }).catch(() => null);
      await target.ban({ reason: `${author.tag}: ${reason}` });
      await message.reply({ embeds: [successEmbed("🔨 User Banned", `<@${target.id}> has been banned.\nReason: ${reason}`)] });
    } catch (err) {
      console.error(`[mod] Ban failed in guild ${guild.id}:`, err);
      await message.reply({ embeds: [errorEmbed("Failed to ban that user.")] });
    }
    return true;
  }

  if (lower.startsWith("!kick")) {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      try {
        await message.reply({ embeds: [errorEmbed("You need the **Kick Members** permission to use this command.")] });
      } catch (err) {
        console.error(`[mod] Failed to reply to !kick permission check:`, err);
      }
      return true;
    }

    const target = message.mentions.members?.first();
    if (!target) {
      await message.reply({ embeds: [errorEmbed("Please mention a user to kick: `!kick @user [reason]`")] });
      return true;
    }

    if (!target.kickable) {
      await message.reply({ embeds: [errorEmbed("I cannot kick that user. They may have a higher role than me.")] });
      return true;
    }

    const reason = content.slice(content.indexOf(target.toString()) + target.toString().length).trim() || "No reason provided";

    try {
      await target.send({ embeds: [errorEmbed(`You have been **kicked** from **${guild.name}**.\nReason: ${reason}`)] }).catch(() => null);
      await target.kick(`${author.tag}: ${reason}`);
      await message.reply({ embeds: [successEmbed("👢 User Kicked", `<@${target.id}> has been kicked.\nReason: ${reason}`)] });
    } catch (err) {
      console.error(`[mod] Kick failed in guild ${guild.id}:`, err);
      await message.reply({ embeds: [errorEmbed("Failed to kick that user.")] });
    }
    return true;
  }

  if (lower.startsWith("!unmute")) {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      try {
        await message.reply({ embeds: [errorEmbed("You need the **Timeout Members** permission to use this command.")] });
      } catch (err) {
        console.error(`[mod] Failed to reply to !unmute permission check:`, err);
      }
      return true;
    }

    const target = message.mentions.members?.first();
    if (!target) {
      await message.reply({ embeds: [errorEmbed("Please mention a user to unmute: `!unmute @user`")] });
      return true;
    }

    try {
      await target.timeout(null);
      await message.reply({ embeds: [successEmbed("🔊 User Unmuted", `<@${target.id}> has been unmuted.`)] });
    } catch (err) {
      console.error(`[mod] Unmute failed in guild ${guild.id}:`, err);
      await message.reply({ embeds: [errorEmbed("Failed to unmute that user.")] });
    }
    return true;
  }

  if (lower.startsWith("!mute")) {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      try {
        await message.reply({ embeds: [errorEmbed("You need the **Timeout Members** permission to use this command.")] });
      } catch (err) {
        console.error(`[mod] Failed to reply to !mute permission check:`, err);
      }
      return true;
    }

    const target = message.mentions.members?.first();
    if (!target) {
      await message.reply({ embeds: [errorEmbed("Please mention a user to mute: `!mute @user [duration] [reason]`\nDuration examples: `10m`, `1h`, `1d`")] });
      return true;
    }

    if (!target.moderatable) {
      await message.reply({ embeds: [errorEmbed("I cannot mute that user. They may have a higher role than me.")] });
      return true;
    }

    const afterMention = content.slice(content.indexOf(target.toString()) + target.toString().length).trim();
    const parts = afterMention.split(/\s+/);
    let durationMs = 10 * 60_000;
    let reason = "No reason provided";

    if (parts[0]) {
      const parsed = parseDuration(parts[0]);
      if (parsed !== null) {
        durationMs = parsed;
        reason = parts.slice(1).join(" ") || "No reason provided";
      } else {
        reason = afterMention;
      }
    }

    const maxMs = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > maxMs) {
      await message.reply({ embeds: [errorEmbed("Maximum mute duration is 28 days.")] });
      return true;
    }

    const durationLabel = durationMs < 60_000
      ? `${durationMs / 1000}s`
      : durationMs < 3_600_000
      ? `${durationMs / 60_000}m`
      : durationMs < 86_400_000
      ? `${durationMs / 3_600_000}h`
      : `${durationMs / 86_400_000}d`;

    try {
      await target.timeout(durationMs, `${author.tag}: ${reason}`);
      await message.reply({ embeds: [successEmbed("🔇 User Muted", `<@${target.id}> has been muted for **${durationLabel}**.\nReason: ${reason}`)] });
    } catch (err) {
      console.error(`[mod] Mute failed in guild ${guild.id}:`, err);
      await message.reply({ embeds: [errorEmbed("Failed to mute that user.")] });
    }
    return true;
  }

  if (lower.startsWith("!clearwarnings")) {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      try {
        await message.reply({ embeds: [errorEmbed("You need the **Timeout Members** permission to use this command.")] });
      } catch (err) {
        console.error(`[mod] Failed to reply to !clearwarnings permission check:`, err);
      }
      return true;
    }

    const target = message.mentions.users.first();
    if (!target) {
      await message.reply({ embeds: [errorEmbed("Please mention a user: `!clearwarnings @user`")] });
      return true;
    }

    clearWarnings(guild.id, target.id);
    await message.reply({ embeds: [successEmbed("🗑️ Warnings Cleared", `All warnings for <@${target.id}> have been cleared.`)] });
    return true;
  }

  if (lower.startsWith("!warnings")) {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      try {
        await message.reply({ embeds: [errorEmbed("You need the **Timeout Members** permission to use this command.")] });
      } catch (err) {
        console.error(`[mod] Failed to reply to !warnings permission check:`, err);
      }
      return true;
    }

    const target = message.mentions.users.first();
    if (!target) {
      await message.reply({ embeds: [errorEmbed("Please mention a user: `!warnings @user`")] });
      return true;
    }

    const warns = getWarnings(guild.id, target.id);
    if (warns.length === 0) {
      await message.reply({ embeds: [successEmbed(`⚠️ Warnings for ${target.tag}`, "This user has no warnings.")] });
      return true;
    }

    const list = warns
      .map((w, i) => `**${i + 1}.** ${w.reason} — by <@${w.moderatorId}> <t:${Math.floor(w.timestamp / 1000)}:R>`)
      .join("\n");

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle(`⚠️ Warnings for ${target.tag}`)
          .setDescription(list)
          .setFooter({ text: `Total: ${warns.length} warning${warns.length === 1 ? "" : "s"}` })
          .setTimestamp(),
      ],
    });
    return true;
  }

  if (lower.startsWith("!warn")) {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      try {
        await message.reply({ embeds: [errorEmbed("You need the **Timeout Members** permission to use this command.")] });
      } catch (err) {
        console.error(`[mod] Failed to reply to !warn permission check:`, err);
      }
      return true;
    }

    const target = message.mentions.users.first();
    if (!target) {
      await message.reply({ embeds: [errorEmbed("Please mention a user to warn: `!warn @user [reason]`")] });
      return true;
    }

    const targetMention = message.mentions.members?.first()?.toString() ?? `<@${target.id}>`;
    const reason = content.slice(content.indexOf(targetMention) + targetMention.length).trim() || "No reason provided";

    const allWarns = addWarning(guild.id, target.id, {
      reason,
      moderatorId: author.id,
      timestamp: Date.now(),
    });

    const targetMember = message.mentions.members?.first();
    if (targetMember) {
      await targetMember.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle(`⚠️ Warning in ${guild.name}`)
            .setDescription(`You have received a warning.\nReason: ${reason}`)
            .setFooter({ text: `You now have ${allWarns.length} warning${allWarns.length === 1 ? "" : "s"}.` })
            .setTimestamp(),
        ],
      }).catch(() => null);
    }

    await message.reply({
      embeds: [
        successEmbed(
          "⚠️ User Warned",
          `<@${target.id}> has been warned.\nReason: ${reason}\nTotal warnings: **${allWarns.length}**`
        ),
      ],
    });
    return true;
  }

  return false;
}
