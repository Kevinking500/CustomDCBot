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

    const matchedKeyword = execution.matchedKeyword || "";
    const rawId = matchedKeyword.replace(/\*/g, '');
    
    const isProtected = config.protectedRoles.includes(rawId) || config.protectedUsers.includes(rawId);
    if (!isProtected) return;

    let pingCount = 0;
    let timeframeDays = 84;
    let rule1 = (moderationRules && Array.isArray(moderationRules) && moderationRules.length > 0) ? moderationRules[0] : null;

    if (!!storageConfig && !!storageConfig.enablePingHistory) {
        const mockAuthor = { id: execution.userId };
        const mockMessage = { author: mockAuthor, url: 'Blocked by AutoMod' };
        const mockTarget = { id: rawId };

        try {
            await addPing(client, mockMessage, mockTarget);
            if (rule1 && !!rule1.useCustomTimeframe) {
                timeframeDays = rule1.timeframeDays;
            } else {
                const retentionWeeks = (storageConfig && storageConfig.pingHistoryRetention) ? storageConfig.pingHistoryRetention : 12; 
                timeframeDays = retentionWeeks * 7;
            }
            pingCount = await getPingCountInWindow(client, execution.userId, timeframeDays);
        } catch (e) {
        }
    }

    if (!rule1 || !rule1.enableModeration) return;
    
    let requiredCount = (rule1.useCustomTimeframe) ? rule1.pingsCountAdvanced : rule1.pingsCountBasic;
    let generatedReason = (rule1.useCustomTimeframe) 
        ? localize('ping-protection', 'reason-advanced', { c: pingCount, d: rule1.timeframeDays })
        : localize('ping-protection', 'reason-basic', { c: pingCount, w: (storageConfig.pingHistoryRetention || 12) });

    if (pingCount >= requiredCount) {
        const memberToPunish = await execution.guild.members.fetch(execution.userId).catch(() => null);
        if (memberToPunish) {
            await executeAction(client, memberToPunish, rule1, generatedReason, storageConfig);
        }
    }
};