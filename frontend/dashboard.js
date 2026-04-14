/**
 * Study Dashboard Application
 * Features: Pomodoro Timer, Rewards System, Badges, Dark Mode
 * Beginner-friendly, modular JavaScript code
 */

// ============================================
// Configuration
// ============================================

const CONFIG = {
    STUDY_TIME: 25 * 60, // 25 minutes in seconds
    BREAK_TIME: 5 * 60,  // 5 minutes in seconds
    POINTS_PER_MINUTE: 1,
    BADGE_THRESHOLDS: {
        100: { name: 'Starter', icon: '🥉' },
        500: { name: 'Scholar', icon: '🥈' },
        1000: { name: 'Master', icon: '🥇' }
    }
};

const DASHBOARD_EVENT_KEY = 'studyDashboardLastEvent';

// ============================================
// State Management
// ============================================

const state = {
    isRunning: false,
    isPaused: false,
    isStudyMode: true,
    studyDurationSeconds: CONFIG.STUDY_TIME,
    breakDurationSeconds: CONFIG.BREAK_TIME,
    secondsLeft: CONFIG.STUDY_TIME,
    sessionsCompleted: 0,
    totalPoints: 0,
    totalMinutesStudied: 0,
    streak: 0,
    lastSessionDate: null,
    unlockedBadges: [],
    theme: 'light'
};

// ============================================
// DOM Elements
// ============================================

const elements = {
    // Timer elements
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    resetBtn: document.getElementById('resetBtn'),
    timeDisplay: document.getElementById('timeDisplay'),
    timerMode: document.getElementById('timerMode'),
    timerCircle: document.getElementById('timerCircle'),
    sessionsToday: document.getElementById('sessionsToday'),

    // Rewards elements
    pointsValue: document.getElementById('pointsValue'),
    motivationalMessage: document.getElementById('motivationalMessage'),
    streakNumber: document.getElementById('streakNumber'),

    // Badge elements
    badge1: document.getElementById('badge1'),
    badge2: document.getElementById('badge2'),
    badge3: document.getElementById('badge3'),
    badgeStatus1: document.getElementById('badgeStatus1'),
    badgeStatus2: document.getElementById('badgeStatus2'),
    badgeStatus3: document.getElementById('badgeStatus3'),

    // Stats elements
    totalMinutes: document.getElementById('totalMinutes'),
    badgesUnlocked: document.getElementById('badgesUnlocked'),

    // Theme elements
    themeToggle: document.getElementById('themeToggle'),

    // Notification elements
    notification: document.getElementById('notification'),
    notificationText: document.getElementById('notificationText'),

    // Other elements
    resetAllBtn: document.getElementById('resetAllBtn'),
    pointsPerSessionValue: document.getElementById('pointsPerSessionValue'),
    streakBonusValue: document.getElementById('streakBonusValue')
};

// ============================================
// Local Storage Management
// ============================================

const storage = {
    save: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('LocalStorage save failed:', e);
        }
    },

    load: (key, defaultValue) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.warn('LocalStorage load failed:', e);
            return defaultValue;
        }
    },

    saveState: () => {
        storage.save('studyDashboardState', state);
    },

    loadState: () => {
        const savedState = storage.load('studyDashboardState', null);
        if (savedState) {
            Object.assign(state, savedState);
        }

        if (!Number.isFinite(state.studyDurationSeconds) || state.studyDurationSeconds <= 0) {
            state.studyDurationSeconds = CONFIG.STUDY_TIME;
        }

        if (!Number.isFinite(state.breakDurationSeconds) || state.breakDurationSeconds <= 0) {
            state.breakDurationSeconds = CONFIG.BREAK_TIME;
        }

        if (!Number.isFinite(state.secondsLeft) || state.secondsLeft <= 0) {
            state.secondsLeft = state.isStudyMode ? state.studyDurationSeconds : state.breakDurationSeconds;
        }
    },

    saveTheme: (theme) => {
        storage.save('studyDashboardTheme', theme);
    },

    loadTheme: () => {
        return storage.load('studyDashboardTheme', 'light');
    }
};

// ============================================
// Utility Functions
// ============================================

/**
 * Format seconds to MM:SS format
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Show notification toast
 */
function showNotification(message, duration = 3000) {
    elements.notificationText.textContent = message;
    elements.notification.classList.add('show');

    setTimeout(() => {
        elements.notification.classList.remove('show');
    }, duration);
}

/**
 * Play notification sound (optional)
 */
function playSound() {
    // Create a simple beep using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        console.warn('Audio playback not supported');
    }
}

/**
 * Get motivational message based on points
 */
function getMotivationalMessage() {
    const points = state.totalPoints;
    const messages = [
        'Start studying to earn points!',
        'Keep up the great work! 💪',
        'You\'re doing amazing! 🌟',
        'One more session! 🚀',
        'You\'re unstoppable! 🔥',
        'Champion energy! ✨',
        'You\'re a study legend! 👑'
    ];

    if (points === 0) return messages[0];
    if (points < 100) return messages[1];
    if (points < 500) return messages[2];
    if (points < 1000) return messages[3];
    if (points < 2000) return messages[4];
    if (points < 5000) return messages[5];
    return messages[6];
}

function notifyParent(type, payload = {}) {
    window.parent?.postMessage(
        {
            source: 'ai-study-dashboard',
            type,
            ...payload
        },
        '*'
    );
}

function notifyCrossTabEvent(type, payload = {}) {
    try {
        localStorage.setItem(
            DASHBOARD_EVENT_KEY,
            JSON.stringify({
                source: 'ai-study-dashboard',
                type,
                timestamp: Date.now(),
                ...payload
            })
        );
    } catch (_error) {
        // Ignore storage failures
    }
}

function getConsistencyMultiplier() {
    return 1 + Math.min(state.streak, 10) * 0.1;
}

function calculateSessionPoints(studySeconds) {
    const studyMinutes = Math.max(1, Math.round(studySeconds / 60));
    const multiplier = getConsistencyMultiplier();
    return Math.max(1, Math.round(studyMinutes * CONFIG.POINTS_PER_MINUTE * multiplier));
}

function updatePointsBreakdown() {
    const currentSessionPoints = calculateSessionPoints(state.studyDurationSeconds);
    const consistencyBonusPercent = Math.round((getConsistencyMultiplier() - 1) * 100);

    if (elements.pointsPerSessionValue) {
        elements.pointsPerSessionValue.textContent = `${currentSessionPoints} pts`;
    }

    if (elements.streakBonusValue) {
        elements.streakBonusValue.textContent = `+${consistencyBonusPercent}%`;
    }
}

// ============================================
// Timer Functions
// ============================================

let timerInterval = null;

/**
 * Update the timer display
 */
function updateTimerDisplay() {
    elements.timeDisplay.textContent = formatTime(state.secondsLeft);
    updateCircleProgress();
}

/**
 * Update the circle progress animation
 */
function updateCircleProgress() {
    const totalSeconds = state.isStudyMode ? state.studyDurationSeconds : state.breakDurationSeconds;
    const secondsElapsed = totalSeconds - state.secondsLeft;
    const percentage = (secondsElapsed / totalSeconds) * 100;

    // Calculate stroke-dashoffset (circumference is 565.48)
    const circumference = 565.48;
    const offset = circumference - (percentage / 100) * circumference;

    elements.timerCircle.style.strokeDashoffset = offset;
}

/**
 * Switch between study and break modes
 */
function switchMode() {
    state.isStudyMode = !state.isStudyMode;
    state.secondsLeft = state.isStudyMode ? state.studyDurationSeconds : state.breakDurationSeconds;

    if (state.isStudyMode) {
        elements.timerMode.textContent = 'Study Time';
        elements.timerMode.style.background = 'var(--accent-light)';
    } else {
        elements.timerMode.textContent = 'Break Time';
        elements.timerMode.style.background = 'rgba(16, 185, 129, 0.1)';
    }

    updateTimerDisplay();
}

/**
 * Handle session completion
 */
function completeSession() {
    if (state.isStudyMode) {
        // Study session completed
        state.sessionsCompleted++;
        // Update streak
        updateStreak();

        const earnedPoints = calculateSessionPoints(state.studyDurationSeconds);
        state.totalPoints += earnedPoints;
        state.totalMinutesStudied += state.studyDurationSeconds / 60;

        // Show notification and sound
        showNotification(`🎉 Study session completed! You earned ${earnedPoints} points!`);
        playSound();
        notifyParent('dashboard:session-complete', {
            earnedPoints,
            totalPoints: state.totalPoints,
            streak: state.streak
        });
        notifyCrossTabEvent('session-complete', {
            earnedPoints,
            totalPoints: state.totalPoints,
            streak: state.streak
        });

        // Check and unlock badges
        checkBadgeUnlocks();

        // Show motivational message
        updateMotivationalMessage();
    } else {
        // Break completed
        showNotification('5️⃣ Break time over. Ready to study?');
    }

    // Auto-switch mode and continue timer
    switchMode();
    updateUI();
    startTimer(); // Auto-continue
}

/**
 * Start the timer
 */
function startTimer() {
    if (state.isRunning) return;

    state.isRunning = true;
    state.isPaused = false;
    elements.startBtn.disabled = true;
    elements.pauseBtn.disabled = false;

    timerInterval = setInterval(() => {
        state.secondsLeft--;
        updateTimerDisplay();

        if (state.secondsLeft <= 0) {
            clearInterval(timerInterval);
            state.isRunning = false;
            completeSession();
        }
    }, 1000);
}

/**
 * Pause the timer
 */
function pauseTimer() {
    state.isRunning = false;
    state.isPaused = true;
    clearInterval(timerInterval);
    elements.startBtn.disabled = false;
    elements.pauseBtn.disabled = true;
    showNotification('⏸️ Timer paused');
}

/**
 * Reset the timer
 */
function resetTimer() {
    state.isRunning = false;
    state.isPaused = false;
    clearInterval(timerInterval);

    state.isStudyMode = true;
    state.secondsLeft = state.studyDurationSeconds;

    elements.startBtn.disabled = false;
    elements.pauseBtn.disabled = true;
    elements.timerMode.textContent = 'Study Time';

    updateTimerDisplay();
    updatePointsBreakdown();
    showNotification('🔄 Timer reset');
}

function setStudyMinutes(minutes, autoStart = false) {
    const parsedMinutes = Number(minutes);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes < 1 || parsedMinutes > 180) {
        showNotification('⚠️ Timer must be between 1 and 180 minutes');
        return false;
    }

    clearInterval(timerInterval);
    state.isRunning = false;
    state.isPaused = false;
    state.isStudyMode = true;
    state.studyDurationSeconds = Math.round(parsedMinutes * 60);
    state.secondsLeft = state.studyDurationSeconds;

    elements.startBtn.disabled = false;
    elements.pauseBtn.disabled = true;
    elements.timerMode.textContent = 'Study Time';
    elements.timerMode.style.background = 'var(--accent-light)';

    updateUI();
    storage.saveState();
    showNotification(`⏱️ Study timer updated to ${parsedMinutes} minutes`);

    if (autoStart) {
        startTimer();
    }

    return true;
}

// ============================================
// Rewards & Streak Functions
// ============================================

/**
 * Update the daily streak
 */
function updateStreak() {
    const today = new Date().toDateString();

    if (state.lastSessionDate === today) {
        // Same day, no change to streak
        return;
    }

    const lastDate = state.lastSessionDate ? new Date(state.lastSessionDate) : null;
    const currentDate = new Date();

    if (lastDate) {
        const daysDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));

        if (daysDiff === 1) {
            // Consecutive day
            state.streak++;
            state.totalPoints += 10; // Bonus points
            showNotification('🔥 Streak continued +10 bonus points!');
        } else if (daysDiff > 1) {
            // Streak broken
            state.streak = 1;
        }
    } else {
        // First ever session
        state.streak = 1;
    }

    state.lastSessionDate = today;
}

/**
 * Update motivational message
 */
function updateMotivationalMessage() {
    elements.motivationalMessage.textContent = getMotivationalMessage();
}

// ============================================
// Badge Functions
// ============================================

/**
 * Check and unlock badges based on points
 */
function checkBadgeUnlocks() {
    const badges = [
        { threshold: 100, id: 'badge1', statusId: 'badgeStatus1' },
        { threshold: 500, id: 'badge2', statusId: 'badgeStatus2' },
        { threshold: 1000, id: 'badge3', statusId: 'badgeStatus3' }
    ];

    badges.forEach(badge => {
        if (state.totalPoints >= badge.threshold && !state.unlockedBadges.includes(badge.threshold)) {
            state.unlockedBadges.push(badge.threshold);
            unlockBadge(badge.id, badge.statusId);
        }
    });
}

/**
 * Unlock a badge with animation
 */
function unlockBadge(badgeId, statusId) {
    const badgeElement = document.getElementById(badgeId);
    const statusElement = document.getElementById(statusId);

    badgeElement.classList.add('unlocked');
    statusElement.textContent = 'Unlocked';
    statusElement.style.color = 'var(--unlock-color)';

    showNotification('🏆 New badge unlocked!');
}

// ============================================
// Theme Management
// ============================================

/**
 * Initialize theme
 */
function initTheme() {
    state.theme = storage.loadTheme();
    applyTheme(state.theme);
}

/**
 * Apply theme to page
 */
function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        elements.themeToggle.querySelector('.theme-icon').textContent = '☀️';
    } else {
        document.documentElement.removeAttribute('data-theme');
        elements.themeToggle.querySelector('.theme-icon').textContent = '🌙';
    }
    state.theme = theme;
}

/**
 * Toggle theme
 */
function toggleTheme() {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    storage.saveTheme(newTheme);
    showNotification(`${newTheme === 'dark' ? '🌙' : '☀️'} Theme switched`);
}

// ============================================
// UI Update Function
// ============================================

/**
 * Update all UI elements
 */
function updateUI() {
    // Update timer display
    updateTimerDisplay();

    // Update rewards display
    elements.pointsValue.textContent = state.totalPoints;
    elements.streakNumber.textContent = state.streak;

    // Update sessions
    elements.sessionsToday.textContent = state.sessionsCompleted;

    // Update stats
    elements.totalMinutes.textContent = Math.floor(state.totalMinutesStudied);
    elements.badgesUnlocked.textContent = state.unlockedBadges.length;

    // Update motivational message
    updateMotivationalMessage();
    updatePointsBreakdown();
    notifyParent('dashboard:state-updated', {
        totalPoints: state.totalPoints,
        streak: state.streak,
        sessionsCompleted: state.sessionsCompleted,
        totalMinutesStudied: state.totalMinutesStudied
    });
}

// ============================================
// Event Listeners
// ============================================

/**
 * Initialize event listeners
 */
function initEventListeners() {
    elements.startBtn.addEventListener('click', startTimer);
    elements.pauseBtn.addEventListener('click', pauseTimer);
    elements.resetBtn.addEventListener('click', resetTimer);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.resetAllBtn.addEventListener('click', resetAllData);
}

/**
 * Reset all data
 */
function resetAllData() {
    if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
        // Reset timer
        pauseTimer();
        resetTimer();

        // Reset state
        state.sessionsCompleted = 0;
        state.totalPoints = 0;
        state.totalMinutesStudied = 0;
        state.streak = 0;
        state.lastSessionDate = null;
        state.unlockedBadges = [];
        state.studyDurationSeconds = CONFIG.STUDY_TIME;
        state.breakDurationSeconds = CONFIG.BREAK_TIME;
        state.secondsLeft = state.studyDurationSeconds;

        // Remove unlocked badge classes
        document.getElementById('badge1').classList.remove('unlocked');
        document.getElementById('badge2').classList.remove('unlocked');
        document.getElementById('badge3').classList.remove('unlocked');
        elements.badgeStatus1.textContent = 'Locked';
        elements.badgeStatus2.textContent = 'Locked';
        elements.badgeStatus3.textContent = 'Locked';

        // Update UI
        updateUI();

        // Save state
        storage.saveState();

        showNotification('🔄 All data has been reset');
    }
}

// ============================================
// Initialize Application
// ============================================

function init() {
    // Load saved state and theme
    storage.loadState();
    initTheme();

    // Initialize UI
    updateUI();

    // Setup event listeners
    initEventListeners();

    // Allow parent chat app to control timer
    window.addEventListener('message', (event) => {
        const payload = event.data || {};
        if (payload.source !== 'ai-study-agent') {
            return;
        }

        if (payload.type === 'dashboard:set-timer') {
            setStudyMinutes(payload.minutes, Boolean(payload.autoStart));
            return;
        }

        if (payload.type === 'dashboard:start-timer') {
            startTimer();
            return;
        }

        if (payload.type === 'dashboard:pause-timer') {
            pauseTimer();
            return;
        }

        if (payload.type === 'dashboard:reset-timer') {
            resetTimer();
        }
    });

    window.DashboardAPI = {
        setTimerMinutes: (minutes, autoStart = false) => setStudyMinutes(minutes, autoStart),
        startTimer,
        pauseTimer,
        resetTimer,
        getState: () => ({ ...state })
    };

    // Check for badges on load
    checkBadgeUnlocks();

    console.log('🚀 Study Dashboard initialized successfully!');
}

// Run initialization when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Save state periodically and on page unload
window.addEventListener('beforeunload', () => {
    storage.saveState();
});

// Auto-save state every 10 seconds
setInterval(() => {
    storage.saveState();
}, 10000);
