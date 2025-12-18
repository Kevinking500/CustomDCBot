/**
 * Logic for the Ping Protection module
 * @module ping-protection
 * @author itskevinnn
 */
const { Op } = require('sequelize');
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
const { embedType, embedTypeV2, formatDate } = require('../../src/functions/helpers');
const { localize } = require('../../src/functions/localize');

async function addPing(client, message, target) {
    const isRole = !target.username; 
    await client.models['ping-protection']['PingHistory'].create({
        userId: message.author.id,
        messageUrl: message.url || 'Blocked by AutoMod',
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

async function sendAutoModRepost(client, channel, author, content, targetId, moduleConfig) {
    if (!moduleConfig.sendContentAsBot) return null;

    const warningMsg = moduleConfig.pingWarningMessage;
    const targetMention = `<@${targetId}>`; 
    
    const placeholders = {
        '%target-name%': 'Protected Target',
        '%target-mention%': targetMention,
        '%target-id%': targetId,
        '%user-id%': author.id
    };
    
    let warningOptions = await embedTypeV2(warningMsg, placeholders);
    let warningText = "";

    if (warningOptions.embeds && warningOptions.embeds.length > 0) {
        warningText = warningOptions.embeds[0].description || "";
    } else {
        warningText = warningOptions.content || "";
    }

    const embed = new MessageEmbed()
        .setAuthor({ name: author.tag, iconURL: author.displayAvatarURL({ dynamic: true }) })
        .setTitle(localize('ping-protection', 'automod-block-title') || "New message with a blocked ping")
        .setDescription(`${content}\n\n${warningText}`)
        .setColor('RED')
        .setFooter({ text: client.strings.footer, iconURL: client.strings.footerImgUrl });

    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    return await channel.send({ embeds: [embed] }).catch((err) => {
        client.logger.error(`[ping-protection] Repost Failed: ${err.message}`);
        return null;
    });
}

async function syncNativeAutoMod(client) {
    const config = client.configurations['ping-protection']['configuration'];
    if (!config || !config.enableAutomod) return;

    try {
        const guild = await client.guilds.fetch(client.guildID);
        const rules = await guild.autoModerationRules.fetch();
        const existingRule = rules.find(r => r.name === 'SCNX Ping Protection');

        const protectedIds = [...(config.protectedRoles || []), ...(config.protectedUsers || [])];
        
        if (protectedIds.length === 0) {
            if (existingRule) await existingRule.delete().catch(() => {});
            return;
        }

        const actions = [{ type: 1 }]; 

        const alertChannelId = getSafeChannelId(config.autoModLogChannel);

        if (alertChannelId) {
            actions.push({
                type: 2, 
                metadata: {
                    channel: alertChannelId 
                }
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
            client.logger.info(`[ping-protection] AutoMod synced. Actions: ${actions.length}`);
        } else {
            await guild.autoModerationRules.create(ruleData);
            client.logger.info(`[ping-protection] AutoMod created. Actions: ${actions.length}`);
        }
    } catch (e) {
        client.logger.error(`[ping-protection] AutoMod Sync Failed: ${e.message}`);
        if (e.rawError) client.logger.error(JSON.stringify(e.rawError, null, 2));
    }
}

async function handleAutoModAlert(client, alertMessage) {
    const config = client.configurations['ping-protection']['configuration'];
    if (!config) return;

    let fullText = alertMessage.content || "";
    if (alertMessage.embeds.length > 0) {
        const embed = alertMessage.embeds[0];
        fullText += " " + (embed.title || "");
        fullText += " " + (embed.description || "");
        fullText += " " + (embed.footer ? embed.footer.text : "");
        if (embed.fields) {
            embed.fields.forEach(f => fullText += " " + f.value + " " + f.name);
        }
    }

    let originalChannelId = null;

    if (alertMessage.mentions.channels.size > 0) {
        originalChannelId = alertMessage.mentions.channels.first().id;
    }

    if (!originalChannelId && alertMessage.components) {
        for (const row of alertMessage.components) {
            for (const component of row.components) {
                if (component.style === 5 && component.url && component.url.includes('/channels/')) {
                    const parts = component.url.split('/');
                    if (parts.length >= 2) {
                        originalChannelId = parts[parts.length - 2];
                        break;
                    }
                }
            }
            if (originalChannelId) break;
        }
    }

    if (!originalChannelId) {
        const mentionMatch = fullText.match(/<#(\d{17,19})>/);
        if (mentionMatch) originalChannelId = mentionMatch[1];
    }

    if (!originalChannelId) {
        // DEBUG: Log the components to see what's failing
        if (alertMessage.components.length > 0) {
            client.logger.info(`[ping-protection] Debug Components: ${JSON.stringify(alertMessage.components)}`);
        }
        client.logger.warn('[ping-protection] Repost Failed: Could not extract Channel ID.');
        return;
    }

    let userId = null;

    if (alertMessage.mentions.users.size > 0) {
        const found = alertMessage.mentions.users.find(u => u.id !== client.user.id);
        if (found) userId = found.id;
    }

    if (!userId) {
        const parenMatch = fullText.match(/\((\d{17,19})\)/);
        if (parenMatch) userId = parenMatch[1];
    }

    if (!userId) {
        const mentionMatch = fullText.match(/<@!?(\d{17,19})>/);
        if (mentionMatch) userId = mentionMatch[1];
    }

    if (!userId) {
        client.logger.warn('[ping-protection] Repost Failed: Could not extract User ID.');
        return;
    }

    let content = "*[Content Hidden]*";
    if (alertMessage.embeds.length > 0) {
        const embed = alertMessage.embeds[0];
        if (embed.description && embed.description.length > 20) {
             content = embed.description;
        }
        const contentField = embed.fields.find(f => f.name && (f.name.includes('Content') || f.name.includes('Message')));
        if (contentField) content = contentField.value;
    }

    let targetId = "Protected User";
    const keywordMatch = fullText.match(/Keyword:\s*\*?(\d+)\*?/);
    if (keywordMatch) targetId = keywordMatch[1];

    const author = await client.users.fetch(userId).catch(() => null);
    const originalChannel = await client.channels.fetch(originalChannelId).catch(() => null);

    if (author && originalChannel) {
        const reposted = await sendAutoModRepost(client, originalChannel, author, content, targetId, config);
        
        const storageConfig = client.configurations['ping-protection']['storage'];
        if (!!storageConfig && !!storageConfig.enablePingHistory) {
            const logUrl = reposted ? reposted.url : 'Blocked by AutoMod';
            const mockMessage = { author: { id: userId }, url: logUrl };
            const mockTarget = { id: targetId }; 
            await addPing(client, mockMessage, mockTarget);
        }
    } else {
        client.logger.error(`[ping-protection] Resolution Failed: Author: ${!!author}, Channel: ${!!originalChannel}`);
    }
}

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
async function executeAction(client, member, rule, reason, storageConfig) {
    const actionType = rule.actionType; 
    if (!member) return false;
    const botMember = await member.guild.members.fetch(client.user.id);
    if (botMember.roles.highest.position <= member.roles.highest.position) return false;
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
        try { await member.timeout(durationMs, reason); return true; } catch (error) { return false; }
    } else if (actionType === 'KICK') {
        await logDb('KICK');
        try { await member.kick(reason); return true; } catch (error) { return false; }
    }
    return false;
}

module.exports = {
    addPing,
    getPingCountInWindow,
    sendPingWarning,
    sendAutoModRepost,
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
    handleAutoModAlert,
    getSafeChannelId
};