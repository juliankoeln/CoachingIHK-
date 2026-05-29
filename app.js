// app.js – CoachBoard v2

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
let sessionCode  = null;
let sessionRef   = null;
let myName       = null;
let myId         = null;
let isModerator  = false;
let isDisplay    = false;   // ?display=1 → Beamer-Ansicht
let phaseListener = null;   // keep reference to detach/re-attach cleanly
let answersListener = null;
let votesListener   = null;

// ─── DISPLAY MODE (?display=1&code=XXXXX) ──────────────────────────────────
isDisplay = getUrlParam('display') === '1';
if (isDisplay) {
  sessionCode = getUrlParam('code');
  sessionRef  = db.ref('sessions/' + sessionCode);
  document.body.classList.add('display-mode');
  showScreen('screen-display');
  watchDisplayPhase();
}

function watchDisplayPhase() {
  sessionRef.on('value', snap => {
    const session = snap.val();
    if (!session) return;
    const phase = session.phase;

    // Willkommensscreen
    if (phase === 'welcome') {
      showDisplayWelcome(session.welcome || {});
    } else if (phase === 'lobby') {
      showDisplayLobby(session);
    } else if (phase === 'input') {
      showDisplayInput(session);
    } else if (phase === 'voting') {
      showDisplayVoting(session);
    } else if (phase === 'results') {
      showDisplayResults(session);
    }
  });
}

function setDisplayContent(html) {
  document.getElementById('display-content').innerHTML = html;
}

function showDisplayWelcome(w) {
  setDisplayContent(`
    <div class="display-welcome">
      <div class="display-welcome-emoji">${w.emoji || '✦'}</div>
      <div class="display-welcome-title">${w.title || 'Willkommen'}</div>
      <div class="display-welcome-sub">${w.subtitle || ''}</div>
    </div>
  `);
}

function showDisplayLobby(session) {
  const participants = session.participants || {};
  const chips = Object.values(participants)
    .map(p => `<div class="display-chip"><span class="chip-dot"></span>${p.name}</div>`)
    .join('');
  const code = session.code;
  const joinUrl = window.location.origin + window.location.pathname + '?join=' + code;

  // Build QR in display
  setDisplayContent(`
    <div class="display-lobby">
      <div class="display-lobby-left">
        <div class="display-label">Session beitreten</div>
        <div id="display-qr"></div>
        <div class="display-code">${code}</div>
      </div>
      <div class="display-lobby-right">
        <div class="display-label">Verbunden</div>
        <div class="display-chips" id="display-chips">${chips || '<span style="color:var(--muted)">Warten…</span>'}</div>
        <div class="display-count">${Object.keys(participants).length} Teilnehmer</div>
      </div>
    </div>
  `);

  // Render QR
  setTimeout(() => {
    const el = document.getElementById('display-qr');
    if (el && el.children.length === 0) {
      new QRCode(el, { text: joinUrl, width: 180, height: 180, colorDark: '#0f0e17', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.M });
    }
  }, 100);
}

function showDisplayInput(session) {
  const answers = session.answers || {};
  const participants = session.participants || {};
  const total = Object.keys(participants).length;
  const count = Object.keys(answers).length;
  setDisplayContent(`
    <div class="display-centered">
      <div class="display-big-emoji">🤔</div>
      <div class="display-big-title">Nobody is Perfect</div>
      <div class="display-big-sub">Schreib eine überraschende Wahrheit über dich</div>
      <div class="display-progress-pill">${count} von ${total} eingegangen</div>
    </div>
  `);
}

function showDisplayVoting(session) {
  const votes = session.votes || {};
  const participants = session.participants || {};
  const total = Object.keys(participants).length;
  const voted = Object.keys(votes).length;
  setDisplayContent(`
    <div class="display-centered">
      <div class="display-big-emoji">🗳️</div>
      <div class="display-big-title">Wer hat was geschrieben?</div>
      <div class="display-big-sub">Tippe auf eurem Handy den Namen der Person</div>
      <div class="display-progress-pill">${voted} von ${total} haben abgestimmt</div>
    </div>
  `);
}

async function showDisplayResults(session) {
  const answers = session.answers || {};
  const votes   = session.votes   || {};
  const participants = session.participants || {};

  const nameMap = {};
  Object.entries(participants).forEach(([id, p]) => nameMap[id] = p.name);

  const items = Object.entries(answers).map(([authorId, answer]) => {
    const correctGuessers = [];
    const wrongGuessers   = [];
    Object.entries(votes).forEach(([voterId, voterVotes]) => {
      const guessedId = voterVotes[authorId];
      if (!guessedId) return;
      if (guessedId === authorId) correctGuessers.push(nameMap[voterId] || '?');
      else wrongGuessers.push({ voter: nameMap[voterId] || '?', guessed: nameMap[guessedId] || '?' });
    });
    return { authorName: nameMap[authorId] || '?', text: answer.text, correctGuessers, wrongGuessers };
  });

  const cards = items.map((item, i) => {
    const guessed = item.correctGuessers.length;
    const total   = Object.keys(votes).length;
    const emoji   = guessed === 0 ? '🕵️' : guessed === total ? '😅' : '🎯';
    return `
      <div class="display-result-card" style="animation-delay:${i*0.12}s">
        <div class="display-result-text">"${item.text}"</div>
        <div class="display-result-author">${emoji} <strong>${item.authorName}</strong>
          <span class="display-result-score">${guessed} von ${total} erraten</span></div>
        ${item.correctGuessers.length ? `<div class="display-result-correct">✓ ${item.correctGuessers.join(', ')}</div>` : ''}
        ${item.wrongGuessers.length   ? `<div class="display-result-wrong">✗ ${item.wrongGuessers.map(w=>`${w.voter} → ${w.guessed}`).join(', ')}</div>` : ''}
      </div>
    `;
  }).join('');

  setDisplayContent(`
    <div class="display-results">
      <div class="display-results-title">🎉 Auflösung</div>
      <div class="display-results-grid">${cards}</div>
    </div>
  `);
}

// ─── MODERATOR: Create Session ─────────────────────────────────────────────
if (!isDisplay) {
  const btnCreate = document.getElementById('btn-create-session');
  if (btnCreate) {
    btnCreate.addEventListener('click', () => {
      sessionCode = randomCode();
      isModerator = true;
      sessionRef  = db.ref('sessions/' + sessionCode);

      sessionRef.set({
        code: sessionCode,
        createdAt: Date.now(),
        phase: 'welcome',
        welcome: { emoji: '✦', title: 'Willkommen', subtitle: '' },
        participants: {},
        answers: {},
        votes: {}
      });

      setTimeout(() => sessionRef.remove(), 8 * 60 * 60 * 1000);
      showModeratorWelcomeEdit();
    });
  }
}

// ─── MODERATOR: Welcome Screen Editor ─────────────────────────────────────
function showModeratorWelcomeEdit() {
  showScreen('screen-mod-welcome-edit');

  // Display-Link anzeigen
  const displayUrl = window.location.origin + window.location.pathname + '?display=1&code=' + sessionCode;
  document.getElementById('display-url').textContent = displayUrl;

  document.getElementById('btn-copy-display-link').onclick = () => {
    navigator.clipboard.writeText(displayUrl).then(() => toast('Beamer-Link kopiert!', 'success'));
  };

  // Live-Preview beim Tippen
  ['welcome-title', 'welcome-subtitle', 'welcome-emoji'].forEach(id => {
    document.getElementById(id).addEventListener('input', saveWelcomePreview);
  });

  document.getElementById('btn-save-welcome').addEventListener('click', () => {
    saveWelcomePreview();
    sessionRef.child('phase').set('welcome');
    toast('Willkommensscreen aktiv!', 'success');
  });

  document.getElementById('btn-go-lobby').addEventListener('click', () => {
    saveWelcomePreview();
    sessionRef.child('phase').set('lobby');
    showModeratorLobby();
  });
}

function saveWelcomePreview() {
  const title    = document.getElementById('welcome-title').value.trim()    || 'Willkommen';
  const subtitle = document.getElementById('welcome-subtitle').value.trim() || '';
  const emoji    = document.getElementById('welcome-emoji').value.trim()    || '✦';
  sessionRef.child('welcome').set({ title, subtitle, emoji });
}

// ─── MODERATOR: Lobby ─────────────────────────────────────────────────────
function showModeratorLobby() {
  showScreen('screen-mod-lobby');

  const joinUrl = window.location.origin + window.location.pathname + '?join=' + sessionCode;
  document.getElementById('join-url').textContent = joinUrl;

  const qrContainer = document.getElementById('qr-code');
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: joinUrl, width: 200, height: 200,
    colorDark: '#0f0e17', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });

  document.getElementById('session-code-display').textContent = sessionCode;

  sessionRef.child('participants').on('value', snap => {
    const participants = snap.val() || {};
    renderParticipantList(participants);
    const count = Object.keys(participants).length;
    document.getElementById('participant-count').textContent = count;
    document.getElementById('btn-start-icebreaker').disabled = count < 2;
  });

  document.getElementById('btn-start-icebreaker').onclick = () => {
    // Clean up previous round data before starting
    sessionRef.update({ answers: null, votes: null }).then(() => {
      sessionRef.child('phase').set('input');
      showScreen('screen-mod-waiting');
      watchAnswers();
    });
  };
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

// ─── MODERATOR: Waiting for answers ───────────────────────────────────────
function watchAnswers() {
  if (answersListener) sessionRef.child('answers').off('value', answersListener);
  answersListener = sessionRef.child('answers').on('value', snap => {
    const answers = snap.val() || {};
    const answerCount = Object.keys(answers).length;
    sessionRef.child('participants').once('value', pSnap => {
      const total = Object.keys(pSnap.val() || {}).length;
      document.getElementById('answer-progress').textContent = `${answerCount} von ${total} Antworten eingegangen`;
      document.getElementById('btn-start-voting').disabled = answerCount < 2;
    });
  });

  document.getElementById('btn-start-voting').onclick = () => {
    sessionRef.child('phase').set('voting');
    showScreen('screen-mod-voting');
    watchVotingProgress();
  };
}

// ─── MODERATOR: Voting progress ───────────────────────────────────────────
function watchVotingProgress() {
  if (votesListener) sessionRef.child('votes').off('value', votesListener);
  votesListener = sessionRef.child('votes').on('value', vSnap => {
    const votes = vSnap.val() || {};
    sessionRef.child('participants').once('value', pSnap => {
      const total = Object.keys(pSnap.val() || {}).length;
      const voted = Object.keys(votes).length;
      document.getElementById('voting-progress').textContent = `${voted} von ${total} haben abgestimmt`;
      document.getElementById('btn-show-results').disabled = voted < 1;
    });
  });

  document.getElementById('btn-show-results').onclick = () => {
    sessionRef.child('phase').set('results');
    showModResults();
  };
}

// ─── MODERATOR: Results ───────────────────────────────────────────────────
async function showModResults() {
  showScreen('screen-mod-results');

  const [answersSnap, votesSnap, participantsSnap] = await Promise.all([
    sessionRef.child('answers').once('value'),
    sessionRef.child('votes').once('value'),
    sessionRef.child('participants').once('value')
  ]);

  const answers      = answersSnap.val()      || {};
  const votes        = votesSnap.val()        || {};
  const participants = participantsSnap.val() || {};
  const nameMap      = {};
  Object.entries(participants).forEach(([id, p]) => nameMap[id] = p.name);

  const items = Object.entries(answers).map(([authorId, answer]) => {
    const correctGuessers = [], wrongGuessers = [];
    Object.entries(votes).forEach(([voterId, voterVotes]) => {
      const guessedId = voterVotes[authorId];
      if (!guessedId) return;
      if (guessedId === authorId) correctGuessers.push(nameMap[voterId] || '?');
      else wrongGuessers.push({ voter: nameMap[voterId] || '?', guessed: nameMap[guessedId] || '?' });
    });
    return { authorId, authorName: nameMap[authorId] || '?', answer: answer.text, correctGuessers, wrongGuessers };
  });

  renderModResults(items, votes);
}

function renderModResults(items, votes) {
  const container = document.getElementById('results-container');
  container.innerHTML = '';
  items.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = (i * 0.1) + 's';
    const guessed = item.correctGuessers.length;
    const total   = Object.keys(votes).length;
    const emoji   = guessed === 0 ? '🕵️' : guessed === total ? '😅' : '🎯';
    card.innerHTML = `
      <div class="result-answer">"${item.answer}"</div>
      <div class="result-reveal">${emoji} <strong>${item.authorName}</strong>
        <span class="result-score">${guessed} von ${total} erraten</span></div>
      ${item.correctGuessers.length ? `<div class="result-guessers correct">✓ Richtig: ${item.correctGuessers.join(', ')}</div>` : ''}
      ${item.wrongGuessers.length   ? `<div class="result-guessers wrong">✗ Dachten es wäre: ${item.wrongGuessers.map(w=>`${w.voter} → ${w.guessed}`).join(', ')}</div>` : ''}
    `;
    container.appendChild(card);
  });

  document.getElementById('btn-new-round').onclick = () => {
    // Reset only game data, keep participants
    sessionRef.update({ answers: null, votes: null }).then(() => {
      sessionRef.child('phase').set('lobby');
      showModeratorLobby();
      toast('Neue Runde gestartet!', 'success');
    });
  };
}

// ─── PARTICIPANT: Join ─────────────────────────────────────────────────────
if (!isDisplay) {
  const joinCode = getUrlParam('join');
  if (joinCode) {
    isModerator = false;
    // joinCode might be the full URL if old QR, extract just the code part
    sessionCode = joinCode.length <= 8 ? joinCode.toUpperCase() : joinCode.split('/').pop().toUpperCase();
    showScreen('screen-join');
    document.getElementById('session-code-join').textContent = sessionCode;
  } else if (!isModerator) {
    showScreen('screen-home');
  }

  const btnJoin = document.getElementById('btn-join');
  if (btnJoin) {
    btnJoin.addEventListener('click', () => {
      const name = document.getElementById('input-name').value.trim();
      if (!name) { toast('Bitte gib deinen Namen ein', 'error'); return; }

      myName = name;
      myId   = Date.now().toString(36) + Math.random().toString(36).substr(2);
      sessionRef = db.ref('sessions/' + sessionCode);

      sessionRef.once('value', snap => {
        if (!snap.exists()) { toast('Session nicht gefunden!', 'error'); return; }

        const participantRef = sessionRef.child('participants/' + myId);
        participantRef.set({ id: myId, name: myName, joinedAt: Date.now() });
        participantRef.onDisconnect().remove();

        watchSessionPhase();
      });
    });
  }
}

// ─── PARTICIPANT: Watch Phase ──────────────────────────────────────────────
function watchSessionPhase() {
  if (phaseListener) sessionRef.child('phase').off('value', phaseListener);

  phaseListener = sessionRef.child('phase').on('value', snap => {
    const phase = snap.val();
    if      (phase === 'welcome') showParticipantLobby();  // show waiting during welcome
    else if (phase === 'lobby')   showParticipantLobby();
    else if (phase === 'input')   showParticipantInput();
    else if (phase === 'voting')  showParticipantVoting();
    else if (phase === 'results') showParticipantResults();
  });
}

function showParticipantLobby() {
  showScreen('screen-participant-lobby');
  document.getElementById('p-name-display').textContent = myName;
  sessionRef.child('participants').on('value', snap => {
    const count = Object.keys(snap.val() || {}).length;
    document.getElementById('p-participant-count').textContent = count + ' Teilnehmer verbunden';
  });
}

function showParticipantInput() {
  // Reset input UI for new round
  const textarea = document.getElementById('input-answer');
  const btn      = document.getElementById('btn-submit-answer');
  textarea.value    = '';
  textarea.disabled = false;
  btn.disabled      = false;
  btn.textContent   = 'Abschicken ✓';
  myVotes = {};
  showScreen('screen-participant-input');
}

const btnSubmitAnswer = document.getElementById('btn-submit-answer');
if (btnSubmitAnswer) {
  btnSubmitAnswer.addEventListener('click', () => {
    const answer = document.getElementById('input-answer').value.trim();
    if (!answer) { toast('Bitte schreib etwas!', 'error'); return; }
    if (answer.length > 120) { toast('Maximal 120 Zeichen', 'error'); return; }

    sessionRef.child('answers/' + myId).set({ text: answer, authorId: myId });
    btnSubmitAnswer.disabled = true;
    document.getElementById('input-answer').disabled = true;
    showScreen('screen-participant-answer-sent');
  });
}

async function showParticipantVoting() {
  showScreen('screen-participant-voting');
  myVotes = {}; // reset for new round

  const [answersSnap, participantsSnap] = await Promise.all([
    sessionRef.child('answers').once('value'),
    sessionRef.child('participants').once('value')
  ]);

  const answers      = answersSnap.val()      || {};
  const participants = participantsSnap.val() || {};
  const nameList     = Object.entries(participants)
    .filter(([id]) => id !== myId)
    .map(([id, p]) => ({ id, name: p.name }));

  renderVotingCards(answers, nameList);
}

let myVotes = {};

function renderVotingCards(answers, nameList) {
  const container    = document.getElementById('voting-cards');
  container.innerHTML = '';
  myVotes = {};

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

  container.querySelectorAll('.name-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const answerId = btn.dataset.answer;
      container.querySelectorAll(`.name-btn[data-answer="${answerId}"]`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      myVotes[answerId] = btn.dataset.guess;
      checkAllVoted(otherAnswers.length);
    });
  });

  const submitBtn = document.getElementById('btn-submit-votes');
  submitBtn.disabled    = true;
  submitBtn.textContent = `Noch ${otherAnswers.length} offen…`;
  submitBtn.onclick = () => {
    sessionRef.child('votes/' + myId).set(myVotes);
    submitBtn.disabled = true;
    showScreen('screen-participant-voted');
  };
}

function checkAllVoted(total) {
  const votedCount = Object.keys(myVotes).length;
  const submitBtn  = document.getElementById('btn-submit-votes');
  submitBtn.disabled    = votedCount < total;
  submitBtn.textContent = votedCount < total
    ? `Noch ${total - votedCount} offen…`
    : 'Abstimmung abschicken ✓';
}

function showParticipantResults() {
  showScreen('screen-participant-results');
}

// ─── Misc ──────────────────────────────────────────────────────────────────
const btnCopyLink = document.getElementById('btn-copy-link');
if (btnCopyLink) {
  btnCopyLink.addEventListener('click', () => {
    const url = document.getElementById('join-url').textContent;
    navigator.clipboard.writeText(url).then(() => toast('Link kopiert!', 'success'));
  });
}
