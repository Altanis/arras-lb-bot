const fetch = require('node-fetch');

const ArrasCacheSystem = class {
    constructor() {
        this.servers = {};
    }

    async request() {
        this.servers = await fetch('https://ak7oqfc2u4qqcu6i.uvwx.xyz:2222/status').then(r => r.json());
        if (!this.servers.ok) throw new Error('Could not resolve servers.');
        this.servers = this.servers.status;

        return this.servers;
    }
}; 

module.exports = { ArrasCacheSystem };