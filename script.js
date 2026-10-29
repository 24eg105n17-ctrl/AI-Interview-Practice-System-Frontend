const STORAGE_KEYS = {
    user: 'prepwise.user',
    profile: 'prepwise.profile',
    history: 'prepwise.history',
    interview: 'prepwise.currentInterview',
    result: 'prepwise.lastResult'
};
const TOPICS = ['Java', 'Python', 'SQL', 'React', 'Spring Boot', 'JavaScript', 'HTML/CSS', 'Data Structures'];
const QUESTION_TOTAL = 10;
const API_BASE_URL = 'https://ai-interview-practice-system-backend-12.onrender.com';

function readStorage(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        console.error(`Unable to read saved Prepwise data (${key}).`, error);
        return fallback;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`Unable to save Prepwise data (${key}).`, error);
        return false;
    }
}

function currentUser() {
    return readStorage(STORAGE_KEYS.user, null);
}

function historyItems() {
    const history = readStorage(STORAGE_KEYS.history, []);
    return Array.isArray(history) ? history : [];
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function showMessage(element, message) {
    if (element) element.textContent = message;
}

async function apiRequest(url, options = {}) {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${url}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
    } catch {
        throw new Error('The app could not reach the server. Check that it is running, then try again.');
    }

    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new Error('The server returned an unexpected response. Please try again.');
    }
    if (!response.ok) {
        const knownMessage = typeof payload.message === 'string' ? payload.message : '';
        if (response.status === 401) throw new Error('Email or password is incorrect. Please try again.');
        if (response.status === 409) throw new Error('An account with this email already exists. Please sign in instead.');
        if (response.status === 400 && knownMessage) throw new Error(knownMessage);
        if (response.status === 400) throw new Error('Please check the information you entered and try again.');
        throw new Error('Something went wrong on the server. Please try again in a moment.');
    }
    return payload;
}

function requireLogin() {
    if (!currentUser()) window.location.replace('/index.html');
}

function setupAuthentication() {
    const loginForm = document.querySelector('#login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async event => {
            event.preventDefault();
            const message = document.querySelector('#form-message');
            const submit = loginForm.querySelector('button[type="submit"]');
            const form = new FormData(loginForm);
            showMessage(message, '');
            submit.disabled = true;
            try {
                const result = await apiRequest('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
                });
                const savedProfile = readStorage(STORAGE_KEYS.profile, null);
                const user = {
                    fullName: savedProfile?.email?.toLowerCase() === String(form.get('email')).trim().toLowerCase()
                        ? savedProfile.fullName : result.fullName,
                    email: String(form.get('email')).trim().toLowerCase()
                };
                if (!writeStorage(STORAGE_KEYS.user, user)) {
                    throw new Error('This browser could not save your sign-in. Please check your storage settings.');
                }
                window.location.assign('/dashboard.html');
            } catch (error) {
                showMessage(message, error.message);
                submit.disabled = false;
            }
        });
    }

    const registerForm = document.querySelector('#register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async event => {
            event.preventDefault();
            const message = document.querySelector('#form-message');
            const submit = registerForm.querySelector('button[type="submit"]');
            const form = new FormData(registerForm);
            const fullName = String(form.get('fullName')).trim();
            const email = String(form.get('email')).trim().toLowerCase();
            const password = String(form.get('password'));
            const confirmPassword = String(form.get('confirmPassword'));
            showMessage(message, '');
            if (!fullName || !email || !password || !confirmPassword) {
                showMessage(message, 'Please fill in every field.');
                return;
            }
            if (password.length < 8) {
                showMessage(message, 'Choose a password with at least 8 characters.');
                return;
            }
            if (password !== confirmPassword) {
                showMessage(message, 'Those passwords do not match. Please check them and try again.');
                return;
            }
            submit.disabled = true;
            try {
                await apiRequest('/api/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ fullName, email, password, confirmPassword })
                });
                const profile = { fullName, email };
                if (!writeStorage(STORAGE_KEYS.profile, profile)) {
                    throw new Error('Your account was created, but this browser could not save your profile. Please check storage settings.');
                }
                showMessage(message, 'Account created. Taking you to sign in…');
                message.classList.add('success-message');
                window.setTimeout(() => window.location.assign('/index.html'), 800);
            } catch (error) {
                showMessage(message, error.message);
                submit.disabled = false;
            }
        });
    }
}

function setUpShell() {
    const user = currentUser();
    if (!user) return;
    const initials = user.fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
    document.querySelectorAll('[data-avatar]').forEach(element => {
        element.textContent = initials[0];
        element.setAttribute('aria-label', `${user.fullName} profile`);
    });
    const sidebarUser = document.querySelector('#sidebar-user');
    if (sidebarUser) {
        sidebarUser.innerHTML = `<span class="user-avatar">${escapeHtml(initials[0])}</span><span><strong>${escapeHtml(user.fullName)}</strong><small>${escapeHtml(user.email)}</small></span>`;
    }
    const today = document.querySelector('[data-today]');
    if (today) today.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
    document.querySelectorAll('[data-action="logout"]').forEach(button => {
        button.addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEYS.user);
            sessionStorage.removeItem(STORAGE_KEYS.interview);
            window.location.assign('/index.html');
        });
    });
}

function getStatistics(history = historyItems()) {
    const sessions = history.filter(item => item && Number.isFinite(Number(item.averageScore)));
    const scores = sessions.map(item => Number(item.averageScore));
    const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
    const best = scores.length ? Math.max(...scores) : null;
    const questions = sessions.reduce((sum, item) => sum + (Number(item.questionsAnswered) || 0), 0);
    const topics = new Set(sessions.map(item => item.topic)).size;
    return { sessions, scores, average, best, questions, topics };
}

function showStatistics() {
    const stats = getStatistics();
    const values = {
        interviews: stats.sessions.length,
        average: stats.average === null ? '—' : stats.average.toFixed(1),
        questions: stats.questions,
        best: stats.best === null ? '—' : stats.best.toFixed(1),
        topics: stats.topics
    };
    Object.entries(values).forEach(([key, value]) => {
        document.querySelectorAll(`[data-stat="${key}"]`).forEach(element => {
            element.textContent = String(value);
        });
    });
}

function displayDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Date unavailable'
        : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function performanceLabel(score) {
    if (score >= 9) return 'Excellent';
    if (score >= 7) return 'Very Good';
    if (score >= 5) return 'Average';
    return 'Needs Improvement';
}

function renderInterviewRows(interviews, withDate = true) {
    if (!interviews.length) {
        return '<div class="empty-state"><strong>Your story is just beginning.</strong>When you finish an interview, you’ll find it saved here.<br><a class="text-link" href="/dashboard.html#topics">Choose your first topic →</a></div>';
    }
    const headings = withDate
        ? '<th>Date</th><th>Topic</th><th>Score</th><th>Questions</th><th>Performance</th>'
        : '<th>Topic</th><th>Score</th><th>Questions</th><th>Performance</th>';
    const rows = interviews.map(item => {
        const score = Number(item.averageScore) || 0;
        return `<tr>${withDate ? `<td>${escapeHtml(displayDate(item.date))}</td>` : ''}<td class="topic-cell">${escapeHtml(item.topic)}</td><td><span class="score-pill">${score.toFixed(1)} / 10</span></td><td>${Number(item.questionsAnswered) || 0}</td><td>${escapeHtml(performanceLabel(score))}</td></tr>`;
    }).join('');
    return `<table class="data-table"><thead><tr>${headings}</tr></thead><tbody>${rows}</tbody></table>`;
}

function initDashboard() {
    showStatistics();
    const container = document.querySelector('#recent-interviews');
    if (container) container.innerHTML = renderInterviewRows(historyItems().slice(0, 4), false);
}

function initHistory() {
    const container = document.querySelector('#history-table');
    if (container) container.innerHTML = renderInterviewRows(historyItems());
}

function initProfile() {
    const user = currentUser();
    const profile = readStorage(STORAGE_KEYS.profile, null);
    const fullName = user?.fullName || profile?.fullName || 'Your name';
    const email = user?.email || profile?.email || 'you@example.com';
    ['#profile-name', '#profile-name-detail'].forEach(selector => {
        const element = document.querySelector(selector);
        if (element) element.textContent = fullName;
    });
    ['#profile-email', '#profile-email-detail'].forEach(selector => {
        const element = document.querySelector(selector);
        if (element) element.textContent = email;
    });
    const avatar = document.querySelector('#profile-avatar');
    if (avatar) avatar.textContent = fullName.trim()[0]?.toUpperCase() || '?';
}

function initProgress() {
    const chart = document.querySelector('#score-chart');
    const list = document.querySelector('#topic-progress-list');
    const history = historyItems();
    if (chart) {
        chart.innerHTML = history.length
            ? history.slice(-10).map((item, index) => {
                const score = Math.max(0, Math.min(10, Number(item.averageScore) || 0));
                return `<div class="chart-column" title="${escapeHtml(item.topic)}: ${score.toFixed(1)} out of 10"><div class="chart-bar-wrap"><div class="chart-bar" style="height:${Math.max(4, score * 10)}%"></div></div><span>${index + 1}</span></div>`;
            }).join('')
            : '<div class="chart-empty">Your scores will appear here after your first interview.</div>';
    }
    if (list) {
        const counts = new Map();
        history.forEach(item => counts.set(item.topic, (counts.get(item.topic) || 0) + 1));
        list.innerHTML = counts.size
            ? [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([topic, count]) => {
                const width = Math.max(6, Math.round(count / history.length * 100));
                return `<div class="topic-progress-row"><strong>${escapeHtml(topic)}</strong><div class="topic-progress-track"><span style="width:${width}%"></span></div><small>${count} ${count === 1 ? 'session' : 'sessions'}</small></div>`;
            }).join('')
            : '<div class="empty-state">Your practiced topics will show here after your first interview.</div>';
    }
    const improvement = document.querySelector('#improvement-value');
    const copy = document.querySelector('#improvement-copy');
    if (improvement && copy) {
        if (history.length >= 2) {
            const change = Number(history[history.length - 1].averageScore) - Number(history[0].averageScore);
            improvement.textContent = `${change > 0 ? '+' : ''}${change.toFixed(1)}`;
            copy.textContent = change > 0
                ? 'Your latest session is up from your first one. Keep building on that momentum.'
                : change < 0
                    ? 'Scores can shift from session to session. Keep practicing and focus on what you learned.'
                    : 'Your first and latest session are level. Keep practicing to build on your foundation.';
        } else if (history.length === 1) {
            improvement.textContent = '—';
            copy.textContent = 'Complete another interview to compare sessions and see your improvement.';
        }
    }
}

function loadInterviewState() {
    try {
        const value = sessionStorage.getItem(STORAGE_KEYS.interview);
        return value ? JSON.parse(value) : null;
    } catch (error) {
        console.error('Unable to restore the current practice session.', error);
        return null;
    }
}

function saveInterviewState(state) {
    try {
        sessionStorage.setItem(STORAGE_KEYS.interview, JSON.stringify(state));
        return true;
    } catch (error) {
        console.error('Unable to save the current practice session.', error);
        return false;
    }
}

function setSessionMode(mode) {
    const element = document.querySelector('#session-mode');
    if (element) element.textContent = mode || 'Demo/Fallback AI mode';
}

function updateQuestionProgress(state) {
    const number = state.currentIndex + 1;
    const counter = document.querySelector('#question-count');
    const progress = document.querySelector('#question-progress');
    const question = document.querySelector('#question-text');
    if (counter) counter.textContent = `Question ${number} of ${QUESTION_TOTAL}`;
    if (progress) progress.style.width = `${number / QUESTION_TOTAL * 100}%`;
    if (question) question.textContent = state.questions[state.currentIndex] || 'Your next question is being prepared.';
}

function renderFeedback(evaluation) {
    document.querySelector('#answer-score').textContent = String(evaluation.score);
    document.querySelector('#feedback-strengths').textContent = evaluation.strengths;
    document.querySelector('#feedback-weaknesses').textContent = evaluation.weaknesses;
    document.querySelector('#feedback-suggestions').textContent = evaluation.suggestions;
    document.querySelector('#feedback-model').textContent = evaluation.modelAnswer;
    document.querySelector('#feedback-panel').classList.remove('hidden');
    document.querySelector('#submit-answer').classList.add('hidden');
    document.querySelector('#answer').readOnly = true;
    const next = document.querySelector('#next-question');
    next.innerHTML = stateHasNextQuestion() ? 'Next question <span aria-hidden="true">→</span>' : 'See your results <span aria-hidden="true">→</span>';
}

function stateHasNextQuestion() {
    const state = loadInterviewState();
    return state && state.currentIndex < QUESTION_TOTAL - 1;
}

async function fetchQuestion(state) {
    const query = new URLSearchParams({ topic: state.topic, difficulty: state.difficulty });
    state.questions.forEach(question => query.append('askedQuestions', question));
    const response = await apiRequest(`/api/interview/question?${query.toString()}`, { method: 'GET', headers: {} });
    if (!response || typeof response.question !== 'string' || !response.question.trim()) {
        throw new Error('We could not prepare a question. Please try again.');
    }
    if (state.questions.some(question => question.toLowerCase() === response.question.toLowerCase())) {
        throw new Error('We received a repeated question. Please try again.');
    }
    state.questions.push(response.question);
    if (!saveInterviewState(state)) throw new Error('This browser could not save your session. Check your browser storage settings.');
    setSessionMode(response.mode);
    updateQuestionProgress(state);
}

function updateQuestionCounter(answer) {
    const element = document.querySelector('#character-count');
    if (element) element.textContent = `${answer.length} / 12000`;
}

function saveCompletedInterview(state) {
    const evaluations = state.evaluations;
    const totalScore = evaluations.reduce((sum, result) => sum + result.score, 0);
    const averageScore = evaluations.length ? totalScore / evaluations.length : 0;
    const completed = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}`,
        date: new Date().toISOString(),
        topic: state.topic,
        totalScore,
        averageScore: Number(averageScore.toFixed(2)),
        questionsAnswered: evaluations.length,
        performance: performanceLabel(averageScore),
        strengths: [...new Set(evaluations.map(item => item.strengths))].slice(0, 3).join(' '),
        weaknesses: [...new Set(evaluations.map(item => item.weaknesses))].slice(0, 3).join(' '),
        suggestions: [...new Set(evaluations.map(item => item.suggestions))].slice(0, 3).join(' ')
    };
    const history = historyItems();
    history.unshift(completed);
    if (!writeStorage(STORAGE_KEYS.history, history) || !writeStorage(STORAGE_KEYS.result, completed)) {
        throw new Error('The session is complete, but this browser could not save your result. Check your browser storage settings.');
    }
    sessionStorage.removeItem(STORAGE_KEYS.interview);
    window.location.assign('/result.html');
}

function initInterview() {
    const queryTopic = new URLSearchParams(window.location.search).get('topic');
    let state = loadInterviewState();
    if (!state || !Array.isArray(state.questions) || state.topic !== queryTopic || state.questions.length >= QUESTION_TOTAL) {
        if (!queryTopic || !TOPICS.some(topic => topic.toLowerCase() === queryTopic.toLowerCase())) {
            window.location.replace('/dashboard.html');
            return;
        }
        state = { topic: queryTopic, difficulty: 'Intermediate', currentIndex: 0, questions: [], evaluations: [] };
        saveInterviewState(state);
    }
    document.querySelector('#interview-topic').textContent = `${state.topic} practice`;
    const answer = document.querySelector('#answer');
    const answerForm = document.querySelector('#answer-form');
    const nextButton = document.querySelector('#next-question');
    updateQuestionCounter(answer.value);
    answer.addEventListener('input', () => updateQuestionCounter(answer.value));

    const currentEvaluation = () => state.evaluations[state.currentIndex];
    const restoreCurrent = () => {
        updateQuestionProgress(state);
        const evaluation = currentEvaluation();
        if (evaluation) {
            answer.value = evaluation.answer;
            updateQuestionCounter(answer.value);
            setSessionMode(evaluation.mode);
            renderFeedback(evaluation);
        } else {
            answer.value = '';
            document.querySelector('#feedback-panel').classList.add('hidden');
            document.querySelector('#submit-answer').classList.remove('hidden');
            answer.readOnly = false;
        }
    };

    if (state.questions.length) {
        restoreCurrent();
        setSessionMode(currentEvaluation()?.mode || 'Demo/Fallback AI mode');
    } else {
        fetchQuestion(state).catch(error => {
            showMessage(document.querySelector('#interview-message'), error.message);
        });
    }

    answerForm.addEventListener('submit', async event => {
        event.preventDefault();
        const message = document.querySelector('#interview-message');
        const submit = document.querySelector('#submit-answer');
        const text = answer.value.trim();
        showMessage(message, '');
        if (!text) {
            showMessage(message, 'Write an answer before asking for feedback.');
            answer.focus();
            return;
        }
        submit.disabled = true;
        try {
            const result = await apiRequest('/api/interview/evaluate', {
                method: 'POST',
                body: JSON.stringify({
                    topic: state.topic,
                    difficulty: state.difficulty,
                    question: state.questions[state.currentIndex],
                    answer: text
                })
            });
            if (!Number.isInteger(result.score) || result.score < 0 || result.score > 10
                    || ['strengths', 'weaknesses', 'suggestions', 'modelAnswer'].some(key => typeof result[key] !== 'string' || !result[key].trim())) {
                throw new Error('Feedback came back in an unexpected format. Please submit your answer again.');
            }
            const evaluation = { ...result, answer: text };
            state.evaluations[state.currentIndex] = evaluation;
            if (!saveInterviewState(state)) throw new Error('This browser could not save your progress. Check your browser storage settings.');
            setSessionMode(result.mode);
            renderFeedback(evaluation);
        } catch (error) {
            showMessage(message, error.message);
        } finally {
            submit.disabled = false;
        }
    });

    nextButton.addEventListener('click', async () => {
        if (!currentEvaluation()) {
            showMessage(document.querySelector('#interview-message'), 'Submit your answer to unlock the next question.');
            return;
        }
        if (state.currentIndex === QUESTION_TOTAL - 1) {
            try {
                saveCompletedInterview(state);
            } catch (error) {
                showMessage(document.querySelector('#interview-message'), error.message);
            }
            return;
        }
        nextButton.disabled = true;
        state.currentIndex += 1;
        if (!saveInterviewState(state)) {
            state.currentIndex -= 1;
            nextButton.disabled = false;
            showMessage(document.querySelector('#interview-message'), 'This browser could not save your progress. Check your browser storage settings.');
            return;
        }
        answer.value = '';
        updateQuestionCounter(answer.value);
        document.querySelector('#feedback-panel').classList.add('hidden');
        document.querySelector('#submit-answer').classList.remove('hidden');
        answer.readOnly = false;
        showMessage(document.querySelector('#interview-message'), '');
        try {
            await fetchQuestion(state);
        } catch (error) {
            state.currentIndex -= 1;
            saveInterviewState(state);
            showMessage(document.querySelector('#interview-message'), error.message);
        } finally {
            nextButton.disabled = false;
        }
    });
}

function initResult() {
    const result = readStorage(STORAGE_KEYS.result, null);
    if (!result) {
        window.location.replace('/dashboard.html');
        return;
    }
    const average = Number(result.averageScore) || 0;
    const values = {
        '#result-average': average.toFixed(1),
        '#result-average-card': average.toFixed(1),
        '#result-total': String(Number(result.totalScore) || 0),
        '#result-questions': String(Number(result.questionsAnswered) || 0),
        '#result-questions-card': String(Number(result.questionsAnswered) || 0),
        '#result-topic': result.topic,
        '#result-topic-card': result.topic,
        '#performance-level': performanceLabel(average),
        '#result-strengths': result.strengths || 'Showing up and making time to practice is a strength worth keeping.',
        '#result-weaknesses': result.weaknesses || 'Keep looking for places where a clearer explanation or example can help.',
        '#result-suggestions': result.suggestions || 'Keep practicing and build each answer around a clear idea and a useful example.'
    };
    Object.entries(values).forEach(([selector, value]) => {
        const element = document.querySelector(selector);
        if (element) element.textContent = String(value);
    });
    const practiceAgain = document.querySelector('#practice-again');
    if (practiceAgain) practiceAgain.href = `/interview.html?topic=${encodeURIComponent(result.topic)}`;
}

document.addEventListener('DOMContentLoaded', () => {
    setupAuthentication();
    const page = document.body.dataset.page;
    if (['dashboard', 'interview', 'result', 'history', 'progress', 'profile'].includes(page)) {
        if (!currentUser()) {
            window.location.replace('/index.html');
            return;
        }
        setUpShell();
        showStatistics();
        if (page === 'dashboard') initDashboard();
        if (page === 'interview') initInterview();
        if (page === 'result') initResult();
        if (page === 'history') initHistory();
        if (page === 'progress') initProgress();
        if (page === 'profile') initProfile();
    }
});
