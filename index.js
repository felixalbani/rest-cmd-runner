const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

// terminal required modules
var pty = require('node-pty');
var terminal = require('term.js');
var socket;
var term;
var buff = [];

// constants
const PORT = process.env.PORT || 4041;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const USERNAME = process.env.REST_USERNAME || 'admin';
const PASS = process.env.REST_PASS || 'admin';

var app = express()

app.use("/term", terminal.middleware());
app.use(morgan('dev'));

// enable files upload
app.use(fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 },
    createParentPath: true
}));

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(function (req, res, next) {
    // Grab the "Authorization" header.
    var auth = req.get("authorization");

    if (!auth) {
        res.set("WWW-Authenticate", "Basic realm=\"Authorization Required\"");
        return res.status(401).send("Authorization Required");
    } else {
        var credentials = new Buffer(auth.split(" ").pop(), "base64").toString("ascii").split(":");
        if (credentials[0] === USERNAME && credentials[1] === PASS) {
            next();
        } else {
            // The user typed in the username or password wrong.
            return res.status(401).send("Access Denied (incorrect credentials)");
        }
    }
});

// curl -H "Content-Type: application/json" -u admin:admin -d '{"cmd":"ls -lrt"}' -X POST 'http://localhost:4041/cmd'
// or with httpie
// http -a admin:admin POST localhost:4041/cmd cmd="ls -lrt"
app.post('/cmd', (req, res) => {
    const { cmd } = req.body;
    // console.log("Executing command" + cmd)
    const process = exec(cmd, function (error, stdout, stderr) {
        result = { 'cmd': cmd, 'stdout': stdout, 'stderr': stderr, 'error': {} }
        if (error)
            result["error"] = { "code": error.code, "signal": error.signal, "stack": error.stack };
        res.send(result);
    });
});

// curl -H "Content-Type: multipart/form-data" -u admin:admin -F 'interpreter="/bin/bash -s hellooooooo"' -F "env1=value1" -F "env2=value2" -F "script=@test.sh" -F "testfile=@testfile" -X POST 'http://localhost:4041/pipeexec'
// uploads all files not called "script" to the upload dir and executes 'script' via pipe to the interpreter with the other form fields not called 'interpreter' as env vars

app.post('/pipeexec', (req, res) => {
    try {
        let script = req.files.script;
        // console.log('files passed '+util.inspect(req.body, {depth: 3}));
        const { interpreter } = req.body;

        for (const [key, value] of Object.entries(req.files)) {
            if(key !== "script") {
                const fullname = UPLOAD_DIR + '/' + req.files[key].name;
                //Use the mv() method to place the file in upload directory (i.e. "uploads")
                req.files[key].mv(fullname, (err) => {
                    if (err)
                        res.status(500).send(err);
                });
            }
        }
        env={};
        for (const [key, value] of Object.entries(req.body)) {
            if(key !== "interpreter") {
                env[key]=value;
            }
        }
        // console.log("before exec:", interpreter,{ "cwd": UPLOAD_DIR, "env": env});
        const process = exec(interpreter,{ "cwd": UPLOAD_DIR, "env": env} , function (error, stdout, stderr) {
            result = { 'cmd': interpreter, 'stdout': stdout, 'stderr': stderr, 'error': {} }
            if (error) {
                result["code"] = error.code;
            } else {
                result["code"] = 0;
            }
            res.send(result);
        });
        // console.log("pre-write:",script.data.toString('utf8'), util.inspect(process.stdio, {depth: 3}));
        process.stdio[0].write(script.data.toString('utf8'));
        process.stdio[0].end();
    } catch (err) {
        console.log("pipeexec catch", err);
        res.status(500).send(err);
    }
});


// http -a admin:admin -f POST localhost:4041/script interpreter="bash -x" script="sleep 10\necho 'hello'" separator="\n"
// http -a admin:admin -f POST localhost:4041/script interpreter="ruby" script@./sample_scripts/helloworld.rb
app.post('/script', (req, res) => {
    try {
        if (!req.files) {
            const {interpreter, script, separator} = req.body; 
            const fullname = UPLOAD_DIR + '/' + Date.now();
            var parsed_script = script.replace(separator, "\n");
            fs.writeFile(fullname, parsed_script, function (err) {
                if (err) 
                    res.send({"error":err});
                else{
                    const cmd = interpreter + " " + fullname;
                    const process = exec(cmd, function (error, stdout, stderr) {
                        result = { 'cmd':cmd, 'stdout': stdout, 'stderr': stderr, 'error':{} }
                        if (error) 
                            result["error"] = { "code":error.code, "signal": error.signal, "stack": error.stack};
                        res.send(result);
                    });
                }        
            });
        } else {
            let script = req.files.script;
            const { interpreter } = req.body;
            const fullname = UPLOAD_DIR + '/' + script.name + "-" + Date.now();

            //Use the mv() method to place the file in upload directory (i.e. "uploads")
            script.mv(fullname, (err) => {
                if (err)
                    res.status(500).send(err);
                else {
                    const cmd = interpreter + " " + fullname;
                    const process = exec(cmd, function (error, stdout, stderr) {
                        result = { 'cmd': cmd, 'stdout': stdout, 'stderr': stderr, 'error': {} }
                        if (error)
                            result["error"] = { "code": error.code, "signal": error.signal, "stack": error.stack };
                        res.send(result);
                    });
                }
            });
        }
    } catch (err) {
        console.log(err);
        res.status(500).send(err);
    }
});


app.use('/xterm.css', express.static(__dirname + '/node_modules/xterm/css/xterm.css'));

app.get('/xterm.js', (req, res) => { 
    res.sendFile(__dirname + '/node_modules/xterm/lib/xterm.js');
});

app.get('/xterm.js.map', (req, res) => { 
    res.sendFile(__dirname + '/node_modules/xterm/lib/xterm.js.map');
});

app.get('/client.js', (req, res) => { 
    res.sendFile(__dirname + '/client.js');
});

app.get('/term',function(req,res){
    res.sendFile(path.join(__dirname+'/terminal2.html'));
  });

app.get('/ping',function(req,res){
    res.status(200).send("pong");
  });

var server = app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});

function startTerminal(){
	// create shell process
	term = pty.fork(
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
	term.on('data', function(data) {
		return !socket ? buff.push(data) : socket.emit('data', data);
	});

	console.log('Created shell with node-pty master/slave pair (master: %d, pid: %d)', term.fd, term.pid);
    return term;
}

var term = startTerminal();

// let socket.io handle sockets
var io = require('socket.io')(server);
var room = io.of('/term');
room.on('connection', function(s) {
    // when connect, store the socket
    socket = s;

    // handle incoming data (client -> server)
    socket.on('data', function(data) {
        term.write(data);
    });

    // handle connection lost
    socket.on('disconnect', function() {
        socket = null;
    });

    // send buffer data to client
    while (buff.length) {
        socket.emit('data', buff.shift());
    };
});
