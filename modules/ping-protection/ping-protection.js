/**
 * Logic for the Ping Protection module
 * @module ping-protection
 * @author itskevinnn
 */
const { Op } = require('sequelize');
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
const { embedType, embedTypeV2, formatDate } = require('../../src/functions/helpers');
const { localize } = require('../../src/functions/localize');

// Data handling
async function addPing(client, messageObj, target) {
    const isRole = !target.username; 
    await client.models['ping-protection']['PingHistory'].create({
        userId: messageObj.author.id,
        messageUrl: messageObj.url || 'Blocked by AutoMod',
        targetId: target.id,
        isRole: isRole
    });
}

async function getPingCountInWindow(client, userId, days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

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

// Makes sure the channel ID from config is valid for Discord
function getSafeChannelId(configValue) {
    if (!configValue) return null;
    let rawId = null;
    if (Array.isArray(configValue) && configValue.length > 0) rawId = configValue[0];
    else if (typeof configValue === 'string') rawId = configValue;

    if (rawId && (typeof rawId === 'string' || typeof rawId === 'number')) {
        const finalId = rawId.toString();
        if (finalId.length > 5) return finalId;
    }
    return null;
}

async function sendPingWarning(client, message, target, moduleConfig) {
    const warningMsg = moduleConfig.pingWarningMessage;
    if (!warningMsg) return;

    const placeholders = {
        '%target-name%': target.name || target.tag || target.username || 'Unknown',
        '%target-mention%': target.toString(),
        '%target-id%': target.id,
        '%user-id%': message.author.id
    };

    let messageOptions = await embedTypeV2(warningMsg, placeholders);
    return message.reply(messageOptions).catch(async () => {
        return message.channel.send(messageOptions).catch(() => {});
    });
}
// Syncs the native AutoMod rule based on configuration
async function syncNativeAutoMod(client) {
    const config = client.configurations['ping-protection']['configuration'];
    
    try {
        const guild = await client.guilds.fetch(client.guildID);
        const rules = await guild.autoModerationRules.fetch();
        const existingRule = rules.find(r => r.name === 'SCNX Ping Protection');

        // Logic to disable/delete the rule
        if (!config || !config.enableAutomod) {
            if (existingRule) {
                await existingRule.delete().catch(() => {});
            }
            return;
        }

        const protectedIds = [...(config.protectedRoles || []), ...(config.protectedUsers || [])];
        
        // Deletest the rule if there are no protected IDs
        if (protectedIds.length === 0) {
            if (existingRule) {
                await existingRule.delete().catch(() => {});
            }
            return;
        }
        
        // AutoMod rule data
        const actions = [];
        const blockMetadata = {};
        if (config.autoModBlockMessage) {
            blockMetadata.customMessage = config.autoModBlockMessage;
        }
        actions.push({ type: 1, metadata: blockMetadata });

        const alertChannelId = getSafeChannelId(config.autoModLogChannel);
        if (alertChannelId) {
            actions.push({
                type: 2, 
                metadata: { channel: alertChannelId }
            });
        }

        const ruleData = {
            name: 'SCNX Ping Protection',
            eventType: 1, 
            triggerType: 1, 
            triggerMetadata: {
                keywordFilter: protectedIds.map(id => `*${id}*`) 
            },
            actions: actions,
            enabled: true,
            exemptRoles: config.ignoredRoles || [],
            exemptChannels: config.ignoredChannels || []
        };

        if (existingRule) {
            await guild.autoModerationRules.edit(existingRule.id, ruleData);
        } else {
            await guild.autoModerationRules.create(ruleData);
        }
    } catch (e) {
        client.logger.error(`[ping-protection] AutoMod Sync/Cleanup Failed: ${error.message}`);
    }
}
// Generates history response
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
        description += `⚠️ ${localize('ping-protection', history.length > 0 ? 'leaver-warning-long' : 'leaver-warning-short', { d: dateStr })}\n\n`;
    }

    if (!isEnabled) {
        description += localize('ping-protection', 'history-disabled');
    } else if (history.length === 0) {
        description += localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const timeString = formatDate(entry.createdAt);
            const targetString = entry.targetId ? (entry.isRole ? `<@&${entry.targetId}>` : `<@${entry.targetId}>`) : "Detected";
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
        .setColor('ORANGE')
        .setFooter({ text: client.strings.footer, iconURL: client.strings.footerImgUrl });

    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    return { embeds: [embed], components: [row] };
}
// Generates actions response
async function generateActionsResponse(client, userId, page = 1) {
    const moderationConfig = client.configurations['ping-protection']['moderation'];
    const limit = 8;
    
    const rule1 = (moderationConfig && Array.isArray(moderationConfig) && moderationConfig.length > 0) ? moderationConfig[0] : null;
    const isEnabled = rule1 ? rule1.enableModeration : false;

    let total = 0, history = [], totalPages = 1;

    const data = await fetchModHistory(client, userId, page, limit);
    total = data.total;
    history = data.history;
    totalPages = Math.ceil(total / limit) || 1;

    const user = await client.users.fetch(userId).catch(() => ({ username: 'Unknown User', displayAvatarURL: () => null }));
    let description = "";

    if (!isEnabled) {
        description += `${localize('ping-protection', 'warning-mod-disabled')}\n\n`;
    }

    if (history.length === 0) {
        description += localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const duration = entry.actionDuration ? ` (${entry.actionDuration}m)` : '';
            const reasonText = entry.reason || localize('ping-protection', 'no-reason') || 'No reason';
            return `${(page - 1) * limit + index + 1}. **${entry.type}${duration}** - ${formatDate(entry.createdAt)}\n${localize('ping-protection', 'label-reason')}: ${reasonText}`;
        });
        description += lines.join('\n\n') + `\n\n*${localize('ping-protection', 'actions-retention-note')}*`;
    }

    const row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId(`ping-protection_mod-page_${userId}_${page - 1}`).setLabel('Back').setStyle('PRIMARY').setDisabled(page <= 1),
        new MessageButton().setCustomId('ping_protection_page_count').setLabel(`${page}/${totalPages}`).setStyle('SECONDARY').setDisabled(true),
        new MessageButton().setCustomId(`ping-protection_mod-page_${userId}_${page + 1}`).setLabel('Next').setStyle('PRIMARY').setDisabled(page >= totalPages || (!isEnabled && history.length === 0))
    );

    const embed = new MessageEmbed()
        .setTitle(localize('ping-protection', 'embed-actions-title', { u: user.username }))
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(description)
        .setColor(isEnabled ? 'RED' : 'GREY') 
        .setFooter({ text: client.strings.footer, iconURL: client.strings.footerImgUrl });

    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    return { embeds: [embed], components: [row] };
}
// Handles data deletion
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
        const retentionWeeks = storageConfig.pingHistoryRetention || 12;
        historyCutoff.setDate(historyCutoff.getDate() - (retentionWeeks * 7));
        if (storageConfig.DeleteAllPingHistoryAfterTimeframe) {
            const usersWithExpiredData = await client.models['ping-protection']['PingHistory'].findAll({
                where: { createdAt: { [Op.lt]: historyCutoff } },
                attributes: ['userId'],
                group: ['userId']
            });

            const userIdsToWipe = usersWithExpiredData.map(entry => entry.userId);
            if (userIdsToWipe.length > 0) {
                await client.models['ping-protection']['PingHistory'].destroy({
                    where: { userId: userIdsToWipe }
                });
            }
        } 
        else {
            await client.models['ping-protection']['PingHistory'].destroy({ 
                where: { createdAt: { [Op.lt]: historyCutoff } } 
            });
        }
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

async function executeAction(client, member, rule, reason, storageConfig) {
    const actionType = rule.actionType; 
    if (!member) {
        client.logger.debug('[Ping Protection] ' + localize('ping-protection', 'not-a-member'));
        return false;
    }
    const botMember = await member.guild.members.fetch(client.user.id);
    if (botMember.roles.highest.position <= member.roles.highest.position) {
        client.logger.warn('[Ping Protection] ' + localize('ping-protection', 'punish-role-error', {tag: member.user.tag}));
        return false;
    }
    const logDb = async (type, duration = null) => {
        try {
            await client.models['ping-protection']['ModerationLog'].create({
                victimID: member.id, type, actionDuration: duration, reason
            });
        } catch (dbError) {}
    };
    if (actionType === 'MUTE') {
        const durationMs = rule.muteDuration * 60000;
        await logDb('MUTE', rule.muteDuration);
        try { 
            await member.timeout(durationMs, reason); 
            client.logger.info('[Ping Protection] ' + localize('ping-protection', 'log-mute-success', {tag: member.user.tag, dur: rule.muteDuration}));
            return true; 
        } catch (error) { 
            client.logger.warn('[Ping Protection] ' + localize('ping-protection', 'log-mute-error', {tag: member.user.tag, e: error.message}));
            return false; 
        }
    } else if (actionType === 'KICK') {
        await logDb('KICK');
        try { 
            await member.kick(reason); 
            client.logger.info('[Ping Protection] ' + localize('ping-protection', 'log-kick-success', {tag: member.user.tag}));
            return true; 
        } catch (error) { 
            client.logger.warn('[Ping Protection] ' + localize('ping-protection', 'log-kick-error', {tag: member.user.tag, e: error.message}));
            return false; 
        }
    }
    return false;
}

module.exports = {
    addPing,
    getPingCountInWindow,
    sendPingWarning,
    syncNativeAutoMod,
    fetchPingHistory,
    fetchModHistory,
    executeAction,
    deleteAllUserData,
    getLeaverStatus,
    markUserAsLeft,
    markUserAsRejoined,
    enforceRetention,
    generateHistoryResponse,
    generateActionsResponse,
    getSafeChannelId
};