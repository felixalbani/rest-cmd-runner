const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const http = require('http');
const https = require('https');
const md5File = require('md5-file')

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

async function checkAndDownload(url,local) {
    return new Promise((resolve, reject) => {
            download(url+".md5", local+".md5", function(err) {
                var shouldDownload=true;
                if(err) {
                    console.log("No md5 available, downloading anyway", err);
                } else {
                    try {
                        if (fs.existsSync(local)) {
                            // check if MD5s are equal
                            const hashLocalFile = md5File.sync(local);
                            const md5FileDownloaded = fs.readFileSync(local+".md5", 'utf8').split(' ')[0];
                            if(hashLocalFile == md5FileDownloaded) {
                                console.log("files are equal");
                                shouldDownload = false;
                            } else {
                                console.log("different MD5, downloading");
                            }
                        }
                    } catch(err) {
                        console.error(err)
                    }
                }
                if(shouldDownload) {
                    // download actual file
                    download(url, local, function(err) {
                        if(err) {
                            console.log("Error downloading "+url);
                            reject(err);
                        }
                        resolve();
                    });
                    
                } else {
                    console.log("skipping download");
                    resolve();
                }
            });
    });
}


async function depedenciesAndEnv(req,fieldsToIgnore) {
    return new Promise((resolve, reject) => {
        env={};
        var all = [];
        for (const [key, value] of Object.entries(req.body)) {
            if(!fieldsToIgnore.includes(key)) {
                env[key]=value;
            }
        }
        for (const [key, value] of Object.entries(req.files)) {
            if(!fieldsToIgnore.includes(key) && key !== "URLS") {
                const fullname = UPLOAD_DIR + '/' + req.files[key].name;
                //Use the mv() method to place the file in upload directory (i.e. "uploads")
                req.files[key].mv(fullname, (err) => {
                    if (err)
                        reject(err);
                });
            } else if(key === "URLS") {
                const urls=req.files.URLS.data.toString('utf8').split('\n');
                for (const url of urls) {
                    if(url.trim().length>0 && !url.trim().startsWith("#")) {
                        console.log("localizing",url);
                        if(url.trim().toLowerCase().startsWith("http")) {
                            const elems=url.split('|');
                            var localName=elems[0].split("/").pop();
                            if(elems.length>1) { // explicit local name
                                localName=elems[1];
                            }
                            const fullname = UPLOAD_DIR + '/' + localName;
                            const result=checkAndDownload(elems[0],fullname);
                            all.push(result);
                        } else {
                            console.log("warning, skipping URL because it does not begin with http, so it might be an attempt to do local-file traversal");
                        }
                    }
                }
            }
        }
        // this will fail when any checkAndDownload fails and resolve when all are resolved
        Promise.all(all).then(function(ret) {
                resolve(env);
            }).catch(function(err) {
                console.error("checkAndDownload failed", err);
                reject(err);
            });
    });
}

// curl -H "Content-Type: multipart/form-data"  -u admin:admin -F "cmd=ls -lrt" -F "env1=value1" -F "env2=value2" -F "script=@sample_scripts/helloworld.sh" -F "testfile=@testfile" -F "URLS=@sample_scripts/dependencies.urls" -X POST 'http://localhost:4041/cmd'
// or with httpie
// http -a admin:admin POST localhost:4041/cmd cmd="ls -lrt"

app.post('/cmd', async (req, res) => {
    try {
        const { cmd } = req.body;
        const env=await depedenciesAndEnv(req,["cmd"]);
        // console.log("Executing command" + cmd)
        const process = exec(cmd, { "cwd": UPLOAD_DIR, "env": env}, function (error, stdout, stderr) {
            result = { 'cmd': cmd, 'stdout': stdout, 'stderr': stderr, 'error': {} }
            if (error)
                result["error"] = { "code": error.code, "signal": error.signal, "stack": error.stack };
            res.send(result);
        });
    } catch (err) {
        console.log("cmd catch", err);
        res.status(500).send(err);
    }
});

// curl -H "Content-Type: multipart/form-data" -u admin:admin -F 'interpreter="/bin/bash -s hellooooooo"' -F "env1=value1" -F "env2=value2" -F "script=@sample_scripts/helloworld.sh" -F "testfile=@testfile" -F "URLS=@sample_scripts/dependencies.urls" -X POST 'http://localhost:4041/pipeexec'
// uploads all files not called "script" to the upload dir and executes 'script' via pipe to the interpreter with the other form fields not called 'interpreter' as env vars
//
// On the files post-ed, you can have a special file that is named "URLS", that contain one line per URL-based localization plus an optional local name in the form:
// http://example.com/myfile|mylocalfilename
// http://example.com/myfile2|mylocalfilename2
// http://example.com/myfile3
// .
// .
// .
// The localization logic tries to first request the name of the same URL, but with .md5 appended, and if it exists, uses that to check if we have the local file already localized and if it matches, it does
// not download the file again, since the idea of URLS is that it will be used for bigger files not practical to be POST-ed directly.

app.post('/pipeexec', async (req, res) => {
    try {
        let script = req.files.script;
        // console.log('files passed '+util.inspect(req.body, {depth: 3}));
        const { interpreter } = req.body;
        const env=await depedenciesAndEnv(req,["script","interpreter"]);
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

var download = function(url, dest, cb) {
    var file = fs.createWriteStream(dest).on('error', (e) => {
        cb(e.message);
    });
    const ht = url.startsWith("https") ? https : http;
    var request = ht.get(url, function(response) {
            response.pipe(file);
            file.on('finish', function() {
            file.close(cb); 
        }).on('error', function(err) {
            console.log("cannot save local file "+ dest + " from url="+url,err);
            fs.unlink(dest);
            if (cb) cb(err.message);
        });
    }).on('error', (e) => {
        cb(e.message);
    });
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
