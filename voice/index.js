const WebSocketServer = require("ws");
let { RTCPeerConnection, RTCIceCandidate } = require("wrtc");
const uuid = require("uuid");
const server = new WebSocketServer.Server({ port: 8080 });

const broadcast = (from, data) => {
  server.clients.forEach((client) => {
    if (client.id === from) return;
    client.send(JSON.stringify(data));
  });
};

server.on("connection", async (ws) => {
  ws.id = uuid.v4();
  ws.receivers = [];

  // const offer = await localConnection.createOffer();
  // await localConnection.setLocalDescription(offer);

  // sending message
  ws.on("message", async (binaryData) => {
    const data = JSON.parse(binaryData);
    switch (data.type) {
      case "senderOffer":
        const pc = new RTCPeerConnection();

        pc.onicecandidate = (e) => {
          if (e.candidate)
            ws.send(
              JSON.stringify({
                type: "senderCandidate",
                payload: { candidate: e.candidate },
              })
            );
        };

        pc.ontrack = (e) => {
          ws.stream = e.streams[0];
        };

        ws.pc = pc;

        await pc.setRemoteDescription(data.payload.sdp);

        let sdp = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });

        await pc.setLocalDescription(sdp);

        ws.send(JSON.stringify({ type: "senderAnswer", payload: { sdp } }));
        console.log("Answered Sender's offer", ws.id);

        // Broadcast user join
        broadcast(ws.id, { type: "userJoined", payload: { id: ws.id } });
        const allUsers = [...server.clients]
          .map((client) => client.id)
          .filter((id) => id !== ws.id);
        ws.send(JSON.stringify({ type: "allUsers", payload: { allUsers } }));
        break;
      case "senderCandidate": {
        if (!data.payload.candidate) break;
        ws.pc.addIceCandidate(new RTCIceCandidate(data.payload.candidate));
        break;
      }
      case "receiverOffer": {
        let pc = new RTCPeerConnection();

        pc.onicecandidate = (e) => {
          ws.send(
            JSON.stringify({
              type: "receiverCandidate",
              payload: {
                candidate: e.candidate,
                id: data.payload.id,
              },
            })
          );
        };

        const senderClient = [...server.clients].find(
          (c) => c.id === data.payload.id
        );

        if (!senderClient) return;

        senderClient.stream?.getTracks().forEach((track) => {
          pc.addTrack(track, senderClient.stream);
        });

        await pc.setRemoteDescription(data.payload.sdp);

        let sdp = await pc.createAnswer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });

        await pc.setLocalDescription(sdp);

        ws.receivers.push(pc);

        ws.send(
          JSON.stringify({
            type: "receiverAnswer",
            payload: {
              sdp,
              id: data.payload.id,
            },
          })
        );
        console.log(
          "Answered Receiver's Offer To:",
          ws.id,
          "From:",
          data.payload.id
        );
        break;
      }
      case "receiverCandidate": {
        break;
      }
      default:
        break;
    }
  });
  ws.on("close", () => {
    ws.receivers.forEach((receiver) => {
      receiver.close();
    });
    ws.pc?.close();
    broadcast(ws.id, { type: "userLeft", payload: { id: ws.id } });
    console.log(`${ws.id} has disconnected`);
  });
  ws.onerror = function () {
    console.log("Some Error occurred");
  };
});

server.on("listening", () => {
  console.log("The WebSocket server is running on port 8080");
});
