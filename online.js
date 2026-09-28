// online.js — WebSocket client for online multiplayer. Exposes a global `Online`.
// Talks to the chess-backend move-relay server.

(function () {
  "use strict";

  // Where the multiplayer server lives.
  // Local dev uses the FastAPI server on :8000. In production, set PROD_URL to
  // your deployed backend (e.g. Render), or pass ?server=wss://... in the URL.
  const PROD_URL = "wss://chess-backend.onrender.com/ws"; // <-- change to your Render URL

  function serverUrl() {
    const override = new URLSearchParams(location.search).get("server");
    if (override) return override;
    try {
      const saved = localStorage.getItem("chessServer");
      if (saved) return saved;
    } catch (e) {}
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "") {
      return "ws://localhost:8000/ws";
    }
    return PROD_URL;
  }

  let ws = null;
  let connected = false;
  let handlers = {};
  let pingTimer = null;

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  // Connect to a room. Pass { room } to join an existing one, or omit to create.
  // handlers: { onInit, onOpponentJoined, onStart, onMove, onResign,
  //             onDrawOffer, onRematch, onOpponentLeft, onFull, onError, onClose }
  function connect(opts) {
    opts = opts || {};
    handlers = opts.handlers || {};
    disconnect(); // ensure any old socket is gone

    const params = new URLSearchParams();
    if (opts.room) params.set("room", opts.room);
    if (opts.name) params.set("name", opts.name);
    const url = serverUrl() + "?" + params.toString();

    try {
      ws = new WebSocket(url);
    } catch (e) {
      if (handlers.onError) handlers.onError("Could not connect");
      return;
    }

    ws.onopen = () => {
      connected = true;
      // keepalive so the connection (and a sleepy free-tier host) stays awake
      pingTimer = setInterval(() => send({ type: "ping" }), 25000);
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      route(msg);
    };
    ws.onerror = () => {
      if (handlers.onError) handlers.onError("Connection error");
    };
    ws.onclose = () => {
      connected = false;
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (handlers.onClose) handlers.onClose();
    };
  }

  function route(msg) {
    switch (msg.type) {
      case "init": if (handlers.onInit) handlers.onInit(msg); break;
      case "opponent_joined": if (handlers.onOpponentJoined) handlers.onOpponentJoined(msg); break;
      case "start": if (handlers.onStart) handlers.onStart(msg); break;
      case "move": if (handlers.onMove) handlers.onMove(msg); break;
      case "resign": if (handlers.onResign) handlers.onResign(msg); break;
      case "draw_offer": if (handlers.onDrawOffer) handlers.onDrawOffer(msg); break;
      case "draw_accept": if (handlers.onDrawAccept) handlers.onDrawAccept(msg); break;
      case "rematch": if (handlers.onRematch) handlers.onRematch(msg); break;
      case "opponent_left": if (handlers.onOpponentLeft) handlers.onOpponentLeft(msg); break;
      case "full": if (handlers.onFull) handlers.onFull(msg); break;
      case "error": if (handlers.onError) handlers.onError(msg.message || "Error"); break;
      case "pong": break;
    }
  }

  function sendMove(move, fen) {
    send({ type: "move", move: move, fen: fen });
  }
  function sendResign() { send({ type: "resign" }); }
  function sendRematch() { send({ type: "rematch" }); }

  function disconnect() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try { ws.close(); } catch (e) {}
      ws = null;
    }
    connected = false;
  }

  function isConnected() { return connected; }

  function setServerUrl(url) {
    try {
      if (url) localStorage.setItem("chessServer", url);
      else localStorage.removeItem("chessServer");
    } catch (e) {}
  }
  function getServerUrl() { return serverUrl(); }

  window.Online = {
    connect, disconnect, sendMove, sendResign, sendRematch,
    isConnected, setServerUrl, getServerUrl,
  };
})();
