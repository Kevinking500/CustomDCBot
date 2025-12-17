const { 
    addPing, 
    getPingCountInWindow, 
    executeAction, 
    sendPingWarning 
} = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');
// Handles messages
module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== client.guildID) return;

    const config = client.configurations['ping-protection']['configuration'];
    const storageConfig = client.configurations['ping-protection']['storage'];
    const moderationRules = client.configurations['ping-protection']['moderation'];
    
    if (!config) return;

    if (config.ignoredChannels.includes(message.channel.id)) return;
    if (message.member.roles.cache.some(role => config.ignoredRoles.includes(role.id))) return;

    const pingedProtectedRole = message.mentions.roles.some(role => config.protectedRoles.includes(role.id));
    const pingedProtectedUser = message.mentions.users.some(user => config.protectedUsers.includes(user.id));
    if (!pingedProtectedRole && !pingedProtectedUser) return;
    
    const targetUser = message.mentions.users.find(u => config.protectedUsers.includes(u.id));
    const targetRole = message.mentions.roles.find(r => config.protectedRoles.includes(r.id));
    const target = targetUser || targetRole;
    
    if (!storageConfig || !storageConfig.enablePingHistory) {      
        await sendPingWarning(client, message, target, config);
        return; 
    }

    let pingCount = 0;
    const pingerId = message.author.id;
    let timeframeWeeks = 12;
    let rule1 = null; 
    
    if (moderationRules && Array.isArray(moderationRules) && moderationRules.length > 0) {
        rule1 = moderationRules[0];
    }

    try {
        await addPing(client, message, target);

        if (rule1 && !!rule1.advancedConfiguration) {
            timeframeWeeks = rule1.timeframeWeeks;
        } else {
            timeframeWeeks = (storageConfig && storageConfig.pingHistoryRetention) ? storageConfig.pingHistoryRetention : 12; 
        }

        pingCount = await getPingCountInWindow(client, pingerId, timeframeWeeks);

    } catch (e) {}
    
    await sendPingWarning(client, message, target, config);
    
    if (!rule1 || !rule1.enableModeration) return;
    
    let requiredCount = 0;
    let generatedReason = "";

    if (!!rule1.advancedConfiguration) {
        requiredCount = rule1.pingsCountAdvanced;
        generatedReason = localize('ping-protection', 'reason-advanced', { c: pingCount, w: rule1.timeframeWeeks });
    } else {
        requiredCount = rule1.pingsCountBasic;
        generatedReason = localize('ping-protection', 'reason-basic', { c: pingCount, w: timeframeWeeks });
    }

    if (pingCount >= requiredCount) {
        const { Op } = require('sequelize');
        const oneMinuteAgo = new Date(new Date() - 60000);
        
        try {
            const recentLog = await client.models['ping-protection']['ModerationLog'].findOne({
                where: {
                    victimID: message.author.id,
                    createdAt: { [Op.gt]: oneMinuteAgo }
                }
            });

            if (recentLog) return; 
        } catch (e) {}

        let memberToPunish = message.member;
        if (!memberToPunish) {
            try {
                memberToPunish = await message.guild.members.fetch(message.author.id);
            } catch (fetchError) {
                return;
            }
        }
        
        await executeAction(client, memberToPunish, rule1, generatedReason, storageConfig);
    }
};