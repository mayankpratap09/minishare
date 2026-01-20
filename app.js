function createRoom() {
    pc = new RTCPeerConnection();
    channel = pc.createDataChannel("file");
  
    channel.onopen = async () => {
      await generateKey();
      const rawKey = await crypto.subtle.exportKey("raw", cryptoKey);
      channel.send(rawKey);
      log("Connected 🔐");
    };
  
    channel.onmessage = receiveFile;
  
    pc.createOffer().then(o => {
      pc.setLocalDescription(o);
  
      // STEP 1: COPY OFFER
      const offer = prompt(
        "Copy this OFFER and send to other device",
        JSON.stringify(pc.localDescription)
      );
  
      // STEP 2: PASTE ANSWER BACK
      const answer = prompt(
        "Paste ANSWER from other device here"
      );
  
      if (answer) {
        pc.setRemoteDescription(JSON.parse(answer));
      }
    });
  }