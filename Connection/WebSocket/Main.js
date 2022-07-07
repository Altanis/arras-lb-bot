require('dotenv').config();

// -- IMPORT MODULES -- //
const { Worker } = require('node:worker_threads');
const WebSocket = require('ws');

const crypto = require('node:crypto');
const fetch = require('node-fetch');

// -- IMPORT HELPERS -- //
const { Encode, Decode, BroadcastParser, UpdateParser } = require(`${__dirname}/Helpers/Parser`); // Credits to ABC and Ponyo for parsing Brodcast packets.
// const { GenerateCaptchaToken } = require('../../puppeteer');
const worker = new Worker(`${__dirname}/Helpers/Worker`);

class ArrasSocket extends WebSocket {
    constructor(url) {
        super(url, ["arras.io#v0+ft2", "arras.io#v1+ft2"]);

        this._send = WebSocket.prototype.send;
        this.onmessage = function({ data }) {
            data = new Uint8Array(data);
            this.emit('decryptedMessage', Decode(data));
        }
    }

    send(data) {
        this._send.call(this, Encode(data));
    }
}

const WebSocketManager = class {
    connect(url, party) {
        return new Promise(function(resolve, reject) {
            setTimeout(function() {
                reject('Promise timed out after 15 seconds.');

                try {
                    socket.terminate();
                } catch (error)  {
                    setTimeout(socket.terminate, 1000);
                }
            }, 15e3);

            const socket = new ArrasSocket(url);
            socket.on('error', reject);

            socket.LBParser = new BroadcastParser();
            socket.UpdateParser = new UpdateParser();
            socket.indexes = {};

            socket.on('open', function() {
                console.log(`Connection established (${socket.url})!`);
                
                socket.send(['k']);
                setInterval(() => {
                    socket.send(['p']);
                }, 1000);
            });

            socket.on('decryptedMessage', async function(data) {
                switch (data[0]) {
                    case 'u':
                        socket.UpdateParser.parse(data);
                        if (party && socket.UpdateParser.player.party) {
                            resolve(socket.UpdateParser.player.party);
                            socket.terminate();
                        }

                        socket.send(['d', 0]);
                        break;
                    case 'C':
                        const challengeString = data[1];
                        console.log('Received challenge:', challengeString);

                        worker.on('message', function(data) {
                            const result = data[1];
                            console.log('Result to challenge:', result);

                            socket.send(['R', challengeString, result]);
                        });

                        worker.postMessage([1, challengeString]);
                        break;
                    case 'b':
                        socket.LBParser.parse(data);

                        for (let entry of socket.LBParser.leaderboard) {
                            entry.entity = socket.indexes[entry.index]?.name || 'Unknown';
                        }

                        if (!party) {
                            resolve(socket.LBParser.leaderboard);
                            socket.terminate();
                        }
                        break;
                    case 'J': 
                        data.shift();
                        data.filter(d => typeof d === 'string').forEach(d => {
                            d = JSON.parse(d);
                            socket.indexes[d.index] = d;
                        });
                        break;
                    case 'w':
                        if (data[1] === 2) {
                            fetch(`https://indecisive-youthful-cabin.glitch.me/${process.env.CAPTCHA_SOLVER_UID}`).then(r => r.text())
                                .then(response => {
                                    if (response.includes('{')) reject('Couldn\'t solve captcha.');
                                    console.log(response);
                                    socket.send(['s', '', 0, response]);
                                }).catch(reject);
                        } else {
                            socket.send(['s', '', 0])
                        }
                        break;
                }
            });

            socket.on('close', function() { console.log('Socket closed.'); reject('Socket closed prematurely.'); });
        });
    }
}

module.exports = { WebSocketManager };