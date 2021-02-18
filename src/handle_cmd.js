const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.use = function(app, auth, UPLOAD_DIR){

    // curl -H "Content-Type: application/json" -u admin:admin -d '{"cmd":"ls -lrt"}' -X POST 'http://localhost:4041/cmd'
    // or with httpie
    // http -a admin:admin POST localhost:4041/cmd cmd="ls -lrt"
    app.post('/cmd', auth, (req, res) => {
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
    app.post('/script', auth, (req, res) => {
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
}