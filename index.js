var localStream = new MediaStream();
const localVideo = document.querySelector(".local-video");
const videoGrid = document.querySelector(".video-grid");
const ws = new WebSocket("ws://localhost:8080");

var senderPeerConnection;
const recieversPeerConnections = {};
var users = [];

const pc_config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

const createSenderOffer = async () => {
  try {
    if (!senderPeerConnection) return;
    const sdp = await senderPeerConnection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });

    await senderPeerConnection.setLocalDescription(
      new RTCSessionDescription(sdp)
    );

    ws.send(
      JSON.stringify({
        type: "senderOffer",
        payload: {
          sdp,
        },
      })
    );
  } catch (error) {
    console.log(error);
  }
};

const createSenderPeerConnection = () => {
  const peerConn = new RTCPeerConnection(pc_config);

  peerConn.onicecandidate = (e) => {
    ws.send(
      JSON.stringify({
        type: "senderCandidate",
        payload: {
          candidate: e.candidate,
        },
      })
    );
  };

  localStream?.getTracks().forEach((track) => {
    peerConn.addTrack(track, localStream);
  });

  senderPeerConnection = peerConn;
};

const createRecieverPeerConnection = async (id) => {
  const pc = new RTCPeerConnection(pc_config);
  recieversPeerConnections[id] = pc;

  pc.onicecandidate = (e) => {
    if (!e.candidate) return;
    ws.send(
      JSON.stringify({
        type: "receiverCandidate",
        payload: {
          candidate: e.candidate,
          id,
        },
      })
    );
  };

  pc.ontrack = (e) => {
    const index = users.findIndex((u) => u.id == id);
    if (index >= 0) {
      users[index] = { id, stream: e.streams[0] };
      _updateUser(id, e.streams[0]);
    } else {
      users.push({ id, stream: e.streams[0] });
      _addUser(id, e.streams[0]);
    }
  };

  const sdp = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  });

  await pc.setLocalDescription(new RTCSessionDescription(sdp));

  ws.send(
    JSON.stringify({
      type: "receiverOffer",
      payload: { sdp, id },
    })
  );
};

const getLocalStream = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        width: 240,
        height: 240,
      },
    });
    localStream = stream;
    if (localVideo) localVideo.srcObject = stream;

    createSenderPeerConnection();
    await createSenderOffer();
  } catch (e) {
    console.log(`getUserMedia error: ${e}`);
  }
};

ws.onopen = () => {
  getLocalStream();
};

ws.onmessage = async (e) => {
  const data = JSON.parse(e.data);
  switch (data.type) {
    case "senderAnswer": {
      const sdp = data.payload.sdp;
      await senderPeerConnection.setRemoteDescription(
        new RTCSessionDescription(sdp)
      );
      break;
    }
    case "senderCandidate": {
      const candidate = data.payload.candidate;
      await senderPeerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
      break;
    }
    case "userJoined": {
      const id = data.payload.id;
      await createRecieverPeerConnection(id);
      break;
    }
    case "userLeft": {
      const id = data.payload.id;
      recieversPeerConnections[id].close();
      delete recieversPeerConnections[id];
      const userIndex = users.findIndex((u) => u.id === id);
      users.splice(userIndex, 1);
      _removeUser(id);
    }
    case "allUsers": {
      const allUsers = data.payload.allUsers;
      allUsers.forEach(async (id) => {
        await createRecieverPeerConnection(id);
      });
      break;
    }
    case "receiverAnswer": {
      const pc = recieversPeerConnections[data.payload.id];
      await pc?.setRemoteDescription(data.payload.sdp);
      break;
    }
    case "receiverCandidate": {
      const { id, candidate } = data.payload;
      console.log(id, candidate);
      recieversPeerConnections[id]?.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    }
    default:
      break;
  }
};

const _removeUser = (id) => {
  for (var i = 0; i < videoGrid.children.length; i++) {
    const currentId = videoGrid.children[i].getAttribute("id");
    if (currentId == id) {
      videoGrid.removeChild(videoGrid.children[i]);
      break;
    }
  }
};

const _addUser = (id, stream) => {
  const newVideo = document.createElement("video");
  newVideo.srcObject = stream;
  newVideo.id = id;
  newVideo.autoplay = true;
  videoGrid.appendChild(newVideo);
};

const _updateUser = (id, stream) => {
  for (var i = 0; i < videoGrid.children.length; i++) {
    const currentId = videoGrid.children[i].getAttribute("id");
    if (currentId == id) {
      videoGrid.children[i].srcObject = stream;
      break;
    }
  }
};
