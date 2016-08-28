'use strict';

var os = require('os');
var fs = require('fs');
var https = require('https');
var nodeStatic = require('node-static');
var socket = require('socket.io');

var options = {
    key: fs.readFileSync('./devkeys/dev.key'),
    cert: fs.readFileSync('./devkeys/dev.cer')
};

var server = new nodeStatic.Server('./public');

var app = https.createServer(options, function(req, res) {
    req.addListener('end', function() {
        server.serve(req, res);
    }).resume();
}).listen(8080);

var io = socket.listen(app);

io.sockets.on('connection', function(socket) {
    socket.on('message', function(message) {
        socket.broadcast.to(message.room).emit('message', message.data);
    });
    socket.on('join', function(room) {
        var clientsNum = numClientsInRoom('/', room);
        if (clientsNum == 2) {
            socket.emit('full');
        } else {
            socket.join(room);
            socket.emit('joined', room, {
                id: socket.id,
                clientsNum: clientsNum + 1
            });
        }
    });
});

function numClientsInRoom(namespace, room) {
    var roomSockets = io.nsps[namespace].adapter.rooms[room];
    if (typeof roomSockets == 'undefined') {
        return 0;
    }
    return Object.keys(roomSockets.sockets).length;
}
