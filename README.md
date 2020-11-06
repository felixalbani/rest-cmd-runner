# Commands over REST API

Simple NodeJS REST API server that allows remote command execution via REST API.


References:
- https://gist.github.com/flesch/7323594


```
docker build -t rest-cmd .

docker run --name cmd -p 4041:4041 -d rest-cmd

```
