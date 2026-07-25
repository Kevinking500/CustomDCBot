/*
 * Tests for the temp-channels USER context-menu commands ("Add to Channel" / "Remove from
 * Channel"). Both are thin adapters: defer ephemerally, run the creator-only owner guard
 * (resolveOwnedTempChannel), and on success hand off to the shared userAdd/userRemove core with
 * the 'context' caller, which acts on interaction.targetUser. The DB client is pulled from
 * `../../main`, aliased by jest moduleNameMapper to the shared stub; we mutate its models per
 * test. localize is left as the real module (description keys are not asserted on).
 */
const mainStub = require('../__stubs__/main');
const addCmd = require('../../modules/temp-channels/commands/add-to-channel');
const removeCmd = require('../../modules/temp-channels/commands/remove-from-channel');

function setupChannel(vc) {
    mainStub.client.models = {'temp-channels': {TempChannel: {findOne: jest.fn().mockResolvedValue(vc)}}};
    mainStub.client.users = {fetch: jest.fn(() => Promise.resolve(null))};
}

function makeVchann() {
    return {
        id: 'vc1',
        guild: {roles: {everyone: 'everyone-role'}},
        permissionsFor: jest.fn().mockReturnValue({has: () => true}),
        permissionOverwrites: {
            create: jest.fn().mockResolvedValue(),
            delete: jest.fn().mockResolvedValue()
        }
    };
}

function makeInteraction({
                             vchann,
                             removedMember
                         } = {}) {
    return {
        channelId: 'vc1',
        member: {
            id: 'creator',
            voice: {channelId: 'vc1'}
        },
        targetUser: {
            id: 'target',
            username: 'Target'
        },
        client: {
            configurations: {
                'temp-channels': {
                    config: {
                        userAdded: 'temp-channels.userAdded',
                        userRemoved: 'temp-channels.userRemoved',
                        notInChannel: 'temp-channels.notInChannel'
                    }
                }
            }
        },
        guild: {
            channels: {cache: {get: () => vchann}},
            members: {cache: {get: () => removedMember || {voice: {channelId: null}}}}
        },
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue()
    };
}

describe('temp-channels context command config', () => {
    test('Add to Channel: USER context, everyone (no defaultMemberPermissions)', () => {
        expect(addCmd.config.name).toBe('Add to Channel');
        expect(addCmd.config.type).toBe('USER');
        expect(addCmd.config.contextMenu).toBe(true);
        expect(addCmd.config.defaultMemberPermissions).toBeUndefined();
    });
    test('Remove from Channel: USER context, everyone (no defaultMemberPermissions)', () => {
        expect(removeCmd.config.name).toBe('Remove from Channel');
        expect(removeCmd.config.type).toBe('USER');
        expect(removeCmd.config.contextMenu).toBe(true);
        expect(removeCmd.config.defaultMemberPermissions).toBeUndefined();
    });
});

describe('Add to Channel creator-only guard', () => {
    test('non-creator (no owned channel) replies notInChannel; userAdd is not run', async () => {
        setupChannel(null);
        const interaction = makeInteraction({vchann: makeVchann()});
        await addCmd.run(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(interaction.editReply.mock.calls[0][0])).toContain('notInChannel');
    });

    test('creator: userAdd adds interaction.targetUser and persists', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: '',
            isPublic: false,
            save: jest.fn().mockResolvedValue()
        };
        setupChannel(vc);
        const interaction = makeInteraction({vchann: makeVchann()});
        await addCmd.run(interaction);
        expect(vc.save).toHaveBeenCalled();
        expect(vc.allowedUsers).toBe('target');
        expect(JSON.stringify(interaction.editReply.mock.calls.pop()[0])).toContain('userAdded');
    });
});

describe('Remove from Channel creator-only guard', () => {
    test('non-creator replies notInChannel; userRemove is not run', async () => {
        setupChannel(null);
        const interaction = makeInteraction({vchann: makeVchann()});
        await removeCmd.run(interaction);
        expect(JSON.stringify(interaction.editReply.mock.calls[0][0])).toContain('notInChannel');
    });

    test('creator: userRemove removes interaction.targetUser and persists', async () => {
        const vc = {
            id: 'vc1',
            allowedUsers: 'target',
            isPublic: true,
            save: jest.fn().mockResolvedValue()
        };
        setupChannel(vc);
        const interaction = makeInteraction({
            vchann: makeVchann(),
            removedMember: {voice: {channelId: null}}
        });
        await removeCmd.run(interaction);
        expect(vc.save).toHaveBeenCalled();
        expect(vc.allowedUsers).toBe('');
        expect(JSON.stringify(interaction.editReply.mock.calls.pop()[0])).toContain('userRemoved');
    });
});