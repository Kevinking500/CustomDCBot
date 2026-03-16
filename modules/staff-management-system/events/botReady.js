const schedule = require('node-schedule');
const { localize } = require('../../../src/functions/localize');
const { Op } = require('sequelize');
const { scheduleStatusExpiry } = require('../staff-management');

module.exports.run = async (client) => {
    try {
        const LoaRequest = client.models['staff-management-system']['LoaRequest'];
        const activeRequests = await LoaRequest.findAll({
            where: { status: 'APPROVED' }
        });

        let loaded = 0;
        for (const req of activeRequests) {
            scheduleStatusExpiry(client, req);
            loaded++;
        }
    } catch (e) {
        client.logger.error(localize('staff-management-system', 'log-sched-fail', { error: e.message }));
    }

    const jobName = 'staff-management-checks';
    const existingJob = schedule.scheduledJobs[jobName];
    if (existingJob) existingJob.cancel();

    const job = schedule.scheduleJob(jobName, '0 * * * *', async function() {
        if (!client.botReadyAt) return;
        
        const guild = client.guilds.cache.get(client.guildID);
        if (!guild) return;

        await checkExpiredSuspensions(client, guild);
    });
    if (!client.intervals) client.intervals = [];
    client.intervals.push(job);
};

async function checkExpiredSuspensions(client, guild) {
    const Infraction = client.models['staff-management-system']['Infraction'];
    const StaffProfile = client.models['staff-management-system']['StaffProfile'];
    const config = client.configurations['staff-management-system']['infractions'];
    const activeSuspensions = await Infraction.findAll({
        where: { type: 'Suspension', active: true }
    });

    for (const susp of activeSuspensions) {
        const startDate = new Date(susp.createdAt);
        const expireDate = new Date(startDate.getTime() + (susp.durationDays * 24 * 60 * 60 * 1000));
        
        if (new Date() >= expireDate) {
            const member = await guild.members.fetch(susp.userId).catch(() => null);
            const profile = await StaffProfile.findByPk(susp.userId);

            if (member && profile && profile.suspendedRoles) {
                try {
                    const rolesToAdd = JSON.parse(profile.suspendedRoles);
                    if (Array.isArray(rolesToAdd)) {
                        await member.roles.add(rolesToAdd).catch(e => client.logger.warn(`Failed to restore roles for ${member.user.tag}: ${e.message}`));
                    }

                    if (config.suspensionRole) {
                        await member.roles.remove(config.suspensionRole).catch(() => {});
                    }

                    await susp.update({ active: false });
                    await profile.update({ 
                        isSuspended: false, 
                        suspendedRoles: null 
                    });

                    client.logger.info(localize('staff-management-system', 'log-susp-end', { tag: member.user.tag }));

                } catch (e) {
                    client.logger.error(localize('staff-management-system', 'log-susp-err', { error: e.message }));
                }
            } else {
                await susp.update({ active: false });
            }
        }
    }
}