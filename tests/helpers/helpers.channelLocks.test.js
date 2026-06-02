/*
 * Covers lockChannel / unlockChannel — focusing on the thread branches (which take a
 * simpler setLocked path) and the ChannelLock model interactions, plus the
 * disableModule scnx reportIssue branch. ./scnx-integration is mocked at top level.
 */
jest.mock('../../src/functions/scnx-integration', () => ({
    reportIssue: jest.fn(async () => {
    })
}), {virtual: true});

const scnx = require('../../src/functions/scnx-integration');
const mainStub = require('../__stubs__/main');
const {
    lockChannel,
    unlockChannel,
    disableModule
} = require('../../src/functions/helpers');
const {ChannelType} = require('discord.js');

beforeEach(() => {
    mainStub.client.config = {
        disableEveryoneProtection: false,
        timezone: 'UTC'
    };
    mainStub.client.strings = {
        footer: 'f',
        footerImgUrl: '',
        disableFooterTimestamp: false
    };
    mainStub.client.scnxSetup = false;
    mainStub.client.modules = {};
    mainStub.client.logger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        log: jest.fn()
    };
    mainStub.client.logChannel = null;
    scnx.reportIssue.mockClear();
});

describe('lockChannel (thread branch)', () => {
    test('public thread: destroys any existing lock then calls setLocked(true)', async () => {
        const destroy = jest.fn().mockResolvedValue();
        const setLocked = jest.fn().mockResolvedValue();
        const channel = {
            id: 'thread-1',
            type: ChannelType.PublicThread,
            setLocked,
            client: {
                models: {ChannelLock: {findOne: jest.fn().mockResolvedValue({destroy})}}
            }
        };
        await lockChannel(channel, [], 'lockdown');
        expect(destroy).toHaveBeenCalled();
        expect(setLocked).toHaveBeenCalledWith(true, 'lockdown');
    });

    test('private thread without prior lock still locks', async () => {
        const setLocked = jest.fn().mockResolvedValue();
        const channel = {
            id: 'thread-2',
            type: ChannelType.PrivateThread,
            setLocked,
            client: {models: {ChannelLock: {findOne: jest.fn().mockResolvedValue(null)}}}
        };
        await lockChannel(channel);
        expect(setLocked).toHaveBeenCalledWith(true, expect.any(String));
    });
});

describe('unlockChannel', () => {
    test('thread branch calls setLocked(false)', async () => {
        const setLocked = jest.fn().mockResolvedValue();
        const channel = {
            id: 't',
            type: ChannelType.PublicThread,
            setLocked,
            client: {models: {ChannelLock: {findOne: jest.fn().mockResolvedValue(null)}}}
        };
        await unlockChannel(channel, 'reopen');
        expect(setLocked).toHaveBeenCalledWith(false, 'reopen');
    });

    test('restores stored permission overwrites for a normal channel', async () => {
        const set = jest.fn().mockResolvedValue();
        const channel = {
            id: 'c',
            type: ChannelType.GuildText,
            permissionOverwrites: {set},
            client: {
                models: {ChannelLock: {findOne: jest.fn().mockResolvedValue({permissions: [{id: 'role-1'}]})}},
                logger: {error: jest.fn()}
            }
        };
        await unlockChannel(channel, 'reopen');
        expect(set).toHaveBeenCalledWith([{id: 'role-1'}], 'reopen');
    });

    test('logs an error when no stored lock data is found for a normal channel', async () => {
        const error = jest.fn();
        const channel = {
            id: 'c2',
            type: ChannelType.GuildText,
            permissionOverwrites: {set: jest.fn()},
            client: {
                models: {ChannelLock: {findOne: jest.fn().mockResolvedValue(null)}},
                logger: {error}
            }
        };
        await unlockChannel(channel);
        expect(error).toHaveBeenCalled();
        expect(channel.permissionOverwrites.set).not.toHaveBeenCalled();
    });
});

describe('disableModule (scnx reportIssue branch)', () => {
    test('reports the issue to scnx when scnxSetup is enabled', () => {
        mainStub.client.scnxSetup = true;
        mainStub.client.modules.broken = {enabled: true};
        disableModule('broken', 'config error');
        expect(mainStub.client.modules.broken.enabled).toBe(false);
        expect(scnx.reportIssue).toHaveBeenCalledWith(mainStub.client, expect.objectContaining({
            type: 'MODULE_FAILURE',
            module: 'broken',
            errorData: {reason: 'config error'}
        }));
    });

    test('does not call reportIssue when scnxSetup is false', () => {
        mainStub.client.scnxSetup = false;
        mainStub.client.modules.x = {enabled: true};
        disableModule('x');
        expect(scnx.reportIssue).not.toHaveBeenCalled();
    });
});