/**
 * Logic for the Ping Protection module
 * @module ping-protection
 * @author itskevinnn
 */
const { Op } = require('sequelize');
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
const { embedType, formatDate } = require('../../src/functions/helpers');
const { localize } = require('../../src/functions/localize');

// Core functions and logic
async function addPing(client, message, target) {
    const isRole = !target.username; 
    await client.models['ping-protection']['PingHistory'].create({
        userId: message.author.id,
        messageUrl: message.url,
        targetId: target.id,
        isRole: isRole
    });
}

async function getPingCountInWindow(client, userId, weeks) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (weeks * 7));

    return await client.models['ping-protection']['PingHistory'].count({
        where: {
            userId: userId,
            createdAt: { [Op.gt]: cutoffDate }
        }
    });
}

async function fetchPingHistory(client, userId, page = 1, limit = 8) { 
    const offset = (page - 1) * limit;
    const { count, rows } = await client.models['ping-protection']['PingHistory'].findAndCountAll({ 
        where: { userId: userId },
        order: [['createdAt', 'DESC']], 
        limit: limit,
        offset: offset
    });
    return { total: count, history: rows };
}

async function fetchModHistory(client, userId, page = 1, limit = 8) {
    if (!client.models['ping-protection'] || !client.models['ping-protection']['ModerationLog']) return { total: 0, history: [] };
    try {
        const offset = (page - 1) * limit;
        const { count, rows } = await client.models['ping-protection']['ModerationLog'].findAndCountAll({
            where: { victimID: userId },
            order: [['createdAt', 'DESC']],
            limit: limit,
            offset: offset
        });
        return { total: count, history: rows };
    } catch (e) {
        return { total: 0, history: [] };
    }
}

async function getLeaverStatus(client, userId) {
    return await client.models['ping-protection']['LeaverData'].findByPk(userId);
}

// Action logic

async function sendPingWarning(client, message, target, moduleConfig) {
    const warningMsg = moduleConfig.pingWarningMessage;
    if (!warningMsg) return;

    const targetName = target.name || target.tag || target.username || 'Unknown';
    const targetMention = target.toString();

    const placeholders = {
        '%target-name%': targetName,
        '%target-mention%': targetMention,
        '%target-id%': target.id
    };

    const replyOptions = embedType(warningMsg, placeholders);
    await message.reply(replyOptions).catch(() => {});
}

async function executeAction(client, member, rule, reason, storageConfig) {
    const actionType = rule.actionType; 
    if (!member) return false;
    
    const botMember = await member.guild.members.fetch(client.user.id);
    if (botMember.roles.highest.position <= member.roles.highest.position) {
        return false;
    }

    // Database logging
    const logDb = async (type, duration = null) => {
        try {
            await client.models['ping-protection']['ModerationLog'].create({
                victimID: member.id,
                type,
                actionDuration: duration,
                reason
            });
        } catch (dbError) {}
    };

    if (actionType === 'MUTE') {
        const durationMs = rule.muteDuration * 60000;
        await logDb('MUTE', rule.muteDuration);
        
        try {
            await member.timeout(durationMs, reason);
            return true;
        } catch (error) {
            return false;
        }
    } else if (actionType === 'KICK') {
        await logDb('KICK');
        try {
            await member.kick(reason);
            return true;
        } catch (error) {
            return false;
        }
    }
    return false;
}

// Generates history and actions responses
async function generateHistoryResponse(client, userId, page = 1) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    const limit = 8;
    const isEnabled = !!storageConfig.enablePingHistory;

    let total = 0, history = [], totalPages = 1;

    if (isEnabled) {
        const data = await fetchPingHistory(client, userId, page, limit);
        total = data.total;
        history = data.history;
        totalPages = Math.ceil(total / limit) || 1;
    }

    const user = await client.users.fetch(userId).catch(() => ({ username: 'Unknown User', displayAvatarURL: () => null }));
    const leaverData = await getLeaverStatus(client, userId);
    let description = "";
    
    if (leaverData) {
        const dateStr = formatDate(leaverData.leftAt);
        if (history.length > 0) {
            description += `⚠️ ${localize('ping-protection', 'leaver-warning-long', { d: dateStr })}\n\n`;
        } else {
            description += `⚠️ ${localize('ping-protection', 'leaver-warning-short', { d: dateStr })}\n\n`;
        }
    }

    if (!isEnabled) {
        description += localize('ping-protection', 'history-disabled');
    } else if (history.length === 0) {
        description += localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const timeString = formatDate(entry.createdAt);
            let targetString = "Unknown";
            
            if (entry.targetId) {
                targetString = entry.isRole ? `<@&${entry.targetId}>` : `<@${entry.targetId}>`; 
            } else {
                targetString = "Detected";
            }
            
            return `${(page - 1) * limit + index + 1}. **Pinged ${targetString}** at ${timeString}\n[Jump to Message](${entry.messageUrl})`;
        });
        description += lines.join('\n\n');
    }

    const row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId(`ping-protection_hist-page_${userId}_${page - 1}`).setLabel('Back').setStyle('PRIMARY').setDisabled(page <= 1),
        new MessageButton().setCustomId('ping_protection_page_count').setLabel(`${page}/${totalPages}`).setStyle('SECONDARY').setDisabled(true),
        new MessageButton().setCustomId(`ping-protection_hist-page_${userId}_${page + 1}`).setLabel('Next').setStyle('PRIMARY').setDisabled(page >= totalPages || !isEnabled)
    );

    const embed = new MessageEmbed()
        .setTitle(localize('ping-protection', 'embed-history-title', { u: user.username }))
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(description)
        .setColor('ORANGE');

    return { embeds: [embed], components: [row], ephemeral: false };
}

async function generateActionsResponse(client, userId, page = 1) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    const limit = 8;
    const isEnabled = true; 

    let total = 0, history = [], totalPages = 1;

    if (isEnabled) {
        const data = await fetchModHistory(client, userId, page, limit);
        total = data.total;
        history = data.history;
        totalPages = Math.ceil(total / limit) || 1;
    }

    const user = await client.users.fetch(userId).catch(() => ({ username: 'Unknown User', displayAvatarURL: () => null }));
    let description = "";

    if (history.length === 0) {
        description = localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const duration = entry.actionDuration ? ` (${entry.actionDuration}m)` : '';
            const reasonText = entry.reason || localize('ping-protection', 'no-reason') || 'No reason';
            const timeString = formatDate(entry.createdAt);
            
            return `${(page - 1) * limit + index + 1}. **${entry.type}${duration}** - ${timeString}\n${localize('ping-protection', 'label-reason')}: ${reasonText}`;
        });
        description = lines.join('\n\n') + `\n\n*${localize('ping-protection', 'actions-retention-note')}*`;
    }

    const row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId(`ping-protection_mod-page_${userId}_${page - 1}`).setLabel('Back').setStyle('PRIMARY').setDisabled(page <= 1),
        new MessageButton().setCustomId('ping_protection_page_count').setLabel(`${page}/${totalPages}`).setStyle('SECONDARY').setDisabled(true),
        new MessageButton().setCustomId(`ping-protection_mod-page_${userId}_${page + 1}`).setLabel('Next').setStyle('PRIMARY').setDisabled(page >= totalPages || !isEnabled)
    );

    const embed = new MessageEmbed()
        .setTitle(localize('ping-protection', 'embed-actions-title', { u: user.username }))
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(description)
        .setColor('RED');

    return { embeds: [embed], components: [row], ephemeral: false };
}

// Manages data deletion
async function deleteAllUserData(client, userId) {
    await client.models['ping-protection']['PingHistory'].destroy({ where: { userId: userId } });
    await client.models['ping-protection']['ModerationLog'].destroy({ where: { victimID: userId } });
    await client.models['ping-protection']['LeaverData'].destroy({ where: { userId: userId } });
    client.logger.info('[ping-protection] ' + localize('ping-protection', 'log-manual-delete-logs', { u: userId }));
}

async function markUserAsLeft(client, userId) {
    await client.models['ping-protection']['LeaverData'].upsert({ userId: userId, leftAt: new Date() });
}

async function markUserAsRejoined(client, userId) {
    await client.models['ping-protection']['LeaverData'].destroy({ where: { userId: userId } });
}

async function enforceRetention(client) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    if (!storageConfig) return;

    if (storageConfig.enablePingHistory) {
        const historyCutoff = new Date();
        historyCutoff.setDate(historyCutoff.getDate() - ((storageConfig.pingHistoryRetention || 12) * 7));
        await client.models['ping-protection']['PingHistory'].destroy({ where: { createdAt: { [Op.lt]: historyCutoff } } });
    }

    if (storageConfig.modLogRetention) {
        const modCutoff = new Date();
        modCutoff.setMonth(modCutoff.getMonth() - (storageConfig.modLogRetention || 6));
        await client.models['ping-protection']['ModerationLog'].destroy({ where: { createdAt: { [Op.lt]: modCutoff } } });
    }

    if (storageConfig.enableLeaverDataRetention) {
        const leaverCutoff = new Date();
        leaverCutoff.setDate(leaverCutoff.getDate() - (storageConfig.leaverRetention || 1));
        const leaversToDelete = await client.models['ping-protection']['LeaverData'].findAll({ where: { leftAt: { [Op.lt]: leaverCutoff } } });
        for (const leaver of leaversToDelete) {
            await deleteAllUserData(client, leaver.userId);
            await leaver.destroy();
        }
    }
}

module.exports = {
    addPing,
    getPingCountInWindow,
    sendPingWarning,
    fetchPingHistory,
    fetchModHistory,
    executeAction,
    deleteAllUserData,
    getLeaverStatus,
    markUserAsLeft,
    markUserAsRejoined,
    enforceRetention,
    generateHistoryResponse,
    generateActionsResponse
};