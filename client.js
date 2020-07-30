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
		term.write('WELCOME!\r\n');

		socket.on('disconnect', function() {
			term.destroy();
		});

		// for displaying the first command line
		socket.emit('data', '\n');
	});
};