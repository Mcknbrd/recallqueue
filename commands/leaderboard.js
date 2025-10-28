import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from "fs";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("🏆 View or refresh the global leaderboard.")
  .addSubcommand(sub =>
    sub
      .setName("show")
      .setDescription("Show the leaderboard in chat.")
      .addStringOption(opt =>
        opt
          .setName("type")
          .setDescription("Queue type to show (all, 5q, trio)")
          .addChoices(
            { name: "All", value: "all" },
            { name: "5Q", value: "5q" },
            { name: "Trio", value: "trio" }
          )
      )
      .addStringOption(opt =>
        opt
          .setName("sort")
          .setDescription("Sort by matches or winrate")
          .addChoices(
            { name: "Matches Played", value: "matches" },
            { name: "Winrate", value: "winrate" }
          )
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("update")
      .setDescription("🔁 Force refresh the persistent leaderboard embed (admin only).")
  );

export async function execute(interaction, db, updateQueueEmbed, config) {
  const sub = interaction.options.getSubcommand();

  if (sub === "show") {
    const type = interaction.options.getString("type") || "all";
    const sort = interaction.options.getString("sort") || "matches";
    const embed = await buildLeaderboardEmbed(db, type, sort);
    return interaction.reply({ embeds: [embed] });
  }

  if (sub === "update") {
    if (!interaction.member.permissions.has("Administrator")) {
      return interaction.reply({
        content: "❌ Only admins can refresh the persistent leaderboard.",
        ephemeral: true,
      });
    }

    await refreshPersistentLeaderboard(interaction.guild, db, config);
    return interaction.reply({ content: "✅ Leaderboard refreshed!", ephemeral: true });
  }
}

/* ---------------------------------------------------------------------- */
/* 🧱 Helper: build leaderboard embed */
export async function buildLeaderboardEmbed(db, type = "all", sort = "matches") {
  const matches = await db.all("SELECT * FROM matches WHERE result != 'none'");
  if (!matches.length) {
    return new EmbedBuilder()
      .setTitle("🏆 Leaderboard")
      .setDescription("_No matches recorded yet._")
      .setColor("Grey");
  }

  const filtered = type === "all" ? matches : matches.filter(m => m.type === type);
  const stats = {};

  for (const m of filtered) {
    const players = JSON.parse(m.playerIds || "[]");
    for (const pid of players) {
      if (!stats[pid]) stats[pid] = { wins: 0, total: 0 };
      stats[pid].total++;
      if (m.result === "win") stats[pid].wins++;
    }
  }

  const arr = Object.entries(stats).map(([userId, s]) => ({
    userId,
    total: s.total,
    wins: s.wins,
    winrate: s.total ? (s.wins / s.total) * 100 : 0,
  }));

  arr.sort((a, b) =>
    sort === "winrate"
      ? b.winrate - a.winrate || b.total - a.total
      : b.total - a.total || b.winrate - a.winrate
  );

  const top = arr.slice(0, 10);
  const lines = top.map(
    (p, i) =>
      `**#${i + 1}** <@${p.userId}> — ${p.total} games | ${p.wins} wins | ${p.winrate.toFixed(
        1
      )}% WR`
  );

  return new EmbedBuilder()
    .setTitle(`🏆 ${type === "all" ? "Overall" : type.toUpperCase()} Leaderboard`)
    .setDescription(lines.join("\n") || "_No data available._")
    .setColor("Gold")
    .setTimestamp();
}

/* ---------------------------------------------------------------------- */
/* 🧱 Helper: refresh persistent leaderboard */
export async function refreshPersistentLeaderboard(guild, db, config) {
  const embed = await buildLeaderboardEmbed(
    db,
    config.leaderboardType || "all",
    config.leaderboardSort || "matches"
  );

  const channel = guild.channels.cache.get(config.leaderboardChannelId);
  if (!channel) return console.warn("⚠️ Leaderboard channel not found.");

  let msg = null;

  // 🧩 Try to fetch existing leaderboard message
  if (config.leaderboardMessageId) {
    try {
      msg = await channel.messages.fetch(config.leaderboardMessageId);
    } catch {
      msg = null;
    }
  }

  // 🆕 If no existing message, send a new one
  if (!msg) {
    const sent = await channel.send({ embeds: [embed] }).catch(() => null);
    if (!sent) {
      console.warn("⚠️ Failed to send leaderboard embed.");
      return;
    }

    // Save new message ID to config.json
    config.leaderboardMessageId = sent.id;
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
    console.log("✅ Created new persistent leaderboard message.");
    return;
  }

  // ✅ If we found an existing message, update it
  try {
    await msg.edit({ embeds: [embed] });
    console.log("✅ Updated existing leaderboard message.");
  } catch (err) {
    console.error("❌ Failed to update leaderboard:", err);
  }
}
