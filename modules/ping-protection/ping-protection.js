/**
 * Logic for the Ping Protection module
 * @module ping-protection
 * @author itskevinnn
 */
const { Op } = require('sequelize');
const { MessageActionRow, MessageButton } = require('discord.js');
const { embedType, formatDiscordUserName, formatDate } = require('../../src/functions/helpers');
const { localize } = require('../../src/functions/localize');

const DISABLED_MSG = "History logging has been disabled by a bot-configurator.\nAre you (one of) the bot-configurators? You can enable history logging in the \"storage\" tab in the 'ping-protection' module ^^";
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
        client.logger.error(`[ping-protection] Failed to query ModerationLog: ${e.message}`);
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
    await message.reply(replyOptions).catch((e) => {
        client.logger.debug(`[ping-protection] Failed to send warning: ${e.message}`);
    });
}

async function executeAction(client, member, rule, reason, storageConfig) {
    const actionType = rule.actionType; 
    if (!member) return false;
    
    const botMember = await member.guild.members.fetch(client.user.id);
    if (botMember.roles.highest.position <= member.roles.highest.position) {
        client.logger.warn(`[ping-protection] Hierarchy Failure: Cannot moderate ${member.user.tag}.`);
        return false;
    }

    // Database logging
    const logDb = async (type, duration = null) => {
        if (!storageConfig.enableModLogHistory) return;
        try {
            await client.models['ping-protection']['ModerationLog'].create({
                victimID: member.id,
                type,
                actionDuration: duration,
                reason
            });
        } catch (dbError) {
            client.logger.error(`[ping-protection] DB Insert Failed: ${dbError.message}`);
        }
    };

    if (actionType === 'MUTE') {
        const durationMs = rule.muteDuration * 60000;
        await logDb('MUTE', rule.muteDuration);
        
        try {
            await member.timeout(durationMs, reason);
            client.logger.info(`[ping-protection] Muted ${member.user.tag} for ${rule.muteDuration}m.`);
            return true;
        } catch (error) {
            client.logger.error(`[ping-protection] Mute failed: ${error.message}`);
            return false;
        }
    } else if (actionType === 'KICK') {
        await logDb('KICK');
        try {
            await member.kick(reason);
            client.logger.info(`[ping-protection] Kicked ${member.user.tag}.`);
            return true;
        } catch (error) {
            client.logger.error(`[ping-protection] Kick failed: ${error.message}`);
            return false;
        }
    }
    return false;
}

// View generations

async function generateHistoryResponse(client, userId, page = 1) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    const limit = 8;
    const isEnabled = storageConfig.enablePingHistory;

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
            description += `⚠️ User left at ${dateStr}. These logs will stay until automatic deletion.\n\n`;
        } else {
            description += `⚠️ User left at ${dateStr}.\n\n`;
        }
    }

    if (!isEnabled) {
        description += DISABLED_MSG;
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

    const replyOptions = embedType({
        _schema: 'v3',
        embeds: [{
            title: localize('ping-protection', 'embed-history-title', { u: user.username }),
            thumbnailURL: user.displayAvatarURL({ dynamic: true }),
            description: description,
            color: 'ORANGE'
        }]
    });
    replyOptions.components = [row];
    return replyOptions;
}
// Generates the actions view
async function generateActionsResponse(client, userId, page = 1) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    const limit = 8;
    const isEnabled = storageConfig.enableModLogHistory;

    let total = 0, history = [], totalPages = 1;

    if (isEnabled) {
        const data = await fetchModHistory(client, userId, page, limit);
        total = data.total;
        history = data.history;
        totalPages = Math.ceil(total / limit) || 1;
    }

    const user = await client.users.fetch(userId).catch(() => ({ username: 'Unknown User', displayAvatarURL: () => null }));
    let description = "";

    if (!isEnabled) {
        description = DISABLED_MSG;
    } else if (history.length === 0) {
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

    const replyOptions = embedType({
        _schema: 'v3',
        embeds: [{
            title: localize('ping-protection', 'embed-actions-title', { u: user.username }),
            thumbnailURL: user.displayAvatarURL({ dynamic: true }),
            description: description,
            color: 'RED'
        }]
    });
    replyOptions.components = [row];
    return replyOptions;
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

    if (storageConfig.enableModLogHistory) {
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