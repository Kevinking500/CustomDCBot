const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder } = require('discord.js');
const { 
    generateReviewHistoryResponse, 
    handleStatusEnd, 
    scheduleStatusExpiry, 
    handleStatusEndSubmit, 
    handleStatusExtend, 
    handleStatusExtendSubmit, 
    handleStatusHistPage, 
    sendStatusDm, 
    generatePromotionHistoryResponse,
    generateInfractionHistoryResponse, 
    generateUserPanel, 
    generatePanelInfractions,
    generatePanelPromotions, 
    generatePanelReviews, 
    generatePanelStatus, 
    generatePanelActivity, 
    generatePanelShifts, 
    generatePanelDeletion,
    executeDataDeletion, 
    generatePanelSubpage, 
    logStatusChange
} = require('../staff-management');
const { localize } = require('../../../src/functions/localize');
const dutyHandlers = require('../commands/duty.js').buttonHandlers;
const configuration = require('../configuration.json');

module.exports.run = async (client, interaction) => {
    if (!client.botReadyAt) return;
    if (!interaction.guild || interaction.guild.id !== client.guildID) return;
    if (!interaction.customId || (!interaction.customId.startsWith('staff-mgmt_') && !interaction.customId.startsWith('duty-mgmt_'))) return;

    try {
        const parts = interaction.customId.split('_');
        const action = parts[1];

        // ----- Duty manage handlers -----
        if (interaction.customId.startsWith('duty-mgmt_')) {
            const dutyAction = parts[1];

            if (interaction.isStringSelectMenu() && dutyAction === 'dropdown') {
                await interaction.deferUpdate();
                return await dutyHandlers.handleDutyDropdown(client, interaction, parts[2], interaction.values[0]);
            }

            if (['start', 'break', 'end', 'hist', 'lb', 'admin-forceend', 'admin-voidactive'].includes(dutyAction)) {
                 await interaction.deferUpdate();
            }

            if (dutyAction === 'start')                return await dutyHandlers.handleDutyStartButton(client, interaction);
            if (dutyAction === 'break')                return await dutyHandlers.handleDutyBreakButton(client, interaction);
            if (dutyAction === 'end')                  return await dutyHandlers.handleDutyEndButton(client, interaction);
            if (dutyAction === 'hist')                 return await dutyHandlers.handleDutyHistPageButton(client, interaction);
            if (dutyAction === 'lb')                   return await dutyHandlers.handleDutyLbPageButton(client, interaction);
            if (dutyAction === 'admin-forceend')       return await dutyHandlers.handleDutyAdminForceEnd(client, interaction);
            if (dutyAction === 'admin-voidactive')     return await dutyHandlers.handleDutyAdminVoidActive(client, interaction);
            if (dutyAction === 'admin-voidall')        return await dutyHandlers.handleDutyAdminVoidAll(client, interaction);
            if (dutyAction === 'admin-voidall-submit') return await dutyHandlers.handleDutyAdminVoidAllSubmit(client, interaction);
            if (dutyAction === 'admin-addtime')        return await dutyHandlers.handleDutyAdminAddTimeButton(client, interaction);
            if (dutyAction === 'admin-addtime-submit') return await dutyHandlers.handleDutyAdminAddTimeSubmit(client, interaction);
            return;
        }
        
        // ----- Review history pagination -----
        if (action === 'rev-page') {
            const targetUser = await client.users.fetch(parts[2]).catch(() => null);
            if (!targetUser) return interaction.reply({ 
                content: localize('staff-management-system', 'err-gen-no-user'), 
                flags: MessageFlags.Ephemeral 
            });

            const payload = await generateReviewHistoryResponse(client, targetUser, parseInt(parts[3]));
            if (payload.content) return interaction.reply(payload);
            return interaction.update(payload);
        }

        // ----- LOA/RA handlers -----
        const loaActions = ['loa-end', 'loa-end-submit', 'loa-extend', 'loa-extend-submit', 'loa-hist'];
        const raActions  = ['ra-end',  'ra-end-submit',  'ra-extend',  'ra-extend-submit',  'ra-hist'];

        if (loaActions.includes(action) || raActions.includes(action)) {
            const type = action.startsWith('loa-') ? 'LOA' : 'RA';
            const base = action.replace(/^(loa|ra)-/, '');

            if (base === 'end')           return handleStatusEnd(interaction, type);
            if (base === 'end-submit')    return handleStatusEndSubmit(interaction, type);
            if (base === 'extend')        return handleStatusExtend(interaction, type);
            if (base === 'extend-submit') return handleStatusExtendSubmit(interaction, type);
            if (base === 'hist')          return handleStatusHistPage(interaction, type);
        }

        // ----- Promotion history pagination -----
        if (action === 'prom-hist') {
            const targetUser = await client.users.fetch(parts[2]).catch(() => null);
            if (!targetUser) return interaction.reply({ 
                content: localize('staff-management-system', 'err-gen-no-user'), 
                flags: MessageFlags.Ephemeral 
            });

            const payload = await generatePromotionHistoryResponse(client, targetUser, parseInt(parts[3], 10));
            if (payload.content) return interaction.reply(payload);
            return interaction.update(payload);
        }

        // ----- Infraction history pagination -----
        if (action === 'inf-hist') {
            const targetUser = await client.users.fetch(parts[2]).catch(() => null);
            if (!targetUser) return interaction.reply({ 
                content: localize('staff-management-system', 'err-gen-no-user'), 
                flags: MessageFlags.Ephemeral 
            });
            const payload = await generateInfractionHistoryResponse(client, targetUser, parseInt(parts[3], 10));
            if (payload.content) return interaction.reply(payload);
            return interaction.update(payload);
        }

        // ----- User panel dropdown -----
        if (interaction.customId.startsWith('staff-mgmt_panel-menu_')) {
            const targetId = interaction.customId.split('_')[2];
            const targetUser = await client.users.fetch(targetId).catch(() => null);
            if (!targetUser) return interaction.reply({ 
                content: localize('staff-management-system', 'err-gen-no-user'), 
                flags: MessageFlags.Ephemeral 
            });

            const selection = interaction.values[0];
            let payload;
            if (selection === 'overview') payload = await generateUserPanel(client, targetUser);
            else if (selection === 'infractions') payload = await generatePanelInfractions(client, targetUser, 1);
            else if (selection === 'promotions') payload = await generatePanelPromotions(client, targetUser, 1);
            else if (selection === 'reviews') payload = await generatePanelReviews(client, targetUser, 1);
            else if (selection === 'status') payload = await generatePanelStatus(client, targetUser, 1);
            else if (selection === 'activity') payload = await generatePanelActivity(client, targetUser, 1);
            else if (selection === 'shifts') payload = await generatePanelShifts(client, targetUser);
            else if (selection === 'deletion') payload = await generatePanelDeletion(client, targetUser);

            return interaction.update(payload);
        }

        // ----- User panel deletion dropdown -----
        if (interaction.customId.startsWith('staff-mgmt_delete-menu_')) {
            const targetId = interaction.customId.split('_')[2];
            const selection = interaction.values[0];

            if (selection === 'back') {
                const targetUser = await client.users.fetch(targetId).catch(() => null);
                if (!targetUser) return interaction.reply({ 
                    content: localize('staff-management-system', 'err-gen-no-user'), 
                    flags: MessageFlags.Ephemeral 
                });

                const payload = await generateUserPanel(client, targetUser);
                return interaction.update(payload);
            }

            const confirmPhrase = localize('staff-management-system', 'del-conf-phrase');
            const modal = new ModalBuilder()
                .setCustomId(`staff-mgmt_del-confirm_${targetId}_${selection}`)
                .setTitle(localize('staff-management-system', 'mod-del-title'));
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('confirm')
                        .setLabel(localize('staff-management-system', 'mod-del-lbl'))
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder(confirmPhrase)
                        .setRequired(true)
                )
            );
            return interaction.showModal(modal);
        }

        // ----- Data deletion modal submission -----
        if (interaction.isModalSubmit() && interaction.customId.startsWith('staff-mgmt_del-confirm_')) {
            const managementRoles = Array.isArray(configuration.managementRoles) 
            ? configuration.managementRoles 
            : [];
            const memberRoles = interaction.member && interaction.member.roles && interaction.member.roles.cache
                ? interaction.member.roles.cache
                : null;
            const hasManagementRole = memberRoles
                ? managementRoles.some((roleId) => memberRoles.has(roleId))
                : false;
            if (!hasManagementRole) {
                return interaction.reply({
                    content: localize('staff-management-system', 'del-no-perm'),
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const parts = interaction.customId.split('_');
            const targetId = parts[2];
            const selection = parts.slice(3).join('_'); 
            
            const confirmPhrase = localize('staff-management-system', 'del-conf-phrase');
            
            if (interaction.fields.getTextInputValue('confirm').trim() !== confirmPhrase) {
                return interaction.reply({ 
                    content: localize('staff-management-system', 'err-conf-fail'), 
                    flags: MessageFlags.Ephemeral 
                });
            }

            if (selection === 'del_all') {
                const embed = new EmbedBuilder()
                    .setTitle(localize('staff-management-system', 'del-all-title'))
                    .setDescription(localize('staff-management-system', 'del-all-desc'))
                    .setColor('DarkRed');

                const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                    .setCustomId(`staff-mgmt_del-all-confirm_${targetId}`)
                    .setLabel(localize('staff-management-system', 'btn-conf-del'))
                    .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                    .setCustomId(`staff-mgmt_del-all-cancel_${targetId}`)
                    .setLabel(localize('staff-management-system', 'btn-cancel'))
                    .setStyle(ButtonStyle.Secondary)
                );

                await interaction.reply({ 
                    embeds: [embed.toJSON()], 
                    components: [row.toJSON()], 
                    flags: MessageFlags.Ephemeral 
                });

                const reply = await interaction.fetchReply();
                const collector = reply.createMessageComponentCollector({ time: 30000 });

                collector.on('collect', async (btnInt) => {
                    const managementRoles = Array.isArray(configuration.managementRoles) ? configuration.managementRoles : [];
                    const memberRoles = btnInt.member && btnInt.member.roles && btnInt.member.roles.cache
                        ? btnInt.member.roles.cache
                        : null;
                    const hasManagementRole = memberRoles
                        ? managementRoles.some((roleId) => memberRoles.has(roleId))
                        : false;
                    if (!hasManagementRole) {
                        return btnInt.reply({
                            content: localize('staff-management-system', 'del-no-perm'),
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    
                    if (btnInt.customId.includes('cancel')) {
                        await btnInt.update({ 
                            content: localize('staff-management-system', 'succ-del-canc'), 
                            embeds: [], 
                            components: [] 
                        });
                        collector.stop('cancelled');
                    } else if (btnInt.customId.includes('confirm')) {
                        await executeDataDeletion(client, targetId, 'del_all');
                        
                        client.logger.info(localize('staff-management-system', 'log-del-all', { 
                            target: targetId, 
                            admin: btnInt.user.id 
                        }));

                        const targetUser = await client.users.fetch(targetId).catch(() => null);
                        if (targetUser) {
                            const payload = await generateUserPanel(client, targetUser);
                            await interaction.message.edit(payload).catch(()=>{});
                        }
                        
                        await btnInt.update({ 
                            content: localize('staff-management-system', 'succ-del-all'), 
                            embeds: [], 
                            components: [] 
                        });
                        collector.stop('confirmed');
                    }
                });

                collector.on('end', (reason) => {
                    if (reason === 'time') {
                        interaction.editReply({ 
                            content: localize('staff-management-system', 'err-del-time'), 
                            embeds: [], 
                            components: [] 
                        }).catch(()=>{});
                    }
                });
                return;
            }

            await executeDataDeletion(client, targetId, selection);
            client.logger.info(localize('staff-management-system', 'log-del-type', { 
                type: selection, 
                target: targetId, 
                admin: interaction.user.id 
            }));
            const targetUser = await client.users.fetch(targetId).catch(() => null);
            if (targetUser) {
                const payload = await generateUserPanel(client, targetUser);
                await interaction.message.edit(payload).catch(()=>{});
            }
            
            return interaction.reply({ 
                content: localize('staff-management-system', 'succ-del-tgt'), 
                flags: MessageFlags.Ephemeral 
            });
        }

        // ----- User panel buttons -----
        if (interaction.customId.startsWith('staff-mgmt_panel-')) {
            const parts = interaction.customId.split('_');
            const targetId = parts[2];
            const page = parseInt(parts[3], 10);
            
            const targetUser = await client.users.fetch(targetId).catch(() => null);
            if (!targetUser) return interaction.reply({ 
                content: localize('staff-management-system', 'err-gen-no-user'), 
                flags: MessageFlags.Ephemeral 
            });
            
            const typeMap = { 
                'inf': 'infractions', 
                'prom': 'promotions', 
                'rev': 'reviews', 
                'stat': 'status', 
                'act': 'activity' 
            };
            const fullType = typeMap[parts[1].split('-')[1]];

            if (fullType) {
                const payload = await generatePanelSubpage(client, targetUser, fullType, page);
                if (payload) return interaction.update(payload);
            }
        }

        // ----- Status buttons -----
        const LoARequest = client.models['staff-management-system']['LoaRequest'];
        const StaffProfile = client.models['staff-management-system']['StaffProfile'];
        const config = client.configurations['staff-management-system']['configuration'];
        const statusConfig = client.configurations['staff-management-system']['status'];

        if (action === 'approve' || action === 'deny') {
            const isSupervisor = interaction.member.roles.cache.some(r => config.supervisorRoles.includes(r.id)) || 
                                 interaction.member.roles.cache.some(r => config.managementRoles.includes(r.id)) ||
                                 interaction.member.permissions.has('Administrator');

            if (!isSupervisor) return interaction.reply({ 
                content: localize('staff-management-system', 'err-gen-no-perm'), 
                flags: MessageFlags.Ephemeral 
            });

            const request = await LoARequest.findByPk(parts[2]);
            if (!request) return interaction.reply({ 
                content: localize('staff-management-system', 'err-no-req'), 
                flags: MessageFlags.Ephemeral 
            });
            if (request.status !== 'PENDING') return interaction.reply({ 
                content: localize('staff-management-system', 'err-req-hndl', { status: request.status }), 
                flags: MessageFlags.Ephemeral 
            });

            if (action === 'deny') {
                const modal = new ModalBuilder()
                .setCustomId(`staff-mgmt_loa-deny_${parts[2]}`)
                .setTitle(localize('staff-management-system', 'mod-deny-req'));
                modal.addComponents(
                    new ActionRowBuilder()
                    .addComponents(
                        new TextInputBuilder()
                        .setCustomId('reason')
                        .setLabel(localize('staff-management-system', 'general-rsn'))
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                    )
                );
                return interaction.showModal(modal);
            }

            if (action === 'approve') {
                await request.update({ 
                    status: 'APPROVED', 
                    approverId: interaction.user.id 
                });
                await StaffProfile.upsert({ 
                    userId: request.userId, 
                    activityStatus: request.type 
                });
                scheduleStatusExpiry(client, request);

                const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
                if (member) {
                    const roleId = request.type === 'LOA' 
                    ? statusConfig.loaRole 
                    : statusConfig.raRole;
                    if (roleId) await member.roles.add(roleId).catch(() => {});
                    await sendStatusDm(member.user, request.type, 'approved', { 
                        approver: interaction.user.tag, 
                        endDate: request.endDate 
                    });
                }

                await logStatusChange(client, request.type, 'start', {
                    userId: request.userId, 
                    startDate: request.startDate, 
                    endDate: request.endDate,
                    reason: request.reason, 
                    approverId: interaction.user.id
                });

                const embed = EmbedBuilder
                .from(interaction.message.embeds[0])
                .setColor('Green')
                .addFields({ 
                    name: localize('staff-management-system', 'general-stat'), 
                    value: localize('staff-management-system', 'req-appr-by', { 
                        user: interaction.user.tag 
                    }) 
                });
                return interaction.update({ 
                    embeds: [embed.toJSON()], 
                    components: [] 
                });
            }
        }

        // ----- Deny modal submission -----
        if (interaction.isModalSubmit() && action === 'loa-deny') {
            const reason = interaction.fields.getTextInputValue('reason');
            const request = await LoARequest.findByPk(parts[2]);

            if (request) {
                await request.update({ 
                    status: 'DENIED', 
                    approverId: interaction.user.id, 
                    rejectionReason: reason 
                });
                const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
                if (member) await sendStatusDm(member.user, request.type, 'denied', { 
                    denier: interaction.user.tag, 
                    reason 
                });

                const embed = EmbedBuilder
                .from(interaction.message.embeds[0])
                .setColor('Red')
                .addFields({ 
                    name: localize('staff-management-system', 'general-stat'), 
                    value: localize('staff-management-system', 'req-deny-by', { 
                        user: interaction.user.tag 
                    }) 
                }, { 
                    name: localize('staff-management-system', 'general-rsn'), 
                    value: reason 
                });
                return interaction.update({ 
                    embeds: [embed.toJSON()], 
                    components: [] 
                });
            }
        }

        // ----- Profile edit submission -----
        if (interaction.isModalSubmit() && action === 'profile-edit') {
            const nickname = interaction.fields.getTextInputValue('nickname');
            const intro = interaction.fields.getTextInputValue('intro');

            const Profile = client.models['staff-management-system']['StaffProfile'];
            await Profile.upsert({ 
                userId: interaction.user.id, 
                customNickname: nickname || null, 
                customIntro: intro || null 
            });
            return interaction.reply({ 
                content: localize('staff-management-system', 'succ-prof-upd'), 
                flags: MessageFlags.Ephemeral 
            });
        }

        // ----- Activity checks button -----
        if (action === 'ac-respond') {
            const ActivityCheck = client.models['staff-management-system']['ActivityCheck'];
            const activeCheck = await ActivityCheck.findOne({ 
                where: { 
                    status: 'ACTIVE', 
                    messageId: interaction.message.id 
                } 
            });

            if (!activeCheck) return interaction.reply({ 
                content: localize('staff-management-system', 'err-ac-alr-end'), 
                flags: MessageFlags.Ephemeral 
            });

            const targetRoles = JSON.parse(activeCheck.targetRoles || '[]');
            const hasRole = targetRoles.length === 0 || interaction.member.roles.cache.some(r => targetRoles.includes(r.id));
            if (!hasRole) return interaction.reply({ 
                content: localize('staff-management-system', 'err-ac-notreq'), 
                flags: MessageFlags.Ephemeral 
            });

            let responded = JSON.parse(activeCheck.respondedUsers || '[]');
            if (responded.includes(interaction.user.id)) return interaction.reply({ 
                content: localize('staff-management-system', 'info-ac-alr-conf'), 
                flags: MessageFlags.Ephemeral 
            });

            responded.push(interaction.user.id);
            await activeCheck.update({ 
                respondedUsers: JSON.stringify(responded) 
            });
            return interaction.reply({ 
                content: localize('staff-management-system', 'succ-ac-log'), 
                flags: MessageFlags.Ephemeral 
            });
        }

    } catch (e) {
        client.logger.error(localize('staff-management-system', 'log-int-error', { error: e.stack }));
        if (!interaction.replied && !interaction.deferred) {
            try { await interaction.reply({ 
                content: localize('staff-management-system', 'err-internal'), 
                flags: MessageFlags.Ephemeral 
            }); } catch (err) {}
        } else {
             try { await interaction.followUp({ 
                content: localize('staff-management-system', 'err-internal'), 
                flags: MessageFlags.Ephemeral 
            }); } catch (err) {}
        }
    }
};