diff --git a//dev/null b/server.js
index 0000000000000000000000000000000000000000..e5bd39c876165b4f977a329240bbd273446125bc 100644
--- a//dev/null
+++ b/server.js
@@ -0,0 +1,111 @@
+const express = require('express');
+const http = require('http');
+const { Server } = require('socket.io');
+const { randomUUID } = require('crypto');
+
+const app = express();
+const server = http.createServer(app);
+const io = new Server(server, { cors: { origin: '*' } });
+
+app.use(express.json());
+app.use(express.static('public'));
+
+// sessions stored in memory
+// sessionId -> {questions, current, players, stats}
+const sessions = new Map();
+
+function createSession(questions) {
+  const id = Math.random().toString(36).substring(2, 8).toUpperCase();
+  sessions.set(id, {
+    questions,
+    current: 0,
+    players: {},
+    stats: questions.map(() => ({ correct: 0, incorrect: 0 }))
+  });
+  return id;
+}
+
+app.post('/sessions', (req, res) => {
+  const { questions } = req.body;
+  if (!Array.isArray(questions)) {
+    return res.status(400).json({ error: 'questions must be array' });
+  }
+  const id = createSession(questions);
+  res.json({ sessionId: id });
+});
+
+io.on('connection', socket => {
+  socket.on('join', ({ sessionId, name }) => {
+    const session = sessions.get(sessionId);
+    if (!session) return socket.emit('error', 'Session not found');
+    socket.join(sessionId);
+    session.players[socket.id] = { name, score: 0 };
+    io.to(sessionId).emit('scoreboard', Object.values(session.players));
+  });
+
+  socket.on('start', ({ sessionId }) => {
+    const session = sessions.get(sessionId);
+    if (!session) return;
+    sendQuestion(sessionId);
+  });
+
+  socket.on('answer', ({ sessionId, answer }) => {
+    const session = sessions.get(sessionId);
+    if (!session) return;
+    const q = session.questions[session.current];
+    const player = session.players[socket.id];
+    if (!q || !player || player.answered) return;
+
+    const timeTaken = Date.now() - session.questionStart;
+    const correct = answer === q.correct;
+    if (correct) {
+      const points = Math.max(0, 1000 - timeTaken);
+      player.score += points;
+      session.stats[session.current].correct++;
+    } else {
+      session.stats[session.current].incorrect++;
+    }
+    player.answered = true;
+    io.to(socket.id).emit('result', { correct, score: player.score });
+
+    const all = Object.values(session.players).every(p => p.answered);
+    if (all) {
+      session.current++;
+      Object.values(session.players).forEach(p => (p.answered = false));
+      if (session.current < session.questions.length) {
+        setTimeout(() => sendQuestion(sessionId), 500);
+      } else {
+        io.to(sessionId).emit('end', {
+          scoreboard: Object.values(session.players),
+          stats: session.stats
+        });
+      }
+    }
+  });
+
+  socket.on('disconnect', () => {
+    for (const [id, session] of sessions.entries()) {
+      if (session.players[socket.id]) {
+        delete session.players[socket.id];
+        io.to(id).emit('scoreboard', Object.values(session.players));
+        break;
+      }
+    }
+  });
+});
+
+function sendQuestion(sessionId) {
+  const session = sessions.get(sessionId);
+  if (!session) return;
+  const q = session.questions[session.current];
+  session.questionStart = Date.now();
+  io.to(sessionId).emit('question', {
+    index: session.current,
+    prompt: q.prompt,
+    image: q.image,
+    answers: q.answers
+  });
+}
+
+const PORT = process.env.PORT || 3000;
+server.listen(PORT, () => console.log(`Server running on ${PORT}`));
