const { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Op, fn, col, literal } = require('sequelize');
const { getConfig, applyFooter, formatDuration, buildPaginationRow } = require('../staff-management');
const { localize } = require('../../../src/functions/localize');

function getLookbackDate(config) {
    const lookback = config.leaderboardLookback || 'Weekly';
    if (lookback === 'All-time') return null;
    const date = new Date();
    if (lookback === 'Weekly') date.setDate(date.getDate() - 7);
    else if (lookback === 'Monthly') date.setMonth(date.getMonth() - 1);
    return date;
}

async function applyBreakElapsedToShift(activeShift, breakStartTime, now = new Date()) {
    if (!activeShift || !breakStartTime) return;

    const breakStartedAt = new Date(breakStartTime);
    if (Number.isNaN(breakStartedAt.getTime()) || breakStartedAt > now) return;

    const elapsedBreakMs = now.getTime() - breakStartedAt.getTime();
    if (elapsedBreakMs <= 0) return;

    await activeShift.update({
        startTime: new Date(new Date(activeShift.startTime).getTime() + elapsedBreakMs)
    });
}

function getQuotaForMember(member, config) {
    if (!config.enableQuotas || !config.quotas || Object.keys(config.quotas).length === 0) return null;

    let bestQuota = null;
    let highestPosition = -1;
    
    for (const [roleId, hoursStr] of Object.entries(config.quotas)) {
        const hours = parseFloat(hoursStr);
        if (isNaN(hours)) continue;
        
        const role = member.guild.roles.cache.get(roleId);
        if (role && member.roles.cache.has(roleId) && role.position > highestPosition) {
            highestPosition = role.position;
            bestQuota = { roleId, hours };
        }
    }
    
    return bestQuota;
}

async function buildDutyManagePayload(client, userId, guild, shiftType) {
    const Profile = client.models['staff-management-system']['StaffProfile'];
    const Shift = client.models['staff-management-system']['StaffShift'];

    const user = await client.users.fetch(userId).catch(() => null);
    const profile = await Profile.findByPk(userId);

    const onDuty = profile?.onDuty || false;
    const onBreak = profile?.onBreak || false;

    let statusText, statusColor;
    if (onDuty && onBreak) { statusText = localize('staff-management-system', 'stat-brk'); statusColor = 'Yellow'; }
    else if (onDuty) { statusText = localize('staff-management-system', 'stat-on'); statusColor = 'Green'; }
    else { statusText = localize('staff-management-system', 'stat-off'); statusColor = 'Red'; }

    const completedShifts = await Shift.findAll({
        where: { 
            userId, 
            type: shiftType, 
            endTime: { [Op.not]: null }, 
            duration: { [Op.not]: null } 
        }
    });
    const totalShifts = completedShifts.length;
    const totalSeconds = completedShifts.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);
    const avgSeconds = totalShifts > 0 
    ? Math.floor(totalSeconds / totalShifts) 
    : 0;

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'duty-panel-title', { type: shiftType }))
        .setColor(statusColor)
        .setThumbnail(user?.displayAvatarURL({ dynamic: true }) || null)
        .setDescription(`**${user?.username || userId}**\n${statusText}`)
        .addFields(
            { 
                name: localize('staff-management-system', 'duty-stats'), 
                value: localize('staff-management-system', 'duty-stat-desc', 
                    { 
                        duration: formatDuration(totalSeconds), 
                        count: totalShifts, 
                        average: formatDuration(avgSeconds) 
                    }
                ) 
            }
        )
    );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId(`duty-mgmt_start_${userId}_${shiftType}`)
        .setLabel(localize('staff-management-system', 'btn-duty-on'))
        .setStyle(ButtonStyle.Success)
        .setDisabled(onDuty),
        new ButtonBuilder()
        .setCustomId(`duty-mgmt_break_${userId}`)
        .setLabel(onBreak ? localize('staff-management-system', 'btn-duty-res') : localize('staff-management-system', 'btn-duty-brk'))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!onDuty),
        new ButtonBuilder()
        .setCustomId(`duty-mgmt_end_${userId}`)
        .setLabel(localize('staff-management-system', 'btn-duty-off'))
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!onDuty)
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

async function buildDutyTimePayload(client, interaction, shiftType) {
    const config = getConfig(client, 'shifts');
    const Shift = client.models['staff-management-system']['StaffShift'];
    const user = interaction.user;

    const whereClause = { 
        userId: user.id, 
        endTime: { [Op.not]: null }, 
        duration: { [Op.not]: null } 
    };
    if (shiftType !== 'All') whereClause.type = shiftType;

    const shifts = await Shift.findAll({ where: whereClause });

    const totalSeconds = shifts.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);
    const shiftCount = shifts.length;

    let breakdownText = '';
    if (shiftType === 'All' && shiftCount > 0) {
        const grouped = {};
        for (const s of shifts) {
            const t = s.type || 'Staff';
            grouped[t] = (grouped[t] || 0) + (parseInt(s.duration) || 0);
        }
        breakdownText = `\n\n**${localize('staff-management-system', 'duty-breakdown')}:**\n` + Object.entries(grouped)
            .sort((a, b) => b[1] - a[1])
            .map(([t, sec]) => `• ${t}: ${formatDuration(sec)}`)
            .join('\n');
    }

    let quotaText = '';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
        const quota = getQuotaForMember(member, config);
        if (quota) {
            const timeframe = config.quotaTimeframe || 'Weekly';
            const cutoff = new Date();
            if (timeframe === 'Weekly') cutoff.setDate(cutoff.getDate() - 7);
            else cutoff.setMonth(cutoff.getMonth() - 1);

            const recentWhere = { 
                userId: user.id, 
                startTime: { [Op.gt]: cutoff }, 
                endTime: { [Op.not]: null }, 
                duration: { [Op.not]: null } 
            };
            if (shiftType !== 'All') recentWhere.type = shiftType;

            const recentShifts = await Shift.findAll({ where: recentWhere });
            const recentSeconds = recentShifts.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);
            const requiredSeconds = quota.hours * 3600;
            const metQuota = recentSeconds >= requiredSeconds;
            quotaText = localize('staff-management-system', 'duty-quota-str', { 
                timeframe, 
                duration: formatDuration(recentSeconds),
                hours: quota.hours, 
                result: metQuota 
                ? localize('staff-management-system', 'quota-met') 
                : localize('staff-management-system', 'quota-fail') 
            });
        }
    }

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'duty-time-title', { type: shiftType }))
        .setColor('Blue')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(localize('staff-management-system', 'duty-time-desc', { 
            count: shiftCount, 
            duration: formatDuration(totalSeconds) 
        }) + breakdownText + quotaText)
    );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`duty-mgmt_hist_${user.id}_1_${shiftType}`)
            .setLabel(localize('staff-management-system', 'btn-hist'))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(shiftCount === 0)
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

async function buildLeaderboardPayload(client, page = 1, shiftType) {
    const config = getConfig(client, 'shifts');
    const Shift = client.models['staff-management-system']['StaffShift'];
    const limit = 15;
    const offset = (page - 1) * limit;

    const whereClause = { 
        endTime: { [Op.not]: null }, 
        duration: { [Op.not]: null } 
    };
    if (shiftType !== 'All') whereClause.type = shiftType;
    
    const lookbackDate = getLookbackDate(config);
    if (lookbackDate) whereClause.startTime = { [Op.gt]: lookbackDate };

    const allResults = await Shift.findAll({
        attributes: [
            'userId',
            [fn('SUM', col('duration')), 'totalDuration'],
            [fn('COUNT', col('id')), 'shiftCount']
        ],
        where: whereClause,
        group: ['userId'],
        order: [[literal('totalDuration'), 'DESC']]
    });

    const total = allResults.length;
    if (total === 0) return { 
        content: localize('staff-management-system', 'err-no-lb', { 
            type: shiftType 
        }) 
    };

    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = allResults.slice(offset, offset + limit);

    const lines = [];
    for (let i = 0; i < paginated.length; i++) {
        const entry = paginated[i];
        const dur = formatDuration(parseInt(entry.dataValues.totalDuration));
        lines.push(`${offset + i + 1}. **<@${entry.userId}>** • ${dur}`);
    }

    const lookbackLabel = config.leaderboardLookback || 'Weekly';
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'duty-lb-title', {
            type: shiftType
        }))
        .setColor('Gold')
        .setDescription(localize('staff-management-system', 'duty-lb-desc', {
            lookback: lookbackLabel,
            lines: lines.join('\n')
        }))
    );

    embed.addFields({
        name: '\u200b',
        value: localize('staff-management-system', 'page-count', {
            page,
            total: totalPages
        })
    });

    const row = buildPaginationRow(
        `duty-mgmt_lb_${page - 1}_${shiftType}`,
        'duty_lb_count',
        `duty-mgmt_lb_${page + 1}_${shiftType}`,
        page, totalPages, 'back', 'next'
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

async function buildShiftHistoryPayload(client, userId, page = 1, shiftType) {
    const Shift = client.models['staff-management-system']['StaffShift'];
    const limit = 10; 
    const offset = (page - 1) * limit;

    const whereClause = { 
        userId, 
        endTime: { [Op.not]: null }, 
        duration: { [Op.not]: null } 
    };
    if (shiftType !== 'All') whereClause.type = shiftType;

    const { count, rows } = await Shift.findAndCountAll({
        where: whereClause,
        order: [['startTime', 'DESC']],
        limit,
        offset
    });

    if (count === 0) return { content: localize('staff-management-system', 'info-no-sh-hi') };
    const totalPages = Math.ceil(count / limit) || 1;

    const lines = rows.map((shift, i) => {
        const dur = formatDuration(shift.duration);
        const startTs = Math.floor(new Date(shift.startTime).getTime() / 1000);
        const endTs = Math.floor(new Date(shift.endTime).getTime() / 1000);
        const typeBadge = shiftType === 'All' ? ` \`[${shift.type || 'Staff'}]\`` : '';
        
        return `**${offset + i + 1}. ${dur}${typeBadge}:**\nStart: <t:${startTs}:F> | End: <t:${endTs}:F>`;
    });

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'duty-hi-title', {
            type: shiftType
        }))
        .setColor('Blue')
        .setDescription(lines.join('\n\n'))
    );

    embed.addFields({
        name: '\u200b',
        value: localize('staff-management-system', 'page-count', {
            page,
            total: totalPages
        })
    }); 

    const row = buildPaginationRow(
        `duty-mgmt_hist_${userId}_${page - 1}_${shiftType}`,
        'duty_hist_count',
        `duty-mgmt_hist_${userId}_${page + 1}_${shiftType}`,
        page, totalPages
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

async function buildDutyAdminPayload(client, targetMember, requestingMember) {
    const Profile = client.models['staff-management-system']['StaffProfile'];
    const Shift = client.models['staff-management-system']['StaffShift'];

    const targetUser = targetMember.user;
    const profile = await Profile.findByPk(targetUser.id);

    const onDuty = profile?.onDuty || false;
    const onBreak = profile?.onBreak || false;

    let statusText, statusColor;
    if (onDuty && onBreak) { 
        statusText = localize('staff-management-system', 'stat-brk'); 
        statusColor = 'Yellow'; 
    }
    else if (onDuty) { 
        statusText = localize('staff-management-system', 'stat-on'); 
        statusColor = 'Green'; 
    }
    else { 
        statusText = localize('staff-management-system', 'stat-off'); 
        statusColor = 'Red'; 
    }

    const completedShifts = await Shift.findAll({
        where: { 
            userId: targetUser.id, 
            endTime: { [Op.not]: null }, 
            duration: { [Op.not]: null } 
        }
    });
    const totalShifts = completedShifts.length;
    const totalSeconds = completedShifts.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);
    const avgSeconds = totalShifts > 0 
    ? Math.floor(totalSeconds / totalShifts) 
    : 0;

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'duty-adm-title', { 
            user: targetUser.username 
        }))
        .setColor(statusColor)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(`**${targetUser.username}**\n${statusText}`)
        .addFields(
            { 
                name: localize('staff-management-system', 'duty-stats'), 
                value: localize('staff-management-system', 'duty-stat-desc', { 
                    duration: formatDuration(totalSeconds), 
                    count: totalShifts, 
                    average: formatDuration(avgSeconds) 
                }) 
            }
        )
    );

    const generalConfig = client.configurations['staff-management-system']['configuration'];
    const isManagement = requestingMember.roles.cache.some(r => (generalConfig.managementRoles || []).includes(r.id)) || requestingMember.permissions.has('Administrator');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId(`duty-mgmt_admin-forceend_${targetUser.id}`)
        .setLabel(localize('staff-management-system', 'btn-f-off'))
        .setEmoji('🔴')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!onDuty),
        new ButtonBuilder()
        .setCustomId(`duty-mgmt_admin-voidactive_${targetUser.id}`)
        .setLabel(localize('staff-management-system', 'btn-v-act'))
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!onDuty),
        new ButtonBuilder()
        .setCustomId(`duty-mgmt_admin-addtime_${targetUser.id}`)
        .setLabel(localize('staff-management-system', 'btn-add-t'))
        .setEmoji('⏱️')
        .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
        .setCustomId(`duty-mgmt_admin-voidall_${targetUser.id}`)
        .setLabel(localize('staff-management-system', 'btn-v-all'))
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!isManagement)
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

// ----- Button handlers -----
async function handleDutyStartButton(client, interaction) {
    const parts = interaction.customId.split('_');
    const userId = parts[2];
    const shiftType = parts[3] || 'Staff'; 

    if (interaction.user.id !== userId) return interaction.followUp({ 
        content: localize('staff-management-system', 'err-not-yours'), 
        flags: MessageFlags.Ephemeral 
    });

    const config = getConfig(client, 'shifts');
    const Profile = client.models['staff-management-system']['StaffProfile'];
    const Shift = client.models['staff-management-system']['StaffShift'];

    const profile = await Profile.findByPk(userId);
    if (profile?.onDuty) return interaction.followUp({ 
        content: localize('staff-management-system', 'err-alr-on'), 
        flags: MessageFlags.Ephemeral 
    });

    await Shift.create({ 
        userId, 
        startTime: new Date(), 
        type: shiftType 
    });
    await Profile.upsert({ 
        userId, 
        onDuty: true, 
        onBreak: false, 
        lastClockIn: new Date() 
    });

    if (config.onDutyRole) {
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (member) await member.roles.add(config.onDutyRole).catch(() => {});
    }

    const payload = await buildDutyManagePayload(client, userId, interaction.guild, shiftType);
    return interaction.editReply(payload);
}

async function handleDutyBreakButton(client, interaction) {
    const userId = interaction.customId.split('_')[2];
    if (interaction.user.id !== userId) return interaction.followUp({ 
        content: localize('staff-management-system', 'err-not-yours'), 
        flags: MessageFlags.Ephemeral 
    });

    const Profile = client.models['staff-management-system']['StaffProfile'];
    const Shift = client.models['staff-management-system']['StaffShift'];
    const profile = await Profile.findByPk(userId);
    
    if (!profile?.onDuty) return interaction.followUp({ 
        content: localize('staff-management-system', 'err-not-on'), 
        flags: MessageFlags.Ephemeral 
    });

    const activeShift = await Shift.findOne({ 
        where: { userId, endTime: null } 
    });
    const shiftType = activeShift?.type || 'Staff';

    const nowOnBreak = !profile.onBreak;
    if (!nowOnBreak && profile.breakStartTime && activeShift) {
        await applyBreakElapsedToShift(activeShift, profile.breakStartTime);
    }

    await Profile.update({
        onBreak: nowOnBreak,
        breakStartTime: nowOnBreak 
        ? new Date() 
        : null
    }, {
    where: { userId }
    });

    const payload = await buildDutyManagePayload(client, userId, interaction.guild, shiftType);
    return interaction.editReply(payload);
}

async function handleDutyEndButton(client, interaction) {
    const userId = interaction.customId.split('_')[2];
    if (interaction.user.id !== userId) return interaction.followUp({ 
        content: localize('staff-management-system', 'err-not-yours'), 
        flags: MessageFlags.Ephemeral 
    });

    const config = getConfig(client, 'shifts');
    const Profile = client.models['staff-management-system']['StaffProfile'];
    const Shift = client.models['staff-management-system']['StaffShift'];

    const profile = await Profile.findByPk(userId);
    if (!profile?.onDuty) return interaction.followUp({ 
        content: localize('staff-management-system', 'err-not-on'), 
        flags: MessageFlags.Ephemeral 
    });

    const activeShifts = await Shift.findAll({ where: { userId, endTime: null } });
    const shiftType = activeShifts.length > 0 ? activeShifts[0].type : 'Staff';

    for (const activeShift of activeShifts) {
        if (profile.onBreak && profile.breakStartTime) {
            await applyBreakElapsedToShift(activeShift, profile.breakStartTime);
        }

        const endTime = new Date();
        const durationSeconds = Math.floor(
            (endTime.getTime() - new Date(activeShift.startTime).getTime()) / 1000
        );

        if (config.minShiftDuration && (durationSeconds / 60) < config.minShiftDuration) {
            await activeShift.destroy();
        } else {
            await activeShift.update({ endTime, duration: durationSeconds });
        }
    }

    await Profile.update({ 
        onDuty: false, 
        onBreak: false, 
        breakStartTime: null }, { 
            where: { userId } 
        });
    if (config.onDutyRole) {
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (member) await member.roles.remove(config.onDutyRole).catch(() => {});
    }

    const payload = await buildDutyManagePayload(client, userId, interaction.guild, shiftType);
    return interaction.editReply(payload);
}

async function handleDutyHistPageButton(client, interaction) {
    const parts = interaction.customId.split('_');
    const userId = parts[2];
    const page = parseInt(parts[3]);
    const shiftType = parts[4] || 'Staff';

    if (interaction.user.id !== userId) return interaction.followUp({ 
        content: localize('staff-management-system', 'err-hist-oth'), 
        flags: MessageFlags.Ephemeral 
    });

    const payload = await buildShiftHistoryPayload(client, userId, page, shiftType);
    if (payload.content) return interaction.followUp({ 
        ...payload, 
        flags: MessageFlags.Ephemeral 
    });

    const isOnHistEmbed = interaction.message?.embeds?.[0]?.title?.startsWith(localize('staff-management-system', 'duty-hi-title', { type: '' }).replace(' - ', ''));
    if (isOnHistEmbed) {
        return interaction.editReply(payload);
    } else {
        return interaction.followUp({ 
            ...payload, 
            flags: MessageFlags.Ephemeral 
        });
    }
}

async function handleDutyLbPageButton(client, interaction) {
    const parts = interaction.customId.split('_');
    const page = parseInt(parts[2]);
    const shiftType = parts[3] || 'Staff';

    const payload = await buildLeaderboardPayload(client, page, shiftType);
    if (payload.content) return interaction.editReply({ ...payload, flags: MessageFlags.Ephemeral });
    return interaction.editReply(payload);
}

// ----- Admin handler -----
async function handleDutyAdminForceEnd(client, interaction) {
    const targetUserId = interaction.customId.split('_')[2];
    const config = getConfig(client, 'shifts');
    const Profile = client.models['staff-management-system']['StaffProfile'];
    const Shift = client.models['staff-management-system']['StaffShift'];
    const profile = await Profile.findByPk(targetUserId);

    const activeShifts = await Shift.findAll({ 
        where: { userId: targetUserId, endTime: null } 
    });
    for (const activeShift of activeShifts) {
        if (profile?.onBreak && profile.breakStartTime) {
            await applyBreakElapsedToShift(activeShift, profile.breakStartTime);
        }

        const endTime = new Date();
        const durationSeconds = Math.floor(
            (endTime.getTime() - new Date(activeShift.startTime).getTime()) / 1000
        );

        await activeShift.update({
            endTime,
            duration: durationSeconds
        });
    }

    await Profile.update({ 
        onDuty: false, 
        onBreak: false, 
        breakStartTime: null }, { 
            where: { userId: targetUserId } 
        });
    if (config.onDutyRole) {
        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        if (member) await member.roles.remove(config.onDutyRole).catch(() => {});
    }

    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
    const payload = await buildDutyAdminPayload(client, targetMember, interaction.member);
    return interaction.editReply(payload);
}

async function handleDutyAdminVoidActive(client, interaction) {
    const targetUserId = interaction.customId.split('_')[2];
    const config = getConfig(client, 'shifts');
    const Profile = client.models['staff-management-system']['StaffProfile'];
    const Shift = client.models['staff-management-system']['StaffShift'];

    const activeShifts = await Shift.findAll({ 
        where: { userId: targetUserId, endTime: null } 
    });
    for (const activeShift of activeShifts) await activeShift.destroy();

    await Profile.update({ 
        onDuty: false, 
        onBreak: false, 
        breakStartTime: null }, { 
            where: { userId: targetUserId } 
        });
    if (config.onDutyRole) {
        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        if (member) await member.roles.remove(config.onDutyRole).catch(() => {});
    }

    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
    const payload = await buildDutyAdminPayload(client, targetMember, interaction.member);
    return interaction.editReply(payload);
}

async function handleDutyAdminVoidAll(client, interaction) {
    const targetUserId = interaction.customId.split('_')[2];
    const modal = new ModalBuilder()
    .setCustomId(`duty-mgmt_admin-voidall-submit_${targetUserId}`)
    .setTitle(localize('staff-management-system', 'mod-v-all-title'));
    modal.addComponents(
        new ActionRowBuilder()
        .addComponents(new TextInputBuilder()
        .setCustomId('confirm')
        .setLabel(localize('staff-management-system', 'mod-v-all-lbl'))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('CONFIRM')
        .setRequired(true))
    );
    return interaction.showModal(modal);
}

async function handleDutyAdminVoidAllSubmit(client, interaction) {
    const targetUserId = interaction.customId.split('_')[2];
    
    if (interaction.fields.getTextInputValue('confirm') !== 'CONFIRM') {
        return interaction.reply({ 
            content: localize('staff-management-system', 'err-conf-fail'), 
            flags: MessageFlags.Ephemeral 
        });
    }

    const config = getConfig(client, 'shifts');
    const Profile = client.models['staff-management-system']['StaffProfile'];
    const Shift = client.models['staff-management-system']['StaffShift'];

    await Shift.destroy({ 
        where: { userId: targetUserId } 
    });
    await Profile.update({ 
        onDuty: false, 
        onBreak: false, 
        breakStartTime: null 
    }, { 
        where: { userId: targetUserId } 
    });
    
    if (config.onDutyRole) {
        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        if (member) await member.roles.remove(config.onDutyRole).catch(() => {});
    }

    client.logger.info(localize('staff-management-system', 'log-void-all', { 
        target: targetUserId, 
        admin: interaction.user.id 
    }));
    
    return interaction.reply({ 
        content: localize('staff-management-system', 'succ-v-all', { user: targetUserId }), 
        flags: MessageFlags.Ephemeral 
    });
}

async function handleDutyAdminAddTimeButton(client, interaction) {
    const targetUserId = interaction.customId.split('_')[2];
    const config = getConfig(client, 'shifts');
    const dutyTypes = config.dutyTypes && config.dutyTypes.length > 0 
    ? config.dutyTypes 
    : ['Staff'];
    
    const modal = new ModalBuilder()
    .setCustomId(`duty-mgmt_admin-addtime-submit_${targetUserId}`)
    .setTitle(localize('staff-management-system', 'mod-add-t'));
    modal.addComponents(
        new ActionRowBuilder()
        .addComponents(
            new TextInputBuilder()
            .setCustomId('minutes')
            .setLabel(localize('staff-management-system', 'mod-add-min'))
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 60')
            .setRequired(true)
        ),
        new ActionRowBuilder()
        .addComponents(
            new TextInputBuilder()
            .setCustomId('type')
            .setLabel(localize('staff-management-system', 'mod-add-type'))
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(dutyTypes.join(', '))
            .setValue(dutyTypes[0])
            .setRequired(true)
        )
    );
    return interaction.showModal(modal);
}

async function handleDutyAdminAddTimeSubmit(client, interaction) {
    const targetUserId = interaction.customId.split('_')[2];
    const minutesRaw = interaction.fields.getTextInputValue('minutes');
    const shiftType = interaction.fields.getTextInputValue('type');
    
    const minutes = parseInt(minutesRaw);
    if (isNaN(minutes) || minutes <= 0) {
        return interaction.reply({ 
            content: localize('staff-management-system', 'err-inv-min'), 
            flags: MessageFlags.Ephemeral 
        });
    }

    const config = getConfig(client, 'shifts');
    const dutyTypes = config.dutyTypes && config.dutyTypes.length > 0 
    ? config.dutyTypes 
    : ['Staff'];
    
    if (!dutyTypes.includes(shiftType)) {
        return interaction.reply({ 
            content: localize('staff-management-system', 'err-inv-type', { 
                types: dutyTypes.join(', ') 
            }), 
            flags: MessageFlags.Ephemeral 
        });
    }

    const Shift = client.models['staff-management-system']['StaffShift'];
    
    const durationSeconds = minutes * 60;
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (durationSeconds * 1000));

    await Shift.create({
        userId: targetUserId,
        startTime: startTime,
        endTime: endTime,
        duration: durationSeconds,
        type: shiftType
    });

    client.logger.info(localize('staff-management-system', 'log-add-time', { 
        admin: interaction.user.tag, 
        min: minutes, 
        type: shiftType, 
        target: targetUserId 
    }));

    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
    const payload = await buildDutyAdminPayload(client, targetMember, interaction.member);
    
    return interaction.update(payload);
}

// ----- Dropdown handler -----
async function handleDutyDropdown(client, interaction, action, selectedType) {
    if (action === 'manage') {
        const payload = await buildDutyManagePayload(client, interaction.user.id, interaction.guild, selectedType);
        return interaction.editReply({ content: '', ...payload });
    }
    if (action === 'leaderboard') {
        const payload = await buildLeaderboardPayload(client, 1, selectedType);
        return interaction.editReply({ content: '', ...payload });
    }
    if (action === 'time') {
        const payload = await buildDutyTimePayload(client, interaction, selectedType);
        return interaction.editReply({ content: '', ...payload });
    }
}

async function handleCommonDutyCommand(i, action) {
    const config = getConfig(i.client, 'shifts');
    if (!config || !config.enableShifts) return i.editReply({ content: localize('staff-management-system', 'err-sh-dis') });
    
    const dutyTypes = config.dutyTypes && config.dutyTypes.length > 0 ? config.dutyTypes : ['Staff'];
    let shiftType = i.options.getString('type');

    const allowedTypes = (action === 'leaderboard' || action === 'time') ? ['All', ...dutyTypes] : dutyTypes;

    if (action === 'manage') {
        const Profile = i.client.models['staff-management-system']['StaffProfile'];
        const Shift = i.client.models['staff-management-system']['StaffShift'];
        const profile = await Profile.findByPk(i.user.id);
        if (profile?.onDuty) {
            const activeShift = await Shift.findOne({ where: { userId: i.user.id, endTime: null } });
            shiftType = activeShift?.type || dutyTypes[0];
        }
    }

    if (!shiftType) {
        if (dutyTypes.length === 1 && action === 'manage') {
            shiftType = dutyTypes[0];
        } else if (dutyTypes.length === 1 && (action === 'leaderboard' || action === 'time')) {
            shiftType = 'All'; 
        } else {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`duty-mgmt_dropdown_${action}`)
                .setPlaceholder(localize('staff-management-system', 'ph-sel-type'));
            
            allowedTypes.forEach(t => selectMenu.addOptions({ label: t, value: t }));
            const row = new ActionRowBuilder().addComponents(selectMenu);
            return i.editReply({ content: localize('staff-management-system', 'msg-sel-type'), components: [row.toJSON()] });
        }
    } else if (!allowedTypes.includes(shiftType)) {
        return i.editReply({ content: localize('staff-management-system', 'err-inv-type', { types: allowedTypes.join(', ') }) });
    }

    if (action === 'manage') {
        const payload = await buildDutyManagePayload(i.client, i.user.id, i.guild, shiftType);
        await i.editReply(payload);
    } else if (action === 'leaderboard') {
        const payload = await buildLeaderboardPayload(i.client, 1, shiftType);
        await i.editReply(payload);
    } else if (action === 'time') {
        const payload = await buildDutyTimePayload(i.client, i, shiftType);
        await i.editReply(payload);
    }
}

module.exports.autoComplete = {
    'manage': {
        'type': async function (interaction) {
            const config = getConfig(interaction.client, 'shifts');
            const dutyTypes = config.dutyTypes && config.dutyTypes.length > 0 
            ? config.dutyTypes 
            : ['Staff'];
            const focusedValue = interaction.value || '';
            
            const filtered = dutyTypes.filter(choice => choice.toLowerCase().startsWith(focusedValue.toLowerCase()));
            await interaction.respond(filtered.slice(0, 25).map(choice => ({ 
                name: choice, 
                value: choice 
            })));
        }
    },
    'leaderboard': {
        'type': async function (interaction) {
            const config = getConfig(interaction.client, 'shifts');
            const dutyTypes = config.dutyTypes && config.dutyTypes.length > 0 
            ? config.dutyTypes 
            : ['Staff'];
            const options = ['All', ...dutyTypes]; 
            const focusedValue = interaction.value || '';
            
            const filtered = options.filter(choice => choice.toLowerCase().startsWith(focusedValue.toLowerCase()));
            await interaction.respond(filtered.slice(0, 25).map(choice => ({ 
                name: choice, 
                value: choice 
            })));
        }
    },
    'time': {
        'type': async function (interaction) {
            const config = getConfig(interaction.client, 'shifts');
            const dutyTypes = config.dutyTypes && config.dutyTypes.length > 0 
            ? config.dutyTypes 
            : ['Staff'];
            const options = ['All', ...dutyTypes]; 
            const focusedValue = interaction.value || '';
            
            const filtered = options.filter(choice => choice.toLowerCase().startsWith(focusedValue.toLowerCase()));
            await interaction.respond(filtered.slice(0, 25).map(choice => ({ 
                name: choice, 
                value: choice 
            })));
        }
    }
};

module.exports.beforeSubcommand = async function (interaction) {
    await interaction.deferReply({ 
        flags: MessageFlags.Ephemeral 
    });
};

module.exports.subcommands = {
    'manage': async function (i) {
        await handleCommonDutyCommand(i, 'manage');
    },
    'active': async function (i) {
        const config = getConfig(i.client, 'shifts');
        if (!config || !config.enableShifts) return i.editReply({ 
            content: localize('staff-management-system', 'err-sh-dis') 
        });

        const Shift = i.client.models['staff-management-system']['StaffShift'];
        const Profile = i.client.models['staff-management-system']['StaffProfile'];
        const activeShifts = await Shift.findAll({ 
            where: { endTime: null }, 
            order: [['startTime', 'ASC']] 
        });

        if (activeShifts.length === 0) return i.editReply({ 
            content: localize('staff-management-system', 'info-no-act-sh') 
        });

        const profiles = await Profile.findAll({
            where: {
                userId: activeShifts.map(shift => shift.userId)
            }
        });
        const profileMap = new Map(profiles.map(profile => [profile.userId, profile]));

        const dutyTypes = config.dutyTypes && config.dutyTypes.length > 0 
        ? config.dutyTypes 
        : ['Staff'];

        const grouped = {};
        for (const shift of activeShifts) {
            const type = shift.type || dutyTypes[0];
            if (!grouped[type]) grouped[type] = [];
            grouped[type].push(shift);
        }

        const embed = applyFooter(i.client, new EmbedBuilder()
            .setTitle(localize('staff-management-system', 'duty-act-title'))
            .setColor('Green')
            .setDescription(localize('staff-management-system', 'duty-act-desc', { 
                count: activeShifts.length
            }))
        );

        let index = 1;
        for (const type of dutyTypes) {
            if (grouped[type]) {
                const lines = [];
                for (const shift of grouped[type]) {
                    const profile = profileMap.get(shift.userId);
                    const isOnBreak = profile?.onBreak && profile?.breakStartTime;

                    let elapsed;
                    if (isOnBreak) {
                        elapsed = Math.floor(
                            (new Date(profile.breakStartTime).getTime() - new Date(shift.startTime).getTime()) / 1000
                        );
                    } else {
                        elapsed = Math.floor(
                            (Date.now() - new Date(shift.startTime).getTime()) / 1000
                        );
                    }

                    const breakSuffix = isOnBreak
                        ? ` (${localize('staff-management-system', 'stat-brk')})`
                        : '';

                    lines.push(`${index}. **<@${shift.userId}>** • ${formatDuration(elapsed)}${breakSuffix}`);
                    index++;
                }
                embed.addFields({ 
                    name: `${type} (${grouped[type].length})`, 
                    value: lines.join('\n') 
                });
                delete grouped[type];
            }
        }
        for (const [type, shifts] of Object.entries(grouped)) {
            const lines = [];
            for (const shift of shifts) {
                const profile = profileMap.get(shift.userId);
                const isOnBreak = profile?.onBreak && profile?.breakStartTime;

                let elapsed;
                if (isOnBreak) {
                    elapsed = Math.floor(
                        (new Date(profile.breakStartTime).getTime() - new Date(shift.startTime).getTime()) / 1000
                    );
                } else {
                    elapsed = Math.floor(
                        (Date.now() - new Date(shift.startTime).getTime()) / 1000
                    );
                }

                const breakSuffix = isOnBreak
                    ? ` (${localize('staff-management-system', 'stat-brk')})`
                    : '';

                lines.push(`${index}. **<@${shift.userId}>** • ${formatDuration(elapsed)}${breakSuffix}`);
                index++;
            }

            embed.addFields({
                name: `${type} (${shifts.length}) [Legacy]`,
                value: lines.join('\n')
            });
        }
        await i.editReply({ 
            embeds: [embed.toJSON()] 
        });
    },
    'leaderboard': async function (i) {
        await handleCommonDutyCommand(i, 'leaderboard');
    },
    'time': async function (i) {
        await handleCommonDutyCommand(i, 'time');
    },
    'admin': async function (i) {
        const config = getConfig(i.client, 'shifts');
        if (!config || !config.enableShifts) return i.editReply({ 
            content: localize('staff-management-system', 'err-sh-dis') 
        });
        
        const generalConfig = getConfig(i.client, 'configuration');
        const canManage = i.member.roles.cache.some(r => [...(generalConfig.supervisorRoles || []), ...(generalConfig.managementRoles || [])].includes(r.id)) || i.member.permissions.has('Administrator');
        if (!canManage) return i.editReply({ 
            content: localize('staff-management-system', 'err-no-perm') 
        });

        const target = i.options.getMember('user');
        if (!target) return i.editReply({ 
            content: localize('staff-management-system', 'err-no-mem') 
        });
        
        const payload = await buildDutyAdminPayload(i.client, target, i.member);
        await i.editReply(payload);
    }
};

module.exports.config = {
    name: 'duty',
    description: localize('staff-management-system', 'cmd-desc-duty'),
    usage: '/duty',
    type: 'slash',
    defaultPermission: false,
    options: [
        { 
            type: 'SUB_COMMAND', 
            name: 'manage', 
            description: localize('staff-management-system', 'cmd-desc-duty-manage'),
            options: [
                { 
                    type: 'STRING', 
                    name: 'type', 
                    description: localize('staff-management-system', 'cmd-desc-duty-manage-type'), 
                    required: false, 
                    autocomplete: true 
                }
            ]
        },
        { 
            type: 'SUB_COMMAND', 
            name: 'active', 
            description: localize('staff-management-system', 'cmd-desc-duty-active') 
        },
        { 
            type: 'SUB_COMMAND', 
            name: 'leaderboard', 
            description: localize('staff-management-system', 'cmd-desc-duty-lb'),
            options: [
                { 
                    type: 'STRING', 
                    name: 'type', 
                    description: localize('staff-management-system', 'cmd-desc-duty-lb-type'), 
                    required: false, 
                    autocomplete: true 
                }
            ]
        },
        { 
            type: 'SUB_COMMAND', 
            name: 'time', 
            description: localize('staff-management-system', 'cmd-desc-duty-time'),
            options: [
                { 
                    type: 'STRING', 
                    name: 'type', 
                    description: localize('staff-management-system', 'cmd-desc-duty-time-type'), 
                    required: false, 
                    autocomplete: true 
                }
            ]
        },
        { 
            type: 'SUB_COMMAND', 
            name: 'admin', 
            description: localize('staff-management-system', 'cmd-desc-duty-admin'), 
            options: [
                { 
                    type: 'USER', 
                    name: 'user', 
                    description: localize('staff-management-system', 'cmd-desc-duty-admin-user'), 
                    required: true 
                }
            ]
        }
    ]
};

// Export handlers
module.exports.buttonHandlers = {
    handleDutyStartButton, 
    handleDutyAdminAddTimeButton,
    handleDutyBreakButton, 
    handleDutyEndButton, 
    handleDutyDropdown, 
    handleDutyHistPageButton, 
    handleDutyLbPageButton,
    handleDutyAdminForceEnd, 
    handleDutyAdminVoidActive, 
    handleDutyAdminVoidAll, 
    handleDutyAdminVoidAllSubmit, 
    handleDutyAdminAddTimeSubmit
};