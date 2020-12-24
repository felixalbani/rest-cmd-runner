# Commands over REST API

Simple NodeJS REST API server that allows remote command execution via REST API.


References:
- https://gist.github.com/flesch/7323594


```
docker build -t rest-cmd .

docker run --name cmd -p 4041:4041 -d rest-cmd

```

* To create a redistributable binary with the REST API server, please install "pkg" globally like:
```
npm install -g pkg
```

and after that, make sure the dependecies are rebuilt:
```
rm -rf node_modules
yarn install
```

finally create the binary, make sure the node major version matches the one you used to to the "yarn install" above
```
pkg -t node14-linux-x64 -o rest-cmd-runner .
```

to be able to run the generated binary, you need to distribute the pty binary alongside the rest-cmd-runner bin:
```
cp node_modules/node-pty/build/Release/pty.node /the/path/where/you/put/the/rest-cmd-runnerBin
```
