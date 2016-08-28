'use strict';

/** AngularJS application controller */

var app = angular.module('Application', []);

app.constant('LOCAL_VIDEO_ELEMENT_ID', 'local-video');
app.constant('REMOTE_VIDEO_ELEMENT_ID', 'remote-video');
app.constant('SERVER_URL', window.location.protocol + '//' + window.location.host);

app.controller('MainController', MainController);
MainController.$inject = ['$scope', 'LOCAL_VIDEO_ELEMENT_ID', 'REMOTE_VIDEO_ELEMENT_ID', 'SERVER_URL'];
function MainController($scope, LOCAL_VIDEO_ELEMENT_ID, REMOTE_VIDEO_ELEMENT_ID, SERVER_URL) {
    var webRTC;
    $scope.rooms = [
        'Aikido',
        'Judo',
        'Taekwondo',
        'Muay Thai',
        'Sumo',
    ];
    $scope.room = $scope.rooms[0];
    $scope.onAir = false;
    $scope.error = '';
    $scope.join = function() {
        try {
            webRTC = new WebRTC({
                localVideoElementId: LOCAL_VIDEO_ELEMENT_ID,
                remoteVideoElementId: REMOTE_VIDEO_ELEMENT_ID,
                serverUrl: SERVER_URL
            });
            webRTC.initLocalMedia();
            webRTC.initSignaling();
            webRTC.joinRoom($scope.room);
            $scope.onAir = true;
        } catch(e) {
            $scope.error = e.message;
        }
    };
    $scope.leave = function() {
        try {
            webRTC.leaveRoom($scope.room);
            $scope.onAir = false;
        } catch(e) {
            $scope.error = e.message;
        }
    };
}

/** WebRTC setup, signaling & peer connections handling */

function WebRTC(opts) {
    var options = opts || {};
    this.config = {
        localVideoElementId: '',
        remoteVideoElementId: '',
        serverUrl: 'https://localhost',
        constraints: {
            video: true,
            audio: true
        },
        socketIoOpts: {
            secure: true
        },
        iceServers: [{url: 'stun:stun.l.google.com:19302'}]
    };
    for (var key in options) {
        this.config[key] = options[key];
    }
    this.offerOptions = {
        offerToReceiveVideo: this.config.constraints.video,
        offerToReceiveAudio: this.config.constraints.audio
    };
    this.serverConnection = new ServerConnection(this.config);
}

WebRTC.prototype.initLocalMedia = function() {
    var self = this;
    function successHandler(stream) {
        window.stream = stream;
        self.localStream = stream;
        self.localVideoElement = self.getLocalVideoElement();
        self.localVideoElement.srcObject = stream;
        self.localVideoElement.muted = "muted";
    }
    function errorHandler(error) {
        console.log(error);
        throw new Error('Cannot initialize media');
    }
    navigator.mediaDevices.getUserMedia(this.config.constraints).then(successHandler).catch(errorHandler);
};

WebRTC.prototype.initSignaling = function() {
    var self = this;
    var peerConnectionConfig = {
        iceServers: this.config.iceServers
    };
    this.serverConnection.on('joined', function(room, data) {
        var isInitiator = (data.clientsNum > 1);
        self.createPeerConnection(peerConnectionConfig, isInitiator);
    });
    this.serverConnection.on('message', function(message) {
        if (message.type == 'offer') {
            self.handleOfferMessage(message);
        } else if (message.type == 'answer') {
            self.handleAnswerMessage(message);
        } else if (message.type == 'candidate') {
            self.handleCandidateMessage(message);
        } else if (message.type == 'disconnect') {
            self.handleDisconnectMessage(message);
        }
    });
    this.serverConnection.on('ip', function(ip) {
        console.log('Server IP address is: ' + ip);
    });
    this.serverConnection.on('full', function() {
        console.log('This room is currently full');
    });
};

WebRTC.prototype.sendMessage = function(message) {
    this.serverConnection.emit('message', message);
};

WebRTC.prototype.createPeerConnection = function(config, isInitiator) {
    var self = this;
    this.peerConnection = new RTCPeerConnection(config);
    this.peerConnection.onicecandidate = function(event) {
        if (event.candidate) {
            self.sendMessage({
                room: self.room,
                data: {
                    type: 'candidate',
                    id: event.candidate.sdpMid,
                    label: event.candidate.sdpMLineIndex,
                    candidate: event.candidate.candidate
                }
            });
        }
    };
    this.peerConnection.ontrack = function(event) {
        self.remoteVideoElement = self.getRemoteVideoElement();
        self.remoteVideoElement.srcObject = event.streams[0];
        self.remoteVideoElement.play();
    };
    if (isInitiator) {
        try {
            var interval = setInterval(function() {
                if (self.localStream) {
                    clearInterval(interval);
                    self.localStream.getTracks().forEach(function(track) {
                        self.peerConnection.addTrack(track, self.localStream);
                    });
                    var offerPromise = new Promise(function(resolve, reject) {
                        self.peerConnection.createOffer(resolve, reject, self.offerOptions);
                    });
                    offerPromise.then(function(offer) {
                        return new Promise(function(resolve, reject) {
                            self.peerConnection.setLocalDescription(offer, resolve, reject);
                        });
                    }).then(function() {
                        self.sendMessage({
                            room: self.room,
                            data: self.peerConnection.localDescription
                        });
                    }).catch(function(e) {
                        console.log(e);
                        throw new Error('Cannot create peer connection');
                    });
                }
            }, 200);
        } catch (e) {
            console.log(e);
            throw new Error('Cannot create peer connection');
        }
    }
};

WebRTC.prototype.handleOfferMessage = function(message) {
    var self = this;
    this.peerConnection.setRemoteDescription(new RTCSessionDescription(message))
        .then(function() {
            self.localStream.getTracks().forEach(function(track) {
                self.peerConnection.addTrack(track, self.localStream);
            });
        })
        .then(function() {
            return new Promise(function(resolve, reject) {
                self.peerConnection.createAnswer(resolve, reject, self.offerOptions);
            });
        })
        .then(function(answer) {
            return new Promise(function(resolve, reject) {
                self.peerConnection.setLocalDescription(answer, resolve, reject);
            });
        })
        .then(function() {
            self.sendMessage({
                room: self.room,
                data: self.peerConnection.localDescription
            });
        })
        .catch(function(e) {
            console.log(e);
            throw new Error('Cannot handle offer message from the peer');
        });
};

WebRTC.prototype.handleAnswerMessage = function(message) {
    this.peerConnection.setRemoteDescription(new RTCSessionDescription(message));
};

WebRTC.prototype.handleCandidateMessage = function(message) {
    this.peerConnection.addIceCandidate(new RTCIceCandidate({
        candidate: message.candidate
    }));
};

WebRTC.prototype.handleDisconnectMessage = function(message) {
    this.remoteVideoElement.srcObject.getTracks().forEach(function(track) {
        track.stop();
    });
    if (this.remoteVideoElement && this.remoteVideoElement.srcObject) {
        this.remoteVideoElement.srcObject.getTracks().forEach(function(track) {
            track.stop();
        });
        this.remoteVideoElement.srcObject = null;
    }
};

// @todo refactor into separate methods, incl. handleDisconnectMessage
WebRTC.prototype.leaveRoom = function() {
    if (this.room) {
        this.sendMessage({
            room: this.room,
            data: {
                type: 'disconnect'
            }
        });
        if (this.remoteVideoElement && this.remoteVideoElement.srcObject) {
            this.remoteVideoElement.srcObject.getTracks().forEach(function(track) {
                track.stop();
            });
            this.remoteVideoElement.srcObject = null;
        }
        if (this.localVideoElement && this.localVideoElement.srcObject) {
            this.localVideoElement.srcObject.getTracks().forEach(function(track) {
                track.stop();
            });
            this.localVideoElement.srcObject = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        if (this.serverConnection) {
            this.serverConnection.close();
        }
    }
};

WebRTC.prototype.joinRoom = function(room, callback) {
    this.room = room;
    this.serverConnection.emit('join', room);
};

WebRTC.prototype.getLocalVideoElement = function() {
    var element = document.getElementById(this.config.localVideoElementId);
    element.oncontextmenu = function() {
        return false;
    };
    return element;
};

WebRTC.prototype.getRemoteVideoElement = function () {
    return document.getElementById(this.config.remoteVideoElementId);
};

/** Websocket connection to the server */

function ServerConnection(config) {
    this.connection = io.connect(config.serverUrl, config.socketIoOpts);
}

ServerConnection.prototype.on = function(event, callback) {
    this.connection.on(event, callback);
};

ServerConnection.prototype.emit = function(event, data, callback) {
    this.connection.emit(event, data, callback);
};

ServerConnection.prototype.close = function() {
    this.connection.disconnect();
};
