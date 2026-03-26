import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface GuildInvites {
  [inviterId: string]: number;
}

export interface AntiNukeLimits {
  channelCreate?: number;
  channelDelete?: number;
  roleCreate?: number;
  roleDelete?: number;
  ban?: number;
  kick?: number;
  botAdd?: number;
  webhookCreate?: number;
}

export interface Warning {
  reason: string;
  moderatorId: string;
  timestamp: number;
}

export interface GuildConfig {
  welcomeChannel: string;
  welcomeMessage: string;
  welcomeEnabled: boolean;
  welcomeColor: string;
  welcomeImage: string;
  logChannel: string;
  invites: GuildInvites;
  warnings: { [userId: string]: Warning[] };
  antiNuke: {
    enabled: boolean;
    limits: AntiNukeLimits;
    immuneUsers: string[];
    immuneRoles: string[];
  };
}

export interface GuildsData {
  [guildId: string]: GuildConfig;
}

const DATA_PATH = join(process.cwd(), "guilds.json");

function defaultGuild(): GuildConfig {
  return {
    welcomeChannel: "",
    welcomeMessage: "Welcome {user} to **{server}**! You were invited by **{inviter}** (invite #{inviteCount}).",
    welcomeEnabled: true,
    welcomeColor: "#5865F2",
    welcomeImage: "",
    logChannel: "",
    invites: {},
    warnings: {},
    antiNuke: {
      enabled: true,
      limits: {
        channelCreate: 5,
        channelDelete: 3,
        roleCreate: 5,
        roleDelete: 3,
        ban: 3,
        kick: 5,
        botAdd: 1,
        webhookCreate: 5,
      },
      immuneUsers: [],
      immuneRoles: [],
    },
  };
}

function load(): GuildsData {
  if (!existsSync(DATA_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DATA_PATH, "utf-8")) as GuildsData;
  } catch {
    return {};
  }
}

function save(data: GuildsData): void {
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function getGuild(guildId: string): GuildConfig {
  const data = load();
  if (!data[guildId]) {
    data[guildId] = defaultGuild();
    save(data);
  }
  return data[guildId] as GuildConfig;
}

export function updateGuild(guildId: string, partial: Partial<GuildConfig>): GuildConfig {
  const data = load();
  if (!data[guildId]) {
    data[guildId] = defaultGuild();
  }
  data[guildId] = { ...data[guildId], ...partial } as GuildConfig;
  save(data);
  return data[guildId] as GuildConfig;
}

export function setAntiNuke(guildId: string, enabled: boolean): void {
  const data = load();
  if (!data[guildId]) data[guildId] = defaultGuild();
  data[guildId]!.antiNuke.enabled = enabled;
  save(data);
}

export function setAntiNukeLimit(guildId: string, action: keyof AntiNukeLimits, limit: number): void {
  const data = load();
  if (!data[guildId]) data[guildId] = defaultGuild();
  data[guildId]!.antiNuke.limits[action] = limit;
  save(data);
}

export function addImmuneUser(guildId: string, userId: string): void {
  const data = load();
  if (!data[guildId]) data[guildId] = defaultGuild();
  const users = data[guildId]!.antiNuke.immuneUsers;
  if (!users.includes(userId)) users.push(userId);
  save(data);
}

export function removeImmuneUser(guildId: string, userId: string): void {
  const data = load();
  if (!data[guildId]) data[guildId] = defaultGuild();
  data[guildId]!.antiNuke.immuneUsers = data[guildId]!.antiNuke.immuneUsers.filter((id) => id !== userId);
  save(data);
}

export function addImmuneRole(guildId: string, roleId: string): void {
  const data = load();
  if (!data[guildId]) data[guildId] = defaultGuild();
  const roles = data[guildId]!.antiNuke.immuneRoles;
  if (!roles.includes(roleId)) roles.push(roleId);
  save(data);
}

export function removeImmuneRole(guildId: string, roleId: string): void {
  const data = load();
  if (!data[guildId]) data[guildId] = defaultGuild();
  data[guildId]!.antiNuke.immuneRoles = data[guildId]!.antiNuke.immuneRoles.filter((id) => id !== roleId);
  save(data);
}

export function isImmune(guildId: string, userId: string, memberRoleIds: string[]): boolean {
  const cfg = getGuild(guildId);
  if (cfg.antiNuke.immuneUsers.includes(userId)) return true;
  return memberRoleIds.some((rid) => cfg.antiNuke.immuneRoles.includes(rid));
}

export function addInviteCredit(guildId: string, inviterId: string, count = 1): void {
  const data = load();
  if (!data[guildId]) data[guildId] = defaultGuild();
  const current = data[guildId]!.invites[inviterId] ?? 0;
  data[guildId]!.invites[inviterId] = current + count;
  save(data);
}

export function getInvites(guildId: string): GuildInvites {
  return getGuild(guildId).invites;
}

export function addWarning(guildId: string, userId: string, warning: Warning): Warning[] {
  const data = load();
  if (!data[guildId]) data[guildId] = defaultGuild();
  const guild = data[guildId]!;
  if (!guild.warnings) guild.warnings = {};
  if (!guild.warnings[userId]) guild.warnings[userId] = [];
  guild.warnings[userId].push(warning);
  save(data);
  return guild.warnings[userId];
}

export function getWarnings(guildId: string, userId: string): Warning[] {
  const guild = getGuild(guildId);
  return guild.warnings?.[userId] ?? [];
}

export function clearWarnings(guildId: string, userId: string): void {
  const data = load();
  if (!data[guildId]) data[guildId] = defaultGuild();
  const guild = data[guildId]!;
  if (guild.warnings) delete guild.warnings[userId];
  save(data);
}
