// terminal required modules
const express = require('express');
var pty = require('node-pty');
var terminal = require('term.js');

exports.use = function (app, EXTERNAL_URL) {

    app.use("/term", terminal.middleware());

    app.get('/xterm.css', (req, res) => {
        res.sendFile('node_modules/xterm/css/xterm.css', { 'root': '.' });
    });

    app.get('/xterm.js', (req, res) => {
        res.sendFile('node_modules/xterm/lib/xterm.js', { 'root': '.' });
    });

    app.get('/xterm.js.map', (req, res) => {
        res.sendFile('node_modules/xterm/lib/xterm.js.map', { 'root': '.' });
    });

    const term_html = `
    <!doctype html>
    <html>
    <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/3.1.1/socket.io.js"></script>
        <script src="xterm.js"></script>
        <link rel="stylesheet" href="xterm.css" />
    </head>
    <body>
        <div id="terminal"></div>
        <script>
            var e = document.getElementById("terminal");
            
            var client = {};

            client.run = function (options) {

                options = options || {};

                var socket = io.connect(options.remote || "http://127.0.0.1:4041");
                socket.on('connect', function() {
                    var term = new Terminal({
                        cols: 80,
                        rows: 24,
                        useStyle: true,
                        screenKeys: true
                    });

                    term.onData(function(data) {
                        socket.emit('data', data);
                    });

                    socket.on('data', function(data) {
                        term.write(data);
                    });

                    term.open(options.parent || document.body);
                    term.write('WELCOME!\\r\\n');

                    socket.on('disconnect', function() {
                        term.destroy();
                    });

                    // for displaying the first command line
                    socket.emit('data', '\\n');
                });
            };

            client.run({
                parent: e,
                remote: "${EXTERNAL_URL}"
            })
        </script>
    </body>
    </html>
    `

    app.get('/term', function (req, res) {
        res.send(term_html);
    });

}

class Terminal {

    constructor() {
        this.buff = [];
        this.socket = null;
        this. term = null;
    }
    
    start_terminal() {
        var that = this;
        // create shell process
        this.term = pty.fork(
            process.env.SHELL || 'sh',
            [],
            {
                name: require('fs').existsSync('/usr/share/terminfo/x/xterm-256color')
                    ? 'xterm-256color'
                    : 'xterm',
                cols: 80,
                rows: 24,
                cwd: process.env.HOME
            }
        );
    
        // store term's output into buffer or emit through socket
        this.term.on('data', function (data) {
            return !that.socket ? that.buff.push(data) : that.socket.emit('data', data);
        });
    
        console.log('Created shell with node-pty master/slave pair (master: %d, pid: %d)', this.term.fd, this.term.pid);
        return this.term;
    }
    
    handle_io(server){
        var that = this;
       
        var io = require('socket.io')(server, {
            allowEIO3: true, // false by default
            cors: {
              origin: '*',
            }
          });
        //var room = io.of('/term');
        io.on('connection', function (s) {
            // when connect, store the socket
            that.socket = s;

            // handle incoming data (client -> server)
            that.socket.on('data', function (data) {
                that.term.write(data);
            });

            // handle connection lost
            that.socket.on('disconnect', function () {
                that.socket = null;
            });

            that.socket.on('resize', function(data) {
                that.term.resize(data.cols, data.rows);
            });

            // send buffer data to client
            while (that.buff.length) {
                that.socket.emit('data', that.buff.shift());
            };
        });
    }
}

exports.term = new Terminal();
