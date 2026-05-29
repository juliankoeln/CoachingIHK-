// app.js – CoachBoard

// ─── Helpers ───────────────────────────────────────────────────────────────
function randomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── State ─────────────────────────────────────────────────────────────────
let sessionCode = null;
let sessionRef = null;
let myName = null;
let myId = null;
let isModerator = false;
let participantRefs = {};

// ─── MODERATOR: Create Session ─────────────────────────────────────────────
document.getElementById('btn-create-session').addEventListener('click', () => {
  sessionCode = randomCode();
  isModerator = true;
  myName = 'Moderatorin';

  sessionRef = db.ref('sessions/' + sessionCode);
  sessionRef.set({
    code: sessionCode,
    createdAt: Date.now(),
    phase: 'lobby', // lobby | input | voting | results
    participants: {},
    answers: {},
    votes: {}
  });

  // Auto-cleanup after 8 hours
  setTimeout(() => sessionRef.remove(), 8 * 60 * 60 * 1000);

  showModeratorLobby();
});

function showModeratorLobby() {
  showScreen('screen-mod-lobby');

  // QR Code
  const joinUrl = window.location.origin + window.location.pathname + '?join=' + sessionCode;
  document.getElementById('join-url').textContent = joinUrl;

  const qrContainer = document.getElementById('qr-code');
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: joinUrl,
    width: 200,
    height: 200,
    colorDark: '#0f0e17',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });

  document.getElementById('session-code-display').textContent = sessionCode;

  // Listen for participants
  sessionRef.child('participants').on('value', snap => {
    const participants = snap.val() || {};
    renderParticipantList(participants);
    const count = Object.keys(participants).length;
    document.getElementById('participant-count').textContent = count;
    document.getElementById('btn-start-icebreaker').disabled = count < 2;
  });
}

function renderParticipantList(participants) {
  const list = document.getElementById('participant-list');
  list.innerHTML = '';
  Object.values(participants).forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'participant-chip';
    chip.innerHTML = `<span class="chip-dot"></span>${p.name}`;
    list.appendChild(chip);
  });
}

// ─── MODERATOR: Start Icebreaker ───────────────────────────────────────────
document.getElementById('btn-start-icebreaker').addEventListener('click', () => {
  sessionRef.child('phase').set('input');
  showScreen('screen-mod-waiting');
  watchAnswers();
});

function watchAnswers() {
  sessionRef.child('answers').on('value', snap => {
    const answers = snap.val() || {};
    const participants = Object.keys(participantRefs).length;
    const answerCount = Object.keys(answers).length;
    document.getElementById('answer-progress').textContent = `${answerCount} von ${participantRefs._count || '?'} Antworten eingegangen`;

    // Update mod view
    sessionRef.child('participants').once('value', pSnap => {
      const total = Object.keys(pSnap.val() || {}).length;
      document.getElementById('answer-progress').textContent = `${answerCount} von ${total} Antworten eingegangen`;
      document.getElementById('btn-start-voting').disabled = answerCount < 2;
    });
  });
}

document.getElementById('btn-start-voting').addEventListener('click', () => {
  sessionRef.child('phase').set('voting');
  showScreen('screen-mod-voting');
  watchVotingProgress();
});

// ─── MODERATOR: Watch Voting ───────────────────────────────────────────────
function watchVotingProgress() {
  sessionRef.child('votes').on('value', vSnap => {
    const votes = vSnap.val() || {};
    sessionRef.child('participants').once('value', pSnap => {
      const total = Object.keys(pSnap.val() || {}).length;
      const voted = Object.keys(votes).length;
      document.getElementById('voting-progress').textContent = `${voted} von ${total} haben abgestimmt`;
      document.getElementById('btn-show-results').disabled = voted < 1;
    });
  });
}

document.getElementById('btn-show-results').addEventListener('click', () => {
  sessionRef.child('phase').set('results');
  showResults();
});

async function showResults() {
  showScreen('screen-mod-results');

  const [answersSnap, votesSnap, participantsSnap] = await Promise.all([
    sessionRef.child('answers').once('value'),
    sessionRef.child('votes').once('value'),
    sessionRef.child('participants').once('value')
  ]);

  const answers = answersSnap.val() || {};
  const votes = votesSnap.val() || {};
  const participants = participantsSnap.val() || {};

  // Build name map
  const nameMap = {}; // participantId → name
  Object.entries(participants).forEach(([id, p]) => nameMap[id] = p.name);

  // Count correct guesses per answer author
  const scores = {}; // participantId → correct guesses others made
  Object.values(participants).forEach(p => scores[p.id || p.name] = 0);

  // For each answer, check votes
  const resultItems = Object.entries(answers).map(([authorId, answer]) => {
    const authorName = nameMap[authorId] || '?';
    const correctGuessers = [];
    const wrongGuessers = [];

    Object.entries(votes).forEach(([voterId, voterVotes]) => {
      if (voterVotes[authorId]) {
        const guessedId = voterVotes[authorId];
        if (guessedId === authorId) {
          correctGuessers.push(nameMap[voterId] || '?');
        } else {
          wrongGuessers.push({ voter: nameMap[voterId] || '?', guessed: nameMap[guessedId] || '?' });
        }
      }
    });

    return { authorId, authorName, answer: answer.text, correctGuessers, wrongGuessers };
  });

  renderResults(resultItems, nameMap, votes, answers);
}

function renderResults(items, nameMap, votes, answers) {
  const container = document.getElementById('results-container');
  container.innerHTML = '';

  items.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = (i * 0.1) + 's';

    const guessed = item.correctGuessers.length;
    const total = Object.keys(votes).length;
    const emoji = guessed === 0 ? '🕵️' : guessed === total ? '😅' : '🎯';

    card.innerHTML = `
      <div class="result-answer">"${item.answer}"</div>
      <div class="result-reveal">
        ${emoji} <strong>${item.authorName}</strong>
        <span class="result-score">${guessed} von ${total} haben es erraten</span>
      </div>
      ${item.correctGuessers.length > 0 ? `<div class="result-guessers correct">✓ Richtig: ${item.correctGuessers.join(', ')}</div>` : ''}
      ${item.wrongGuessers.length > 0 ? `<div class="result-guessers wrong">✗ Dachten es wäre: ${item.wrongGuessers.map(w => `${w.voter} → ${w.guessed}`).join(', ')}</div>` : ''}
    `;
    container.appendChild(card);
  });
}

document.getElementById('btn-new-round').addEventListener('click', () => {
  sessionRef.update({ answers: null, votes: null, phase: 'lobby' });
  showModeratorLobby();
  toast('Neue Runde gestartet!', 'success');
});

// ─── PARTICIPANT: Join Flow ────────────────────────────────────────────────
const joinCode = getUrlParam('join');
if (joinCode) {
  // Participant mode
  isModerator = false;
  sessionCode = joinCode.length > 5 ? new URL(joinCode).searchParams.get('join') || joinCode.split('/').pop() : joinCode;
  // Handle full URL in QR
  showScreen('screen-join');
  document.getElementById('session-code-join').textContent = sessionCode.toUpperCase();
} else {
  showScreen('screen-home');
}

document.getElementById('btn-join').addEventListener('click', () => {
  const name = document.getElementById('input-name').value.trim();
  if (!name) { toast('Bitte gib deinen Namen ein', 'error'); return; }

  myName = name;
  myId = Date.now().toString(36) + Math.random().toString(36).substr(2);

  // Check session exists
  const code = sessionCode || document.getElementById('input-code')?.value?.trim().toUpperCase();
  if (!code) { toast('Kein Session-Code', 'error'); return; }

  sessionCode = code;
  sessionRef = db.ref('sessions/' + sessionCode);

  sessionRef.once('value', snap => {
    if (!snap.exists()) {
      toast('Session nicht gefunden. Bitte Code prüfen.', 'error');
      return;
    }

    // Register participant
    const participantRef = sessionRef.child('participants/' + myId);
    participantRef.set({ id: myId, name: myName, joinedAt: Date.now() });
    participantRef.onDisconnect().remove();

    watchSessionPhase();
  });
});

// ─── PARTICIPANT: Watch Phase ──────────────────────────────────────────────
function watchSessionPhase() {
  sessionRef.child('phase').on('value', snap => {
    const phase = snap.val();
    if (phase === 'lobby') showParticipantLobby();
    else if (phase === 'input') showParticipantInput();
    else if (phase === 'voting') showParticipantVoting();
    else if (phase === 'results') showParticipantResults();
  });
}

function showParticipantLobby() {
  showScreen('screen-participant-lobby');
  document.getElementById('p-name-display').textContent = myName;

  sessionRef.child('participants').on('value', snap => {
    const participants = snap.val() || {};
    const count = Object.keys(participants).length;
    document.getElementById('p-participant-count').textContent = count + ' Teilnehmer verbunden';
  });
}

function showParticipantInput() {
  showScreen('screen-participant-input');
}

document.getElementById('btn-submit-answer').addEventListener('click', () => {
  const answer = document.getElementById('input-answer').value.trim();
  if (!answer) { toast('Bitte schreib etwas über dich!', 'error'); return; }
  if (answer.length > 120) { toast('Maximal 120 Zeichen', 'error'); return; }

  sessionRef.child('answers/' + myId).set({ text: answer, authorId: myId });
  document.getElementById('btn-submit-answer').disabled = true;
  document.getElementById('input-answer').disabled = true;
  showScreen('screen-participant-answer-sent');
});

async function showParticipantVoting() {
  showScreen('screen-participant-voting');

  const [answersSnap, participantsSnap] = await Promise.all([
    sessionRef.child('answers').once('value'),
    sessionRef.child('participants').once('value')
  ]);

  const answers = answersSnap.val() || {};
  const participants = participantsSnap.val() || {};

  const nameList = Object.entries(participants)
    .filter(([id]) => id !== myId)
    .map(([id, p]) => ({ id, name: p.name }));

  renderVotingCards(answers, nameList);
}

let myVotes = {}; // answerId → guessedParticipantId

function renderVotingCards(answers, nameList) {
  const container = document.getElementById('voting-cards');
  container.innerHTML = '';

  // Only show other people's answers (not your own)
  const otherAnswers = Object.entries(answers).filter(([id]) => id !== myId);

  otherAnswers.forEach(([authorId, answer], i) => {
    const card = document.createElement('div');
    card.className = 'voting-card';
    card.style.animationDelay = (i * 0.08) + 's';

    const nameOptions = nameList.map(p =>
      `<button class="name-btn" data-answer="${authorId}" data-guess="${p.id}">${p.name}</button>`
    ).join('');

    card.innerHTML = `
      <div class="voting-answer-text">"${answer.text}"</div>
      <div class="voting-question">Wer hat das geschrieben?</div>
      <div class="name-options">${nameOptions}</div>
    `;
    container.appendChild(card);
  });

  // Name button click
  container.querySelectorAll('.name-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const answerId = btn.dataset.answer;
      const guessId = btn.dataset.guess;

      // Deselect others for same answer
      container.querySelectorAll(`.name-btn[data-answer="${answerId}"]`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      myVotes[answerId] = guessId;
      checkAllVoted(otherAnswers.length);
    });
  });
}

function checkAllVoted(total) {
  const votedCount = Object.keys(myVotes).length;
  const submitBtn = document.getElementById('btn-submit-votes');
  submitBtn.disabled = votedCount < total;
  submitBtn.textContent = votedCount < total
    ? `Noch ${total - votedCount} offen…`
    : 'Abstimmung abschicken ✓';
}

document.getElementById('btn-submit-votes').addEventListener('click', () => {
  sessionRef.child('votes/' + myId).set(myVotes);
  document.getElementById('btn-submit-votes').disabled = true;
  showScreen('screen-participant-voted');
});

function showParticipantResults() {
  showScreen('screen-participant-results');
}

// ─── Misc ──────────────────────────────────────────────────────────────────
document.getElementById('btn-copy-link')?.addEventListener('click', () => {
  const url = document.getElementById('join-url').textContent;
  navigator.clipboard.writeText(url).then(() => toast('Link kopiert!', 'success'));
});
