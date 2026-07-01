/*
 * Tests for the massrole USER context adapters and the role-select handler.
 *  - adapters: config shape, adminRoles guard, and the ephemeral role-select reply whose
 *    customId encodes action + target user id.
 *  - event handler: re-checks the guard, resolves member + selected role and delegates to the
 *    shared applyRoleToMember core with the right action.
 *  - applyRoleToMember: mirrors the slash per-member add/remove (done / notDone output).
 * Tests do not depend on any new description key resolving (localize is mocked to echo).
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key, vars) => `${file}.${key}` + (vars ? JSON.stringify(vars) : '')}));
jest.mock('../../src/functions/helpers', () => ({embedType: (s) => ({content: s})}));

const addCmd = require('../../modules/massrole/commands/add-role-to-user');
const removeCmd = require('../../modules/massrole/commands/remove-role-from-user');
const massrole = require('../../modules/massrole/commands/massrole');
const eventHandler = require('../../modules/massrole/events/interactionCreate');

function memberRoles(ids) {
    const map = new Map(ids.map(id => [id, {id}]));
    return {cache: {filter: (fn) => ({size: [...map.values()].filter(fn).length})}};
}

function makeAdapterInteraction({
                                    adminRoles = ['adminR'],
                                    memberRoleIds = ['adminR']
                                } = {}) {
    return {
        targetUser: {id: 'target'},
        member: {roles: memberRoles(memberRoleIds)},
        client: {configurations: {massrole: {config: {adminRoles}}}},
        reply: jest.fn().mockResolvedValue()
    };
}

describe('massrole context adapters', () => {
    test('configs: USER context, ADMINISTRATOR-gated', () => {
        for (const cmd of [addCmd, removeCmd]) {
            expect(cmd.config.type).toBe('USER');
            expect(cmd.config.contextMenu).toBe(true);
            expect(cmd.config.defaultMemberPermissions).toEqual(['ADMINISTRATOR']);
        }
    });

    test('Add: refuses a non-admin and does not show a select', async () => {
        const interaction = makeAdapterInteraction({memberRoleIds: ['someoneElse']});
        await addCmd.run(interaction);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.components).toBeUndefined();
        expect(arg.content).toBe('massrole.not-admin');
    });

    test('Add: replies with a role select encoding add + target id', async () => {
        const interaction = makeAdapterInteraction();
        await addCmd.run(interaction);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.ephemeral).toBe(true);
        const json = arg.components[0].toJSON();
        const menu = json.components[0];
        expect(menu.custom_id).toBe('massrole-ctx:add:target');
        expect(menu.type).toBe(6); // ROLE_SELECT
    });

    test('Remove: replies with a role select encoding remove + target id', async () => {
        const interaction = makeAdapterInteraction();
        await removeCmd.run(interaction);
        const menu = removeCmd && interaction.reply.mock.calls[0][0].components[0].toJSON().components[0];
        expect(menu.custom_id).toBe('massrole-ctx:remove:target');
    });
});

function makeSelectInteraction({
                                   action = 'add',
                                   adminRoles = ['adminR'],
                                   memberRoleIds = ['adminR'],
                                   member = {
                                       id: 'target',
                                       roles: {
                                           add: jest.fn().mockResolvedValue(),
                                           remove: jest.fn().mockResolvedValue()
                                       }
                                   },
                                   role = {id: 'roleX'},
                                   guildId = 'g1'
                               } = {}) {
    return {
        isRoleSelectMenu: () => true,
        customId: `massrole-ctx:${action}:target`,
        guild: {
            id: guildId,
            members: {fetch: jest.fn().mockResolvedValue(member)},
            roles: {cache: {get: () => role}}
        },
        member: {roles: memberRoles(memberRoleIds)},
        roles: {first: () => role},
        values: ['roleX'],
        user: {tag: 'Admin#1'},
        client: {
            guild: {id: 'g1'},
            configurations: {
                massrole: {
                    config: {adminRoles},
                    strings: {
                        done: 'DONE',
                        notDone: 'NOPE'
                    }
                }
            }
        },
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue()
    };
}

describe('massrole role-select handler', () => {
    test('ignores non role-select interactions', async () => {
        const interaction = {
            isRoleSelectMenu: () => false,
            customId: 'massrole-ctx:add:target'
        };
        const res = await eventHandler.run({guild: {id: 'g1'}}, interaction);
        expect(res).toBeUndefined();
    });

    test('refuses a non-admin', async () => {
        const interaction = makeSelectInteraction({memberRoleIds: ['x']});
        await eventHandler.run(interaction.client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            ephemeral: true,
            content: 'massrole.not-admin'
        }));
        expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    test('add: resolves member + role and adds the role', async () => {
        const member = {
            id: 'target',
            roles: {
                add: jest.fn().mockResolvedValue(),
                remove: jest.fn().mockResolvedValue()
            }
        };
        const role = {id: 'roleX'};
        const interaction = makeSelectInteraction({
            action: 'add',
            member,
            role
        });
        await eventHandler.run(interaction.client, interaction);
        expect(interaction.guild.members.fetch).toHaveBeenCalledWith('target');
        expect(member.roles.add).toHaveBeenCalledWith(role, expect.any(String));
        expect(member.roles.remove).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith({content: 'DONE'});
    });

    test('remove: removes the role', async () => {
        const member = {
            id: 'target',
            roles: {
                add: jest.fn().mockResolvedValue(),
                remove: jest.fn().mockResolvedValue()
            }
        };
        const interaction = makeSelectInteraction({
            action: 'remove',
            member,
            role: {id: 'roleX'}
        });
        await eventHandler.run(interaction.client, interaction);
        expect(member.roles.remove).toHaveBeenCalled();
        expect(member.roles.add).not.toHaveBeenCalled();
    });

    test('replies when the target member cannot be resolved', async () => {
        const interaction = makeSelectInteraction();
        interaction.guild.members.fetch = jest.fn().mockRejectedValue(new Error('gone'));
        await eventHandler.run(interaction.client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
        expect(interaction.deferReply).not.toHaveBeenCalled();
    });
});

describe('applyRoleToMember core', () => {
    test('add reports notDone when the role operation throws', async () => {
        const member = {roles: {add: jest.fn().mockRejectedValue(new Error('perm'))}};
        const interaction = {
            client: {
                configurations: {
                    massrole: {
                        strings: {
                            done: 'DONE',
                            notDone: 'NOPE'
                        }
                    }
                }
            },
            user: {tag: 'A#1'},
            deferReply: jest.fn().mockResolvedValue(),
            editReply: jest.fn().mockResolvedValue()
        };
        await massrole.applyRoleToMember(interaction, member, {id: 'r'}, 'add');
        expect(interaction.editReply).toHaveBeenCalledWith({content: 'NOPE'});
    });
});