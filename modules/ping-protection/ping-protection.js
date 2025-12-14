/**
 * Logic for the Ping Protection module
 * @module ping-protection
 * @author itskevinnn
 */
const { Op } = require('sequelize');
const { embedType, formatDiscordUserName } = require('../../src/functions/helpers');
const { localize } = require('../../src/functions/localize');

/**
 * Adds a ping record to the database
 * @param {Client} client
 * @param {Message} message 
 */
async function addPing(client, message) {
    await client.models['ping-protection']['PingHistory'].create({
        userId: message.author.id,
        messageUrl: message.url
    });
}

/**
 * Counts pings within a specific timeframe
 * @param {Client} client 
 * @param {string} userId 
 * @param {number} weeks 
 * @returns {Promise<number>}
 */
async function getPingCountInWindow(client, userId, weeks) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (weeks * 7));

    return await client.models['ping-protection']['PingHistory'].count({
        where: {
            userId: userId,
            timestamp: {
                [Op.gt]: cutoffDate
            }
        }
    });
}

/**
 * Sends the warning message
 * @param {Client} client
 * @param {Message} message 
 * @param {Role|User} target 
 * @param {Object} moduleConfig 
 */
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
        client.logger.debug(`[ping-protection] Failed to send warning to ${message.author.tag}: ${e.message}`);
    });
}

/**
 * Fetches the last X pings
 * @param {Client} client 
 * @param {string} userId 
 * @param {number} limit 
 * @returns {Promise<Array>}
 */
async function fetchPingHistory(client, userId, limit = 10) {
    return await client.models['ping-protection']['PingHistory'].findAll({
        where: { userId: userId },
        order: [['timestamp', 'DESC']],
        limit: limit
    });
}

/**
 * Fetches the moderation log history
 * @param {Client} client 
 * @param {string} userId 
 * @param {number} limit 
 * @returns {Promise<Array>}
 */
async function fetchModHistory(client, userId, limit = 10) {
    return await client.models['ping-protection']['ModerationLog'].findAll({
        where: { userId: userId },
        order: [['timestamp', 'DESC']],
        limit: limit
    });
}

/**
 * Executes a punishment and logs it if configured
 * @param {Client} client 
 * @param {GuildMember} member 
 * @param {Object} actionConfig 
 * @param {string} reason 
 * @param {Object} storageConfig 
 */
async function executeAction(client, member, actionConfig, reason, storageConfig) {
    const ModLog = client.models['ping-protection']['ModerationLog'];

    try {
        if (actionConfig.type === 'MUTE') {
            const durationMs = (actionConfig.muteDuration || 60) * 60 * 1000;
            
            await member.timeout(durationMs, reason);
            
            if (storageConfig && storageConfig.enableModLogHistory) {
                await ModLog.create({
                    userId: member.id,
                    actionType: 'MUTE',
                    actionDuration: durationMs,
                    reason: reason
                });
            }
            
            client.logger.info('[ping-protection] ' + localize('ping-protection', 'log-action-mute', {
                u: member.user.tag,
                t: actionConfig.muteDuration,
                r: reason
            }));

        } else if (actionConfig.type === 'KICK') {
            await member.kick(reason);

            if (storageConfig && storageConfig.enableModLogHistory) {
                await ModLog.create({
                    userId: member.id,
                    actionType: 'KICK',
                    actionDuration: null,
                    reason: reason
                });
            }
            
            client.logger.info('[ping-protection] ' + localize('ping-protection', 'log-action-kick', {
                u: member.user.tag,
                r: reason
            }));
        }
    } catch (error) {
        client.logger.error(`[ping-protection] Failed to execute ${actionConfig.type} on ${member.user.tag}: ${error.message}`);
    }
}

/**
 * Deletes ALL database information from a user
 * @param {Client} client 
 * @param {string} userId 
 */
async function deleteAllUserData(client, userId) {
    await client.models['ping-protection']['PingHistory'].destroy({ where: { userId: userId } });
    await client.models['ping-protection']['ModerationLog'].destroy({ where: { userId: userId } });
    await client.models['ping-protection']['LeaverData'].destroy({ where: { userId: userId } });
    
    client.logger.info('[ping-protection] ' + localize('ping-protection', 'log-manual-delete', { u: userId }));
}

/**
 * Checks if a user is currently marked as left
 * @param {Client} client 
 * @param {string} userId 
 * @returns {Promise<Object|null>}
 */
async function getLeaverStatus(client, userId) {
    return await client.models['ping-protection']['LeaverData'].findByPk(userId);
}

/**
 * Marks user as left
 */
async function markUserAsLeft(client, userId) {
    await client.models['ping-protection']['LeaverData'].upsert({
        userId: userId,
        leftAt: new Date()
    });
}

/**
 * Handles rejoin
 */
async function markUserAsRejoined(client, userId) {
    await client.models['ping-protection']['LeaverData'].destroy({
        where: { userId: userId }
    });
}

/**
 * Enforces retention policies
 */
async function enforceRetention(client) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    if (!storageConfig) return;

    if (storageConfig.enablePingHistory) {
        const historyWeeks = storageConfig.pingHistoryRetention || 12; 
        const historyCutoff = new Date();
        historyCutoff.setDate(historyCutoff.getDate() - (historyWeeks * 7));

        await client.models['ping-protection']['PingHistory'].destroy({
            where: { timestamp: { [Op.lt]: historyCutoff } }
        });
    }

    if (storageConfig.enableModLogHistory) {
        const modMonths = storageConfig.modLogRetention || 6;
        const modCutoff = new Date();
        modCutoff.setMonth(modCutoff.getMonth() - modMonths);

        await client.models['ping-protection']['ModerationLog'].destroy({
            where: { timestamp: { [Op.lt]: modCutoff } }
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
            await client.models['ping-protection']['ModerationLog'].destroy({ where: { userId } });
            await leaver.destroy();
            
            client.logger.debug('[ping-protection] ' + localize('ping-protection', 'log-cleanup-finished', { u: userId }));
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