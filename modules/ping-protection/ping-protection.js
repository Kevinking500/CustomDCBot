/**
 * Logic for the Ping Protection module
 * @module ping-protection
 * @author itskevinnn
 */
const { Op } = require('sequelize');
const { embedType, formatDiscordUserName } = require('../../src/functions/helpers');
const { localize } = require('../../src/functions/localize');

// Adds a ping entry to the database
async function addPing(client, message, target) {
    const isRole = !target.username;
    await client.models['ping-protection']['PingHistory'].create({
        userId: message.author.id,
        messageUrl: message.url,
        targetId: target.id,
        isRole: isRole
    });
}

// Gets the number of pings in the specified timeframe
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
// Sends the ping warning message
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

 // Fetches ping history
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

// Fetches moderation action history
async function fetchModHistory(client, userId, limit = 10) {
    if (!client.models['ping-protection'] || !client.models['ping-protection']['ModerationLog']) return [];

    try {
        return await client.models['ping-protection']['ModerationLog'].findAll({
            where: { victimID: userId },
            order: [['createdAt', 'DESC']],
            limit: limit
        });
    } catch (e) {
        client.logger.error(`[MOD-FETCH-ERROR] Failed to query ModerationLog: ${e.message}`);
        return [];
    }
}

// Executes the configured moderation action
async function executeAction(client, member, rule, reason, storageConfig) {
    const actionType = rule.actionType; 
    
    if (!member) return false;
    
    const botMember = await member.guild.members.fetch(client.user.id);
    if (botMember.roles.highest.position <= member.roles.highest.position) {
        client.logger.warn(`[ping-protection] Hierarchy Failure: Cannot moderate ${member.user.tag}.`);
        return false;
    }

    if (actionType === 'MUTE') {
        const durationMs = rule.muteDuration * 60000;
        
        if (storageConfig.enableModLogHistory) {
            try {
                await client.models['ping-protection']['ModerationLog'].create({
                    victimID: member.id,
                    type: 'MUTE',
                    actionDuration: rule.muteDuration, 
                    reason: reason
                });
            } catch (dbError) {
                client.logger.error(`[ping-protection] DB Insert Failed: ${dbError.message}`);
            }
        }
        
        try {
            await member.timeout(durationMs, reason);
            client.logger.info(`[MODERATION] Muted ${member.user.tag} for ${rule.muteDuration}m.`);
            return true;
        } catch (error) {
            client.logger.error(`[ping-protection] Mute failed: ${error.message}`);
            return false;
        }

    } else if (actionType === 'KICK') {
        
        if (storageConfig.enableModLogHistory) {
            try {
                await client.models['ping-protection']['ModerationLog'].create({
                    victimID: member.id, 
                    type: 'KICK',
                    reason: reason
                });
            } catch (dbError) {
                client.logger.error(`[ping-protection] DB Insert Failed: ${dbError.message}`);
            }
        }
        
        try {
            await member.kick(reason);
            client.logger.info(`[MODERATION] Kicked ${member.user.tag}.`);
            return true;
        } catch (error) {
            client.logger.error(`[ping-protection] Kick failed: ${error.message}`);
            return false;
        }
    }
    return false;
}
// Handles deletion of all data from a user
async function deleteAllUserData(client, userId) {
    await client.models['ping-protection']['PingHistory'].destroy({ where: { userId: userId } });
    await client.models['ping-protection']['ModerationLog'].destroy({ where: { victimID: userId } });
    await client.models['ping-protection']['LeaverData'].destroy({ where: { userId: userId } });
    
    client.logger.info('[ping-protection] ' + localize('ping-protection', 'log-manual-delete', { u: userId }));
}

async function getLeaverStatus(client, userId) {
    return await client.models['ping-protection']['LeaverData'].findByPk(userId);
}

async function markUserAsLeft(client, userId) {
    await client.models['ping-protection']['LeaverData'].upsert({
        userId: userId,
        leftAt: new Date()
    });
}

async function markUserAsRejoined(client, userId) {
    await client.models['ping-protection']['LeaverData'].destroy({
        where: { userId: userId }
    });
}
// Enforces data retention policies
async function enforceRetention(client) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    if (!storageConfig) return;

    if (storageConfig.enablePingHistory) {
        const historyWeeks = storageConfig.pingHistoryRetention || 12; 
        const historyCutoff = new Date();
        historyCutoff.setDate(historyCutoff.getDate() - (historyWeeks * 7));

        await client.models['ping-protection']['PingHistory'].destroy({
            where: { createdAt: { [Op.lt]: historyCutoff } }
        });
    }

    if (storageConfig.enableModLogHistory) {
        const modMonths = storageConfig.modLogRetention || 6;
        const modCutoff = new Date();
        modCutoff.setMonth(modCutoff.getMonth() - modMonths);

        await client.models['ping-protection']['ModerationLog'].destroy({
            where: { createdAt: { [Op.lt]: modCutoff } }
        });
    }

    if (storageConfig.enableLeaverDataRetention) {
        const leaverDays = storageConfig.leaverRetention || 1;
        const leaverCutoff = new Date();
        leaverCutoff.setDate(leaverCutoff.getDate() - leaverDays);

        const leaversToDelete = await client.models['ping-protection']['LeaverData'].findAll({
            where: { leftAt: { [Op.lt]: leaverCutoff } }
        });

        for (const leaver of leaversToDelete) {
            const userId = leaver.userId;
            await client.models['ping-protection']['PingHistory'].destroy({ where: { userId } });
            await client.models['ping-protection']['ModerationLog'].destroy({ where: { userId: userId } }); 
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
    enforceRetention
};