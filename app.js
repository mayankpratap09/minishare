let pc, channel;
let cryptoKey = null;
let receivedBuffers = [];
let fileMeta = null;

const CHUNK_SIZE = 64 * 1024;
const statusText = document.getElementById("status");
const speedText = document.getElementById("speed");
const progressBar = document.getElementById("progress");

let lastTime = Date.now();
let lastBytes = 0;

function log(msg) {
  statusText.innerText = msg;
}

function updateProgress(sent, total) {
  progressBar.value = Math.floor((sent / total) * 100);
}

function updateSpeed(sent) {
  const now = Date.now();
  const diff = (now - lastTime) / 1000;
  if (diff >= 0.5) {
    const speed = ((sent - lastBytes) / diff / (1024 * 1024)).toFixed(2);
    speedText.innerText = `Speed: ${speed} MB/s`;
    lastTime = now;
    lastBytes = sent;
  }
}

async function generateKey() {
  cryptoKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

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
    setTimeout(() => {
      prompt("Copy OFFER", JSON.stringify(pc.localDescription));
    }, 500);
  });
}

function joinRoom() {
  pc = new RTCPeerConnection();
  pc.ondatachannel = e => {
    channel = e.channel;
    channel.onmessage = receiveFile;
    channel.onopen = () => log("Connected 🔐");
  };

  const offer = JSON.parse(prompt("Paste OFFER"));
  pc.setRemoteDescription(offer);

  pc.createAnswer().then(a => {
    pc.setLocalDescription(a);
    setTimeout(() => {
      prompt("Copy ANSWER", JSON.stringify(pc.localDescription));
    }, 500);
  });
}

fileInput.onchange = () => {
  sendFile(fileInput.files[0]);
};

async function sendFile(file) {
  channel.send(JSON.stringify({ type: "meta", name: file.name, size: file.size }));

  let offset = 0;
  while (offset < file.size) {
    if (channel.bufferedAmount > 8 * 1024 * 1024) {
      await new Promise(r => setTimeout(r, 50));
      continue;
    }

    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      buffer
    );

    channel.send(JSON.stringify({ iv: Array.from(iv) }));
    channel.send(encrypted);

    offset += CHUNK_SIZE;
    updateProgress(offset, file.size);
    updateSpeed(offset);
  }

  channel.send("EOF");
  log("File sent ✅");
}

async function receiveFile(e) {
  if (typeof e.data === "string") {
    if (e.data === "EOF") {
      const blob = new Blob(receivedBuffers);
      receivedBuffers = [];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileMeta.name;
      a.click();
      log("File received ✅");
      return;
    }

    const msg = JSON.parse(e.data);
    if (msg.type === "meta") {
      fileMeta = msg;
      receivedBuffers = [];
      return;
    }
    if (msg.iv) {
      window.currentIV = new Uint8Array(msg.iv);
    }
    return;
  }

  if (!cryptoKey) {
    cryptoKey = await crypto.subtle.importKey(
      "raw",
      e.data,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    return;
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: window.currentIV },
    cryptoKey,
    e.data
  );

  receivedBuffers.push(decrypted);
}