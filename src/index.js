const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const handle_cmd = require('./handle_cmd');
const handle_term = require('./handle_term');

// constants
const PORT = process.env.PORT || 4041;
const EXTERNAL_URL = process.env.EXTERNAL_URL || 'http://127.0.0.1:4041';
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const USERNAME = process.env.REST_USERNAME || 'admin';
const PASS = process.env.REST_PASS || 'admin';

var app = express()

app.use(morgan('dev'));

// enable files upload
app.use(fileUpload({
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

handle_cmd.use(app, UPLOAD_DIR);
handle_term.use(app, EXTERNAL_URL);

handle_term.term.start_terminal();

var server = app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});

handle_term.term.handle_io(server);
