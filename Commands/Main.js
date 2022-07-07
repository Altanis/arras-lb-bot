const fs = require('fs');

const CommandSystem = class {
    constructor() {
        this.commands = [];
        this.files = [];
        this.directory = '';
    }

    setDirectory(directory) {
        this.directory = `${__dirname}\\${directory}`;
    }

    fetchCommands() {
        this.files = fs.readdirSync(this.directory).filter(f => f.endsWith('.js'));

        for (let file of this.files) {
            const f = require(`${this.directory}\\${file}`);
            this.commands.push(f.data.toJSON());
        }

        return this.commands;
    }
}

module.exports = { CommandSystem };