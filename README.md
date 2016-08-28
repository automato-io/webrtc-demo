# WebRTC technology demo

Try [WebRTC](https://webrtc.org/) - real-time communication between [browsers](http://caniuse.com/#search=webrtc) without the need for additional applications or plug-ins.

Stack: Node, Angular, Bootstrap

Issues: [dev@automato.io](mailto:dev@automato.io)

## Live demo

[webrtc.automato.io](webrtc.automato.io)

## Build and run
  
```sh
npm install
bower install
docker build -t webrtc-demo .
docker run -ti --rm -p 8080:8080 --name webrtc-demo webrtc-demo
```