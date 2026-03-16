/**
 * Logic for the Staff Management module
 * @module staff-management
 * @author itskevinnn
 */
const { ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');
const schedule = require('node-schedule');
const { embedTypeV2, formatDate } = require('../../src/functions/helpers');
const { localize } = require('../../src/functions/localize');

// --- Local helpers ---
const getConfig = (client, file) => client.configurations['staff-management-system'][file];
const getSafeChannelId = (val) => Array.isArray(val) && val.length > 0 // Helper to get safe channel ID from config
? val[0] 
: (typeof val === 'string' 
    ? val 
    : null
);
const parseDurationToDays = (input) => {
    if (!input) return null;
    const match = input.toString().match(/^(\d+)([dDwWmM])?$/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2]?.toLowerCase() || 'd';
    return unit === 'm' 
    ? value * 30 
    : (unit === 'w' 
        ? value * 7 
        : value
    );
};

const applyFooter = (client, embed) => {
    embed.setFooter({ text: client.strings.footer, iconURL: client.strings.footerImgUrl });
    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();
    return embed;
};

const buildPaginationRow = (backId, countId, nextId, page, totalPages) => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId(backId)
        .setLabel(localize('helpers', 'back'))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page <= 1),
        new ButtonBuilder()
        .setCustomId(countId)
        .setLabel(`${page}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
        new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel(localize('helpers', 'next'))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page >= totalPages)
    );
};

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return localize('staff-management-system', 'time-zero');
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h > 0) parts.push(`${h} ${localize('staff-management-system', h !== 1 
        ? 'time-hours' 
        : 'time-hour'
    )}`);
    if (m > 0) parts.push(`${m} ${localize('staff-management-system', m !== 1 
        ? 'time-mins' 
        : 'time-min'
    )}`);
    if (s > 0) parts.push(`${s} ${localize('staff-management-system', s !== 1 
        ? 'time-secs' 
        : 'time-sec'
    )}`);
    return parts.join(', ') || localize('staff-management-system', 'time-zero');
}

// ---------- Status DM's and logging ----------

async function sendStatusDm(user, type, dmType, data = {}) {
    const label = type === 'LOA' 
    ? 'LoA' 
    : 'RA';
    const viewCmd = type === 'LOA' 
    ? '`/loa view`' 
    : '`/ra view`';
    const endFmt = data.endDate 
    ? `<t:${Math.floor(new Date(data.endDate).getTime() / 1000)}:F>` 
    : '';
    
    // These messages use the locales key to be easily used later
    const messages = {
        approved: { 
            title: 'dm-appr-title', 
            color: 'Green', 
            desc: 'dm-appr-desc', 
            params: { label, approver: data.approver, endFmt, viewCmd } 
        },
        denied: { 
            title: 'dm-deny-title', 
            color: 'Red', 
            desc: 'dm-deny-desc', 
            params: { label, denier: data.denier, reason: data.reason } 
        },
        extended: { 
            title: 'dm-ext-title', 
            color: 'Yellow', 
            desc: 'dm-ext-desc', 
            params: { label, extender: data.extender, days: data.days, endFmt, reason: data.reason, viewCmd } 
        },
        ended_early: { 
            title: 'dm-early-title', 
            color: 'Red', 
            desc: 'dm-early-desc', 
            params: { label, ender: data.ender, reason: data.reason } 
        },
        ended: { 
            title: 'dm-end-title', 
            color: 'Black', 
            desc: 'dm-end-desc', 
            params: { label } 
        }
    };

    const msg = messages[dmType];
    if (!msg) return;

    const embed = new EmbedBuilder()
        .setTitle(localize('staff-management-system', msg.title, msg.params))
        .setDescription(localize('staff-management-system', msg.desc, msg.params))
        .setColor(msg.color);
    applyFooter(user.client, embed); 

    try { 
        await user.send({ 
            embeds: [embed.toJSON()] 
        }); 
    } catch (e) {
        user.client.logger.error(
        localize('staff-management-system', 'log-stat-dm-error', {
            e: e.message,
            u: user.tag
        })
    );
}
}

async function logStatusChange(client, type, action, data) {
    const statusConfig = getConfig(client, 'status');
    if (!statusConfig?.logStatusChanges) return;

    const channelId = getSafeChannelId(statusConfig.statusChangeLogChannel) || getSafeChannelId(getConfig(client, 'configuration')?.generalLogChannel);
    if (!channelId) return;

    const guild = client.guilds.cache.get(client.guildID);
    if (!guild) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const label = type === 'LOA' 
    ? 'LoA' 
    : 'RA';
    const targetUserObj = data.targetUser || await client.users.fetch(data.userId).catch(() => null);
    const mention = targetUserObj 
    ? targetUserObj.toString() 
    : `<@${data.userId}>`;
    const username = targetUserObj 
    ? targetUserObj.username 
    : data.userId;

    const embed = new EmbedBuilder()
    .setThumbnail(targetUserObj
    ?.displayAvatarURL({ dynamic: true }) || null);

    if (action === 'start') {
        embed.setTitle(localize('staff-management-system', 'log-start-title', { label, username }))
             .setColor('Green')
             .setDescription(localize('staff-management-system', 'log-start-desc', 
                { label, mention, apprText: data.approverId 
                ? ` ${localize('staff-management-system', 'label-appr-by')}: <@${data.approverId}>.` 
                : '' 
             }))
             .addFields({ 
                name: localize('staff-management-system', 'log-info-hdr', { label }), 
                value: `**${localize('staff-management-system', 'general-start')}:** <t:${Math.floor(new Date(data.startDate).getTime() / 1000)}:F>\n**${localize('staff-management-system', 'general-end')}:** <t:${Math.floor(new Date(data.endDate).getTime() / 1000)}:F>\n**${localize('staff-management-system', 'general-rsn')}:** ${data.reason || localize('staff-management-system', 'none-provided')}` 
             });
    
    } else if (action === 'end') {
        embed.setTitle(localize('staff-management-system', 'log-end-title', { label, username }))
             .setColor('Red')
             .setDescription(localize('staff-management-system', 'log-end-desc', { label, mention }))
             .addFields({ 
                name: localize('staff-management-system', 'log-info-hdr', { label }), 
                value: `**${localize('staff-management-system', 'general-started')}:** <t:${Math.floor(new Date(data.startDate).getTime() / 1000)}:F>\n**${localize('staff-management-system', 'general-ended')}:** <t:${Math.floor(Date.now() / 1000)}:F>\n**${localize('staff-management-system', 'general-rsn')}:** ${data.reason || localize('staff-management-system', 'none-provided')}` 
             });
    
    } else if (action === 'adjusted') {
        embed.setTitle(localize('staff-management-system', 'log-adj-title', { label, username }))
             .setColor('Yellow')
             .setDescription(localize('staff-management-system', 'log-adj-desc', { label, mention, executor: data.executorId }))
             .addFields({ 
                name: localize('staff-management-system', 'log-changes'), 
                value: data.changesText 
             });
    }

    applyFooter(client, embed);
    try { 
        await channel.send({ 
            embeds: [embed.toJSON()] 
        }); 
    } catch (e) {
        client.logger.error(
            localize('staff-management-system', 'log-status-adj-error', { 
                e: e.message
            })
        );
    }
}

// ---------- Infractions ----------
async function issueInfraction(client, interaction, targetMember, type, reason, expiryInput) {
    const config = getConfig(client, 'infractions');
    if (!config?.enableInfractions) return interaction.reply({ 
        content: localize('staff-management-system', 'err-feat-disabled', { feature: 'Infractions' }), 
        flags: MessageFlags.Ephemeral 
    });
    if (type.toLowerCase() === 'suspension') {
        return interaction.reply({ 
            content: localize('staff-management-system', 'err-use-susp'), 
            flags: MessageFlags.Ephemeral 
        });
    }

    let expiresAt = null;
    if (expiryInput) {
        const days = parseDurationToDays(expiryInput);
        if (!days) return interaction.reply({ 
            content: localize('staff-management-system', 'err-inv-dur'), 
            flags: MessageFlags.Ephemeral 
        });
        expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const record = await client.models['staff-management-system']['Infraction'].create({
        userId: targetMember.id, 
        issuerId: interaction.user.id, 
        type, reason, expiresAt, 
        active: true
    });

    const placeholders = {
        '%user%': targetMember.user.toString(),
        '%userPfp%': targetMember.user.displayAvatarURL({ dynamic: true, format: 'png', size: 1024 }) || '',
        '%issuerMention%': interaction.user.toString(),
        '%issuerName%': interaction.user.username,
        '%issuerPfp%': interaction.user.displayAvatarURL({ dynamic: true, format: 'png', size: 1024 }) || '',
        '%type%': type,
        '%reason%': reason,
        '%caseId%': record.caseId.toString(),
        '%endDate%': expiresAt 
            ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` 
            : localize('staff-management-system', 'label-never')
    };

    const channelId = getSafeChannelId(config.infractionLogChannel);
    if (channelId) {
        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (channel) {
            let template = config.infractionMessage;
            if (typeof template === 'string') { 
                try { template = JSON.parse(template); } 
                catch (e) {} 
            } 
            else if (typeof template === 'object') { 
                template = JSON.parse(JSON.stringify(template)); 
            }
            
            if (template && template.embeds && !template._schema) template._schema = 'v3';
            let msgOpts = await embedTypeV2(template, placeholders);
            if (msgOpts?.content?.trim() === '') delete msgOpts.content;

            if (msgOpts?.embeds?.length > 0) {
                const parsedEmbed = EmbedBuilder.from(msgOpts.embeds[0]);
                applyFooter(client, parsedEmbed);
                msgOpts.embeds[0] = parsedEmbed.toJSON();
            }

            const sentMsg = await channel.send(msgOpts).catch(()=>{});
            if (sentMsg) await record.update({ messageUrl: sentMsg.url });
        }
    }

    if (config.dmInfractedUser) {
        let dmTemplate = config.infractionDmMessage;
        if (typeof dmTemplate === 'string') { 
            try { dmTemplate = JSON.parse(dmTemplate); } 
            catch (e) {} 
        } 
        else if (typeof dmTemplate === 'object') { 
            dmTemplate = JSON.parse(JSON.stringify(dmTemplate)); 
        }
        
        if (dmTemplate && dmTemplate.embeds && !dmTemplate._schema) dmTemplate._schema = 'v3';
        let dmOpts = await embedTypeV2(dmTemplate, placeholders);
        if (dmOpts?.content?.trim() === '') delete dmOpts.content;
        if (dmOpts && (dmOpts.content || dmOpts.embeds?.length > 0)) 
            await targetMember.send(dmOpts).catch(()=>{});
    }

    await interaction.reply({ 
        content: localize('staff-management-system', 'succ-infract', { 
            type, caseId: record.caseId, user: targetMember.user.tag 
        }), 
        flags: MessageFlags.Ephemeral 
    });
}

// ---------- Suspensions ----------
async function issueSuspension(client, interaction, targetMember, durationInput, reason) {
    const config = getConfig(client, 'infractions');
    if (!config?.enableInfractions) 
        return interaction.reply({ 
        content: localize('staff-management-system', 'err-feat-disabled', { 
        feature: 'Infractions' 
        }), 
        flags: MessageFlags.Ephemeral 
    });

    if (!config?.enableSuspensions) 
        return interaction.reply({ 
        content: localize('staff-management-system', 'err-feat-disabled', { 
            feature: 'Suspensions' 
        }), 
        flags: MessageFlags.Ephemeral 
    });

    const durationDays = parseDurationToDays(durationInput);
    if (!durationDays) 
        return interaction.reply({ 
        content: localize('staff-management-system', 'err-inv-dur'), 
        flags: MessageFlags.Ephemeral 
    });
    
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    const durationString = `${durationDays} ${localize('staff-management-system', 'label-days')}`;

    const hierarchyRole = interaction.guild.roles.cache.get(config.suspensionHierarchyRole);
    if (hierarchyRole) {
        const rolesToRemove = targetMember.roles.cache.filter(r => r.position >= hierarchyRole.position && r.id !== interaction.guild.id && !r.managed).map(r => r.id);
        if (rolesToRemove.length) {
            await targetMember.roles.remove(rolesToRemove).catch(() => {});
            await client.models['staff-management-system']['StaffProfile'].upsert({ 
                userId: targetMember.id, 
                isSuspended: true, 
                suspendedRoles: JSON.stringify(rolesToRemove) 
            });
        }
    }
    if (config.suspensionRole) await targetMember.roles.add(config.suspensionRole).catch(() => {});

    const record = await client.models['staff-management-system']['Infraction'].create({
        userId: targetMember.id, 
        issuerId: interaction.user.id, 
        type: 'Suspension', 
        reason, durationDays, expiresAt, 
        active: true
    });

    const placeholders = {
        '%user%': targetMember.user.toString(),
        '%userPfp%': targetMember.user.displayAvatarURL({ dynamic: true, format: 'png', size: 1024 }) || '',
        '%issuerMention%': interaction.user.toString(),
        '%issuerName%': interaction.user.username,
        '%issuerPfp%': interaction.user.displayAvatarURL({ dynamic: true, format: 'png', size: 1024 }) || '',
        '%duration%': durationString,
        '%reason%': reason,
        '%caseId%': record.caseId.toString(),
        '%endDate%': `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`
    };

    const channelId = getSafeChannelId(config.infractionLogChannel);
    if (channelId) {
        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (channel) {
            let template = config.suspensionMessage;
            if (typeof template === 'string') { 
                try { 
                    template = JSON.parse(template); 
                } 
                catch (e) {} 
            } 
            else if (typeof template === 'object') { 
                template = JSON.parse(JSON.stringify(template)); 
            }
            
            if (template && template.embeds && !template._schema) template._schema = 'v3';
            let msgOpts = await embedTypeV2(template, placeholders);
            if (msgOpts?.content?.trim() === '') delete msgOpts.content;

            if (msgOpts?.embeds?.length > 0) {
                const parsedEmbed = EmbedBuilder.from(msgOpts.embeds[0]);
                applyFooter(client, parsedEmbed);
                msgOpts.embeds[0] = parsedEmbed.toJSON();
            }

            const sentMsg = await channel.send(msgOpts).catch(()=>{});
            if (sentMsg) await record.update({ messageUrl: sentMsg.url });
        }
    }

    if (config.dmInfractedUser) {
        let dmTemplate = config.suspensionDmMessage;
        if (typeof dmTemplate === 'string') { 
            try { 
                dmTemplate = JSON.parse(dmTemplate); 
            } 
            catch (e) {} 
        } 
        else if (typeof dmTemplate === 'object') { 
            dmTemplate = JSON.parse(JSON.stringify(dmTemplate)); 
        }
        
        if (dmTemplate && dmTemplate.embeds && !dmTemplate._schema) dmTemplate._schema = 'v3';
        let dmOpts = await embedTypeV2(dmTemplate, placeholders);
        if (dmOpts?.content?.trim() === '') delete dmOpts.content;
        if (dmOpts && (dmOpts.content || dmOpts.embeds?.length > 0)) await targetMember.send(dmOpts).catch(()=>{});
    }

    await interaction.reply({ 
        content: localize('staff-management-system', 'succ-susp', { 
            caseId: record.caseId, 
            user: targetMember.user.tag, 
            duration: durationString 
        }), 
        flags: MessageFlags.Ephemeral 
    });
}

// ----- Infractions voiding -----
async function voidInfraction(client, interaction, caseId) {
    const config = getConfig(client, 'infractions');
    if (!config?.enableInfractions) return interaction.reply({ 
        content: localize('staff-management-system', 'err-feat-disabled', { 
            feature: 'Infractions' 
        }), 
        flags: MessageFlags.Ephemeral 
    });

    const generalConfig = getConfig(client, 'configuration');
    const canManage = interaction.member.roles.cache.some(r => [...(generalConfig.supervisorRoles || []), ...(generalConfig.managementRoles || [])].includes(r.id)) || interaction.member.permissions.has('Administrator');
    if (!canManage) return interaction.reply({ 
        content: localize('staff-management-system', 'err-gen-no-perm'), 
        flags: MessageFlags.Ephemeral 
    });

    const record = await client.models['staff-management-system']['Infraction'].findByPk(caseId);
    if (!record) return interaction.reply({ 
        content: localize('staff-management-system', 'err-no-case', { caseId }), 
        flags: MessageFlags.Ephemeral 
    });
    if (!record.active) return interaction.reply({ 
        content: localize('staff-management-system', 'err-case-inact', { caseId }), 
        flags: MessageFlags.Ephemeral 
    });

    await record.update({ active: false });

    if (record.type.toLowerCase() === 'suspension') {
        const Profile = client.models['staff-management-system']['StaffProfile'];
        const profile = await Profile.findOne({ 
            where: { userId: record.userId } 
        });
        const member = await interaction.guild.members.fetch(record.userId).catch(() => null);
        
        if (member && profile && profile.isSuspended) {
            try {
                const rolesToRestore = JSON.parse(profile.suspendedRoles || '[]');
                if (rolesToRestore.length > 0) await member.roles.add(rolesToRestore);
                if (config.suspensionRole) await member.roles.remove(config.suspensionRole);
                await profile.update({ isSuspended: false, suspendedRoles: '[]' });
            } catch (e) {
                return interaction.reply({ 
                    content: localize('staff-management-system', 'succ-void-fail', { caseId }), 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }
    }
    await interaction.reply({ 
        content: localize('staff-management-system', 'succ-void', { caseId }), 
        flags: MessageFlags.Ephemeral 
    });
}

// ----- Generates infractions history embed -----
async function generateInfractionHistoryResponse(client, targetUser, page = 1) {
    const limit = 5;
    const offset = (page - 1) * limit;
    const { count, rows } = await client.models['staff-management-system']['Infraction'].findAndCountAll({ 
        where: { userId: targetUser.id }, 
        order: [['createdAt', 'DESC']], 
        limit, offset 
    });

    if (count === 0) 
        return { 
        content: localize('staff-management-system', 'info-clean-rec', { 
            username: targetUser.username 
        }), 
        flags: MessageFlags.Ephemeral 
    };

    const totalPages = Math.ceil(count / limit) || 1;
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'rec-title', { username: targetUser.username }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setColor('Red')
    );

    const desc = rows.map(r => {
        const link = r.messageUrl 
        ? ` • [Jump](${r.messageUrl})` 
        : '';
        const statusIcon = r.active 
        ? '🔴' 
        : localize('staff-management-system', 'icon-voided');
        const expiry = r.expiresAt 
        ? `\n**${localize('staff-management-system', 'label-exp')}:** <t:${Math.floor(new Date(r.expiresAt).getTime() / 1000)}:R>` 
        : '';

        return `**${statusIcon} ${localize('staff-management-system', 'label-case')} #${r.caseId} - ${r.type}**\n**${localize('staff-management-system', 'label-date')}:** <t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:f>\n**${localize('staff-management-system', 'label-iss')}:** <@${r.issuerId}>\n**${localize('staff-management-system', 'general-rsn')}:** ${r.reason}${expiry}${link}`;
    }).join('\n\n');

    embed.setDescription(desc);
    embed.addFields({ name: '\u200b', value: localize('staff-management-system', 'page-count', { 
        page, 
        total: totalPages 
    }) });

    const row = buildPaginationRow(
        `staff-mgmt_inf-hist_${targetUser.id}_${page - 1}`,
        'inf_hist_count',
        `staff-mgmt_inf-hist_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return { embeds: [embed.toJSON()], components: [row.toJSON()] };
}

// ----- Gets infraction history -----
async function getInfractionHistory(client, interaction, targetUser) {
    const response = await generateInfractionHistoryResponse(client, targetUser, 1);
    if (response.content && response.content.startsWith('ℹ️')) return interaction.reply(response);
    await interaction.reply({ 
        ...response, 
        flags: MessageFlags.Ephemeral 
    });
}

// ---------- Promotions ----------
async function promoteUser(client, interaction, targetMember, newRole, reason) {
    const config = getConfig(client, 'promotions');
    if (!config?.enablePromotions) return interaction.reply({ 
        content: localize('staff-management-system', 'err-feat-disabled', { feature: 'Promotions' }), 
        flags: MessageFlags.Ephemeral 
    });

    const finalReason = reason && reason.trim() !== '' 
    ? reason 
    : localize('staff-management-system', 'none-provided');
    const channelOverride = interaction.options.getChannel('channel');

    if (config.autoAddRole) {
        if (interaction.guild.members.me.roles.highest.position <= newRole.position) {
            return interaction.reply({ 
                content: localize('staff-management-system', 'err-role-hier'), 
                flags: MessageFlags.Ephemeral 
            });
        }
        try { 
            await targetMember.roles.add(newRole); 
        } 
        catch (e) { 
            return interaction.reply({ 
            content: localize('staff-management-system', 'err-add-role', { e: e.message }), 
            flags: MessageFlags.Ephemeral 
        }); }
    }

    const record = await client.models['staff-management-system']['Promotion'].create({ 
        userId: targetMember.id, 
        issuerId: interaction.user.id, 
        newRole: newRole.id, 
        reason: finalReason 
    });

    const placeholders = {
        '%user%': targetMember.user.toString(), 
        '%newRoleName%': newRole.name, 
        '%newRoleMention%': newRole.toString(),
        '%promoterMention%': interaction.user.toString(), 
        '%promoterName%': interaction.user.username, 
        '%reason%': finalReason,
        '%userPfp%': targetMember.user.displayAvatarURL({ dynamic: true, format: 'png', size: 1024 }) || '',
        '%promoterPfp%': interaction.user.displayAvatarURL({ dynamic: true, format: 'png', size: 1024 }) || ''
    };

    const targetChannelId = channelOverride 
    ? channelOverride.id 
    : getSafeChannelId(config.promotionsChannel);

    if (targetChannelId) {
        const channel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
        if (channel) {
            let embedTemplate = config.promotionMessage;
            if (typeof embedTemplate === 'string') { 
                try { 
                    embedTemplate = JSON.parse(embedTemplate); 
                } 
            catch (e) {} }
            
            else if (typeof embedTemplate === 'object') { 
                embedTemplate = JSON.parse(JSON.stringify(embedTemplate)); 
            }

            if (embedTemplate && embedTemplate.embeds && !embedTemplate._schema) embedTemplate._schema = 'v3';
            let msgOpts = await embedTypeV2(embedTemplate, placeholders);
            if (msgOpts?.content?.trim() === '') delete msgOpts.content;

            if (msgOpts.embeds && msgOpts.embeds.length > 0) {
                const parsedEmbed = EmbedBuilder.from(msgOpts.embeds[0]);
                applyFooter(client, parsedEmbed);
                msgOpts.embeds[0] = parsedEmbed.toJSON();
            }

            const sentMessage = await channel
            .send(msgOpts)
            .catch(e => {
                client.logger.error(localize('staff-management-system', 'log-promo-msg-error', {
                    e: e.message,
                }));
                return null;
            });
            
            if (sentMessage) await record.update({ messageUrl: sentMessage.url }); 
        }
    }

    if (config.dmPromotedUser && config.promotionDmMessage) {
        try {
            let dmTemplate = config.promotionDmMessage;
            if (typeof dmTemplate === 'string') { 
                try { 
                    dmTemplate = JSON.parse(dmTemplate); 
                } catch (e) {} }
            else if (typeof dmTemplate === 'object') { 
                dmTemplate = JSON.parse(JSON.stringify(dmTemplate)); 
            }

            if (dmTemplate && dmTemplate.embeds && !dmTemplate._schema) dmTemplate._schema = 'v3';
            let dmOpts = await embedTypeV2(dmTemplate, placeholders);
            if (dmOpts?.content?.trim() === '') delete dmOpts.content;
            
            if (dmOpts && (dmOpts.content || (dmOpts.embeds && dmOpts.embeds.length > 0))) {
                await targetMember.send(dmOpts).catch(()=>{});
            }
        } catch (e) {} 
    }
    
    await interaction.reply({ 
        content: localize('staff-management-system', 'succ-promo', { 
            user: targetMember.user.tag, 
            role: newRole.name 
        }), 
        flags: MessageFlags.Ephemeral 
    });
}

// ----- Generates promotion history & embed -----
async function generatePromotionHistoryResponse(client, targetUser, page = 1) {
    const Promotion = client.models['staff-management-system']['Promotion'];
    const limit = 5;
    const offset = (page - 1) * limit;

    const { count, rows } = await Promotion.findAndCountAll({ 
        where: { 
            userId: targetUser.id 
        }, 
        order: [['createdAt', 'DESC']], 
        limit, 
        offset 
    });
    if (count === 0) return { 
        content: localize('staff-management-system', 'info-no-promo', { username: targetUser.username }), 
        flags: MessageFlags.Ephemeral 
    };

    const totalPages = Math.ceil(count / limit) || 1;
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'prom-hist-title', { username: targetUser.username }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setColor('Gold')
    );

    const desc = rows.map((r, i) => {
        const link = r.messageUrl ? ` • [Jump](${r.messageUrl})` : '';
        return `**${offset + i + 1}. <t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:F>**\n**${localize('staff-management-system', 'label-role')}:** <@&${r.newRole}>\n**${localize('staff-management-system', 'label-prom-by')}:** <@${r.issuerId}>\n**${localize('staff-management-system', 'general-rsn')}:** ${r.reason}${link}`;
    }).join('\n\n');

    embed.setDescription(desc);
    embed.addFields({ name: '\u200b', value: localize('staff-management-system', 'page-count', { page, total: totalPages }) });

    const row = buildPaginationRow(
        `staff-mgmt_prom-hist_${targetUser.id}_${page - 1}`,
        'prom_hist_count',
        `staff-mgmt_prom-hist_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

async function getPromotionHistory(client, interaction, targetUser) {
    const response = await generatePromotionHistoryResponse(client, targetUser, 1);
    if (response.content && response.content.startsWith('ℹ️')) return interaction.reply(response);
    await interaction.reply({ ...response, flags: MessageFlags.Ephemeral });
}

// ---------- User Panel ----------
async function generatePanelSubpage(client, targetUser, type, page) {
    if (type === 'infractions') return await generatePanelInfractions(client, targetUser, page);
    if (type === 'promotions') return await generatePanelPromotions(client, targetUser, page);
    if (type === 'reviews') return await generatePanelReviews(client, targetUser, page);
    if (type === 'status') return await generatePanelStatus(client, targetUser, page);
    if (type === 'activity') return await generatePanelActivity(client, targetUser, page);
    return null;
}

// Overview page
async function generateUserPanel(client, targetUser) {
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'panel-title', { 
            username: targetUser.username 
        }))
        .setDescription(localize('staff-management-system', 'panel-desc', { 
            mention: targetUser.toString(), 
            id: targetUser.id 
        }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setColor('Blurple')
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`staff-mgmt_panel-menu_${targetUser.id}`)
        .setPlaceholder(localize('staff-management-system', 'panel-ph'))
        .addOptions(
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-over'))
            .setValue('overview')
            .setEmoji('🏠'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-act'))
            .setValue('activity')
            .setEmoji('📋'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-inf'))
            .setValue('infractions')
            .setEmoji('⚠️'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-prom'))
            .setValue('promotions')
            .setEmoji('🎉'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-rev'))
            .setValue('reviews')
            .setEmoji('⭐'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-shi'))
            .setValue('shifts')
            .setEmoji('⏱️'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-sta'))
            .setValue('status')
            .setEmoji('🌙'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-del'))
            .setValue('deletion')
            .setEmoji('🗑️')
        );

    const row = new ActionRowBuilder().addComponents(menu);
    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

// Infractions page
async function generatePanelInfractions(client, targetUser, page = 1) {
    const Infraction = client.models['staff-management-system']['Infraction'];
    const allInfractions = await Infraction.findAll({ 
        where: { userId: targetUser.id } 
    });
    const count = allInfractions.length;

    let totalPages = 1;
    if (count > 3) totalPages = 1 + Math.ceil((count - 3) / 5);

    const limit = page === 1 ? 3 : 5;
    const offset = page === 1 ? 0 : 3 + ((page - 2) * 5); 

    const typeCounts = {};
    allInfractions.forEach(inf => { typeCounts[inf.type] = (typeCounts[inf.type] || 0) + 1; });
    const typeStrings = Object.entries(typeCounts).map(([type, qty]) => `${type}: **${qty}**`).join('\n');

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-inf-title', { username: targetUser.username }))
        .setColor('Red')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    let desc = localize('staff-management-system', 'p-inf-desc', { 
        count: count, types: typeStrings || localize('staff-management-system', 'info-none') 
    });

    const rows = await Infraction.findAll({ 
        where: { userId: targetUser.id }, 
        order: [['createdAt', 'DESC']], 
        limit, 
        offset 
    });

    if (rows.length === 0) {
        desc += localize('staff-management-system', 'p-no-hist');
    } else {
        desc += rows.map(r => {
            const statusIcon = r.active ? '🔴' : localize('staff-management-system', 'icon-voided');
            const expiry = r.expiresAt ? `\n**${localize('staff-management-system', 'label-exp')}:** <t:${Math.floor(new Date(r.expiresAt).getTime() / 1000)}:R>` : '';
            return `**${statusIcon} ${localize('staff-management-system', 'label-case')} #${r.caseId} - ${r.type}**\n**${localize('staff-management-system', 'label-date')}:** <t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:f>\n**${localize('staff-management-system', 'general-rsn')}:** ${r.reason}${expiry}`;
        }).join('\n\n');
    }

    embed.setDescription(desc);
    embed.addFields({ name: '\u200b', value: localize('staff-management-system', 'page-count', { page, total: totalPages }) });

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'infractions').data.default = true;

    const paginationRow = buildPaginationRow(
        `staff-mgmt_panel-inf_${targetUser.id}_${page - 1}`,
        'panel_inf_count',
        `staff-mgmt_panel-inf_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [menu.toJSON(), paginationRow.toJSON()] 
    };
}

// Promotions page
async function generatePanelPromotions(client, targetUser, page = 1) {
    const Promotion = client.models['staff-management-system']['Promotion'];
    const count = await Promotion.count({ 
        where: { userId: targetUser.id } 
    });

    let totalPages = 1;
    if (count > 3) totalPages = 1 + Math.ceil((count - 3) / 5);

    const limit = page === 1 
    ? 3 
    : 5;
    const offset = page === 1 
    ? 0 
    : 3 + ((page - 2) * 5); 

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-prom-title', { 
            username: targetUser.username 
        }))
        .setColor('Gold')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    let desc = localize('staff-management-system', 'p-prom-desc', { count: count });
    const rows = await Promotion.findAll({ 
        where: { userId: targetUser.id }, 
        order: [['createdAt', 'DESC']], 
        limit, 
        offset 
    });

    if (rows.length === 0) {
        desc += localize('staff-management-system', 'p-no-hist');
    } else {
        desc += rows.map(r => `**${localize('staff-management-system', 'label-role')}:** <@&${r.newRole}>\n**${localize('staff-management-system', 'label-prom-by')}:** <@${r.issuerId}>\n**${localize('staff-management-system', 'label-date')}:** <t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:R>\n**${localize('staff-management-system', 'general-rsn')}:** ${r.reason}`).join('\n\n');
    }

    embed.setDescription(desc);
    embed.addFields({ name: '\u200b', value: localize('staff-management-system', 'page-count', { page, total: totalPages }) });

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'promotions').data.default = true;

    const paginationRow = buildPaginationRow(
        `staff-mgmt_panel-prom_${targetUser.id}_${page - 1}`,
        'panel_prom_count',
        `staff-mgmt_panel-prom_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [menu.toJSON(), paginationRow.toJSON()] 
    };
}

// Reviews page
async function generatePanelReviews(client, targetUser, page = 1) {
    const Review = client.models['staff-management-system']['StaffReview'];
    const allReviews = await Review.findAll({ 
        where: { targetId: targetUser.id } 
    });
    const count = allReviews.length;
    
    let totalPages = 1;
    if (count > 3) totalPages = 1 + Math.ceil((count - 3) / 5);
    
    const limit = page === 1 ? 3 : 5;
    const offset = page === 1 ? 0 : 3 + ((page - 2) * 5); 
    
    const avg = count 
    ? (allReviews.reduce((a, b) => a + b.stars, 0) / count).toFixed(1) 
    : 0;
    
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-rev-title', { 
            username: targetUser.username 
        }))
        .setColor('Gold')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );
    
    let desc = localize('staff-management-system', 'p-rev-desc', { count: count, avg: avg });
    
    const rows = await Review.findAll({ 
        where: { targetId: targetUser.id }, 
        order: [['createdAt', 'DESC']], 
        limit, 
        offset 
    });
    if (rows.length === 0) desc += localize('staff-management-system', 'p-no-hist');
    else desc += rows.map(r => `**${"⭐".repeat(r.stars)}** ${localize('staff-management-system', 'label-by')} <@${r.authorId}>\n"${r.comment}"`).join('\n\n');
    
    embed.setDescription(desc);
    embed.addFields({ 
        name: '\u200b', 
        value: localize('staff-management-system', 'page-count', { 
            page, total: totalPages 
        }) 
    });

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'reviews').data.default = true;

    const paginationRow = buildPaginationRow(
        `staff-mgmt_panel-rev_${targetUser.id}_${page - 1}`,
        'panel_rev_count',
        `staff-mgmt_panel-rev_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [menu.toJSON(), paginationRow.toJSON()] 
    };
}

// Status page
async function generatePanelStatus(client, targetUser, page = 1) {
    const LoaRequest = client.models['staff-management-system']['LoaRequest'];
    const allStatuses = await LoaRequest.findAll({ 
        where: { userId: targetUser.id } 
    });
    const count = allStatuses.length;
    
    let totalPages = 1;
    if (count > 3) totalPages = 1 + Math.ceil((count - 3) / 5);
    const limit = page === 1 
    ? 3 
    : 5;
    const offset = page === 1 
    ? 0 
    : 3 + ((page - 2) * 5); 
    
    const activeStatus = allStatuses.find(s => ['APPROVED', 'PENDING'].includes(s.status) && new Date(s.endDate) > new Date());
    let activeText = localize('staff-management-system', 'info-none');
    if (activeStatus) {
        activeText = `**${activeStatus.type}** (${activeStatus.status})\n${localize('staff-management-system', 'label-end')}: <t:${Math.floor(new Date(activeStatus.endDate).getTime()/1000)}:R>`;
    }
    
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-sta-title', { 
            username: targetUser.username 
        }))
        .setColor('Green')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );
    
    let desc = localize('staff-management-system', 'p-sta-desc', { 
        count: count, active: activeText 
    });
    
    const rows = await LoaRequest.findAll({ 
        where: { userId: targetUser.id }, 
        order: [['createdAt', 'DESC']], 
        limit, 
        offset 
    });
    if (rows.length === 0) desc += localize('staff-management-system', 'p-no-hist');
    else {
        const icons = { 
            APPROVED: '✅', 
            DENIED: '❌', 
            ENDED: '⏹️', 
            PENDING: '🕐' 
        };
        desc += rows.map(r => `**${icons[r.status] || '❓'} ${r.type} - ${r.status}**\n**${localize('staff-management-system', 'general-start')}:** <t:${Math.floor(new Date(r.startDate).getTime()/1000)}:D>\n**${localize('staff-management-system', 'general-end')}:** <t:${Math.floor(new Date(r.endDate).getTime()/1000)}:D>\n**${localize('staff-management-system', 'general-rsn')}:** ${r.reason}`).join('\n\n');
    }
    
    embed.setDescription(desc);
    embed.addFields({ 
        name: '\u200b', 
        value: localize('staff-management-system', 'page-count', { 
            page, 
            total: totalPages 
        }) 
    });

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'status').data.default = true;

    const paginationRow = buildPaginationRow(
        `staff-mgmt_panel-stat_${targetUser.id}_${page - 1}`,
        'panel_stat_count',
        `staff-mgmt_panel-stat_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [menu.toJSON(), paginationRow.toJSON()] 
    };
}

// Activity checks page
async function generatePanelActivity(client, targetUser, page = 1) {
    const ActivityCheck = client.models['staff-management-system']['ActivityCheck'];
    const allChecks = await ActivityCheck.findAll();
    
    let userResponses = 0;
    const historyRows = [];
    allChecks.forEach(check => {
        const responded = JSON.parse(check.respondedUsers || '[]');
        if (responded.includes(targetUser.id)) {
            userResponses++;
            historyRows.push(check);
        }
    });
    
    historyRows.sort((a, b) => b.createdAt - a.createdAt);
    const count = historyRows.length;
    
    let totalPages = 1;
    if (count > 3) totalPages = 1 + Math.ceil((count - 3) / 5);
    const limit = page === 1 
    ? 3 
    : 5;
    const offset = page === 1 
    ? 0 
    : 3 + ((page - 2) * 5); 
    const paginatedRows = historyRows.slice(offset, offset + limit);

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-act-title', { 
            username: targetUser.username 
        }))
        .setColor('Blue')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );
    
    let desc = localize('staff-management-system', 'p-act-desc', { count: userResponses });
    
    if (paginatedRows.length === 0) desc += localize('staff-management-system', 'p-no-hist');
    else {
        desc += paginatedRows.map(r => `**${localize('staff-management-system', 'label-chk')} <t:${Math.floor(new Date(r.createdAt).getTime()/1000)}:D>**\n**${localize('staff-management-system', 'label-end')}:** <t:${Math.floor(new Date(r.endTime).getTime()/1000)}:F>\n**${localize('staff-management-system', 'label-chan')}:** <#${r.channelId}>`).join('\n\n');
    }
    
    embed.setDescription(desc);
    embed.addFields({ name: '\u200b', value: localize('staff-management-system', 'page-count', { page, total: totalPages }) });

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'activity').data.default = true;

    const paginationRow = buildPaginationRow(
        `staff-mgmt_panel-act_${targetUser.id}_${page - 1}`,
        'panel_act_count',
        `staff-mgmt_panel-act_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [menu.toJSON(), paginationRow.toJSON()] 
    };
}

// Shifts page
async function generatePanelShifts(client, targetUser) {
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-shi-title', { 
            username: targetUser.username 
        }))
        .setColor('Purple')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    try {
        const Shift = client.models['staff-management-system']['StaffShift'];
        const config = getConfig(client, 'shifts') || {}; 
        const shifts = await Shift.findAll({ 
            where: { 
                userId: targetUser.id, 
                endTime: { [Op.not]: null }, 
                duration: { [Op.not]: null } 
            } 
        });
        
        const totalShifts = shifts.length;
        const totalSeconds = shifts.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);

        const breakdown = {};
        shifts.forEach(log => {
            const t = log.type || 'Staff';
            breakdown[t] = (breakdown[t] || 0) + (parseInt(log.duration) || 0);
        });
        const breakdownStr = Object.entries(breakdown).sort((a, b) => b[1] - a[1]).map(([type, sec]) => `• ${type}: ${formatDuration(sec)}`).join('\n') || localize('staff-management-system', 'info-none');

        let quotaStr = localize('staff-management-system', 'no-quota-configured');
        const guild = client.guilds.cache.get(client.guildID);
        const member = await guild?.members.fetch(targetUser.id).catch(() => null);
        
        if (member && config.enableQuotas && config.quotas) {
            let bestQuota = null;
            let highestPosition = -1;
            for (const [roleId, hoursStr] of Object.entries(config.quotas)) {
                const hours = parseFloat(hoursStr);
                const role = guild.roles.cache.get(roleId);
                if (role && member.roles.cache.has(roleId) && role.position > highestPosition) {
                    highestPosition = role.position;
                    bestQuota = { hours };
                }
            }

            if (bestQuota) {
                const timeframe = config.quotaTimeframe || 'Weekly';
                const cutoff = new Date();
                if (timeframe === 'Weekly') cutoff.setDate(cutoff.getDate() - 7);
                else cutoff.setMonth(cutoff.getMonth() - 1);

                const recentShifts = await Shift.findAll({ 
                    where: { 
                        userId: targetUser.id, 
                        startTime: { [Op.gt]: cutoff }, 
                        endTime: { [Op.not]: null }, 
                        duration: { [Op.not]: null } 
                    } 
                });
                const recentSeconds = recentShifts.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);
                const requiredSeconds = bestQuota.hours * 3600;
                const isMet = recentSeconds >= requiredSeconds;
                
                quotaStr = localize('staff-management-system', 'duty-quota-str', { 
                    timeframe, 
                    duration: formatDuration(recentSeconds), 
                    hours: bestQuota.hours, 
                    result: isMet 
                    ? localize('staff-management-system', 'duty-quota-met') 
                    : localize('staff-management-system', 'duty-quota-failed') 
                });
            }
        }

        const allResults = await Shift.findAll({
            attributes: ['userId', [Shift.sequelize.fn('SUM', Shift.sequelize.col('duration')), 'totalDuration']],
            where: { endTime: { [Op.not]: null }, duration: { [Op.not]: null } },
            group: ['userId'],
            order: [[Shift.sequelize.literal('totalDuration'), 'DESC']]
        });
        
        const lbIndex = allResults.findIndex(p => p.userId === targetUser.id);
        const lbRank = lbIndex !== -1 
        ? `${lbIndex + 1} / ${allResults.length}` 
        : localize('staff-management-system', 'label-unranked');

        embed.setDescription(localize('staff-management-system', 'panel-shifts-desc', { 
            totalShifts, 
            totalSeconds: formatDuration(totalSeconds), 
            lbRank, 
            breakdownStr, 
            quotaStr 
        }));

    } catch (e) {
        client.logger.error(`[Staff Management] User panel error: ${e.stack}`);
        embed.setDescription(localize('staff-management-system', 'err-shift-data-unavailable', { error: e.message }));
    }

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'shifts').data.default = true;

    const historyBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId(`duty-mgmt_hist_${targetUser.id}_1_All`)
        .setLabel(localize('staff-management-system', 'btn-view-history'))
        .setStyle(ButtonStyle.Secondary)
    );

    return { 
        embeds: [embed.toJSON()], 
        components: [menu.toJSON(), historyBtnRow.toJSON()] 
    };
}

// Deletion page
async function generatePanelDeletion(client, targetUser) {
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'panel-deletion-title', { tag: targetUser.username }))
        .setDescription(localize('staff-management-system', 'panel-deletion-desc', { mention: targetUser.toString() }))
        .setColor('DarkRed')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`staff-mgmt_delete-menu_${targetUser.id}`)
        .setPlaceholder(localize('staff-management-system', 'panel-deletion-placeholder'))
        .addOptions(
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-back'))
            .setValue('back')
            .setEmoji('◀️'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-act'))
            .setValue('del_activity')
            .setEmoji('📋'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-inf'))
            .setValue('del_infractions')
            .setEmoji('⚠️'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-prom'))
            .setValue('del_promotions')
            .setEmoji('🎉'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-rev'))
            .setValue('del_reviews')
            .setEmoji('⭐'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-shifts'))
            .setValue('del_shifts')
            .setEmoji('⏱️'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-status'))
            .setValue('del_status')
            .setEmoji('🌙'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-all'))
            .setValue('del_all')
            .setEmoji('💥')
        );

    return { 
        embeds: [embed.toJSON()], 
        components: [new ActionRowBuilder().addComponents(menu).toJSON()] 
    };
}

async function executeDataDeletion(client, targetId, dataType) {
    const models = client.models['staff-management-system'];
    
    if (['del_infractions', 'del_all'].includes(dataType)) await models['Infraction'].destroy({ 
        where: { userId: targetId } 
    });
    if (['del_promotions', 'del_all'].includes(dataType)) await models['Promotion'].destroy({ 
        where: { userId: targetId } 
    });
    if (['del_reviews', 'del_all'].includes(dataType)) await models['StaffReview'].destroy({ 
        where: { targetId: targetId } 
    }); 
    if (['del_shifts', 'del_all'].includes(dataType)) {
        await models['StaffShift'].destroy({ 
            where: { userId: targetId } 
        });
        await models['StaffProfile'].destroy({ 
            where: { userId: targetId } 
        });
    }
    if (['del_status', 'del_all'].includes(dataType)) await models['LoaRequest'].destroy({ 
        where: { userId: targetId } 
    });
    if (['del_activity', 'del_all'].includes(dataType)) {
        const allChecks = await models['ActivityCheck'].findAll();
        for (const check of allChecks) {
            let responded = JSON.parse(check.respondedUsers || '[]');
            if (responded.includes(targetId)) {
                responded = responded.filter(id => id !== targetId);
                await check.update({ respondedUsers: JSON.stringify(responded) });
            }
        }
    }
}

// ----- Status -----
const getStatusMeta = (type) => ({
    isLoa: type === 'LOA', 
    label: type === 'LOA' 
    ? 'LoA' 
    : 'RA', 
    enableKey: type === 'LOA' 
    ? 'enableLoa' 
    : 'enableRa',
    roleKey: type === 'LOA' 
    ? 'loaRole' 
    : 'raRole', 
    maxDaysKey: type === 'LOA' 
    ? 'loaMaxDays' 
    : 'raMaxDays', 
    color: type === 'LOA' 
    ? 'Green' 
    : 'Orange',
    activeText: localize('staff-management-system', type === 'LOA' 
        ? 'status-active-loa' 
        : 'status-active-ra'
    ),
    histTitle: localize('staff-management-system', type === 'LOA' 
        ? 'status-hist-loa' 
        : 'status-hist-ra'
    ), 
    actionPrefix: type === 'LOA' 
    ? 'loa' 
    : 'ra'
});

async function handleStatusRequest(client, interaction, type, durationInput, reason) {
    const config = getConfig(client, 'status');
    const isLoa = type === 'LOA';
    if (!config[isLoa 
        ? 'enableLoa' 
        : 'enableRa']) return interaction.editReply({ 
            content: localize('staff-management-system', 'err-status-disabled', { type }) 
        }
    );

    const days = parseDurationToDays(durationInput?.trim());
    if (!days || isNaN(days) || days <= 0) return interaction.editReply({ 
        content: localize('staff-management-system', 'err-invalid-duration') 
    });
    
    const maxDays = (isLoa ? config.loaMaxDays : config.raMaxDays) || (isLoa ? 60 : 30);
    if (days > maxDays) return interaction.editReply({ 
        content: localize('staff-management-system', 'err-duration-max', { max: maxDays }) 
    });

    const LoaRequest = client.models['staff-management-system']['LoaRequest'];
    if (await LoaRequest.findOne({ 
        where: { userId: interaction.user.id, type, status: { [Op.in]: ['PENDING', 'APPROVED'] }, 
        endDate: { [Op.gt]: new Date() } } 
    })) {
        return interaction.editReply({ 
            content: localize('staff-management-system', 'err-status-exists', { type }) 
        });
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
    const needsApproval = isLoa 
    ? config.requireLoaApproval !== false 
    : config.requireRaApproval !== false;

    const req = await LoaRequest.create({ 
        userId: interaction.user.id, 
        type, 
        reason, 
        startDate, 
        endDate, 
        status: needsApproval 
        ? 'PENDING' 
        : 'APPROVED' 
    });

    const logChannelId = getSafeChannelId(config.statusLogChannel);
    if (logChannelId && needsApproval) {
        const channel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle(localize('staff-management-system', 'status-request-title', { type }))
                .setColor('Blue')
                .setAuthor({ name: `Request ID: ${req.id}`})
                .addFields(
                    { name: localize('staff-management-system', 'status-req-user'), 
                        value: interaction.user.toString(), 
                        inline: true 
                    }, 
                    { name: localize('staff-management-system', 'status-req-duration'), 
                        value: `${days} ${localize('staff-management-system', 'label-days')}`, 
                        inline: true 
                    }, 
                    { name: localize('staff-management-system', 'general-rsn'), 
                        value: reason 
                    }
                );
            
            applyFooter(client, embed);
            const row = new ActionRowBuilder()
            .addComponents(new ButtonBuilder()
            .setCustomId(`staff-mgmt_approve_${req.id}`)
            .setLabel(localize('staff-management-system', 'btn-approve'))
            .setStyle(ButtonStyle.Success), 
            new ButtonBuilder()
            .setCustomId(`staff-mgmt_deny_${req.id}`)
            .setLabel(localize('staff-management-system', 'btn-deny'))
            .setStyle(ButtonStyle.Danger));
            channel.send({ embeds: [embed.toJSON()], components: [row.toJSON()] }).catch(()=>{});
        }
    }

    if (!needsApproval) {
        const roleId = config[isLoa ? 'loaRole' : 'raRole'];
        if (roleId) interaction.member.roles.add(roleId).catch(()=>{});
        await logStatusChange(client, type, 'start', { 
            targetUser: interaction.user, 
            startDate, 
            endDate, 
            reason, 
            approverId: null 
        });
    }

    await interaction.editReply({ 
        content: localize('staff-management-system', 'success-status-request', { 
            type, state: needsApproval 
            ? localize('staff-management-system', 'state-pending') 
            : localize('staff-management-system', 'state-auto') 
        }) 
    });
}

async function handleStatusView(client, interaction, type, targetUser) {
    const user = targetUser || interaction.user;
    const request = await client.models['staff-management-system']['LoaRequest'].findOne({ 
        where: { userId: user.id, type, status: { [Op.in]: ['APPROVED', 'PENDING'] }, 
        endDate: { [Op.gt]: new Date() } }, 
        order: [['createdAt', 'DESC']] 
    });

    if (!request) return interaction.editReply({ 
        content: localize('staff-management-system', 'no-active-status', { 
            user: user.username, 
            type 
        }) 
    });

    const embed = new EmbedBuilder()
    .setTitle(`${type} Status: ${user.username}`)
    .setColor(request.status === 'APPROVED' 
        ? 'Green' 
        : 'Yellow'
    )
    .addFields(
        { 
        name: localize('staff-management-system', 'label-stat'),
         value: request.status, 
         inline: true }, 
        { 
        name: localize('staff-management-system', 'label-end'), 
        value: formatDate(request.endDate), 
        inline: true }, 
        { 
        name: localize('staff-management-system', 'general-rsn'), 
        value: request.reason || localize('staff-management-system', 'info-none') 
    })
    .setThumbnail(user.displayAvatarURL({ dynamic: true }));
    applyFooter(client, embed);
    await interaction.editReply({ embeds: [embed.toJSON()] });
}

async function handleStatusList(client, interaction, type, filter, page = 1) {
    const limit = 10;
    const offset = (page - 1) * limit;

    let whereClause = { type };
    let title = `${type} List`;

    if (filter === 'active') { 
        whereClause.status = 'APPROVED'; 
        whereClause.endDate = { [Op.gt]: new Date() }; 
        title += localize('staff-management-system', 'filter-active'); 
    }
    else if (filter === 'expired') { 
        whereClause.endDate = { [Op.lt]: new Date() }; 
        title += localize('staff-management-system', 'filter-expired'); 
    }
    else { 
        whereClause.status = { [Op.ne]: 'PENDING' }; 
        title += localize('staff-management-system', 'filter-history'); 
    }

    const { count, rows } = await client.models['staff-management-system']['LoaRequest'].findAndCountAll({ 
        where: whereClause, 
        limit, 
        offset, 
        order: [['endDate', 'DESC']] 
    });
    if (count === 0) return interaction.editReply({ 
        content: localize('staff-management-system', 'err-no-recs') 
    });

    const totalPages = Math.ceil(count / limit) || 1;
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor('Blue')
        .setDescription(rows.map(r => `**<@${r.userId}>** ${r.status === 'APPROVED' ? '✅' : (r.status === 'DENIED' ? '❌' : '⏹️')}\nEnds: ${formatDate(r.endDate)}\nReason: ${r.reason}`).join('\n\n'))
        .addFields(
            { 
                name: '\u200b', 
                value: localize('staff-management-system', 'page-count', { page, total: totalPages }) 
            }
        );
    applyFooter(client, embed);
    await interaction.editReply({ embeds: [embed.toJSON()] });
}

async function handleStatusManage(client, interaction, targetMember, type) {
    const config = getConfig(client, 'status');
    const meta = getStatusMeta(type);
    if (!config[meta.enableKey]) return interaction.editReply({ 
        content: localize('staff-management-system', 'err-status-disabled', { type }) 
    });

    const generalConfig = getConfig(client, 'configuration');
    const canManage = interaction.member.roles.cache.some(r => [...(generalConfig.supervisorRoles || []), ...(generalConfig.managementRoles || [])].includes(r.id)) || interaction.member.permissions.has('Administrator');
    if (!canManage) return interaction.editReply({ 
        content: localize('staff-management-system', 'err-gen-no-perm') 
    });

    const LoaRequest = client.models['staff-management-system']['LoaRequest'];
    const activeRequest = await LoaRequest.findOne({ 
        where: {
            userId: targetMember.user.id, 
            type, 
            status: { [Op.in]: ['APPROVED', 'PENDING'] }, 
            endDate: { [Op.gt]: new Date() } 
        }, 
            order: [['createdAt', 'DESC']] 
        }
    );
    const totalCount = await LoaRequest.count({ 
        where: { userId: targetMember.user.id, type } 
    });

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'manage-status-title', { 
            label: meta.label, 
            username: targetMember.user.username 
        }))
        .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
        .setColor(activeRequest 
            ? meta.color 
            : 'Grey'
        )
        .setDescription(localize('staff-management-system', 'manage-stat-desc', { 
            status: activeRequest 
            ? meta.activeText 
            : localize('staff-management-system', 'no-act-stat', { 
                label: meta.label 
            }), 
            label: meta.label, 
            count: Math.max(0, totalCount - (activeRequest ? 1 : 0)) 
        }))
    );

    embed.addFields({ 
        name: localize('staff-management-system', 'manage-active-details', { label: meta.label }), 
        value: activeRequest ? `**${localize('staff-management-system', 'general-start')}:** ${formatDate(activeRequest.startDate)}\n**${localize('staff-management-system', 'general-end')}:** ${formatDate(activeRequest.endDate)}\n**${localize('staff-management-system', 'label-stat')}:** ${activeRequest.status}\n**${localize('staff-management-system', 'label-appr-by')}:** ${activeRequest.approverId ? `<@${activeRequest.approverId}>` : localize('staff-management-system', 'label-auto')}\n**${localize('staff-management-system', 'general-rsn')}:** ${activeRequest.reason || localize('staff-management-system', 'info-none')}` : localize('staff-management-system', 'manage-no-active-user', { label: meta.label }) 
    });

    const p = meta.actionPrefix;
    const rid = activeRequest?.id ?? 'none';
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId(`staff-mgmt_${p}-end_${rid}`)
        .setLabel(localize('staff-management-system', 'btn-end-early', { label: meta.label }))
        .setEmoji('🚫').setStyle(ButtonStyle.Danger)
        .setDisabled(!activeRequest),
        new ButtonBuilder()
        .setCustomId(`staff-mgmt_${p}-extend_${rid}`)
        .setLabel(localize('staff-management-system', 'btn-extend', { label: meta.label }))
        .setEmoji('⏳')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!activeRequest),
        new ButtonBuilder()
        .setCustomId(`staff-mgmt_${p}-hist_${targetMember.user.id}_1`)
        .setLabel(localize('staff-management-system', 'btn-view-history'))
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(totalCount === 0)
    );
    await interaction.editReply({ 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    });
}

async function handleStatusEnd(interaction, type) {
    const meta = getStatusMeta(type);
    const requestId = interaction.customId.split('_')[2];
    if (requestId === 'none') return interaction.reply({ 
        content: localize('staff-management-system', 'err-no-active-end', { label: meta.label }), 
        flags: MessageFlags.Ephemeral 
    });

    const modal = new ModalBuilder()
    .setCustomId(`staff-mgmt_${meta.actionPrefix}-end-submit_${requestId}`)
    .setTitle(localize('staff-management-system', 'modal-end-early-title', { label: meta.label }));
    modal.addComponents(new ActionRowBuilder()
    .addComponents(
        new TextInputBuilder()
        .setCustomId('end_reason')
        .setLabel(localize('staff-management-system', 'modal-end-early-reason'))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ));
    return interaction.showModal(modal);
}

async function handleStatusEndSubmit(client, interaction, type) {
    const meta = getStatusMeta(type);
    const request = await client.models['staff-management-system']['LoaRequest'].findByPk(interaction.customId.split('_')[2]);
    if (!request || request.status === 'ENDED' || request.status === 'DENIED') return interaction.reply({ 
        content: localize('staff-management-system', 'err-stat-inact', { label: meta.label }), 
        flags: MessageFlags.Ephemeral 
    });

    const reason = interaction.fields.getTextInputValue('end_reason');
    const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
    
    if (member && getConfig(client, 'status')[meta.roleKey]) await member.roles.remove(getConfig(client, 'status')[meta.roleKey]).catch(() => {});

    await request.update({ status: 'ENDED', endDate: new Date() });
    await client.models['staff-management-system']['StaffProfile'].update({ activityStatus: 'ACTIVE' }, { 
        where: { userId: request.userId } 
    });

    if (member) await sendStatusDm(member.user, type, 'ended_early', { 
        ender: interaction.user.tag, 
        reason 
    });
    await logStatusChange(client, type, 'end', { 
        userId: request.userId, 
        startDate: request.startDate, 
        reason: request.reason 
    });

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor('Grey')
    .setDescription(localize('staff-management-system', 'status-ended-embed-desc', { 
        label: meta.label, user: interaction.user.tag, reason 
    }))
    .spliceFields(0, 1, { 
        name: localize('staff-management-system', 'manage-active-details', { label: meta.label }), 
        value: localize('staff-management-system', 'manage-no-active-user', { label: meta.label }) 
    });

    const p = meta.actionPrefix;
    const disabledRow = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
        .setCustomId(`${p}-end-done`)
        .setLabel(localize('staff-management-system', 'btn-end-early', { label: meta.label }))
        .setEmoji('🚫')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
        new ButtonBuilder()
        .setCustomId(`${p}-extend-done`)
        .setLabel(localize('staff-management-system', 'btn-extend', { label: meta.label }))
        .setEmoji('⏳')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
        new ButtonBuilder()
        .setCustomId(`staff-mgmt_${p}-hist_${request.userId}_1`)
        .setLabel(localize('staff-management-system', 'btn-view-history'))
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ 
        embeds: [updatedEmbed.toJSON()], 
        components: [disabledRow.toJSON()] 
    });
}

async function handleStatusExtend(interaction, type) {
    const meta = getStatusMeta(type);
    const requestId = interaction.customId.split('_')[2];
    if (requestId === 'none') return interaction.reply({ 
        content: localize('staff-management-system', 'err-no-active-extend', { label: meta.label }), 
        flags: MessageFlags.Ephemeral 
    });

    const modal = new ModalBuilder()
    .setCustomId(`staff-mgmt_${meta.actionPrefix}-extend-submit_${requestId}`)
    .setTitle(localize('staff-management-system', 'modal-extend-title', { 
        label: meta.label 
    }));
    modal.addComponents(
        new ActionRowBuilder()
        .addComponents(
        new TextInputBuilder()
        .setCustomId('extend_days')
        .setLabel(localize('staff-management-system', 'modal-extend-days'))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("7")
        .setRequired(true)
        ),
        new ActionRowBuilder()
        .addComponents(
        new TextInputBuilder()
        .setCustomId('extend_reason')
        .setLabel(localize('staff-management-system', 'modal-extend-reason'))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        )
    );
    return interaction.showModal(modal);
}

function scheduleStatusExpiry(client, request) {
    schedule.scheduleJob(new Date(request.endDate), async () => {
        try {
            const req = await client.models['staff-management-system']['LoaRequest'].findByPk(request.id);
            if (req && req.status === 'APPROVED' && new Date(req.endDate) <= new Date()) {
                await req.update({ status: 'ENDED' });
                await client.models['staff-management-system']['StaffProfile'].update({ activityStatus: 'ACTIVE' }, { 
                    where: { userId: req.userId } 
                });

                const member = await client.guilds.cache.get(client.guildID)?.members.fetch(req.userId).catch(() => null);
                if (member) {
                    const roleKey = req.type === 'LOA' 
                    ? 'loaRole' 
                    : 'raRole';
                    if (getConfig(client, 'status')[roleKey]) await member.roles.remove(getConfig(client, 'status')[roleKey]).catch(() => null);
                    await sendStatusDm(member.user, req.type, 'ended');
                }
                await logStatusChange(client, req.type, 'end', { userId: req.userId, startDate: req.startDate, reason: req.reason });
            }
        } catch (e) {}
    });
}

async function handleStatusExtendSubmit(client, interaction, type) {
    const meta = getStatusMeta(type);
    const request = await client.models['staff-management-system']['LoaRequest'].findByPk(interaction.customId.split('_')[2]);
    if (!request || request.status === 'ENDED' || request.status === 'DENIED') return interaction.reply({ 
        content: localize('staff-management-system', 'err-stat-inact', { 
            label: meta.label 
        }), 
        flags: MessageFlags.Ephemeral 
    });

    const days = parseInt(interaction.fields.getTextInputValue('extend_days'), 10);
    const reason = interaction.fields.getTextInputValue('extend_reason');
    if (isNaN(days) || days <= 0 || days > 180) return interaction.reply({ 
        content: localize('staff-management-system', 'err-inv-dur'), 
        flags: MessageFlags.Ephemeral 
    });

    const oldEndDate = new Date(request.endDate);
    const newEndDate = new Date(oldEndDate.getTime() + days * 24 * 60 * 60 * 1000);
    await request.update({ endDate: newEndDate });
    scheduleStatusExpiry(client, request);

    const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
    if (member) await sendStatusDm(member.user, type, 'extended', { 
        extender: interaction.user.tag, 
        days, 
        endDate: newEndDate, 
        reason 
    });
    await logStatusChange(client, type, 'adjusted', { 
        userId: request.userId, 
        executorId: interaction.user.id, 
        changesText: localize('staff-management-system', 'status-adjusted-log', { 
            label: meta.label, 
            newEnd: `<t:${Math.floor(newEndDate.getTime() / 1000)}:F>`, 
            oldEnd: `<t:${Math.floor(oldEndDate.getTime() / 1000)}:F>`,
            reason 
        }) 
    });

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .spliceFields(0, 1, { 
        name: localize('staff-management-system', 'manage-active-details', { label: meta.label }), 
        value: localize('staff-management-system', 'mod-stat-ext', { 
            s: formatDate(request.startDate), 
            e: formatDate(newEndDate), 
            d: days, 
            t: request.status, 
            a: request.approverId 
            ? `<@${request.approverId}>` 
            : localize('staff-management-system', 'label-auto'), 
            r: request.reason || localize('staff-management-system', 'info-none') 
        }) 
    });
    return interaction.update({ 
        embeds: [updatedEmbed.toJSON()], 
        components: interaction.message.components.map(c => c.toJSON()) 
    });
}

async function generateStatusHistoryResponse(client, targetUser, page = 1, type) {
    const meta = getStatusMeta(type);
    const limit = 5;
    const offset = (page - 1) * limit;

    const { count, rows } = await client.models['staff-management-system']['LoaRequest'].findAndCountAll({ 
        where: { userId: targetUser.id, type }, 
        order: [['createdAt', 'DESC']], 
        limit, 
        offset 
    });
    if (count === 0) return { 
        content: localize('staff-management-system', 'info-no-status-history', { label: meta.label }), 
        flags: MessageFlags.Ephemeral 
    };

    const totalPages = Math.ceil(count / limit) || 1;
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(`${meta.histTitle} - ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setColor(meta.color)
        .setDescription(localize('staff-management-system', 'status-history-desc', {
             count: rows.length, 
             total: count, 
             label: meta.label 
            }
        ))
    );

    const statusIcons = { 
        APPROVED: '✅', 
        DENIED: '❌', 
        ENDED: '⏹️', 
        PENDING: '🕐' 
    };
    rows.forEach((req, index) => embed.addFields({ 
        name: `${statusIcons[req.status] ?? '❓'} ${meta.label} #${offset + index + 1} - ${req.status}`, 
        value: `**${localize('staff-management-system', 'general-start')}:** ${formatDate(req.startDate)}\n**${localize('staff-management-system', 'general-end')}:** ${formatDate(req.endDate)}\n**${localize('staff-management-system', 'label-appr-by')}:** ${req.approverId ? `<@${req.approverId}>` : localize('staff-management-system', 'label-auto')}\n**${localize('staff-management-system', 'general-rsn')}:** ${req.reason || localize('staff-management-system', 'info-none')}` }));
    embed.addFields({ 
        name: '\u200b', 
        value: localize('staff-management-system', 'page-count', { page, total: totalPages }) 
    });

    const row = buildPaginationRow(
        `staff-mgmt_${meta.actionPrefix}-hist_${targetUser.id}_${page - 1}`, 
        `${meta.actionPrefix}_hist_page_count`, 
        `staff-mgmt_${meta.actionPrefix}-hist_${targetUser.id}_${page + 1}`, 
        page, 
        totalPages
    );
    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

async function handleStatusHistPage(client, interaction, type) {
    const parts = interaction.customId.split('_');
    const targetUser = await client.users.fetch(parts[2]).catch(() => null);
    if (!targetUser) return interaction.reply({ 
        content: localize('staff-management-system', 'err-gen-no-user'), 
        flags: MessageFlags.Ephemeral 
    });

    const payload = await generateStatusHistoryResponse(client, targetUser, parseInt(parts[3], 10), type);
    if (payload.content) return interaction.reply({ 
        ...payload, 
        flags: MessageFlags.Ephemeral 
    });
    return interaction.message?.embeds?.[0]?.title?.startsWith(getStatusMeta(type).histTitle) 
    ? interaction.update(payload) 
    : interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

// ---------- Activity Checks ----------
async function startActivityCheck(client, interactionOrChannel, isAutomated = false) {
    const config = getConfig(client, 'activity-checks');
    const ActivityCheck = client.models['staff-management-system']['ActivityCheck'];
    
    if (await ActivityCheck.findOne({ 
        where: { status: 'ACTIVE' } 
    })) {
        return !isAutomated && interactionOrChannel.editReply 
        ? interactionOrChannel.editReply({ content: localize('staff-management-system', 'err-ac-act') }) 
        : null;
    }

    let rolesToCheck = config.targetRoles?.length 
    ? config.targetRoles 
    : (getConfig(client, 'configuration')?.staffRoles || []);
    if (!rolesToCheck.length) return !isAutomated && interactionOrChannel.editReply 
    ? interactionOrChannel.editReply({ 
        content: localize('staff-management-system', 'err-ac-norole') 
    }) 
    : null;

    const targetChannel = isAutomated 
    ? interactionOrChannel 
    : (interactionOrChannel.options.getChannel('channel') || interactionOrChannel.guild.channels.cache.get(getSafeChannelId(config.sendingChannel)) || interactionOrChannel.channel);
    if (!targetChannel) return !isAutomated && interactionOrChannel.editReply 
    ? interactionOrChannel.editReply({ 
        content: localize('staff-management-system', 'err-ac-invchan') 
    }) 
    : null;

    const durationHours = config.timeframe || 24;
    const endTime = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    let embedTemplate = typeof config.checkMessage === 'string' 
    ? JSON.parse(config.checkMessage) 
    : config.checkMessage;
    let msgOpts = await embedTypeV2(embedTemplate, { 
        '%endtime%': `<t:${Math.floor(endTime.getTime() / 1000)}:F>`, 
        '%duration%': durationHours.toString() 
    });
    
    if (msgOpts?.content?.trim() === '') delete msgOpts.content;
    msgOpts.components = [
        new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
            .setCustomId('staff-mgmt_ac-respond')
            .setLabel(localize('staff-management-system', 'ac-confirm-btn'))
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
        )
        .toJSON()
    ];

    try {
        const checkMessage = await targetChannel.send(msgOpts);
        if (!isAutomated && interactionOrChannel.editReply) await interactionOrChannel.editReply({ 
            content: localize('staff-management-system', 'succ-ac-start', { 
                channel: targetChannel.id, 
                hours: durationHours 
            }) 
        });
        
        const record = await ActivityCheck.create({ 
            messageId: checkMessage.id, 
            channelId: targetChannel.id, 
            endTime, 
            targetRoles: JSON.stringify(rolesToCheck), 
            respondedUsers: '[]', 
            status: 'ACTIVE' 
        });
        schedule.scheduleJob(endTime, async () => {
            const currentCheck = await ActivityCheck.findByPk(record.id);
            if (currentCheck && currentCheck.status === 'ACTIVE') await endActivityCheckProcess(client, currentCheck);
        });
    } catch (e) {
        if (!isAutomated && interactionOrChannel.editReply) interactionOrChannel.editReply({ 
            content: localize('staff-management-system', 'err-ac-perms', { channel: targetChannel.id }) 
        });
    }
}

async function endActivityCheckProcess(client, activeCheck) {
    await activeCheck.update({ status: 'ENDED' });
    const guild = client.guilds.cache.get(client.guildID);
    if (!guild) return;

    try {
        const msg = await guild.channels.cache.get(activeCheck.channelId)?.messages.fetch(activeCheck.messageId);
        if (msg && msg.embeds.length > 0) {
            const originalEmbed = EmbedBuilder
            .from(msg.embeds[0])
            .setColor('#ed4245');
            originalEmbed
            .setTitle(localize('staff-management-system', 'ac-title-end'));
            await msg.edit({ 
                embeds: [originalEmbed.toJSON()], 
                components: [] 
            });
        }
    } catch (e) {}

    const config = getConfig(client, 'activity-checks');
    const logChannel = guild.channels.cache.get(getSafeChannelId(config.logChannel) || getSafeChannelId(getConfig(client, 'configuration')?.generalLogChannel));
    if (!logChannel) return;

    const targetRoles = JSON.parse(activeCheck.targetRoles || '[]');
    const respondedUsers = JSON.parse(activeCheck.respondedUsers || '[]');
    
    const expectedMembers = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.some(r => targetRoles.includes(r.id)));
    const [responded, exceptions, failed] = [[], [], []];
    const profiles = await client.models['staff-management-system']['StaffProfile'].findAll();

    expectedMembers.forEach(member => {
        if (respondedUsers.includes(member.id)) return responded.push(member);
        
        let isException = false;
        const prof = profiles.find(p => p.userId === member.id);
        const isLoa = prof?.activityStatus === 'LOA';
        const isRa = prof?.activityStatus === 'RA';

        if (config.exceptionsType === 'Only LoA' && isLoa) isException = true;
        else if (config.exceptionsType === 'Only RA' && isRa) isException = true;
        else if (config.exceptionsType === 'LoA and RA' && (isLoa || isRa)) isException = true;
        else if (config.exceptionsType === 'Custom role(s)' && member.roles.cache.some(r => config.customExceptionRoles?.includes(r.id))) isException = true;

        isException 
        ? exceptions.push(member) 
        : failed.push(member);
    });

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'ac-res-title'))
        .setColor('Blurple')
        .addFields(
            { 
                name: localize('staff-management-system', 'ac-f-res', { 
                    count: responded.length }
                ), 
                value: responded.length 
                ? responded.map(m => `<@${m.id}>`).join(', ').substring(0, 1024) 
                : localize('staff-management-system', 'info-none') 
            },
            { 
                name: localize('staff-management-system', 'ac-f-fail', { 
                    count: failed.length 
                }), 
                value: failed.length 
                ? failed.map(m => `<@${m.id}>`).join(', ').substring(0, 1024) 
                : localize('staff-management-system', 'info-none') 
            },
            { 
                name: localize('staff-management-system', 'ac-f-exc', { 
                    count: exceptions.length 
                }), 
                value: exceptions.length 
                ? exceptions.map(m => `<@${m.id}>`).join(', ').substring(0, 1024) 
                : localize('staff-management-system', 'info-none') 
            }
        )
    );

    const pingText = (config.pingResults && config.pingRoles?.length) 
    ? config.pingRoles.map(rId => `<@&${rId}>`).join(' ') 
    : null;
    const finalMessage = { embeds: [embed.toJSON()] };
    if (pingText) finalMessage.content = pingText;

    await logChannel.send(finalMessage);
}

function initActivityCheckAutomation(client) {
    const config = getConfig(client, 'activity-checks');
    if (!config?.enableActivityChecks || !config?.automatedChecks) return;

    let cronString = config.automatedCheckInterval === 'Cronjob' 
    ? config.automatedCheckCronjob 
    : null;
    if (!cronString) {
        const dayMap = { 
            'Monday': 1, 
            'Tuesday': 2, 
            'Wednesday': 3, 
            'Thursday': 4, 
            'Friday': 5, 
            'Saturday': 6,
            'Sunday': 7
        }[config.automatedCheckWeekDay] || 1;
        if (['Weekly', 'Biweekly'].includes(config.automatedCheckInterval)) cronString = `0 12 * * ${dayMap}`;
        else if (config.automatedCheckInterval === 'Monthly') {
            const startDay = [1, 8, 15, 22][(config.automatedCheckMonthWeek || 1) - 1];
            cronString = `0 12 ${startDay}-${startDay + 6} * ${dayMap}`;
        }
    }
    if (!cronString) return;

    let toggleWeek = false; 
    schedule.scheduleJob('automated-activity-check', cronString, async () => {
        if (config.automatedCheckInterval === 'Biweekly' && (toggleWeek = !toggleWeek, !toggleWeek)) return;
        
        const channel = client.guilds.cache.get(client.guildID)?.channels.cache.get(getSafeChannelId(config.sendingChannel));
        if (channel) {
            client.logger.info(`[Activity Checks] Starting automated check.`);
            await startActivityCheck(client, channel, true);
        }
    });
}

// ---------- Reviews ----------
async function submitReview(client, interaction, targetUser, stars, comment) {
    const config = getConfig(client, 'reviews');
    if (!config?.enableReviews) return interaction.reply({ 
        content: localize('staff-management-system', 'err-feat-disabled', { 
            feature: 'Reviews' 
        }), 
        flags: MessageFlags.Ephemeral 
    });

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) return interaction.reply({ 
        content: localize('staff-management-system', 'err-not-mem'), 
        flags: MessageFlags.Ephemeral 
    });
    if (!config.allowSelfRating && targetUser.id === interaction.user.id) return interaction.reply({ 
        content: localize('staff-management-system', 'err-self-rate'), 
        flags: MessageFlags.Ephemeral 
    });

    if (config.onlyAllowStaffReview !== false) {
        const genCfg = getConfig(client, 'configuration');
        if (!targetMember.roles.cache.some(r => [...(genCfg?.staffRoles || []), ...(genCfg?.supervisorRoles || []), ...(genCfg?.managementRoles || [])].includes(r.id))) {
            return interaction.reply({ 
                content: localize('staff-management-system', 'err-staff-rate'), 
                flags: MessageFlags.Ephemeral 
            });
        }
    }

    const review = await client.models['staff-management-system']['StaffReview'].create({ 
        targetId: targetUser.id, 
        authorId: interaction.user.id, 
        stars, 
        comment 
    });
    const channelId = getSafeChannelId(config.reviewLogChannel);

    if (channelId) {
        const channel = interaction.guild.channels.cache.get(channelId);
        if (channel) {
            let msgOpts = await embedTypeV2(config.ratingMessage, { 
                '%target%': targetUser.toString(), 
                '%author%': interaction.user.toString(), 
                '%stars%': "⭐".repeat(stars), 
                '%rating%': stars.toString(), 
                '%comment%': comment, 
                '%staff-profile-picture%': targetUser.displayAvatarURL({ dynamic: true }), 
                '%reviewer-profile-picture%': interaction.user.displayAvatarURL({ dynamic: true }) 
            });
            if (msgOpts?.content?.trim() === '') delete msgOpts.content;
            const sentMessage = await channel.send(msgOpts).catch(()=>{});
            if (sentMessage) await review.update({ messageUrl: sentMessage.url });
        }
    }
    await interaction.reply({ 
        content: localize('staff-management-system', 'succ-review', { 
            tag: targetUser.tag, 
            stars 
        }), 
        flags: MessageFlags.Ephemeral 
    });
}

async function generateReviewHistoryResponse(client, targetUser, page = 1) {
    if (!getConfig(client, 'reviews')?.enableReviews) return { 
        content: localize('staff-management-system', 'err-feat-disabled', { 
            feature: 'Reviews' 
        }), 
        flags: MessageFlags.Ephemeral 
    };

    const limit = 8;
    const offset = (page - 1) * limit;
    const Review = client.models['staff-management-system']['StaffReview'];

    const { count, rows } = await Review.findAndCountAll({ 
        where: { targetId: targetUser.id }, 
        order: [['createdAt', 'DESC']], 
        limit, 
        offset 
    });
    const allReviews = await Review.findAll({ 
        where: { targetId: targetUser.id }, 
        attributes: ['stars'] 
    });
    const avg = allReviews.length 
    ? (allReviews.reduce((a, b) => a + b.stars, 0) / allReviews.length).toFixed(1) 
    : 0;

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'rev-title', { username: targetUser.username }))
        .setColor('Gold')
        .setDescription(localize('staff-management-system', 'rev-desc', { avg, count: allReviews.length }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    embed.addFields({ 
        name: localize('staff-management-system', 'label-hist'), 
        value: rows.length > 0 
        ? rows.map(r => `**${"⭐".repeat(r.stars)}** ${localize('staff-management-system', 'label-by')} <@${r.authorId}>${r.messageUrl 
            ? ` • [Jump](${r.messageUrl})` 
            : ''}\n"${r.comment}"`).join('\n\n') 
        : localize('staff-management-system', 'p-no-hist') });

    const row = buildPaginationRow(
        `staff-mgmt_rev-page_${targetUser.id}_${page - 1}`, 
        'page_count_disabled', 
        `staff-mgmt_rev-page_${targetUser.id}_${page + 1}`, 
        page, 
        Math.ceil(count / limit) || 1
    );
    return { 
        embeds: [embed.toJSON()], 
        components: [row.toJSON()] 
    };
}

async function getReviewHistory(client, interaction, targetUser) {
    const response = await generateReviewHistoryResponse(client, targetUser, 1);
    if (response.content && response.content.startsWith('❌')) return interaction.reply(response);
    await interaction.reply({ 
        ...response, 
        flags: MessageFlags.Ephemeral 
    });
}

module.exports = {
    logStatusChange, 
    getConfig, 
    applyFooter, 
    buildPaginationRow, 
    formatDuration, 
    issueInfraction, 
    issueSuspension, 
    getInfractionHistory, 
    voidInfraction, 
    generateInfractionHistoryResponse,
    promoteUser, 
    generatePromotionHistoryResponse, 
    getPromotionHistory, 
    generateUserPanel, 
    generatePanelInfractions, 
    generatePanelPromotions, 
    generatePanelActivity, 
    generatePanelReviews, 
    generatePanelStatus, 
    generatePanelShifts, 
    generatePanelDeletion, 
    executeDataDeletion, 
    generatePanelSubpage,
    handleStatusRequest, 
    handleStatusView, 
    handleStatusList, 
    handleStatusManage, 
    handleStatusEnd, 
    handleStatusEndSubmit, 
    handleStatusExtend, 
    handleStatusExtendSubmit, 
    handleStatusHistPage,
    startActivityCheck, 
    initActivityCheckAutomation, 
    endActivityCheckProcess,
    submitReview, 
    getReviewHistory, 
    generateReviewHistoryResponse, 
    sendStatusDm, 
    scheduleStatusExpiry
};