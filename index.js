const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const { exec } = require('child_process');
const fs = require('fs');

// constants
const PORT = process.env.PORT || 4041;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const USERNAME = process.env.REST_USERNAME || 'admin';
const PASS = process.env.REST_PASS || 'admin';

var app = express()

// enable files upload
app.use(fileUpload({
    createParentPath: true
}));

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));

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

// curl -H "Content-Type: application/json" -d '{"cmd":"ls -lrt"}'   -X POST 'http://localhost:4041/cmd'
// or with httpie
// http POST localhost:4041/cmd cmd="ls -lrt"
app.post('/cmd', (req, res) => {
    const { cmd } = req.body;
    console.log("Executing command" + cmd)
    const process = exec(cmd, function (error, stdout, stderr) {
        result = { 'cmd': cmd, 'stdout': stdout, 'stderr': stderr, 'error': {} }
        if (error)
            result["error"] = { "code": error.code, "signal": error.signal, "stack": error.stack };
        res.send(result);
    });
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

app.listen(PORT, () => {
    console.log(`sServer is running on port: ${PORT}`);
});