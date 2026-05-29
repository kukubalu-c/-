/**
 * 文件名：login.js
 * 作用：应用密码锁页面逻辑（首次设置密码 + 登录验证 + 忘记密码重置 + 导航切换）
 * 被哪些文件调用：index.html 底部引入
 * 依赖：api.js（通过 window.patentAPI 通信）
 * 使用场景：应用启动时显示密码锁
 */

// 变量名：currentPage
// 作用：当前显示的是哪个页面
// 格式：string - 'login' | 'setup' | 'reset' | 'app'
// 更新时机：用户操作切换页面时
let currentPage = 'login';
let failedAttempts = 0;
let cooldownTimer = null;

// ============================================
// 页面初始化
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    const isSet = await window.patentAPI.checkPasswordSet();
    if (isSet) {
        showPage('login');
    } else {
        showPage('setup');
    }
});

// ============================================
// 页面切换函数
// ============================================
function showPage(page) {
    // 隐藏所有页面
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('setupPage').classList.add('hidden');
    document.getElementById('resetPage').classList.add('hidden');
    document.getElementById('appPage').classList.add('hidden');

    // 显示目标页面
    if (page === 'login') {
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('passwordInput').focus();
        // 清空登录错误
        document.getElementById('loginError').classList.add('hidden');
        document.getElementById('passwordInput').value = '';
        // 始终显示"忘记密码"链接
        document.getElementById('forgotPwdLink').classList.remove('hidden');
    } else if (page === 'setup') {
        document.getElementById('setupPage').classList.remove('hidden');
        document.getElementById('setupPasswordInput').focus();
        // 重置设置页表单
        document.getElementById('setupPasswordInput').value = '';
        document.getElementById('setupConfirmInput').value = '';
        document.getElementById('securityQuestionSelect').value = '';
        document.getElementById('securityQuestionCustom').value = '';
        document.getElementById('securityQuestionCustom').classList.add('hidden');
        document.getElementById('securityAnswerInput').value = '';
        document.getElementById('setupError').classList.add('hidden');
    } else if (page === 'reset') {
        document.getElementById('resetPage').classList.remove('hidden');
        document.getElementById('resetAnswerInput').focus();
        // 重置重置页表单
        document.getElementById('resetAnswerInput').value = '';
        document.getElementById('resetNewPasswordInput').value = '';
        document.getElementById('resetNewConfirmInput').value = '';
        document.getElementById('resetNewPwdSection').classList.add('hidden');
        document.getElementById('resetError').classList.add('hidden');
        document.getElementById('resetVerifyBtn').classList.remove('hidden');
        document.getElementById('resetAnswerInput').classList.remove('hidden');
    } else if (page === 'app') {
        document.getElementById('appPage').classList.remove('hidden');
        initNavigation();
    }
    currentPage = page;
}

// ============================================
// 登录逻辑
// ============================================
document.getElementById('loginBtn').addEventListener('click', async () => {
    const password = document.getElementById('passwordInput').value;
    const errorEl = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');

    // 冷却中禁止点击
    if (loginBtn.disabled) return;

    if (!password) {
        errorEl.textContent = '请输入密码';
        errorEl.classList.remove('hidden');
        return;
    }

    const isValid = await window.patentAPI.verifyPassword(password);
    if (isValid) {
        // 登录成功，重置计数
        failedAttempts = 0;
        errorEl.classList.add('hidden');
        document.getElementById('passwordInput').value = '';
        showPage('app');
        return;
    }

    // 密码错误
    failedAttempts++;
    errorEl.textContent = '密码错误，请重试';
    errorEl.classList.remove('hidden');
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordInput').focus();

    // 3次以上错误进入冷却
    if (failedAttempts >= 3) {
        const waitSeconds = Math.min(30 * (failedAttempts - 2), 120);
        loginBtn.disabled = true;
        loginBtn.textContent = `请等待 ${waitSeconds} 秒后重试`;
        errorEl.textContent = `密码错误已达 ${failedAttempts} 次，请 ${waitSeconds} 秒后再试`;
        // 引导使用忘记密码
        if (failedAttempts >= 4) {
            errorEl.textContent += '，或使用"忘记密码"重置';
        }

        clearTimeout(cooldownTimer);
        let remaining = waitSeconds;
        cooldownTimer = setInterval(() => {
            remaining--;
            loginBtn.textContent = `请等待 ${remaining} 秒后重试`;
            if (remaining <= 0) {
                clearInterval(cooldownTimer);
                loginBtn.disabled = false;
                loginBtn.textContent = '解锁';
                errorEl.textContent = '密码错误，请重试';
            }
        }, 1000);
    }
});

// 按回车触发登录
document.getElementById('passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('loginBtn').click();
    }
});

// ============================================
// 忘记密码
// ============================================
document.getElementById('forgotPwdBtn').addEventListener('click', async () => {
    const question = await window.patentAPI.getSecurityQuestion();
    // 进入重置页时清除冷却
    clearTimeout(cooldownTimer);
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginBtn').textContent = '解锁';
    failedAttempts = 0;

    if (!question) {
        document.getElementById('loginError').textContent = '未设置密保问题，无法在线找回密码。如需重置请联系管理员删除 data/patent.db 后重启系统';
        document.getElementById('loginError').classList.remove('hidden');
        return;
    }
    document.getElementById('resetQuestion').textContent = question;
    showPage('reset');
});

// 返回登录
document.getElementById('resetBackBtn').addEventListener('click', () => {
    showPage('login');
});

// 验证密保答案
document.getElementById('resetVerifyBtn').addEventListener('click', async () => {
    const answer = document.getElementById('resetAnswerInput').value;
    const errorEl = document.getElementById('resetError');

    if (!answer) {
        errorEl.textContent = '请输入密保答案';
        errorEl.classList.remove('hidden');
        return;
    }

    const isValid = await window.patentAPI.verifySecurityAnswer(answer);
    if (isValid) {
        errorEl.classList.add('hidden');
        // 隐藏验证部分，显示新密码设置
        document.getElementById('resetVerifyBtn').classList.add('hidden');
        document.getElementById('resetAnswerInput').classList.add('hidden');
        document.getElementById('resetNewPwdSection').classList.remove('hidden');
        document.getElementById('resetNewPasswordInput').focus();
        document.getElementById('resetQuestionText').textContent = '答案正确，请设置新密码';
    } else {
        errorEl.textContent = '答案错误，请重试';
        errorEl.classList.remove('hidden');
    }
});

// 按回车触发验证
document.getElementById('resetAnswerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('resetVerifyBtn').click();
    }
});

// 保存新密码
document.getElementById('resetSaveBtn').addEventListener('click', async () => {
    const password = document.getElementById('resetNewPasswordInput').value;
    const confirm = document.getElementById('resetNewConfirmInput').value;
    const errorEl = document.getElementById('resetError');

    if (!password || password.length < 4) {
        errorEl.textContent = '密码至少4位字符';
        errorEl.classList.remove('hidden');
        return;
    }
    if (password !== confirm) {
        errorEl.textContent = '两次密码输入不一致';
        errorEl.classList.remove('hidden');
        return;
    }

    const result = await window.patentAPI.setPassword(password);
    if (result) {
        errorEl.textContent = '密码重置成功，请使用新密码登录';
        errorEl.style.color = '#52c41a';
        errorEl.classList.remove('hidden');
        // 2秒后跳回登录页
        setTimeout(() => {
            errorEl.style.color = '#f5222d';
            showPage('login');
        }, 2000);
    } else {
        errorEl.textContent = '密码设置失败，请重试';
        errorEl.classList.remove('hidden');
    }
});

document.getElementById('resetNewConfirmInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('resetSaveBtn').click();
    }
});

// ============================================
// 密保问题下拉切换（自定义输入）
// ============================================
document.getElementById('securityQuestionSelect').addEventListener('change', function () {
    const customInput = document.getElementById('securityQuestionCustom');
    if (this.value === '__custom__') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
    }
});

// ============================================
// 首次设置密码逻辑
// ============================================
document.getElementById('setupBtn').addEventListener('click', async () => {
    const password = document.getElementById('setupPasswordInput').value;
    const confirm = document.getElementById('setupConfirmInput').value;
    const questionSelect = document.getElementById('securityQuestionSelect');
    const customQuestion = document.getElementById('securityQuestionCustom');
    const answer = document.getElementById('securityAnswerInput').value;
    const errorEl = document.getElementById('setupError');

    // 第1步：校验密码合法性
    if (!password || password.length < 4) {
        errorEl.textContent = '密码至少4位字符';
        errorEl.classList.remove('hidden');
        return;
    }
    if (password !== confirm) {
        errorEl.textContent = '两次密码输入不一致';
        errorEl.classList.remove('hidden');
        return;
    }

    // 第2步：校验密保问题
    let question = questionSelect.value;
    if (!question) {
        errorEl.textContent = '请选择或输入密保问题';
        errorEl.classList.remove('hidden');
        return;
    }
    if (question === '__custom__') {
        question = customQuestion.value.trim();
        if (!question) {
            errorEl.textContent = '请输入自定义密保问题';
            errorEl.classList.remove('hidden');
            return;
        }
    }
    if (!answer) {
        errorEl.textContent = '请输入密保答案';
        errorEl.classList.remove('hidden');
        return;
    }

    // 第3步：保存密码
    const result = await window.patentAPI.setPassword(password);
    if (!result) {
        errorEl.textContent = '密码设置失败，请重试';
        errorEl.classList.remove('hidden');
        return;
    }

    // 第4步：保存密保问题和答案
    try {
        await window.patentAPI.dbRun(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('security_question', ?)",
            [question]
        );
        // 答案小写去空格后哈希存储
        const hashHex = await sha256(answer.toLowerCase().trim());
        await window.patentAPI.dbRun(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('security_answer', ?)",
            [hashHex]
        );
    } catch (e) {
        console.error('密保保存失败:', e);
    }

    errorEl.classList.add('hidden');
    document.getElementById('setupPasswordInput').value = '';
    document.getElementById('setupConfirmInput').value = '';
    showPage('app');
});

document.getElementById('setupConfirmInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('setupBtn').click();
    }
});

// ============================================
// 导航切换逻辑
// ============================================
function initNavigation() {
    // 第1步：获取侧边栏导航按钮
    const navItems = document.querySelectorAll('.nav-item');
    // 第2步：获取所有页面内容区
    const pages = {
        dashboard: document.getElementById('dashboardPage'),
        workbench: document.getElementById('workbenchPage'),
        datahub: document.getElementById('datahubPage')
    };

    // 第3步：为每个导航按钮绑定点击事件
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageName = item.dataset.page;
            // 跳过无 data-page 的项（如安全设置按钮）
            if (!pageName) return;

            // 3.1 更新导航高亮状态
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // 3.2 切换页面内容区
            Object.keys(pages).forEach(key => {
                pages[key].classList.toggle('active', key === pageName);
            });

            // 3.3 切换到工作台时刷新列表（确保数据最新）
            if (pageName === 'workbench' && typeof loadPatentList === 'function') {
                if (typeof currentPage !== 'undefined') currentPage = 1;
                loadPatentList();
            }
            // 3.4 切换到仪表盘时初始化图表（懒加载）
            if (pageName === 'dashboard' && typeof initDashboard === 'function') {
                initDashboard();
            }
        });
    });

    // 如果仪表盘是当前激活页，立即初始化
    const activeNav = document.querySelector('.nav-item.active');
    if (activeNav && activeNav.dataset.page === 'dashboard' && typeof initDashboard === 'function') {
        initDashboard();
    }
}

// ============================================
// SHA-256 哈希工具函数
// ============================================
async function sha256(text) {
    const enc = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(text));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// 安全设置弹窗（侧边栏底部）
// ============================================
document.getElementById('sidebarSettingsBtn').addEventListener('click', async () => {
    const question = await window.patentAPI.getSecurityQuestion();
    const select = document.getElementById('secModalQuestionSelect');
    const customInput = document.getElementById('secModalQuestionCustom');
    const answerInput = document.getElementById('secModalAnswerInput');
    const statusEl = document.getElementById('secModalStatus');

    select.value = '';
    customInput.value = '';
    customInput.classList.add('hidden');
    answerInput.value = '';
    statusEl.classList.add('hidden');
    statusEl.style.color = '#f5222d';

    if (question) {
        const options = Array.from(select.options).map(o => o.value);
        if (options.includes(question)) {
            select.value = question;
        } else {
            select.value = '__custom__';
            customInput.value = question;
            customInput.classList.remove('hidden');
        }
    }

    document.getElementById('securityModal').classList.remove('hidden');
});

document.getElementById('securityModalClose').addEventListener('click', () => {
    document.getElementById('securityModal').classList.add('hidden');
});
document.getElementById('secModalCancel').addEventListener('click', () => {
    document.getElementById('securityModal').classList.add('hidden');
});

document.getElementById('secModalQuestionSelect').addEventListener('change', function () {
    const customInput = document.getElementById('secModalQuestionCustom');
    if (this.value === '__custom__') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
    }
});

document.getElementById('secModalSave').addEventListener('click', async () => {
    const select = document.getElementById('secModalQuestionSelect');
    const customInput = document.getElementById('secModalQuestionCustom');
    const answerInput = document.getElementById('secModalAnswerInput');
    const statusEl = document.getElementById('secModalStatus');

    let question = select.value;
    if (!question) {
        statusEl.textContent = '请选择密保问题';
        statusEl.classList.remove('hidden');
        return;
    }
    if (question === '__custom__') {
        question = customInput.value.trim();
        if (!question) {
            statusEl.textContent = '请输入自定义密保问题';
            statusEl.classList.remove('hidden');
            return;
        }
    }
    if (!answerInput.value) {
        statusEl.textContent = '请输入密保答案';
        statusEl.classList.remove('hidden');
        return;
    }

    try {
        await window.patentAPI.dbRun(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('security_question', ?)",
            [question]
        );
        const hashHex = await sha256(answerInput.value.toLowerCase().trim());
        await window.patentAPI.dbRun(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('security_answer', ?)",
            [hashHex]
        );
        statusEl.textContent = '密保设置已保存';
        statusEl.style.color = '#52c41a';
        statusEl.classList.remove('hidden');
        setTimeout(() => {
            document.getElementById('securityModal').classList.add('hidden');
        }, 1500);
    } catch (e) {
        statusEl.textContent = '保存失败：' + e.message;
        statusEl.style.color = '#f5222d';
        statusEl.classList.remove('hidden');
    }
});
