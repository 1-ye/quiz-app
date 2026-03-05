/* ============================================
   QUIZ APP - Core Application Logic
   ============================================ */

// ===== STATE MANAGEMENT =====
const STATE_KEY = 'quizAppState';
let state = loadState();

function defaultState() {
    return {
        answered: {},       // { questionId: { selected: 'A'|'AB'|..., correct: bool } }
        wrong: [],          // [questionId, ...]
        favorites: [],      // [questionId, ...]
        dailyStats: {},     // { '2025-01-01': { done: 10, correct: 8 } }
        lastPosition: 0,    // last practice index
        streak: 0           // consecutive correct
    };
}

function loadState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (raw) return { ...defaultState(), ...JSON.parse(raw) };
    } catch (e) { }
    return defaultState();
}

function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

// ===== PRACTICE STATE =====
let practiceQuestions = [];  // current question set
let practiceIndex = 0;      // current index in set
let practiceMode = '';       // 'sequential', 'random', 'wrong', 'favorites', 'search', 'exam-review'
let selectedOptions = new Set();
let isAnswered = false;
let highlightedOptionIndex = -1;  // for arrow key navigation
let lastInteractionWasTouch = false;  // track if last interaction was touch

// Track actual touch vs mouse interactions
document.addEventListener('touchstart', () => { lastInteractionWasTouch = true; }, { passive: true });
document.addEventListener('mousedown', () => { lastInteractionWasTouch = false; });

// ===== EXAM STATE =====
let examQuestions = [];
let examIndex = 0;
let examAnswers = {};  // { index: Set<option> }
let examTimer = null;
let examTimeLeft = 0;
let examStartTime = 0;
let examConfig = { count: 50, time: 60, type: 'all' };

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSearchbar();
    initExamConfig();
    initResetButton();
    updateDashboard();
});

// ===== NAVIGATION =====
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            showPage(page);
        });
    });

    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
    document.getElementById('sidebarClose').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
    });
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageName).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
    if (navItem) navItem.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');

    if (pageName === 'dashboard') updateDashboard();
    else if (pageName === 'wrong') renderWrongList();
    else if (pageName === 'favorites') renderFavList();
    else if (pageName === 'stats') renderStats();
    else if (pageName === 'exam') resetExamView();
}

// ===== DASHBOARD =====
function updateDashboard() {
    const total = QUESTIONS.length;
    const doneCount = Object.keys(state.answered).length;
    const correctCount = Object.values(state.answered).filter(a => a.correct).length;
    const wrongCount = state.wrong.length;
    const favCount = state.favorites.length;
    const accuracy = doneCount > 0 ? Math.round((correctCount / doneCount) * 100) : 0;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statDone').textContent = `已做 ${doneCount} 题`;
    document.getElementById('statAccuracy').textContent = accuracy + '%';
    document.getElementById('statCorrectCount').textContent = `答对 ${correctCount} 题`;
    document.getElementById('statWrongCount').textContent = wrongCount;
    document.getElementById('statFavCount').textContent = favCount;

    const progress = Math.round((doneCount / total) * 100);
    document.getElementById('progressBar').style.width = progress + '%';
    document.getElementById('progressText').textContent = progress + '%';

    // Category counts
    const types = ['single', 'multi', 'judge'];
    types.forEach(t => {
        const typeQs = QUESTIONS.filter(q => q.type === t);
        const typeDone = typeQs.filter(q => state.answered[q.id]).length;
        const el = document.getElementById('cat' + t.charAt(0).toUpperCase() + t.slice(1) + 'Done');
        if (el) el.textContent = typeDone;
    });

    document.getElementById('streakBadge').textContent = '🔥 ' + state.streak;
}

// ===== PRACTICE MODE =====
function startPractice(type, mode = 'sequential') {
    let qs = [...QUESTIONS];
    if (type !== 'all') {
        qs = qs.filter(q => q.type === type);
    }
    if (mode === 'random') {
        shuffleArray(qs);
    }
    practiceQuestions = qs;
    practiceIndex = 0;
    practiceMode = mode === 'random' ? 'random' : 'sequential';

    const typeNames = { 'all': '全部题目', 'single': '单项选择题', 'multi': '多项选择题', 'judge': '判断题' };
    document.getElementById('practiceType').textContent = (typeNames[type] || '练习') + (mode === 'random' ? ' · 随机' : '');

    showPage('practice');
    renderPracticeQuestion();
}

function continuePractice() {
    practiceQuestions = [...QUESTIONS];
    practiceIndex = state.lastPosition || 0;
    practiceMode = 'sequential';
    document.getElementById('practiceType').textContent = '继续刷题';
    showPage('practice');
    renderPracticeQuestion();
}

function startWrongPractice() {
    if (state.wrong.length === 0) {
        showPage('wrong');
        return;
    }
    const qs = state.wrong.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean);
    shuffleArray(qs);
    practiceQuestions = qs;
    practiceIndex = 0;
    practiceMode = 'wrong';
    document.getElementById('practiceType').textContent = '错题重练';
    showPage('practice');
    renderPracticeQuestion();
}

function startFavPractice() {
    if (state.favorites.length === 0) return;
    const qs = state.favorites.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean);
    practiceQuestions = qs;
    practiceIndex = 0;
    practiceMode = 'favorites';
    document.getElementById('practiceType').textContent = '收藏练习';
    showPage('practice');
    renderPracticeQuestion();
}

function renderPracticeQuestion() {
    if (practiceQuestions.length === 0) return;
    const q = practiceQuestions[practiceIndex];
    selectedOptions = new Set();
    isAnswered = !!state.answered[q.id];
    highlightedOptionIndex = -1;

    document.getElementById('practiceProgress').textContent =
        `${practiceIndex + 1} / ${practiceQuestions.length}`;

    const typeLabels = { single: '单选题', multi: '多选题', judge: '判断题' };
    document.getElementById('qTypeBadge').textContent = typeLabels[q.type] || q.type;
    document.getElementById('qText').textContent = q.question;

    // Render options
    const optList = document.getElementById('optionsList');
    optList.innerHTML = '';
    q.options.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'option-item';
        div.dataset.key = opt.key;
        div.innerHTML = `
            <span class="option-key">${opt.key}</span>
            <span class="option-text">${opt.text}</span>
        `;
        div.addEventListener('click', () => selectOption(opt.key, q));
        optList.appendChild(div);
    });

    // If already answered, show result
    if (isAnswered) {
        const record = state.answered[q.id];
        selectedOptions = new Set(record.selected.split(''));
        showResult(q, record.correct);
    }

    // Result section
    document.getElementById('qResult').style.display = isAnswered ? 'block' : 'none';

    // Fav button
    updateFavButton(q.id);

    // Nav buttons
    document.getElementById('btnPrev').disabled = practiceIndex === 0;
    document.getElementById('btnSubmit').style.display = isAnswered ? 'none' : 'block';

    // Save position
    if (practiceMode === 'sequential' && practiceMode !== 'wrong') {
        state.lastPosition = practiceIndex;
        saveState();
    }
}

function selectOption(key, q, fromTouch = false) {
    if (isAnswered) return;

    if (q.type === 'multi') {
        if (selectedOptions.has(key)) {
            selectedOptions.delete(key);
        } else {
            selectedOptions.add(key);
        }
    } else {
        selectedOptions.clear();
        selectedOptions.add(key);
    }

    // Update highlighted index
    const q2 = practiceQuestions[practiceIndex];
    if (q2) {
        highlightedOptionIndex = q2.options.findIndex(o => o.key === key);
    }

    // Update UI
    document.querySelectorAll('#optionsList .option-item').forEach(el => {
        el.classList.toggle('selected', selectedOptions.has(el.dataset.key));
    });
    updateHighlightUI();

    // Auto-submit for single-choice/judge on actual touch interactions only
    if (lastInteractionWasTouch && q.type !== 'multi' && selectedOptions.size > 0) {
        setTimeout(() => submitAnswer(), 150);
    }
}

function submitAnswer() {
    if (selectedOptions.size === 0 || isAnswered) return;

    const q = practiceQuestions[practiceIndex];
    const selected = Array.from(selectedOptions).sort().join('');
    const correctAnswer = q.answer.split('').sort().join('');
    const isCorrect = selected === correctAnswer;

    // Record answer
    state.answered[q.id] = { selected, correct: isCorrect };

    // Update wrong list
    if (!isCorrect) {
        if (!state.wrong.includes(q.id)) state.wrong.push(q.id);
        state.streak = 0;
    } else {
        state.wrong = state.wrong.filter(id => id !== q.id);
        state.streak++;
    }

    // Daily stats
    const today = new Date().toISOString().slice(0, 10);
    if (!state.dailyStats[today]) state.dailyStats[today] = { done: 0, correct: 0 };
    state.dailyStats[today].done++;
    if (isCorrect) state.dailyStats[today].correct++;

    saveState();
    isAnswered = true;

    showResult(q, isCorrect);
    document.getElementById('btnSubmit').style.display = 'none';
    document.getElementById('streakBadge').textContent = '🔥 ' + state.streak;

    // Auto-advance to next question if correct
    if (isCorrect && practiceIndex < practiceQuestions.length - 1) {
        setTimeout(() => {
            // Only advance if still on the same question (user might have manually navigated)
            if (isAnswered && practiceQuestions[practiceIndex]?.id === q.id) {
                nextQuestion();
            }
        }, 1000);
    }
}

function showResult(q, isCorrect) {
    const resultDiv = document.getElementById('qResult');
    resultDiv.style.display = 'block';

    document.getElementById('resultIcon').textContent = isCorrect ? '✅' : '❌';
    document.getElementById('resultText').textContent = isCorrect ? '回答正确！' : '回答错误';
    document.getElementById('resultAnswer').textContent = '正确答案：' + q.answer;
    document.getElementById('resultAnalysis').textContent = q.analysis ? '解析：' + q.analysis : '';
    document.getElementById('resultAnalysis').style.display = q.analysis ? 'block' : 'none';

    // Highlight options
    const answerKeys = new Set(q.answer.split(''));
    document.querySelectorAll('#optionsList .option-item').forEach(el => {
        const key = el.dataset.key;
        el.classList.remove('selected');
        if (answerKeys.has(key)) {
            el.classList.add('correct');
        } else if (selectedOptions.has(key)) {
            el.classList.add('wrong');
        }
    });
}

function prevQuestion() {
    if (practiceIndex > 0) {
        practiceIndex--;
        renderPracticeQuestion();
    }
}

function nextQuestion() {
    if (practiceIndex < practiceQuestions.length - 1) {
        practiceIndex++;
        renderPracticeQuestion();
    }
}

// ===== ANSWER CARD =====
function showAnswerCard() {
    const grid = document.getElementById('answerCardGrid');
    grid.innerHTML = '';
    practiceQuestions.forEach((q, i) => {
        const div = document.createElement('div');
        div.className = 'ac-item';
        div.textContent = i + 1;
        if (i === practiceIndex) div.classList.add('ac-current');
        else if (state.answered[q.id]) {
            div.classList.add(state.answered[q.id].correct ? 'ac-correct' : 'ac-wrong');
        }
        div.addEventListener('click', () => {
            practiceIndex = i;
            renderPracticeQuestion();
            closeModal('answerCardModal');
        });
        grid.appendChild(div);
    });
    document.getElementById('answerCardModal').style.display = 'flex';
}

function showExamCard() {
    const grid = document.getElementById('answerCardGrid');
    grid.innerHTML = '';
    examQuestions.forEach((q, i) => {
        const div = document.createElement('div');
        div.className = 'ac-item';
        div.textContent = i + 1;
        if (i === examIndex) div.classList.add('ac-current');
        else if (examAnswers[i] && examAnswers[i].size > 0) div.classList.add('ac-answered');
        div.addEventListener('click', () => {
            examIndex = i;
            renderExamQuestion();
            closeModal('answerCardModal');
        });
        grid.appendChild(div);
    });
    document.getElementById('answerCardModal').style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// Click outside to close
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
    }
});

// ===== FAVORITES =====
function toggleFavorite() {
    const q = practiceQuestions[practiceIndex];
    if (!q) return;
    const idx = state.favorites.indexOf(q.id);
    if (idx >= 0) {
        state.favorites.splice(idx, 1);
    } else {
        state.favorites.push(q.id);
    }
    saveState();
    updateFavButton(q.id);
}

function updateFavButton(qId) {
    const btn = document.getElementById('btnFav');
    const isFav = state.favorites.includes(qId);
    btn.textContent = isFav ? '★' : '☆';
    btn.classList.toggle('favorited', isFav);
}

// ===== WRONG LIST =====
function renderWrongList() {
    const list = document.getElementById('wrongList');
    document.getElementById('wrongCount').textContent = state.wrong.length + ' 题';

    if (state.wrong.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-text">暂无错题，继续保持！</div></div>';
        return;
    }

    list.innerHTML = '';
    state.wrong.forEach(id => {
        const q = QUESTIONS.find(qq => qq.id === id);
        if (!q) return;
        list.appendChild(createListItem(q, () => jumpToQuestion(q)));
    });
}

function clearWrong() {
    if (confirm('确定清空错题本？')) {
        state.wrong = [];
        saveState();
        renderWrongList();
    }
}

// ===== FAVORITES LIST =====
function renderFavList() {
    const list = document.getElementById('favList');
    document.getElementById('favCount').textContent = state.favorites.length + ' 题';

    if (state.favorites.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-text">暂无收藏题目</div></div>';
        return;
    }

    list.innerHTML = '';
    state.favorites.forEach(id => {
        const q = QUESTIONS.find(qq => qq.id === id);
        if (!q) return;
        list.appendChild(createListItem(q, () => jumpToQuestion(q)));
    });
}

function createListItem(q, onClick) {
    const div = document.createElement('div');
    div.className = 'q-list-item';
    div.innerHTML = `
        <span class="q-list-id">${q.id}</span>
        <div class="q-list-content">
            <div class="q-list-text">${q.question}</div>
            <div class="q-list-meta">
                <span class="q-list-tag ${q.type}">${q.typeName}</span>
            </div>
        </div>
    `;
    div.addEventListener('click', onClick);
    return div;
}

function jumpToQuestion(q) {
    practiceQuestions = [q];
    practiceIndex = 0;
    practiceMode = 'single-view';
    document.getElementById('practiceType').textContent = '查看题目';
    showPage('practice');
    renderPracticeQuestion();
}

// ===== SEARCH =====
function initSearchbar() {
    const input = document.getElementById('searchInput');
    const btn = document.getElementById('searchBtn');
    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

function doSearch() {
    const keyword = document.getElementById('searchInput').value.trim();
    if (!keyword) return;

    const results = QUESTIONS.filter(q =>
        q.question.includes(keyword) ||
        q.options.some(o => o.text.includes(keyword))
    );

    document.getElementById('searchCount').textContent = results.length + ' 条结果';
    const list = document.getElementById('searchList');
    list.innerHTML = '';

    if (results.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">未找到匹配的题目</div></div>';
    } else {
        results.slice(0, 100).forEach(q => {
            list.appendChild(createListItem(q, () => {
                // Start practice with search results
                practiceQuestions = results;
                practiceIndex = results.indexOf(q);
                practiceMode = 'search';
                document.getElementById('practiceType').textContent = '搜索结果';
                showPage('practice');
                renderPracticeQuestion();
            }));
        });
    }

    showPage('search');
}

// ===== EXAM MODE =====
function initExamConfig() {
    document.querySelectorAll('.config-options').forEach(group => {
        group.querySelectorAll('.config-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.config-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });
}

function resetExamView() {
    document.getElementById('examSetup').style.display = 'block';
    document.getElementById('examProgress').style.display = 'none';
    document.getElementById('examResult').style.display = 'none';
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
}

function startExam() {
    // Read config
    const countBtn = document.querySelector('.config-btn.active[data-count]');
    const timeBtn = document.querySelector('.config-btn.active[data-time]');
    const typeBtn = document.querySelector('.config-btn.active[data-etype]');
    examConfig.count = parseInt(countBtn?.dataset.count || 50);
    examConfig.time = parseInt(timeBtn?.dataset.time || 60);
    examConfig.type = typeBtn?.dataset.etype || 'all';

    // Build exam questions
    let pool = [...QUESTIONS];
    if (examConfig.type !== 'all') pool = pool.filter(q => q.type === examConfig.type);
    shuffleArray(pool);
    examQuestions = pool.slice(0, examConfig.count);
    examIndex = 0;
    examAnswers = {};
    examStartTime = Date.now();

    // Timer
    examTimeLeft = examConfig.time * 60;
    updateTimerDisplay();
    if (examTimer) clearInterval(examTimer);
    examTimer = setInterval(() => {
        examTimeLeft--;
        updateTimerDisplay();
        if (examTimeLeft <= 0) {
            clearInterval(examTimer);
            finishExam();
        }
    }, 1000);

    // Show exam
    document.getElementById('examSetup').style.display = 'none';
    document.getElementById('examProgress').style.display = 'block';
    document.getElementById('examResult').style.display = 'none';
    renderExamQuestion();
}

function updateTimerDisplay() {
    const m = Math.floor(examTimeLeft / 60);
    const s = examTimeLeft % 60;
    const display = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    document.getElementById('examTimer').textContent = display;
    if (examTimeLeft < 60) {
        document.getElementById('examTimer').style.color = 'var(--red)';
    } else {
        document.getElementById('examTimer').style.color = 'var(--yellow)';
    }
}

function renderExamQuestion() {
    const q = examQuestions[examIndex];
    document.getElementById('examCount').textContent = `${examIndex + 1}/${examQuestions.length}`;

    const typeLabels = { single: '单选题', multi: '多选题', judge: '判断题' };
    document.getElementById('examQTypeBadge').textContent = typeLabels[q.type] || q.type;
    document.getElementById('examQText').textContent = q.question;

    const optList = document.getElementById('examOptionsList');
    optList.innerHTML = '';

    const currentAns = examAnswers[examIndex] || new Set();

    q.options.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'option-item' + (currentAns.has(opt.key) ? ' selected' : '');
        div.dataset.key = opt.key;
        div.innerHTML = `
            <span class="option-key">${opt.key}</span>
            <span class="option-text">${opt.text}</span>
        `;
        div.addEventListener('click', () => {
            if (!examAnswers[examIndex]) examAnswers[examIndex] = new Set();
            if (q.type === 'multi') {
                if (examAnswers[examIndex].has(opt.key)) {
                    examAnswers[examIndex].delete(opt.key);
                } else {
                    examAnswers[examIndex].add(opt.key);
                }
            } else {
                examAnswers[examIndex] = new Set([opt.key]);
            }
            // Update UI
            optList.querySelectorAll('.option-item').forEach(el => {
                el.classList.toggle('selected', examAnswers[examIndex].has(el.dataset.key));
            });
        });
        optList.appendChild(div);
    });
}

function examPrev() {
    if (examIndex > 0) { examIndex--; renderExamQuestion(); }
}
function examNext() {
    if (examIndex < examQuestions.length - 1) { examIndex++; renderExamQuestion(); }
}

function finishExam() {
    if (!confirm('确定交卷？')) return;
    if (examTimer) { clearInterval(examTimer); examTimer = null; }

    let correct = 0, wrong = 0, skipped = 0;
    const usedTime = Math.round((Date.now() - examStartTime) / 1000);

    examQuestions.forEach((q, i) => {
        const ans = examAnswers[i];
        if (!ans || ans.size === 0) {
            skipped++;
            return;
        }
        const selected = Array.from(ans).sort().join('');
        const correctAns = q.answer.split('').sort().join('');
        if (selected === correctAns) {
            correct++;
            // Also record in global state
            state.answered[q.id] = { selected, correct: true };
            state.wrong = state.wrong.filter(id => id !== q.id);
        } else {
            wrong++;
            state.answered[q.id] = { selected, correct: false };
            if (!state.wrong.includes(q.id)) state.wrong.push(q.id);
        }

        // Daily stats
        const today = new Date().toISOString().slice(0, 10);
        if (!state.dailyStats[today]) state.dailyStats[today] = { done: 0, correct: 0 };
        state.dailyStats[today].done++;
        if (selected === correctAns) state.dailyStats[today].correct++;
    });

    saveState();

    // Show result
    const totalQ = examQuestions.length;
    const score = Math.round((correct / totalQ) * 100);
    document.getElementById('examProgress').style.display = 'none';
    document.getElementById('examResult').style.display = 'block';

    document.getElementById('scoreValue').textContent = score;
    document.getElementById('examTotalQ').textContent = totalQ;
    document.getElementById('examCorrectQ').textContent = correct;
    document.getElementById('examWrongQ').textContent = wrong;
    document.getElementById('examSkipQ').textContent = skipped;

    const mins = Math.floor(usedTime / 60);
    const secs = usedTime % 60;
    document.getElementById('examUsedTime').textContent = `${mins}分${secs}秒`;

    // Animate score circle
    const circle = document.getElementById('scoreCircle');
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (score / 100) * circumference;
    // Add gradient to SVG
    const svg = circle.closest('svg');
    if (!svg.querySelector('defs')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.id = 'scoreGradient';
        const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#6366f1');
        const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#06b6d4');
        grad.appendChild(s1); grad.appendChild(s2);
        defs.appendChild(grad);
        svg.insertBefore(defs, svg.firstChild);
    }
    circle.style.stroke = 'url(#scoreGradient)';
    requestAnimationFrame(() => {
        circle.style.strokeDashoffset = offset;
    });
}

function reviewExam() {
    // Show exam questions in practice mode with answers revealed
    practiceQuestions = [...examQuestions];
    practiceIndex = 0;
    practiceMode = 'exam-review';
    document.getElementById('practiceType').textContent = '考试回顾';
    showPage('practice');
    renderPracticeQuestion();
}

function retakeExam() {
    resetExamView();
}

// ===== STATS =====
function renderStats() {
    renderTypeAccuracyChart();
    renderDailyChart();
    renderStatsTable();
}

function renderTypeAccuracyChart() {
    const chart = document.getElementById('typeAccuracyChart');
    chart.innerHTML = '';

    const types = [
        { key: 'single', label: '单选题', color: 'linear-gradient(180deg, #6366f1, #818cf8)' },
        { key: 'multi', label: '多选题', color: 'linear-gradient(180deg, #06b6d4, #22d3ee)' },
        { key: 'judge', label: '判断题', color: 'linear-gradient(180deg, #f59e0b, #fbbf24)' }
    ];

    types.forEach(t => {
        const typeQs = QUESTIONS.filter(q => q.type === t.key);
        const answered = typeQs.filter(q => state.answered[q.id]);
        const correct = answered.filter(q => state.answered[q.id].correct);
        const accuracy = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0;

        const wrapper = document.createElement('div');
        wrapper.className = 'bar-wrapper';
        wrapper.innerHTML = `
            <span class="bar-value">${accuracy}%</span>
            <div class="bar" style="height: ${Math.max(accuracy, 4)}px; background: ${t.color}"></div>
            <span class="bar-label">${t.label}</span>
        `;
        chart.appendChild(wrapper);
    });
}

function renderDailyChart() {
    const chart = document.getElementById('dailyChart');
    chart.innerHTML = '';

    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }

    const maxDone = Math.max(...days.map(d => (state.dailyStats[d]?.done || 0)), 1);

    days.forEach(day => {
        const data = state.dailyStats[day] || { done: 0, correct: 0 };
        const height = Math.max((data.done / maxDone) * 120, 4);
        const label = day.slice(5); // MM-DD

        const wrapper = document.createElement('div');
        wrapper.className = 'bar-wrapper';
        wrapper.innerHTML = `
            <span class="bar-value">${data.done}</span>
            <div class="bar" style="height: ${height}px; background: linear-gradient(180deg, #6366f1, #06b6d4)"></div>
            <span class="bar-label">${label}</span>
        `;
        chart.appendChild(wrapper);
    });
}

function renderStatsTable() {
    const tbody = document.getElementById('statsTableBody');
    tbody.innerHTML = '';

    const types = [
        { key: 'single', label: '单选题' },
        { key: 'multi', label: '多选题' },
        { key: 'judge', label: '判断题' }
    ];

    let totalAll = 0, doneAll = 0, correctAll = 0;

    types.forEach(t => {
        const typeQs = QUESTIONS.filter(q => q.type === t.key);
        const answered = typeQs.filter(q => state.answered[q.id]);
        const correct = answered.filter(q => state.answered[q.id].correct);
        const accuracy = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) + '%' : '-';

        totalAll += typeQs.length;
        doneAll += answered.length;
        correctAll += correct.length;

        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${t.label}</td><td>${typeQs.length}</td><td>${answered.length}</td><td>${correct.length}</td><td>${accuracy}</td>`;
        tbody.appendChild(tr);
    });

    const accAll = doneAll > 0 ? Math.round((correctAll / doneAll) * 100) + '%' : '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>合计</strong></td><td><strong>${totalAll}</strong></td><td><strong>${doneAll}</strong></td><td><strong>${correctAll}</strong></td><td><strong>${accAll}</strong></td>`;
    tbody.appendChild(tr);
}

// ===== RESET =====
function initResetButton() {
    document.getElementById('btnResetAll').addEventListener('click', () => {
        if (confirm('确定重置所有学习数据？此操作不可恢复！')) {
            state = defaultState();
            saveState();
            updateDashboard();
            showPage('dashboard');
        }
    });
}

// ===== UTILITIES =====
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;

    // Ignore if typing in search input
    if (document.activeElement?.tagName === 'INPUT') return;

    if (activePage.id === 'page-practice') {
        const q = practiceQuestions[practiceIndex];
        if (!q) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevQuestion();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextQuestion();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isAnswered) {
                highlightedOptionIndex = Math.min(highlightedOptionIndex + 1, q.options.length - 1);
                // Select the highlighted option
                const opt = q.options[highlightedOptionIndex];
                if (opt) selectOptionByKey(opt.key);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isAnswered) {
                highlightedOptionIndex = Math.max(highlightedOptionIndex - 1, 0);
                // Select the highlighted option
                const opt = q.options[highlightedOptionIndex];
                if (opt) selectOptionByKey(opt.key);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (!isAnswered) submitAnswer();
            else nextQuestion();
        } else if (['a', 'A', '1'].includes(e.key)) {
            selectOptionByKey('A');
        } else if (['b', 'B', '2'].includes(e.key)) {
            selectOptionByKey('B');
        } else if (['c', 'C', '3'].includes(e.key)) {
            selectOptionByKey('C');
        } else if (['d', 'D', '4'].includes(e.key)) {
            selectOptionByKey('D');
        }
    } else if (activePage.id === 'page-exam' && document.getElementById('examProgress').style.display !== 'none') {
        if (e.key === 'ArrowLeft') examPrev();
        else if (e.key === 'ArrowRight') examNext();
    }
});

function selectOptionByKey(key) {
    if (isAnswered) return;
    const q = practiceQuestions[practiceIndex];
    if (!q) return;
    if (!q.options.find(o => o.key === key)) return;
    selectOption(key, q);
}

// Update highlight visual for arrow-key selected option
function updateHighlightUI() {
    document.querySelectorAll('#optionsList .option-item').forEach((el, i) => {
        el.classList.toggle('highlighted', i === highlightedOptionIndex);
    });
}

// ===== SWIPE GESTURE SUPPORT =====
(function initSwipeGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let isSwiping = false;
    const SWIPE_THRESHOLD = 50;  // minimum px to trigger swipe
    const SWIPE_MAX_Y = 80;     // max vertical movement allowed

    function getSwipeTarget() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return null;
        if (activePage.id === 'page-practice') return 'practice';
        if (activePage.id === 'page-exam' && document.getElementById('examProgress').style.display !== 'none') return 'exam';
        return null;
    }

    function getQuestionCard(target) {
        if (target === 'practice') return document.getElementById('questionCard');
        if (target === 'exam') return document.getElementById('examQuestionCard');
        return null;
    }

    document.addEventListener('touchstart', (e) => {
        const target = getSwipeTarget();
        if (!target) return;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        isSwiping = true;

        const card = getQuestionCard(target);
        if (card) {
            card.style.transition = 'none';
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        const target = getSwipeTarget();
        if (!target) return;

        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = Math.abs(touchEndY - touchStartY);

        // Only apply visual feedback if horizontal swipe
        if (diffY < SWIPE_MAX_Y) {
            const card = getQuestionCard(target);
            if (card) {
                const translateX = Math.max(-100, Math.min(100, diffX * 0.3));
                const opacity = 1 - Math.abs(translateX) / 300;
                card.style.transform = `translateX(${translateX}px)`;
                card.style.opacity = opacity;
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;

        const target = getSwipeTarget();
        if (!target) return;

        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = Math.abs(touchEndY - touchStartY);

        const card = getQuestionCard(target);

        // Reset card transform with animation
        if (card) {
            card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            card.style.transform = '';
            card.style.opacity = '';
        }

        // Check if it's a valid horizontal swipe
        if (Math.abs(diffX) > SWIPE_THRESHOLD && diffY < SWIPE_MAX_Y) {
            if (diffX < 0) {
                // Swipe left → next question
                if (target === 'practice') {
                    // Add slide-out-left animation
                    if (card) {
                        card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                        card.style.transform = 'translateX(-60px)';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            nextQuestion();
                            card.style.transition = 'none';
                            card.style.transform = 'translateX(60px)';
                            card.style.opacity = '0';
                            requestAnimationFrame(() => {
                                card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                                card.style.transform = '';
                                card.style.opacity = '';
                            });
                        }, 200);
                    } else {
                        nextQuestion();
                    }
                } else if (target === 'exam') {
                    if (card) {
                        card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                        card.style.transform = 'translateX(-60px)';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            examNext();
                            card.style.transition = 'none';
                            card.style.transform = 'translateX(60px)';
                            card.style.opacity = '0';
                            requestAnimationFrame(() => {
                                card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                                card.style.transform = '';
                                card.style.opacity = '';
                            });
                        }, 200);
                    } else {
                        examNext();
                    }
                }
            } else {
                // Swipe right → previous question
                if (target === 'practice') {
                    if (card) {
                        card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                        card.style.transform = 'translateX(60px)';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            prevQuestion();
                            card.style.transition = 'none';
                            card.style.transform = 'translateX(-60px)';
                            card.style.opacity = '0';
                            requestAnimationFrame(() => {
                                card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                                card.style.transform = '';
                                card.style.opacity = '';
                            });
                        }, 200);
                    } else {
                        prevQuestion();
                    }
                } else if (target === 'exam') {
                    if (card) {
                        card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                        card.style.transform = 'translateX(60px)';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            examPrev();
                            card.style.transition = 'none';
                            card.style.transform = 'translateX(-60px)';
                            card.style.opacity = '0';
                            requestAnimationFrame(() => {
                                card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                                card.style.transform = '';
                                card.style.opacity = '';
                            });
                        }, 200);
                    } else {
                        examPrev();
                    }
                }
            }
        }
    }, { passive: true });
})();
