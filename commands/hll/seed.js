/**
 * @typedef GuildConfig
 * @type {object}
 * @property {string} id
 * @property {string} admin_channel
 * @property {string} seed_channel
 */

const {SlashCommandBuilder, blockQuote} = require('discord.js');
const got = require('got');
const _ = require('underscore');
const config = require('./../../config.json');

const BM_API = 'https://api.battlemetrics.com/servers/';

const stringTemplateParser = (expression, valueObj) => {
    const templateMatcher = /{{\s?([^{}\s]*)\s?}}/g;
    return expression.replace(templateMatcher, (substring, value) => {
        value = valueObj[value];
        return value;
    });
}

const findThresholdIndex = (list, needle) => {
    // numeric sorting
    list.sort(function(a, b) {
        return a - b;
    });
    let curr_index = -1
    _.each(list, (element, index) =>{
        if(needle >= element) {
            curr_index = index
        }
    });
    return curr_index;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seed')
        .setDescription('Starts the seeding process of a server.')
        .addStringOption(option =>
            option.setName('server')
                .setDescription('The Server number.')
                .setRequired(true)
        )


        .addStringOption(option =>
            option.setName('battlemetrics')
                .setDescription('The id of the server in battlemetrics.')
                .setRequired(true)
        )

        .addStringOption(option =>
            option.setName('threshold')
                .setDescription('The player threshold to announce, seperated with |. eg "10|20|40|60|70"')
                .setRequired(true)
        )

        .addStringOption(option =>
            option.setName('vip')
                .setDescription('The x amount of first players that get a VIP slot. Default 0.')
        )

        .addStringOption(option =>
            option.setName('show-thresholds')
                .setDescription('Set to 1 if you want to show when thresholds are reached in the public channel. Default 0.')
        )

        .addStringOption(option =>
            option.setName('show-mapchanges')
                .setDescription('Set to 0 if you don\'t want to show when the map changes in the public channel. Default 1.')
        )
    ,
    async execute(interaction) {

        /**
         * @type {GuildConfig}
         */
        const guildConfig = _.find(config.guilds, function(guild) {
            return guild.id === interaction.guildId;
        });
        if(undefined === guildConfig || interaction.channelId !== guildConfig.admin_channel) {
            await interaction.reply({ content: 'Error, you are not allowed to run this command here!', ephemeral: true });
            return;
        }

        const vip = interaction.options.getString('vip') ?? 0;
        const showThresholds = interaction.options.getString('show-thresholds') ?? 0;
        const showMapChanges = interaction.options.getString('show-mapchanges') ?? 1;
        const thresholds = interaction.options.getString('threshold').split('|');
        const battlemetrics = interaction.options.getString('battlemetrics');
        const server = interaction.options.getString('server');


        got(`${BM_API}${battlemetrics}`, { json: true }).then(async response => {
            const hlldata = response.body.data.attributes;
            let maxPlayers = hlldata.maxPlayers;
            let currPlayers = hlldata.players;
            let reply = `Seeding started by ${interaction.user.username}, for Server ${server}, BM id ${battlemetrics}.\n` +
                blockQuote(
                    `Server: ${hlldata.name}\n` +
                    `Players: ${currPlayers}/${maxPlayers}\n` +
                    `Thresholds: ${thresholds} | Public Thresholds: ${showThresholds ? 'Yes' : 'No'}\n` +
                    `Map: ${hlldata.details.map} | Public Map Changes: ${showMapChanges ? 'Yes' : 'No'}`
                )
            const vip_message = vip > 0 ? 'GRATIS VIP SLOTEN VOOR DE EERSTE {{vip}} SEEDERS\n\n' : ''
            await interaction.reply(reply);
            const seed_channel = interaction.client.channels.cache.get(guildConfig.seed_channel);
            const admin_channel = interaction.client.channels.cache.get(interaction.channelId);
            let raw_message_template = 'WE ZIJN WEER BEGONNEN MET HET SEEDEN VAN DE DUTCH LET LOOSE #{{serverid}}! (vullen van de server)\n' +
                '\n' +
                'LET OP Server #{{serverid}}\n' +
                '\n' +
                 vip_message +
                'Alle hulp is welkom! Alvast bedankt voor degene die de server willen joinen en/of even AFK willen gaan staan om ons te helpen.\n' +
                '\n' +
                'Game Server:\n' +
                '{{serverdeeds}}\n' +
                '(ook makkelijk te vinden via de zoekfunctie)\n' +
                '\n' +
                'Alle hulp kunnen we gebruiken! Thanks\n' +
                'Voeg de server meteen even toe aan jouw favoriete servers door op het sterretje naast de servernaam te klikken in Hell Let Loose!'
            let raw_message = stringTemplateParser(raw_message_template, {
                serverid: server,
                vip: vip,
                serverdeeds: hlldata.name
            });
            seed_channel.send(raw_message);
            if(currPlayers === maxPlayers) {
                //we don't start the seeding loop if the server is already full
                admin_channel.send(`Seeding #${server} voltooid: Server zit vol (${currPlayers}/${maxPlayers}).`)
                return;
            }
            let current_threshold_index = findThresholdIndex(thresholds,currPlayers);
            if(current_threshold_index === thresholds.length -1 ) {
                //we dont start the seeding loop when the highest threshold is already reached
                admin_channel.send(`Seeding #${server} voltooid: Max threshold (${currPlayers}/${thresholds[current_threshold_index]}).`)
                if( showThresholds > 0 ) {
                    seed_channel.send(`Al ${currPlayers} spelers online.`);
                }
                return;
            }
            let current_map = hlldata.details.map;
            let seeder = setInterval(()=>{
                got(`${BM_API}${battlemetrics}`, { json: true }).then(async loop_response => {
                    let loop_hlldata = loop_response.body.data.attributes;
                    let new_map = loop_hlldata.details.map;
                    let new_players = loop_hlldata.players;
                    if(current_map !== new_map && ( new_map.includes('WARFARE') || new_map.includes('OFFENSIVE') )) {
                        if( showMapChanges > 0 ) {
                            seed_channel.send(`Nieuwe map op Server #${server}: ${new_map}.`);
                        } else {
                            admin_channel.send(`Seeding #${server} New Map: ${new_map}.`)
                        }
                        current_map = new_map;
                    }
                    let new_threshold_index = findThresholdIndex(thresholds, new_players);
                    if(new_threshold_index > current_threshold_index ) {
                        if( showThresholds > 0 ) {
                            seed_channel.send(`Al ${new_players} spelers online.`);
                        } else {
                            admin_channel.send(`Seeding #${server} threshold: (${new_players}/${maxPlayers}).`)
                        }
                    } else if(new_players === maxPlayers ) {
                        // server full, lets cancel the seeder
                        admin_channel.send(`Seeding #${server} voltooid: Server zit vol (${new_players}/${maxPlayers}).`)
                        clearInterval(seeder);
                    } else if(new_threshold_index === thresholds.length -1 ) {
                        //we are out of thresholds, we reached the end of seeding.
                        admin_channel.send(`Seeding #${server} voltooid: Max threshold (${new_players}/${thresholds[new_threshold_index]}).`)
                        clearInterval(seeder);
                    }
                    current_threshold_index = new_threshold_index
                });

            }, 60000)
        }).catch(async error => {
            console.log('Error calling BattleMetrics!');
            console.log(error.response.body);
            await interaction.reply('Error contacting BattleMetrics. Cancelling Seed request.');
        });


    },
};