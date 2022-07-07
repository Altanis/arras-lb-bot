require('dotenv').config();

// -- IMPORT MODULES -- //
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Client, MessageEmbed, MessageActionRow, MessageButton, Message } = require('discord.js');

// -- IMPORT HELPERS -- //
// These modules do the background processes such as finding and connecting to servers, so the index file isn't cluttered with it.

const { CommandSystem } = require('./Commands/Main');
const { ArrasCacheSystem } = require('./Connection/Servers/Request');
const { WebSocketManager } = require('./Connection/WebSocket/Main');
const { Hosts, Regions, Gamemodes } = require('./api.json');

// -- INIT BOT -- //
const SharpClient = class extends Client {
    constructor(options) {
        super(options);

        this.REST = new REST({ version: 9 }).setToken(process.env.TOKEN);

        this.CommandSystem = new CommandSystem();
        this.ArrasCacheSystem = new ArrasCacheSystem();
        this.WebSocketManager = new WebSocketManager();

        this.ServerManager = {
            servers: {
                uncached: [],
            },
            _servers: {
                parsed: 0,
                uncached: [],
            },

            arrasServers: {},
        };

        this._parseCode('wsi-kci-1s');

        this.Messages = new Map();

        this.CommandSystem.setDirectory('Commands');
        this.CommandSystem.fetchCommands();
        this._refreshCommands();

        const interval = async () => {
            console.log('Starting interval...');
            await this._resetServers();
            await this._seekServers(this.ServerManager._servers.parsed || 0);
            setInterval(async () => {
                await this._resetServers();
                await this._seekServers(this.ServerManager._servers.parsed || 0);
            }, 3e5);
        }
        interval();
    }

    _parseCode(code) {
        let [ host, region, gamemode ] = code.split('-');
        
        host = Hosts[host][0];
        region = Regions[region][0].includes('US') ? 'usa' : Regions[region][0].toLowerCase();
        
        gamemode.split('').forEach(char => {
            if (Gamemodes.minigames.includes(char) || (gamemode === '1s' && gamemode !== 'ms')) gamemode = 'minigames';
            if (!isNaN(parseInt(char)) && gamemode !== 'minigames') gamemode = 'tdm';
        });

        if (!['minigames', 'tdm'].includes(gamemode)) {
            const gamemodes = JSON.parse(JSON.stringify(Gamemodes));

            Object.keys(gamemodes).forEach(char => {
                if (['ffa', 'squads'].includes(gamemode)) return;
                if (gamemode.includes(char)) gamemode = gamemodes[char];
            });

            if (!['ffa', 'squads'].includes(gamemode)) gamemode = 'unknown';
        }

        return { host, region, gamemode }
    }
    
    async _refreshCommands() {
        try {
            console.log('Refreshing application (/) comamnds...');

            await this.REST.put(Routes.applicationGuildCommands(this.user?.id || '993572355458740318', '993572769935663185'), {
                body: this.CommandSystem.commands,
            });
        } catch (error) {
            console.error('Could not refresh application (/) commands... Error:', error);
            this._refreshCommands();
        }
    }

    async _resetServers() {
        this.ServerManager.arrasServers = await this.ArrasCacheSystem.request();
    }

    async _seekParties(name, count, url, counter = 0) {
        const COLOR_MAP = {
            1: '💙',
            2: '💚',
            3: '❤',
            4: '💜',
        };

        this.WebSocketManager.connect(url, true)
            .then(party => {
                party = party.toString();
                
                const link = `https://arras.io/#${name}${party}`;
                if (!this.ServerManager.servers[name].parties.includes(`${COLOR_MAP[party.split('')[0]]} **https://arras.io/#${name}${party}**`)) {
                    console.log('New link found!', link);
                    this.ServerManager.servers[name].parties.push(`${COLOR_MAP[party.split('')[0]]} **https://arras.io/#${name}${party}**`);
                }

                if (this.ServerManager.servers[name].parties.length === count) return;
                if (counter <= 250) {
                    this._seekParties(name, count, url, counter + 1);
                } else {
                    this.ServerManager.servers[name].parties.push(`ERROR: 250+ attempts have been made to find ${count} parties.`);
                }
            }) 
            .catch(error => {
                console.error(error);
                this.ServerManager.servers[name].parties.push(`ERROR: ${error}`);
            });
    }

    async _seekServers(count) {
        const info = Object.entries(this.ServerManager.arrasServers)[count][1];

        this.WebSocketManager.connect(`wss://${info.host}/?a=2`, false)
            .then(scoreboard => {
                console.log(scoreboard);

                this.ServerManager._servers[info.name] = {
                    playerCount: info.clients,
                    uptime: info.uptime,
                    scoreboard,
                    links: this.ServerManager._servers[info.name]?.links || [],
                    info: this._parseCode(info.code),
                    parties: [],
                }

                if (!Object.entries(this.ServerManager.arrasServers)[count + 1]) {
                    console.log('Finished server caching!');
                    delete this.ServerManager._servers.parsed;
                    this.ServerManager.servers = JSON.parse(JSON.stringify(this.ServerManager._servers));
                    this.ServerManager._servers = {
                        parsed: 0,
                        uncached: [],
                    };
                } else {
                    this.ServerManager._servers.parsed++;
                    this._seekServers(count + 1);
                }
            })
            .catch(error => {
                console.error(error);

                this.ServerManager._servers.uncached.push(info.name);
                if (!Object.entries(this.ServerManager.arrasServers)[count + 1]) {
                    console.log('Finished server caching!');
                    delete this.ServerManager._servers.parsed;
                    this.ServerManager.servers = JSON.parse(JSON.stringify(this.ServerManager._servers));
                    this.ServerManager._servers = {
                        parsed: 0,
                        uncached: [],
                    };
                } else {
                    this.ServerManager._servers.parsed++;
                    this._seekServers(count + 1);
                }
            });
    }
}

const client = new SharpClient({ intents: [131071] });

client.on('ready', function() {
    console.log('Bot is online.');
});

client.on('message', function(message) {
    if (message.content.startsWith('!eval') && ['765239557666111509'].includes(message.author.id)) {
        const code = message.content.replace('!eval ', '');
        const embed = new MessageEmbed();
    
        try {
            let evalled = eval(code);

            if (typeof evalled !== 'string')
                evalled = require('util').inspect(evalled);

            embed.setColor('GREEN');
            embed.setTitle('Evaluation Successful!');
            embed.setDescription('The evaluation ran successfully.');
            embed.addField('Inputted Code', `\`\`\`js\n${code}\`\`\``);
            embed.addField(
                'Outputted Code',
                `\`\`\`js\n${evalled.includes(client.token) ? '🖕' : evalled}\`\`\``
            );

            message.channel.send({ embeds: [embed] }).catch(() => {});
        } catch (err) {
            embed.setColor('RED');
            embed.setTitle('Evaluation Unsuccessful!');
            embed.setDescription('The evaluation ran unsuccessfully.');
            embed.addField('Inputted Code', `\`\`\`js\n${code}\`\`\``);
            embed.addField(
                'Error',
                `\`\`\`js\n${err.message.includes(client.token) ? '🖕' : err}\`\`\``
            );

            message.channel.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

client.on('interactionCreate', function(interaction) {
    if (interaction.isCommand()) {
        switch (interaction.commandName) {
            case 'leaders': {
                if (Object.keys(client.ServerManager.servers).length == 1) return interaction.reply({ content: `Servers have not been fully found yet. **${client.ServerManager._servers.parsed}** scoreboards have been found.`, ephemeral: true, });
                if (client.ServerManager.servers.uncached.length) interaction.channel.send({ content: `${client.ServerManager.servers.uncached.length} servers have not been parsed successfully.` });

                let regions = interaction.options.getString('region')?.split(', ') || [];
                let gamemodes = interaction.options.getString('gamemodes')?.split(', ') || [];
                let score = interaction.options.getString('score') || 500000;

                if (typeof score == 'string') {
                    if (score.endsWith('k') || score.endsWith('m')) {
                        let zeros = score.endsWith('k') ? 3 : 6;
                        score = parseInt(score) * parseInt(`1${'0'.repeat(zeros)}`);
                    } else {
                        score = parseInt(score);
                    }
                }
                
                if (isNaN(score) || typeof score !== 'number') return interaction.reply({
                    content: 'Invalid argument `score`.',
                    ephemeral: true,
                });

                let issues = [];

                regions.forEach(region => {
                    if (!['usa', 'europe', 'asia'].includes(region.toLowerCase())) issues = ['region', region];
                });

                gamemodes.forEach(gamemode => {
                    if (!['ffa', 'squads', 'tdm', 'minigames'].includes(gamemode.toLowerCase())) issues = ['gamemode', gamemode];
                });

                if (issues[0] === 'region') return interaction.reply({ content: `Invalid region \`${issues[1]}\`. Valid regions: \`usa, europe, asia\`.`, ephemeral: true });
                else if (issues[0] === 'gamemode') return interaction.reply({ content: `Invalid gamemode \`${issues[1]}\`. Valid gamemodes: \`ffa, squads, tdm, minigames\`.`, ephemeral: true, });

                if (gamemodes.length == 0) gamemodes = ['ffa', 'squads', 'tdm', 'minigames'];
                if (regions.length == 0) regions = ['usa', 'europe', 'asia'];

                const servers = JSON.parse(JSON.stringify(client.ServerManager.servers));
                delete servers.uncached;

                let scores = [];
                Object.entries(servers).forEach(function([name, info]) {
                    for (let [_, value] of Object.entries(info.scoreboard)) {
                        if (value.score >= score
                            && gamemodes.includes(info.info.gamemode)
                            && regions.includes(info.info.region)) {
                                scores.push({
                                    playerInfo: value,
                                    info,
                                    name,
                                });
                            }
                    }
                });

                scores = scores.sort(function(score1, score2) { return score2.playerInfo.score - score1.playerInfo.score });

                const COLOR_MAP = {
                    10: '💙',
                    11: '💚',
                    12: '❤',
                    14: '💜',
                };

                function scoreFormat(score) {
                    if (score >= 1e6) return (score/1e6).toFixed(1) + "m";
                    else if (score >= 1e3) return (score/1e3).toFixed(1) + "k";
                    else return score + "";
                }

                if (scores.length > 25) {
                    const embed = new MessageEmbed();
                    const data = {};

                    const count = Math.ceil(scores.length / 25);
                    for (let p = 0; p < count; p++) {
                        data[p] = {
                            title: `Current Leaders (${p + 1}/${count})`,
                            fields: [],
                        }

                        for (let i = p * 25; i < p * 25 + 25; i++) {
                            const score = scores[i];
                            console.log(score, i);
                            if (!score) break;

                            const { playerInfo, info, name } = score;
                            console.log(playerInfo, info, name);

                            const color = info.info.gamemode === 'ffa' ? '🤍' : (COLOR_MAP[playerInfo.color] || '?');
                            data[p].fields.push({
                                name: `${i + 1}. ${color} ${scoreFormat(playerInfo.score)} ${playerInfo.entity} | **${playerInfo.name || 'unnamed'}**`,
                                value: `${info.info.gamemode} ${info.info.region} https://arras.io/#${name}`
                            });
                        }
                    }

                    const { title, fields } = data[0];

                    embed.setTitle(title);
                    embed.addFields(fields);

                    const row = new MessageActionRow()
                        .addComponents(new MessageButton().setCustomId('next').setLabel('➡️').setStyle('PRIMARY'));

                    client.Messages.set(interaction.id, {
                        data,
                        currentPage: 0,
                        author: interaction.member.id,
                    });
                    interaction.reply({ embeds: [embed], components: [row] });
                } else {
                    const embed = new MessageEmbed();

                    if (!scores.length) {
                        embed.setDescription('No leaders have been found.');
                        interaction.reply({ embeds: [embed] });
                    } else {
                        embed.setTitle('Current Leaders');

                        for (let i = 0; i < 25; i++) {
                            const score = scores[i];
                            if (!score) break;

                            const { playerInfo, info, name } = score;
                            console.log(playerInfo, info, name);

                            const color = info.info.gamemode === 'ffa' ? '🤍' : (COLOR_MAP[playerInfo.color] || '?');

                            embed.addField(`${i + 1}. ${color} ${scoreFormat(playerInfo.score)} ${playerInfo.entity} | **${playerInfo.name || 'unnamed'}**`,
                            `${info.info.gamemode} ${info.info.region} https://arras.io/#${name}`);
                        }

                        interaction.reply({ embeds: [embed] });
                    }
                }
                break;
            }
            case 'uncached': {
                const embed = new MessageEmbed();
                embed.setTitle('Uncached Servers');
                embed.setDescription(`${client.ServerManager.servers.uncached.length ? client.ServerManager.servers.uncached.map(code => `https://arras.io/#${code}`).join('\n') : 'Every server has been cached (hopefully).'}`)

                interaction.reply({
                    embeds: [embed],
                });
                break;
            }
            case 'scoreboard': {
                const link = interaction.options.getString('link').replace('https://arras.io/#', '').replace('http://arras.io/#', '');

                const info = client.ServerManager.servers[link];
                if (!info) return interaction.reply({ content: client.ServerManager.servers.uncached.includes(link) ? 'Link is uncached, cannot retreive scoreboard.' : 'Invalid link.', ephemeral: true, });

                const { scoreboard } = info;
                const embed = new MessageEmbed().setTitle('Scoreboard');

                function scoreFormat(score) {
                    if (score >= 1e6) return (score/1e6).toFixed(1) + "m";
                    else if (score >= 1e3) return (score/1e3).toFixed(1) + "k";
                    else return score + "";
                }     

                const COLOR_MAP = {
                    10: '💙',
                    11: '💚',
                    12: '❤',
                    14: '💜',
                };

                let description = '';
                for (let i = 0; i < 10; i++) {
                    const playerInfo = scoreboard[i];
                    console.log(playerInfo);
                    if (!playerInfo) break;

                    const color = info.info.gamemode === 'ffa' ? '🤍' : (COLOR_MAP[playerInfo.color] || '?');

                    description += `${i + 1}. ${color} ${scoreFormat(playerInfo.score)} ${playerInfo.entity} | **${playerInfo.name || 'unnamed'}**\n`;
                }

                embed.setDescription(description);
                embed.setURL(`https://arras.io/#${link}`);
                interaction.reply({ embeds: [embed] });
                break;
            }
            case 'find': {
                const playerName = interaction.options.getString('name');

                const servers = JSON.parse(JSON.stringify(client.ServerManager.servers));
                delete servers.parsed;
                delete servers.uncached;

                let scores = [];

                Object.entries(servers).forEach(function([name, info]) {
                    for (let [_, value] of Object.entries(info.scoreboard)) {
                        if (value.name.toLowerCase().includes(playerName)) scores.push({
                            playerInfo: value,
                            info,
                            name,
                        });
                    }
                });

                scores = scores.sort(function(score1, score2) { return score2.playerInfo.score - score1.playerInfo.score });

                const COLOR_MAP = {
                    10: '💙',
                    11: '💚',
                    12: '❤',
                    14: '💜',
                };

                function scoreFormat(score) {
                    if (score >= 1e6) return (score/1e6).toFixed(1) + "m";
                    else if (score >= 1e3) return (score/1e3).toFixed(1) + "k";
                    else return score + "";
                }

                if (scores.length > 25) {
                    const embed = new MessageEmbed();
                    const data = {};

                    const count = Math.ceil(scores.length / 25);
                    for (let p = 0; p < count; p++) {
                        data[p] = {
                            title: `Players (${p + 1}/${count})`,
                            fields: [],
                        }

                        for (let i = p * 25; i < p * 25 + 25; i++) {
                            const score = scores[i];
                            if (!score) break;

                            const { playerInfo, info, name } = score;
                            console.log(playerInfo, info, name);

                            const color = info.info.gamemode === 'ffa' ? '🤍' : (COLOR_MAP[playerInfo.color] || '?');
                            data[p].fields.push({
                                name: `${i + 1}. ${color} ${scoreFormat(playerInfo.score)} ${playerInfo.entity} | **${playerInfo.name || 'unnamed'}**`,
                                value: `${info.info.gamemode} ${info.info.region} https://arras.io/#${name}`
                            });
                        }
                    }

                    const { title, fields } = data[0];

                    embed.setTitle(title);
                    embed.addFields(fields);

                    const row = new MessageActionRow()
                        .addComponents(new MessageButton().setCustomId('next').setLabel('➡️').setStyle('PRIMARY'));

                    client.Messages.set(interaction.id, {
                        data,
                        currentPage: 0,
                        author: interaction.member.id,
                    });
                    interaction.reply({ embeds: [embed], components: [row] });
                } else {
                    const embed = new MessageEmbed();

                    if (!scores.length) {
                        embed.setDescription('No players with that name have been found.');
                        interaction.reply({ embeds: [embed] });
                    } else {
                        embed.setTitle('Players');

                        for (let i = 0; i < 25; i++) {
                            const score = scores[i];
                            if (!score) break;

                            const { playerInfo, info, name } = score;
                            console.log(playerInfo, info, name);

                            const color = info.info.gamemode === 'ffa' ? '🤍' : (COLOR_MAP[playerInfo.color] || '?');

                            embed.addField(`${i + 1}. ${color} ${scoreFormat(playerInfo.score)} ${playerInfo.entity} | **${playerInfo.name || 'unnamed'}**`,
                            `${info.info.gamemode} ${info.info.region} https://arras.io/#${name}`);
                        }

                        interaction.reply({ embeds: [embed] });
                    }
                }
                break;
            }
            case 'parties': {
                const link = interaction.options.getString('link').replace('https://arras.io/#', '').replace('http://arras.io/#', '');

                const info = client.ServerManager.servers[link];
                if (!info) return interaction.reply({ content: client.ServerManager.servers.uncached.includes(link) ? 'Link is uncached, cannot retreive parties.' : 'Invalid link.', ephemeral: true, });

                const count = parseInt((client.ServerManager.arrasServers[link]?.code.split('-')[2]).match(/\d+/g)?.[0]);
                if (!count || count === 1) return interaction.reply({ content: 'The gamemode has no parties.', ephemeral: true, });

                const embed = new MessageEmbed().setTitle('Parties');

                if (info.parties.length === count) {
                    embed.setDescription(client.ServerManager.servers[link].parties.join('\n'));
                    interaction.reply({ embeds: [embed], allowedMentions: { repliedUser: true, }, });  
                } else {
                    client._seekParties(link, count, `wss://${client.ServerManager.arrasServers[link].host}/?a=2`);
                    interaction.deferReply();
    
                    const interval = setInterval(() => {
                        let currentIdx = client.ServerManager.servers[link]?.parties?.[client.ServerManager.servers[link]?.parties?.length];
                        if (currentIdx?.includes('ERROR')) {
                            embed.setDescription(`Error: ${currentIdx.replace('ERROR: ', '')}`);
                            interaction.editReply({ embeds: [embed], allowedMentions: { repliedUser: true, } });
                            clearInterval(interval);
                        } else if (client.ServerManager.servers[link]?.parties.length === count) {
                            embed.setDescription(client.ServerManager.servers[link].parties.join('\n'));
                            interaction.editReply({ embeds: [embed], allowedMentions: { repliedUser: true, }, });   
                            clearInterval(interval);
                        }
                    }, 1000);
                }
            }
        }
    } else if (interaction.isButton()) {
        const info = client.Messages.get(interaction.message.interaction.id);
        if (!info) return;

        let { data, currentPage, author } = info;
        if (author !== interaction.member.id) return; 

        if (interaction.component.label === '➡️') {
            currentPage++;
        } else if (interaction.component.label === '⬅️') {
            currentPage--;
        } else return;

        const embed = new MessageEmbed();

        const { title, fields } = data[currentPage];
        embed.setTitle(title);
        embed.addFields(fields);

        const row = new MessageActionRow();

        if (currentPage >= 1) {
            row.addComponents(new MessageButton().setCustomId('before').setLabel('⬅️').setStyle('PRIMARY'));
        }
        if (currentPage + 1 < Object.values(data).length) {
            row.addComponents(new MessageButton().setCustomId('next').setLabel('➡️').setStyle('PRIMARY'));
        }

        interaction.update({ embeds: [embed], components: [row] });
        client.Messages.set(interaction.message.interaction.id, {
            data,
            currentPage,
            author,
        });
    }
});

client.login(process.env.TOKEN);