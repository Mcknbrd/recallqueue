// index.js
import { refreshPersistentLeaderboard } from "./commands/leaderboard.js";
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import fs from "fs";
import dotenv from "dotenv";
import { initDB } from "./database.js";

dotenv.config();

const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const ADMIN_ROLE_ID = "1431709088063950888";
const RANKED_LOBBY_ID = "1431586879140003938";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

/* expose config on client for other modules (reload command uses client.config) */
client.config = config;

/* ------------------------------------------------------------ */
/* Command registration */
const commands = [];
client.commands = new Map();
const commandFiles = fs.readdirSync("./commands").filter((f) => f.endsWith(".js"));
for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);
  if (!command.data || !command.execute) continue;
  commands.push(command.data.toJSON());
  client.commands.set(command.data.name, command);
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands }
);

/* ------------------------------------------------------------ */
/* Database */
const db = await initDB();
await db.run("DELETE FROM matches WHERE logMessageId IS NULL OR logMessageId = '';");
console.log("🧹 Cleaned up old matches without logMessageId.");

/* ------------------------------------------------------------ */
/* Update Queue Embed + Countdown Footer */
let updatingEmbed = false;
let queueCountdown = null;

async function updateQueueEmbed(guild, footerText = null) {
  if (updatingEmbed) return;
  updatingEmbed = true;
  try {
    const channel = guild.channels.cache.get(config.configMessageChannelId);
    if (!channel) return;

    const members = await db.all("SELECT userId FROM queue ORDER BY joinedAt ASC");
    const queueSize = config.queueSize || 5;
    const fiveStackVCs =
      config.targetVoiceChannelIds?.map((id) => `<#${id}>`).join(", ") || "_None_";
    const trioVCs =
      config.trioVoiceChannelIds?.map((id) => `<#${id}>`).join(", ") || "_None_";

    const embed = new EmbedBuilder()
      .setTitle("🎮 Ranked Queue")
      .setDescription(
        `Pulling members from <#${config.queueVoiceChannelId}> →\n\n` +
          `**5Q Channels:** ${fiveStackVCs}\n` +
          `**Trio Channels:** ${trioVCs}`
      )
      .addFields({
        name: `Queue (${members.length}/${queueSize})`,
        value:
          members.length > 0
            ? members.map((m, i) => `${i + 1}. <@${m.userId}>`).join("\n")
            : "_No one in queue._",
      })
      .setColor("Blue");

    if (footerText) embed.setFooter({ text: footerText });

    let msg;
    try {
      msg = await channel.messages.fetch(config.configMessageId);
    } catch {
      msg = await channel.send({ embeds: [embed] });
      config.configMessageId = msg.id;
      fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
      client.config = config;
    }
    await msg.edit({ embeds: [embed] });
  } catch (err) {
    console.error("updateQueueEmbed error:", err);
  } finally {
    updatingEmbed = false;
  }
}

/* ------------------------------------------------------------ */
/* Helper: schedule message deletion */
function scheduleDeletion(guild, channelId, messageId, minutes) {
  const delay = (minutes || 5) * 60_000;
  setTimeout(async () => {
    try {
      const ch = guild.channels.cache.get(channelId);
      if (!ch) return;
      const msg = await ch.messages.fetch(messageId).catch(() => null);
      if (msg) {
        await msg.delete().catch(() => {});
        console.log(`🗑️ Deleted match result embed ${messageId}`);
      }
    } catch (err) {
      console.error("scheduleDeletion error:", err);
    }
  }, delay);
}

/* ------------------------------------------------------------ */
/* Interaction Handling */
client.on("interactionCreate", async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(client, interaction, db, updateQueueEmbed, config);
      return;
    }

    /* 🏁 Finish Match */
    if (interaction.isButton() && interaction.customId.startsWith("finish_match_")) {
      await interaction.deferReply({ ephemeral: true });

      // parse match id
      const matchId = interaction.customId.split("_").slice(2).join("_");
      const match = config.activeMatches?.[matchId];
      if (!match) return interaction.editReply("⚠️ No active match found.");

      // mark pending result and update embed to show result buttons ONLY
      match.pendingResult = true;
      fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
      client.config = config;

      // Try to fetch original match message (if exists) to edit it
      const guild = interaction.guild;
      const msg = await interaction.channel.messages.fetch(match.messageId).catch(() => null);

      const finishedEmbed = msg
        ? EmbedBuilder.from(msg.embeds[0]).setTitle("🏁 Match Finished — Choose Result").setColor("Grey")
        : new EmbedBuilder()
            .setTitle("🏁 Match Finished — Choose Result")
            .setDescription(`**Players (${match.players.length})**\n> ${match.names}`)
            .setColor("Grey");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`result_win_${matchId}`)
          .setLabel("✅ Win")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`result_loss_${matchId}`)
          .setLabel("❌ Loss")
          .setStyle(ButtonStyle.Danger)
      );

      if (msg) {
        await msg.edit({ embeds: [finishedEmbed], components: [row] }).catch(() => {});
      } else {
        // fallback: post a message in the same channel for selection
        const posted = await interaction.channel.send({ embeds: [finishedEmbed], components: [row] }).catch(() => null);
        if (posted) {
          // save message id so logs & history link works
          match.messageId = posted.id;
          fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
          client.config = config;
        }
      }

      await interaction.editReply("🏁 Match marked finished — waiting for result selection.");
      return;
    }

    /* ✅❌ Result Buttons */
    if (interaction.isButton() && interaction.customId.startsWith("result_")) {
      await interaction.deferReply({ ephemeral: true });

      const parts = interaction.customId.split("_");
      const result = parts[1]; // "win" or "loss"
      const matchId = parts.slice(2).join("_");
      const match = config.activeMatches?.[matchId];
      if (!match) return interaction.editReply("⚠️ No active match found.");

      const guild = interaction.guild;

      // Ensure this was a pending result; if not, warn and require admin confirm
      if (!match.pendingResult) {
        // If somehow a result button was pressed without pending flag, ignore to prevent race conditions
        return interaction.editReply("⚠️ This match is not marked pending result. Use Finish Match first.");
      }

      // Move everyone back to lobby (ranked queue voice channel)
      for (const pid of match.players) {
        const member = guild.members.cache.get(pid);
        if (member && member.voice && member.voice.channelId && member.voice.channelId !== RANKED_LOBBY_ID) {
          try {
            await member.voice.setChannel(RANKED_LOBBY_ID);
          } catch (err) {
            // ignore move errors per-user
          }
        }
      }

      // Edit the match message (if exists) to show final result
      const msg = await (async () => {
        try {
          return await interaction.channel.messages.fetch(match.messageId);
        } catch {
          // try match.channelId if provided
          try {
            const ch = guild.channels.cache.get(match.channelId);
            if (!ch) return null;
            return await ch.messages.fetch(match.messageId).catch(() => null);
          } catch {
            return null;
          }
        }
      })();

      const resultText = result === "win" ? "✅ **Win**" : "❌ **Loss**";
      if (msg) {
        const finishedEmbed = EmbedBuilder.from(msg.embeds[0])
          .setTitle(`🏆 Match Result: ${resultText}`)
          .setColor(result === "win" ? "Green" : "Red");
        await msg.edit({ embeds: [finishedEmbed], components: [] }).catch(() => {});
      }

      // Log channel: send a persistent match log and capture its ID
      const logChannel = guild.channels.cache.get(config.matchHistoryChannelId);
      let logMsgId = null;
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle(`🎯 ${match.type.toUpperCase()} Match Result`)
          .setDescription(`${resultText}\n\n**Players (${match.players.length})**\n> ${match.names}`)
          .setColor(result === "win" ? "Green" : "Red")
          .setTimestamp();
        try {
          const logMsg = await logChannel.send({ embeds: [logEmbed] });
          logMsgId = logMsg.id;
        } catch (err) {
          console.warn("Could not send log message to match history channel:", err);
        }
      }

      // Insert match into DB
      try {
        await db.run(
          `INSERT INTO matches (type, playerIds, result, startedAt, finishedAt, logMessageId)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [match.type, JSON.stringify(match.players), result, match.startedAt, Date.now(), logMsgId]
        );
      } catch (err) {
        console.error("Failed to insert match into DB:", err);
      }

      // Auto-requeue players silently: insert or replace into queue with current timestamp
      try {
        for (const pid of match.players) {
          await db.run("INSERT OR REPLACE INTO queue (userId, joinedAt) VALUES (?, ?)", [
            pid,
            Date.now(),
          ]);
        }
      } catch (err) {
        console.error("Failed to auto-requeue players:", err);
      }

      // Refresh persistent leaderboard
      try {
        await refreshPersistentLeaderboard(guild, db, config);
      } catch (e) {
        console.warn("⚠️ Could not refresh leaderboard:", e?.message || e);
      }

      // Refresh queue embed to reflect auto-requeued users
      try {
        await updateQueueEmbed(guild);
      } catch (e) {
        console.warn("Could not update queue embed after result:", e);
      }

      // Schedule deletion of the temporary match message (if we used one) after configured delay
      if (msg && config.matchDeleteDelayMinutes) {
        scheduleDeletion(guild, msg.channel.id, msg.id, config.matchDeleteDelayMinutes);
      }

      // Remove match from activeMatches
      delete config.activeMatches[matchId];
      fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
      client.config = config;

      await interaction.editReply(`✅ Match result recorded as ${result.toUpperCase()}.`);
      return;
    }

    /* ------------------------------------------------------------ */
    /* ----------------- Admin Config Panel Handling --------------- */
    /* Only allow admins to interact with these buttons/modals */
    if (interaction.isButton()) {
      // Buttons for config panel are expected to be used by admins only
      if (!interaction.member.permissions.has("Administrator")) {
        return interaction.reply({ content: "❌ Admins only.", ephemeral: true });
      }

      // Change Queue Size -> opens modal
      if (interaction.customId === "config_size") {
        const modal = new ModalBuilder().setCustomId("modal_config_size").setTitle("Change Queue Size");

        const input = new TextInputBuilder()
          .setCustomId("new_size")
          .setLabel("Enter new queue size (e.g. 5)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      // Edit Allowed Roles -> opens modal to input comma-separated role IDs
      if (interaction.customId === "config_roles") {
        const modal = new ModalBuilder().setCustomId("modal_config_roles").setTitle("Edit Allowed Roles");

        const input = new TextInputBuilder()
          .setCustomId("new_roles")
          .setLabel("Enter Role IDs separated by commas")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      // Edit Voice Channels -> opens modal with two fields (5Q and Trio)
      if (interaction.customId === "config_channels") {
        const modal = new ModalBuilder().setCustomId("modal_config_channels").setTitle("Edit Voice Channels (5Q & Trio)");

        const fiveInput = new TextInputBuilder()
          .setCustomId("new_five_channels")
          .setLabel("5Q Channel IDs (comma-separated)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);

        const trioInput = new TextInputBuilder()
          .setCustomId("new_trio_channels")
          .setLabel("Trio Channel IDs (comma-separated)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(fiveInput));
        modal.addComponents(new ActionRowBuilder().addComponents(trioInput));
        return interaction.showModal(modal);
      }

      // Reset Queue
      if (interaction.customId === "config_reset") {
        await db.run("DELETE FROM queue;");
        config.activeMatches = {};
        fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
        client.config = config;
        await updateQueueEmbed(interaction.guild);
        const embed = new EmbedBuilder()
          .setTitle("⚙️ Queue Reset")
          .setDescription("✅ The queue has been cleared and active matches reset.")
          .setColor("Green")
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    /* Modal submissions for config changes */
    if (interaction.isModalSubmit()) {
      // Only admins
      if (!interaction.member.permissions.has("Administrator")) {
        return interaction.reply({ content: "❌ Admins only.", ephemeral: true });
      }

      // Queue Size
      if (interaction.customId === "modal_config_size") {
        const newSizeRaw = interaction.fields.getTextInputValue("new_size");
        const newSize = parseInt(newSizeRaw, 10);
        if (isNaN(newSize) || newSize < 2) {
          const errEmbed = new EmbedBuilder()
            .setTitle("⚠️ Invalid Queue Size")
            .setDescription("Please provide a valid number (minimum 2).")
            .setColor("Red");
          return interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }
        config.queueSize = newSize;
        fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
        client.config = config;
        await updateQueueEmbed(interaction.guild);

        const okEmbed = new EmbedBuilder()
          .setTitle("⚙️ Queue Size Updated")
          .setDescription(`✅ Queue size updated to **${newSize}**.`)
          .setColor("Green")
          .setTimestamp();
        return interaction.reply({ embeds: [okEmbed], ephemeral: true });
      }

      // Allowed Roles
      if (interaction.customId === "modal_config_roles") {
        const roleInput = interaction.fields.getTextInputValue("new_roles");
        const ids = roleInput
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean);

        // Basic validation: ensure each id is numeric-ish
        const invalid = ids.find((i) => !/^\d{16,19}$/.test(i));
        if (invalid && invalid !== undefined) {
          const errEmbed = new EmbedBuilder()
            .setTitle("⚠️ Invalid Role ID")
            .setDescription(`"${invalid}" doesn't look like a valid role ID.`)
            .setColor("Red");
          return interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }

        config.allowedRoleIds = ids;
        fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
        client.config = config;

        const okEmbed = new EmbedBuilder()
          .setTitle("⚙️ Allowed Roles Updated")
          .setDescription(
            `✅ Allowed roles updated to: ${ids.length ? ids.map((r) => `<@&${r}>`).join(", ") : "*(none)*"}`
          )
          .setColor("Green")
          .setTimestamp();
        return interaction.reply({ embeds: [okEmbed], ephemeral: true });
      }

      // Voice Channels modal (two fields)
      if (interaction.customId === "modal_config_channels") {
        const fiveInput = interaction.fields.getTextInputValue("new_five_channels") || "";
        const trioInput = interaction.fields.getTextInputValue("new_trio_channels") || "";

        const fiveIds = fiveInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const trioIds = trioInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        // Validate IDs (basic length check)
        const allIds = [...fiveIds, ...trioIds];
        const invalid = allIds.find((i) => !/^\d{16,19}$/.test(i));
        if (invalid && invalid !== undefined) {
          const errEmbed = new EmbedBuilder()
            .setTitle("⚠️ Invalid Channel ID")
            .setDescription(`"${invalid}" doesn't look like a valid channel ID.`)
            .setColor("Red");
          return interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }

        // Require at least one channel total
        if (fiveIds.length === 0 && trioIds.length === 0) {
          const errEmbed = new EmbedBuilder()
            .setTitle("⚠️ No Channels Provided")
            .setDescription("You must specify **at least one 5Q or Trio voice channel ID**.")
            .setColor("Red")
            .setTimestamp();
          return interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }

        // Apply changes
        config.targetVoiceChannelIds = fiveIds;
        config.trioVoiceChannelIds = trioIds;

        fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
        client.config = config;
        await updateQueueEmbed(interaction.guild);

        const okEmbed = new EmbedBuilder()
          .setTitle("⚙️ Voice Channels Updated")
          .setDescription(
            `✅ 5Q Channels: ${config.targetVoiceChannelIds.length ? config.targetVoiceChannelIds.map((c) => `<#${c}>`).join(", ") : "*(none)*"}\n` +
            `✅ Trio Channels: ${config.trioVoiceChannelIds.length ? config.trioVoiceChannelIds.map((c) => `<#${c}>`).join(", ") : "*(none)*"}`
          )
          .setColor("Green")
          .setTimestamp();
        return interaction.reply({ embeds: [okEmbed], ephemeral: true });
      }
    }
  } catch (err) {
    console.error("Interaction error:", err);
  }
});

/* ------------------------------------------------------------ */
/* 🚀 Start Match + DM Notifications */
async function startMatch(members, type, guild) {
  try {
    const vcList = type === "5q" ? config.targetVoiceChannelIds : config.trioVoiceChannelIds;
    if (!vcList?.length) return;

    const targetChannelId = vcList[Math.floor(Math.random() * vcList.length)];
    const targetChannel = guild.channels.cache.get(targetChannelId);
    if (!targetChannel) return;

    const names = members.map((m) => m.user.username).join(", ");
    const ids = members.map((m) => m.id);
    const matchId = `${type}_${Date.now()}`;

    if (!config.activeMatches) config.activeMatches = {};
    config.activeMatches[matchId] = {
      messageId: null,
      channelId: targetChannelId,
      players: ids,
      names,
      startedAt: Date.now(),
      type,
      pendingResult: false, // explicitly not pending when created
    };
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
    client.config = config;

    // DM notifications
    for (const m of members.values()) {
      try {
        await m.send(
          `🎮 Your ${type.toUpperCase()} match is about to begin! You’re being moved to <#${targetChannelId}>.`
        );
      } catch {}
    }

    // Move players to target channel (this is the actual match start)
    for (const m of members.values()) {
      try {
        await m.voice.setChannel(targetChannel);
      } catch {}
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${type.toUpperCase()} Match Started!`)
      .setDescription(`**Players (${members.length})**\n> ${names}\n\n➡️ Moved to <#${targetChannelId}>`)
      .setColor(type === "5q" ? "Purple" : "Green")
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`finish_match_${matchId}`)
        .setLabel("🏁 Finish Match")
        .setStyle(ButtonStyle.Success)
    );

    const textChannel = guild.channels.cache.get(config.configMessageChannelId);
    const msg = await textChannel.send({ embeds: [embed], components: [row] });
    config.activeMatches[matchId].messageId = msg.id;
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
    client.config = config;

    console.log(`🎮 Started ${type.toUpperCase()} match (${members.length} players)`);

    await updateQueueEmbed(guild);
  } catch (err) {
    console.error("startMatch error:", err);
  }
}

/* ------------------------------------------------------------ */
/* 🎧 Voice Queue Watch + Timer Footer */
let queueTimerActive = false;
let queueProcessing = false;

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const guild = newState.guild;
    const member = newState.member;
    const queueChannel = guild.channels.cache.get(config.queueVoiceChannelId);
    if (!queueChannel) return;

    // Join
    if (newState.channelId === config.queueVoiceChannelId) {
      await db.run("INSERT OR REPLACE INTO queue (userId, joinedAt) VALUES (?, ?)", [
        member.id,
        Date.now(),
      ]);
      await updateQueueEmbed(guild);
    }

    // Leave
    if (
      oldState.channelId === config.queueVoiceChannelId &&
      newState.channelId !== config.queueVoiceChannelId
    ) {
      await db.run("DELETE FROM queue WHERE userId = ?", [member.id]);
      await updateQueueEmbed(guild);
    }

    const members = queueChannel.members.filter((m) => !m.user.bot);
    const count = members.size;
    if (count === 0) {
      queueTimerActive = false;
      clearInterval(queueCountdown);
      return;
    }

    // Instant 5Q
    if (count >= 5 && !queueProcessing) {
      queueProcessing = true;
      clearInterval(queueCountdown);
      queueTimerActive = false;
      await startMatch(Array.from(members.values()).slice(0, 5), "5q", guild);
      queueProcessing = false;
      return;
    }

    // Trio timer
    if (count >= 3 && count < 5 && !queueTimerActive && !queueProcessing) {
      queueTimerActive = true;
      const timeoutMs = config.matchTimeoutMinutes * 60_000;
      const startTime = Date.now();
      const endTime = startTime + timeoutMs;
      console.log("🕒 Trio countdown started.");

      // Tick every 30 sec
      queueCountdown = setInterval(async () => {
        const remaining = Math.max(0, endTime - Date.now());
        const seconds = Math.ceil(remaining / 1000);
        const footer = `⏳ Auto-start Trio in ${seconds}s`;
        await updateQueueEmbed(guild, footer);
        console.log(`🕒 Queue timer tick: ${seconds}s left`);
      }, 30_000);

      setTimeout(async () => {
        try {
          clearInterval(queueCountdown);
          const current = queueChannel.members.filter((m) => !m.user.bot);
          if (current.size >= 3 && current.size < 5 && !queueProcessing) {
            queueProcessing = true;
            await startMatch(Array.from(current.values()).slice(0, 3), "trio", guild);
            queueProcessing = false;
          }
        } catch (err) {
          console.error("Trio timeout error:", err);
        } finally {
          queueTimerActive = false;
          clearInterval(queueCountdown);
          await updateQueueEmbed(guild);
        }
      }, timeoutMs);
    }
  } catch (err) {
    console.error("voiceStateUpdate error:", err);
  }
});

/* ------------------------------------------------------------ */
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  await updateQueueEmbed(guild);
});

client.login(process.env.DISCORD_TOKEN);
