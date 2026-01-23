const { 
    addPing, 
    getPingCountInWindow, 
    executeAction 
} = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');

// Handles auto mod actions
module.exports.run = async function (client, execution) {
    if (execution.ruleTriggerType !== 'KEYWORD') return; 

    const config = client.configurations['ping-protection']['configuration'];
    const storageConfig = client.configurations['ping-protection']['storage'];
    const moderationRules = client.configurations['ping-protection']['moderation'];
    
    if (!config) return;
    if (config.ignoredUsers && config.ignoredUsers.includes(execution.userId)) return;

    const matchedKeyword = execution.matchedKeyword || "";
    const rawId = matchedKeyword.replace(/\*/g, '');
    
    const isProtected = config.protectedRoles.includes(rawId) || config.protectedUsers.includes(rawId);
    if (!isProtected) return;

    if (!!storageConfig && !!storageConfig.enablePingHistory) {
        try {
            await addPing(client, execution.userId, null, rawId, false);
        } catch (e) {}
    }

    if (!moderationRules || !Array.isArray(moderationRules) || moderationRules.length === 0) return;

    let originChannel = execution.channel;
    if (!originChannel && execution.channelId) {
        originChannel = await execution.guild.channels.fetch(execution.channelId).catch(() => null);
    }
    const memberToPunish = await execution.guild.members.fetch(execution.userId).catch(() => null);
    
    if (!memberToPunish) return;

    for (let i = moderationRules.length - 1; i >= 0; i--) {
        const rule = moderationRules[i];
        
        let timeframeDays = 0;
        let retentionWeeks = (storageConfig && storageConfig.pingHistoryRetention) 
        ? storageConfig.pingHistoryRetention 
        : 12;

        if (!!rule.useCustomTimeframe) {
            timeframeDays = rule.timeframeDays || 7;
        } else {
            timeframeDays = retentionWeeks * 7;
        }

        const pingCount = await getPingCountInWindow(client, execution.userId, timeframeDays);
        const requiredCount = (rule.useCustomTimeframe) 
        ? rule.pingsCountAdvanced 
        : rule.pingsCountBasic;

        if (pingCount >= requiredCount) {
             const generatedReason = (rule.useCustomTimeframe) 
                ? localize('ping-protection', 'reason-advanced', { 
                    c: pingCount, 
                    d: timeframeDays 
                })
                : localize('ping-protection', 'reason-basic', { 
                    c: pingCount, 
                    w: retentionWeeks 
                });

            const success = await executeAction(
                client, 
                memberToPunish, 
                rule, 
                generatedReason, 
                storageConfig, 
                originChannel, 
                { pingCount, timeframeDays }
            );

            if (success) break;
        }
    }
};