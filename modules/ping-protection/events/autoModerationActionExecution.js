/**
 * Event: autoModerationActionExecution
 */
const { 
    addPing, 
    getPingCountInWindow, 
    executeAction 
} = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');

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
    let timeframeWeeks = 12;
    let rule1 = (moderationRules && Array.isArray(moderationRules) && moderationRules.length > 0) ? moderationRules[0] : null;

    if (!!storageConfig && !!storageConfig.enablePingHistory) {
        const mockAuthor = { id: execution.userId };
        const mockMessage = { author: mockAuthor, url: 'Blocked by AutoMod' };
        const mockTarget = { id: rawId };

        try {
            await addPing(client, mockMessage, mockTarget);
            if (rule1 && !!rule1.advancedConfiguration) {
                timeframeWeeks = rule1.timeframeWeeks;
            } else {
                timeframeWeeks = (storageConfig && storageConfig.pingHistoryRetention) ? storageConfig.pingHistoryRetention : 12; 
            }
            pingCount = await getPingCountInWindow(client, execution.userId, timeframeWeeks);
        } catch (e) {
            client.logger.error(`[ping-protection] DB Log Failed: ${e.message}`);
        }
    }

    if (!rule1 || !rule1.enableModeration) return;
    
    let requiredCount = (rule1.advancedConfiguration) ? rule1.pingsCountAdvanced : rule1.pingsCountBasic;
    let generatedReason = (rule1.advancedConfiguration) 
        ? localize('ping-protection', 'reason-advanced', { c: pingCount, w: rule1.timeframeWeeks })
        : localize('ping-protection', 'reason-basic', { c: pingCount, w: timeframeWeeks });

    if (pingCount >= requiredCount) {
        const memberToPunish = await execution.guild.members.fetch(execution.userId).catch(() => null);
        if (memberToPunish) {
            await executeAction(client, memberToPunish, rule1, generatedReason, storageConfig);
        }
    }
};