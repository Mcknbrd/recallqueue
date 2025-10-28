// commands/bulkmoderate.js
// Safe bulk-moderation tool with preview pagination, DM-before-ban, and protected-user checks.
// Put this file in /commands and restart the bot.

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("bulkmoderate")
  .setDescription("ADMIN: DM targets then ban them after confirmation (safe).")
  // REQUIRED options MUST come before non-required ones — message is required so place it first
  .addStringOption(opt => opt
    .setName("message")
    .setDescription("Personal DM to send before ban")
    .setRequired(true)
  )
  // optional options
  .addRoleOption(opt => opt.setName("role").setDescription("Target everyone with this role").setRequired(false))
  .addStringOption(opt => opt.setName("users").setDescription("Comma-separated user IDs or mentions").setRequired(false))
  .addStringOption(opt => opt.setName("reason").setDescription("Ban reason (optional)").setRequired(false))
  .addIntegerOption(opt => opt.setName("delayms").setDescription("Delay between bans in ms (default 1500)").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setDMPermission(false);

function chunkArray(arr, chunkSize) {
  const pages = [];
  for (let i = 0; i < arr.length; i += chunkSize) pages.push(arr.slice(i, i + chunkSize));
  return pages;
}

export async function execute(client, interaction, db, updateQueueEmbed, config) {
  await interaction.deferReply({ ephemeral: true });

  const invoker = interaction.member;
  const guild = interaction.guild;

  // Admin role enforcement (optional config)
  const adminRoleId = config.adminRoleId || null;
  if (adminRoleId) {
    const hasAdminRole = invoker.roles.cache.has(adminRoleId) || invoker.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!hasAdminRole) {
      return interaction.editReply("❌ You must have the configured admin role (or Administrator) to use this command.");
    }
  } else {
    if (!invoker.permissions.has(PermissionsBitField.Flags.ManageGuild) && !invoker.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply("❌ You must have Manage Guild or Administrator permission to use this command.");
    }
  }

  // Read options (message is required and is read first)
  const messageText = interaction.options.getString("message");
  const role = interaction.options.getRole("role");
  const usersString = interaction.options.getString("users") || "";
  const reason = interaction.options.getString("reason") || "No reason provided";
  const delayMs = Number(interaction.options.getInteger("delayms") || 1500);

  // Build candidate list from role and CSV string
  const candidateIds = new Set();

  if (role) {
    const membersWithRole = (await guild.members.fetch()).filter(m => m.roles.cache.has(role.id));
    for (const m of membersWithRole.values()) candidateIds.add(m.id);
  }

  if (usersString && usersString.trim().length > 0) {
    const parts = usersString.split(/[\s,;]+/).map(s => s.replace(/[<@!>]/g, "").trim()).filter(Boolean);
    for (const p of parts) if (/^\d+$/.test(p)) candidateIds.add(p);
  }

  // Ensure invoker is not targeted
  candidateIds.delete(invoker.id);

  if (candidateIds.size === 0) {
    return interaction.editReply("⚠️ No targets found. Provide a role or a list of user IDs/mentions.");
  }

  // Resolve members and apply protections
  const resolved = [];
  const skipped = [];
  const botMember = await guild.members.fetchMe();
  const botHighestRolePosition = botMember.roles.highest.position;

  for (const id of candidateIds) {
    let member;
    try {
      member = await guild.members.fetch(id).catch(() => null);
    } catch {
      member = null;
    }
    if (!member) {
      skipped.push({ id, reason: "Not in guild" });
      continue;
    }

    if (member.id === invoker.id) {
      skipped.push({ id: member.id, reason: "Invoker (skipped)" });
      continue;
    }

    if (member.permissions.has(PermissionsBitField.Flags.Administrator) || member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      skipped.push({ id: member.id, reason: "Has Administrator/ManageGuild" });
      continue;
    }

    if (member.roles.highest.position >= botHighestRolePosition) {
      skipped.push({ id: member.id, reason: "Role >= bot role (cannot act)" });
      continue;
    }

    resolved.push(member);
  }

  if (resolved.length === 0) {
    return interaction.editReply("⚠️ After protections, no targets remain that can be banned.");
  }

  // Prepare pages for preview: show Targets and Skipped in pages of 10
  const targetLines = resolved.map(m => `${m.user.tag} — ${m.id}`);
  const skippedLines = skipped.map(s => `${s.id} — ${s.reason}`);
  const allLines = ["**Targets (will be DM'd & then banned):**", ...targetLines, "", "**Skipped (protected / not found):**", ...skippedLines];
  const pages = chunkArray(allLines, 10);
  let pageIndex = 0;

  const buildPreviewEmbed = (idx) => {
    const embed = new EmbedBuilder()
      .setTitle("Bulk Moderation Preview")
      .setDescription(pages[idx].join("\n") || "_(no items on this page)_")
      .addFields(
        { name: "Totals", value: `Targets: ${resolved.length}\nSkipped: ${skipped.length}` },
        { name: "DM preview", value: messageText.length > 500 ? messageText.slice(0, 500) + "…" : messageText }
      )
      .setFooter({ text: `Page ${idx + 1}/${pages.length}` })
      .setColor("Orange");
    return embed;
  };

  const prevBtn = new ButtonBuilder().setCustomId("bulk_prev").setLabel("⬅️ Prev").setStyle(ButtonStyle.Secondary).setDisabled(true);
  const nextBtn = new ButtonBuilder().setCustomId("bulk_next").setLabel("Next ➡️").setStyle(ButtonStyle.Secondary).setDisabled(pages.length <= 1);
  const confirmBtn = new ButtonBuilder().setCustomId("bulk_confirm").setLabel("Confirm and Proceed").setStyle(ButtonStyle.Danger);
  const cancelBtn = new ButtonBuilder().setCustomId("bulk_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary);

  const navRow = new ActionRowBuilder().addComponents(prevBtn, nextBtn);
  const actionRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

  const previewMessage = await interaction.editReply({
    embeds: [buildPreviewEmbed(pageIndex)],
    components: [navRow, actionRow],
    ephemeral: true,
  });

  // Save operation snapshot in memory
  if (!client._bulkOps) client._bulkOps = {};
  const token = `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  client._bulkOps[token] = {
    invokerId: invoker.id,
    guildId: guild.id,
    members: resolved.map(m => ({ id: m.id, tag: m.user.tag })),
    skipped,
    messageText,
    reason,
    delayMs,
    createdAt: Date.now(),
  };

  // Collector for navigation + confirm/cancel
  const filter = i => i.user.id === invoker.id && ["bulk_prev","bulk_next","bulk_confirm","bulk_cancel"].includes(i.customId);
  const collector = previewMessage.createMessageComponentCollector({ filter, time: 5 * 60_000 });

  collector.on("collect", async (btn) => {
    try {
      await btn.deferUpdate();
      if (btn.customId === "bulk_prev") {
        pageIndex = Math.max(0, pageIndex - 1);
        prevBtn.setDisabled(pageIndex === 0);
        nextBtn.setDisabled(pageIndex === pages.length - 1);
        await previewMessage.edit({ embeds: [buildPreviewEmbed(pageIndex)], components: [navRow, actionRow] }).catch(()=>{});
        return;
      }
      if (btn.customId === "bulk_next") {
        pageIndex = Math.min(pages.length - 1, pageIndex + 1);
        prevBtn.setDisabled(pageIndex === 0);
        nextBtn.setDisabled(pageIndex === pages.length - 1);
        await previewMessage.edit({ embeds: [buildPreviewEmbed(pageIndex)], components: [navRow, actionRow] }).catch(()=>{});
        return;
      }
      if (btn.customId === "bulk_cancel") {
        delete client._bulkOps[token];
        await previewMessage.edit({ content: "❌ Bulk operation cancelled by invoker.", embeds: [], components: [] }).catch(()=>{});
        collector.stop("cancelled");
        return;
      }
      if (btn.customId === "bulk_confirm") {
        // Lock UI
        prevBtn.setDisabled(true);
        nextBtn.setDisabled(true);
        confirmBtn.setDisabled(true);
        cancelBtn.setDisabled(true);
        await previewMessage.edit({ content: "⏳ Proceeding with operation — DMs will be sent and bans performed shortly.", embeds: [buildPreviewEmbed(pageIndex)], components: [navRow, actionRow] }).catch(()=>{});

        collector.stop("confirmed");
        return;
      }
    } catch (err) {
      console.error("bulkmoderate collector error:", err);
    }
  });

  collector.on("end", async (collected, reasonEnd) => {
    if (reasonEnd !== "confirmed") {
      if (client._bulkOps && client._bulkOps[token]) delete client._bulkOps[token];
      if (reasonEnd !== "cancelled") {
        await previewMessage.edit({ content: "⌛ Bulk operation timed out. Please run the command again if you still want to proceed.", embeds: [], components: [] }).catch(()=>{});
      }
      return;
    }

    // Proceed with operation
    const op = client._bulkOps[token];
    if (!op) {
      await previewMessage.edit({ content: "❌ Operation info expired.", embeds: [], components: [] }).catch(()=>{});
      return;
    }

    const modLogChannel = guild.channels.cache.get(config.modLogChannelId || config.matchHistoryChannelId);

    // Send DMs (best effort)
    const dmResults = [];
    for (const mInfo of op.members) {
      try {
        const member = await guild.members.fetch(mInfo.id);
        await member.send(op.messageText).catch(() => { throw new Error("DM failed"); });
        dmResults.push({ id: mInfo.id, tag: mInfo.tag, dm: "sent" });
      } catch {
        dmResults.push({ id: mInfo.id, tag: mInfo.tag, dm: "failed" });
      }
    }

    // Notify invoker summary
    await previewMessage.edit({ content: `📨 DMs attempted: ${dmResults.filter(r=>r.dm==="sent").length}, failed: ${dmResults.filter(r=>r.dm==="failed").length}. Beginning bans...`, components: [] }).catch(()=>{});

    // Ban sequentially
    const banResults = [];
    for (const mInfo of op.members) {
      try {
        const member = await guild.members.fetch(mInfo.id).catch(() => null);
        if (!member) {
          banResults.push({ id: mInfo.id, tag: mInfo.tag, status: "not in guild" });
          continue;
        }

        // final protection checks
        if (member.permissions.has(PermissionsBitField.Flags.Administrator) || member.roles.highest.position >= guild.members.me.roles.highest.position) {
          banResults.push({ id: mInfo.id, tag: mInfo.tag, status: "skipped-protected" });
          continue;
        }

        await member.ban({ days: 1, reason: `Bulk-moderation by ${invoker.user.tag}: ${op.reason}` });
        banResults.push({ id: mInfo.id, tag: mInfo.tag, status: "banned" });

        // Log to mod channel
        if (modLogChannel && modLogChannel.isTextBased()) {
          const logEmbed = new EmbedBuilder()
            .setTitle("Bulk Ban — Action Logged")
            .addFields(
              { name: "Target", value: `${mInfo.tag} — ${mInfo.id}` },
              { name: "Executor", value: `${invoker.user.tag} — ${invoker.id}` },
              { name: "Reason", value: op.reason }
            )
            .setColor("Red")
            .setTimestamp();
          modLogChannel.send({ embeds: [logEmbed] }).catch(()=>{});
        }
      } catch (err) {
        console.error("Ban error for", mInfo.id, err);
        banResults.push({ id: mInfo.id, tag: mInfo.tag, status: "error", error: err.message || String(err) });
      }

      // delay between bans
      await new Promise(r => setTimeout(r, op.delayMs));
    }

    // Final ephemeral summary to invoker
    const successCount = banResults.filter(r => r.status === "banned").length;
    const skippedCount = banResults.filter(r => r.status && String(r.status).startsWith("skipped")).length;
    const errCount = banResults.filter(r => r.status === "error").length;

    const finalEmbed = new EmbedBuilder()
      .setTitle("Bulk Moderation Completed")
      .setDescription(`Banned: ${successCount}\nSkipped/Protected: ${skippedCount}\nErrors: ${errCount}`)
      .setColor("DarkRed")
      .setTimestamp();

    // clean up stored op
    delete client._bulkOps[token];

    await previewMessage.followUp({ embeds: [finalEmbed], ephemeral: true }).catch(()=>{});
  });
}
