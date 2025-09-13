/* FASTWRITE script.js
   - Proper space/backspace behaviour
   - No full replace on space; only append when near the end
   - Highlight letters; mismatch => whole word red until fixed
   - Modal results, retry, restart
*/

(() => {
  // word pools
  const EN = "the be to of and a in that have I it for not on with he as you do at this but his by from they we say her she or an will my one all would there their fast write type code keyboard practice speed".split(" ");
  const UZ = "salom dunyo kitob maktab tez sekin hayot dost ota ona o'qituvchi yozish mashq tezlik sinov o'yin".split(" ");
  const PUNCT = [".",",",";","!","?","-"];
  const POOL = EN.concat(UZ);

  // DOM
  const wordsArea = document.getElementById('wordsArea');
  const timeSelect = document.getElementById('timeSelect');
  const customTime = document.getElementById('customTime');
  const restartBtn = document.getElementById('restartBtn');
  const retryBtn = document.getElementById('retryBtn');
  const themeBtn = document.getElementById('themeBtn');

  const timeDisplay = document.getElementById('timeDisplay');
  const wpmDisplay = document.getElementById('wpm');
  const accDisplay = document.getElementById('acc');
  const typedLettersEl = document.getElementById('typedLetters');
  const correctWordsEl = document.getElementById('correctWords');
  const incorrectWordsEl = document.getElementById('incorrectWords');
  const totalWordsEl = document.getElementById('totalWords');

  // modal
  const modalWrap = document.getElementById('resultModal');
  const modalClose = document.getElementById('modalClose');
  const modalRetry = document.getElementById('modalRetry');
  const resTime = document.getElementById('resTime');
  const resWpm = document.getElementById('resWpm');
  const resAcc = document.getElementById('resAcc');
  const resCorrect = document.getElementById('resCorrect');
  const resIncorrect = document.getElementById('resIncorrect');
  const resTyped = document.getElementById('resTyped');

  // state
  let state = {
    words: [],
    typedBuffers: [],
    submitted: [],   // boolean per word: whether user pressed space to submit
    index: 0,
    started: false,
    startAt: null,
    timerId: null,
    duration: 60,
    typedLettersTotal: 0
  };

  // utils
  function randWord() {
    if (Math.random() < 0.06) return PUNCT[Math.floor(Math.random()*PUNCT.length)];
    return POOL[Math.floor(Math.random()*POOL.length)];
  }

  function makeWords(count = 80) {
    const out = [];
    for (let i=0;i<count;i++) out.push(randWord());
    return out;
  }

  function initSession(count=80) {
    clearInterval(state.timerId);
    state.words = makeWords(count);
    state.typedBuffers = new Array(state.words.length).fill('');
    state.submitted = new Array(state.words.length).fill(false);
    state.index = 0;
    state.started = false;
    state.startAt = null;
    state.typedLettersTotal = 0;
    // read duration
    const val = timeSelect.value;
    if (val === 'custom') {
      state.duration = Number(customTime.value) || 30;
    } else if (val === 'infinite') {
      state.duration = Infinity;
    } else state.duration = Number(val);
    timeDisplay.textContent = (state.duration===Infinity)?'∞':state.duration;
    renderAllWords();
    updateStatsUI();
    hideModal();
    // focus so keys register
    wordsArea.focus();
  }

  function renderAllWords() {
    wordsArea.innerHTML = '';
    for (let i=0;i<state.words.length;i++){
      const w = state.words[i];
      const span = document.createElement('span');
      span.className = 'word' + (i===state.index ? ' active' : '');
      span.dataset.index = i;
      span.dataset.word = w;
      // create letter spans
      for (let j=0;j<w.length;j++){
        const l = document.createElement('span');
        l.className = 'letter';
        l.textContent = w[j];
        span.appendChild(l);
      }
      wordsArea.appendChild(span);
      // space node
      wordsArea.appendChild(document.createTextNode(' '));
    }
    totalWordsEl.textContent = state.words.length;
    // smooth fade-in animation
    wordsArea.style.opacity = '0';
    requestAnimationFrame(()=> { wordsArea.style.opacity='1'; });
    scrollActiveIntoView(true);
  }

  function scrollActiveIntoView(center=false) {
    const active = wordsArea.querySelector('.word.active');
    if (!active) return;
    const wrapH = wordsArea.clientHeight;
    const top = active.offsetTop;
    // if near bottom of container, scroll down smoothly
    const desired = Math.max(0, top - wrapH/3);
    wordsArea.scrollTo({top: desired, behavior: 'smooth'});
  }

  // update active word display (letters highlight)
  function updateActiveWordDisplay(idx) {
    const span = wordsArea.querySelector(`.word[data-index="${idx}"]`);
    if (!span) return;
    const expected = state.words[idx];
    const typed = state.typedBuffers[idx] || '';
    const letters = span.querySelectorAll('.letter');

    // find first mismatch in prefix
    let mismatch = -1;
    for (let i=0;i<typed.length && i<expected.length;i++){
      if (typed[i] !== expected[i]) { mismatch = i; break; }
    }
    if (typed.length > expected.length && mismatch===-1) mismatch = expected.length;

    // if mismatch exists -> whole word letters show red (as requested)
    const isMismatch = mismatch !== -1;

    for (let i=0;i<letters.length;i++){
      letters[i].classList.remove('correct','wrong','neutral');
      letters[i].style.color = '';
      if (i < typed.length) {
        if (!isMismatch && typed[i] === expected[i]) {
          letters[i].classList.add('correct');
          letters[i].style.color = 'var(--good)';
        } else {
          letters[i].classList.add('wrong');
          letters[i].style.color = 'var(--bad)';
        }
      } else {
        letters[i].classList.add('neutral');
      }
    }

    // set word class
    span.classList.remove('correct','incorrect');
    if (state.submitted[idx]) {
      // submitted word: mark final state
      if (typed === expected) span.classList.add('correct'); else span.classList.add('incorrect');
    } else {
      // in-progress: if mismatch exists, mark incorrect class visually
      if (isMismatch && typed.length>0) span.classList.add('incorrect'); else span.classList.remove('incorrect');
    }
  }

  // update all words display partially for performance (current + neighboring)
  function updateDisplays() {
    // update current
    updateActiveWordDisplay(state.index);
    // update previous submitted for color (if any)
    for (let i=0;i<state.index;i++){
      const span = wordsArea.querySelector(`.word[data-index="${i}"]`);
      if (!span) continue;
      if (state.submitted[i]){
        span.classList.remove('active');
        const typed = state.typedBuffers[i] || '';
        if (typed === state.words[i]) span.classList.add('correct'); else span.classList.add('incorrect');
      }
    }
    // small stats update
    updateStatsUI();
  }

  function updateStatsUI() {
    // compute letters correctness over all typed buffers (submitted + in-progress)
    let typedLetters=0, correctLetters=0, wrongLetters=0;
    let correctWords=0, incorrectWords=0;
    for (let i=0;i<state.words.length;i++){
      const expected = state.words[i];
      const typed = state.typedBuffers[i] || '';
      if (typed.length === 0 && !state.submitted[i]) continue;
      typedLetters += typed.length;
      // letter-level
      for (let j=0;j<Math.min(typed.length, expected.length); j++){
        if (typed[j] === expected[j]) correctLetters++; else wrongLetters++;
      }
      if (typed.length > expected.length) wrongLetters += (typed.length - expected.length);
      // word correctness if submitted exactly equals expected
      if (state.submitted[i]) {
        if (typed === expected) correctWords++; else incorrectWords++;
      } else {
        // not submitted yet -> don't count in correct/incorrectWords (but user asked maybe to include partial? we'll count only submitted words)
      }
    }

    const elapsed = state.started ? (Date.now() - state.startAt)/1000 : 0;
    const minutes = Math.max(elapsed/60, 1/60); // avoid division by zero
    const wpm = Math.round((correctLetters/5)/minutes) || 0;
    const accuracy = (correctLetters + wrongLetters) === 0 ? 100 : Math.round((correctLetters / (correctLetters + wrongLetters)) * 100);

    timeDisplay.textContent = (state.duration===Infinity) ? '∞' : Math.max(0, Math.ceil(state.duration - elapsed));
    wpmDisplay.textContent = wpm;
    accDisplay.textContent = accuracy + '%';
    typedLettersEl.textContent = typedLetters;
    correctWordsEl.textContent = correctWords;
    incorrectWordsEl.textContent = incorrectWords;
    totalWordsEl.textContent = state.words.length;
  }

  // keyboard handling
  function onKey(e) {
    // ignore combos
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // ensure focus
    wordsArea.focus();

    if (!state.started) {
      state.started = true;
      state.startAt = Date.now();
      startTimer();
    }

    const idx = state.index;
    const expected = state.words[idx];
    if (expected === undefined) return;
    const key = e.key;

    if (key === ' ') {
      e.preventDefault();
      // submit current
      state.submitted[idx] = true;
      // do not auto-replace entire set; only append more words if we're near the end
      if (state.index < state.words.length - 1) {
        state.index++;
      } else {
        // if at very end, append (but keep previous ones)
        const more = makeWords(40);
        state.words = state.words.concat(more);
        state.typedBuffers = state.typedBuffers.concat(new Array(more.length).fill(''));
        state.submitted = state.submitted.concat(new Array(more.length).fill(false));
        state.index++;
        // re-render appended words
        renderAllWords();
      }
      updateActiveClass();
      updateDisplays();
      // If user has reached near end of viewport, scroll
      scrollActiveIntoView();
      return;
    }

    if (key === 'Enter') {
      e.preventDefault();
      // scroll view down a bit (simulate new line)
      wordsArea.scrollBy({ top: 80, left: 0, behavior: 'smooth' });
      return;
    }

    if (key === 'Backspace') {
      e.preventDefault();
      let buf = state.typedBuffers[idx] || '';
      if (buf.length > 0) {
        // remove last char
        buf = buf.slice(0, -1);
        state.typedBuffers[idx] = buf;
        updateDisplays();
      } else {
        // go to previous word (if exists)
        if (state.index > 0) {
          state.index--;
          updateActiveClass();
          updateDisplays();
          scrollActiveIntoView();
        }
      }
      return;
    }

    if (key.length === 1) {
      // printable char
      const buf = (state.typedBuffers[idx] || '') + key;
      state.typedBuffers[idx] = buf;
      updateDisplays();
      return;
    }
    // ignore other keys
  }

  function updateActiveClass() {
    const prev = wordsArea.querySelector('.word.active');
    if (prev) prev.classList.remove('active');
    const cur = wordsArea.querySelector(`.word[data-index="${state.index}"]`);
    if (cur) cur.classList.add('active');
  }

  // Timer functions
  function startTimer() {
    clearInterval(state.timerId);
    if (state.duration === Infinity) return;
    state.timerId = setInterval(()=>{
      const elapsed = Math.floor((Date.now() - state.startAt)/1000);
      const remaining = Math.max(0, state.duration - elapsed);
      timeDisplay.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(state.timerId);
        endSession();
      }
    }, 250);
  }

  function endSession() {
    // finalize stats and show modal
    updateStatsUI();
    // fill modal
    const elapsedSec = Math.floor((Date.now() - state.startAt)/1000);
    resTime.textContent = (state.duration===Infinity) ? `${elapsedSec}s (∞)` : `${state.duration}s`;
    resWpm.textContent = wpmDisplay.textContent;
    resAcc.textContent = accDisplay.textContent;
    resCorrect.textContent = correctWordsEl.textContent;
    resIncorrect.textContent = incorrectWordsEl.textContent;
    resTyped.textContent = typedLettersEl.textContent;
    showModal();
  }

  function showModal(){
    modalWrap.classList.remove('modalHidden');
    modalWrap.classList.add('modalVisible');
    modalWrap.setAttribute('aria-hidden','false');
  }
  function hideModal(){
    modalWrap.classList.remove('modalVisible');
    modalWrap.classList.add('modalHidden');
    modalWrap.setAttribute('aria-hidden','true');
  }

  // event bindings
  document.addEventListener('keydown', onKey);
  restartBtn.addEventListener('click', ()=> initSession(80));
  retryBtn.addEventListener('click', ()=> {
    // retry with same word list and reset counters
    clearInterval(state.timerId);
    state.typedBuffers = new Array(state.words.length).fill('');
    state.submitted = new Array(state.words.length).fill(false);
    state.index = 0; state.started = false; state.startAt = null;
    updateActiveClass(); renderAllWords(); updateStatsUI();
  });
  themeBtn.addEventListener('click', ()=> document.body.classList.toggle('light'));
  modalClose.addEventListener('click', ()=> hideModal());
  modalRetry.addEventListener('click', ()=> {
    hideModal();
    initSession(80);
  });

  timeSelect.addEventListener('change', ()=>{
    if (timeSelect.value === 'custom') {
      customTime.style.display = 'inline-block';
    } else {
      customTime.style.display = 'none';
      // reset session when switching time
      initSession(80);
    }
  });
  customTime.addEventListener('change', ()=>{
    if (Number(customTime.value) > 0) initSession(80);
  });

  // initial
  initSession(80);
})();
