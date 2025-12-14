const { 
    addPing, 
    getPingCountInWindow, 
    executeAction, 
    sendPingWarning 
} = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');

// Messages handler
module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== client.config.guildID) return;

    const config = client.configurations['ping-protection']['configuration'];
    const storageConfig = client.configurations['ping-protection']['storage'];
    const moderationRules = client.configurations['ping-protection']['moderation'];
    
    if (!config || !moderationRules || !Array.isArray(moderationRules) || moderationRules.length === 0) return;

    const rule1 = moderationRules[0]; 

    // Checks ignored channels and roles
    if (config.ignoredChannels.includes(message.channel.id)) return;
    if (message.member.roles.cache.some(role => config.ignoredRoles.includes(role.id))) return;

    // Detects pings
    const pingedProtectedRole = message.mentions.roles.some(role => config.protectedRoles.includes(role.id));
    const pingedProtectedUser = message.mentions.users.some(user => config.protectedUsers.includes(user.id));
    if (!pingedProtectedRole && !pingedProtectedUser) return;
    
    let pingCount = 0;
    const pingerId = message.author.id;
    const targetUser = message.mentions.users.find(u => config.protectedUsers.includes(u.id));
    const targetRole = message.mentions.roles.find(r => config.protectedRoles.includes(r.id));
    const target = targetUser || targetRole;
    
    let requiredCount = 0; 
    let generatedReason = "";
    let timeframeWeeks = 12;

    try {
        if (storageConfig && storageConfig.enablePingHistory) {
            await addPing(client, message, target);
        }

        if (rule1.advancedConfiguration) {
            timeframeWeeks = rule1.timeframeWeeks;
        } else {
            timeframeWeeks = (storageConfig && storageConfig.pingHistoryRetention) ? storageConfig.pingHistoryRetention : 12; 
        }

        pingCount = await getPingCountInWindow(client, pingerId, timeframeWeeks);

    } catch (e) {
        client.logger.error(`[ping-protection] Database interaction FAILED for ${message.author.tag}: ${e}`);
    }
    
    await sendPingWarning(client, message, target, config);
    
    if (!rule1.enableModeration) return;
    
    if (rule1.advancedConfiguration) {
        requiredCount = rule1.pingsCountAdvanced;
        generatedReason = localize('ping-protection', 'reason-advanced', { c: pingCount, w: rule1.timeframeWeeks });
    } else {
        requiredCount = rule1.pingsCountBasic;
        generatedReason = localize('ping-protection', 'reason-basic', { c: pingCount, w: timeframeWeeks });
    }
    
    // Logs the ping status
    client.logger.info(`[ping-protection] User ${message.author.tag} pinged ${target.id}. Count: ${pingCount}/${requiredCount}`);

    if (pingCount >= requiredCount) {

        const { Op } = require('sequelize');
        const oneMinuteAgo = new Date(new Date() - 60000);
        const recentLog = await client.models['ping-protection']['ModerationLog'].findOne({
            where: {
                victimID: message.author.id,
                createdAt: { [Op.gt]: oneMinuteAgo }
            }
        });

        if (recentLog) return; 

        let memberToPunish = message.member;
        if (!memberToPunish) {
            try {
                memberToPunish = await message.guild.members.fetch(message.author.id);
            } catch (fetchError) {
                client.logger.error(`[ping-protection] Failed to fetch member ${message.author.tag} for punishment.`);
                return;
            }
        }
        
        await executeAction(client, memberToPunish, rule1, generatedReason, storageConfig);
    }
};