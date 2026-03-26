const schedule = require('node-schedule');
const { localize } = require('../../../src/functions/localize');
const { Op } = require('sequelize');
const { scheduleStatusExpiry } = require('../commands/status.js');
const suspension_check_job = 'staff-management-checks';

module.exports.run = async (client) => {
    const guild = client.guilds.cache.get(client.guildID);
    try {
        const LoaRequest = client.models['staff-management-system']['LoaRequest'];
        const activeRequests = await LoaRequest.findAll({
            where: { status: 'APPROVED' }
        });

        for (const req of activeRequests) {
            scheduleStatusExpiry(client, req);
        }
    } catch (e) {
        client.logger.error(localize('staff-management-system', 'log-sched-fail', {
            error: e.message
        }));
    }

    if (guild) {
        try {
            await recoverActiveBreaks(client);
        } catch (e) {
            client.logger.error(localize('staff-management-system', 'log-err-break-recov', {
                error: e.message
            }));
        }

        try {
            await checkExpiredSuspensions(client, guild);
        } catch (e) {
            client.logger.error(localize('staff-management-system', 'log-err-exp-susp', {
                error: e.message
            }));
        }
    }

    const existingJob = schedule.scheduledJobs[suspension_check_job];
    if (existingJob) existingJob.cancel();

    schedule.scheduleJob(suspension_check_job, '0 * * * *', async () => {
        if (!client.botReadyAt) return;

        const guild = client.guilds.cache.get(client.guildID);
        if (!guild) return;

        try {
            await checkExpiredSuspensions(client, guild);
        } catch (e) {
            client.logger.error(localize('staff-management-system', 'log-err-exp-susp', {
                error: e.message
            }));
        }
    });
};

async function recoverActiveBreaks(client) {
    const StaffProfile = client.models['staff-management-system']['StaffProfile'];
    const Shift = client.models['staff-management-system']['StaffShift'];
    const now = new Date();

    const profilesOnBreak = await StaffProfile.findAll({
        where: {
            onDuty: true,
            onBreak: true,
            breakStartTime: { [Op.not]: null }
        }
    });

    if (!profilesOnBreak.length) return;

    const userIds = profilesOnBreak.map(profile => profile.userId);

    const activeShifts = await Shift.findAll({
        where: {
            userId: { [Op.in]: userIds },
            endTime: null
        }
    });

    const activeShiftMap = new Map(activeShifts.map(shift => [shift.userId, shift]));

    for (const profile of profilesOnBreak) {
        const activeShift = activeShiftMap.get(profile.userId);

        if (!activeShift) {
            await profile.update({
                onBreak: false,
                breakStartTime: null
            });
            continue;
        }

        const breakStartedAt = new Date(profile.breakStartTime);
        if (Number.isNaN(breakStartedAt.getTime()) || breakStartedAt > now) {
            await profile.update({ breakStartTime: now });
            continue;
        }

        const elapsedBreakMs = now.getTime() - breakStartedAt.getTime();

        await activeShift.update({
            startTime: new Date(new Date(activeShift.startTime).getTime() + elapsedBreakMs)
        });

        await profile.update({
            breakStartTime: now
        });
    }
}

async function checkExpiredSuspensions(client, guild) {
    const Infraction = client.models['staff-management-system']['Infraction'];
    const StaffProfile = client.models['staff-management-system']['StaffProfile'];
    const config = client.configurations['staff-management-system']['infractions'];
    const now = new Date();

    const expiredSuspensions = await Infraction.findAll({
        where: {
            type: 'Suspension',
            active: true,
            expiresAt: {
                [Op.not]: null,
                [Op.lte]: now
            }
        }
    });

    for (const susp of expiredSuspensions) {
        const member = await guild.members.fetch(susp.userId).catch(() => null);
        const profile = await StaffProfile.findByPk(susp.userId);

        try {
            let rolesToRestore = [];

            if (profile?.suspendedRoles) {
                try {
                    const parsed = JSON.parse(profile.suspendedRoles);
                    if (Array.isArray(parsed)) rolesToRestore = parsed;
                } catch (e) {
                    client.logger.warn(
                        `[Staff Management] Failed to parse suspendedRoles for ${susp.userId}: ${e.message}`
                    );
                }
            }

            if (member) {
                if (rolesToRestore.length > 0) {
                    await member.roles.add(rolesToRestore).catch(e => {
                        client.logger.warn(
                            `Failed to restore roles for ${member.user.tag}: ${e.message}`
                        );
                    });
                }

                if (config.suspensionRole) {
                    await member.roles.remove(config.suspensionRole).catch(() => {});
                }
            }

            await susp.update({ active: false });

            if (profile) {
                await profile.update({
                    isSuspended: false,
                    suspendedRoles: null
                });
            }

            if (member) {
                client.logger.info(localize('staff-management-system', 'log-susp-end', {
                    tag: member.user.tag
                }));
            }
        } catch (e) {
            client.logger.error(localize('staff-management-system', 'log-susp-err', {
                error: e.message
            }));
        }
    }
}