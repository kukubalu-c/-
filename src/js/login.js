/**
 * 文件名：login.js
 * 作用：应用密码锁页面逻辑（首次设置密码 + 登录验证 + 导航切换）
 * 被哪些文件调用：index.html 底部引入
 * 依赖：preload.js（通过 window.patentAPI 通信）
 * 使用场景：应用启动时显示密码锁
 */

// 变量名：currentPage
// 作用：当前显示的是哪个页面
// 格式：string - 'login' | 'setup' | 'app'
// 更新时机：用户操作切换页面时
let currentPage = 'login';

// ============================================
// 页面初始化
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // 第1步：检查是否已设置密码
    const isSet = await window.patentAPI.checkPasswordSet();
    if (isSet) {
        // 已设置密码 → 显示登录页
        showPage('login');
    } else {
        // 未设置密码 → 显示设置页
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
    document.getElementById('appPage').classList.add('hidden');

    // 显示目标页面
    if (page === 'login') {
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('passwordInput').focus();
    } else if (page === 'setup') {
        document.getElementById('setupPage').classList.remove('hidden');
        document.getElementById('setupPasswordInput').focus();
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

    if (!password) {
        errorEl.textContent = '请输入密码';
        errorEl.classList.remove('hidden');
        return;
    }

    const isValid = await window.patentAPI.verifyPassword(password);
    if (isValid) {
        errorEl.classList.add('hidden');
        document.getElementById('passwordInput').value = '';
        showPage('app');
    } else {
        errorEl.textContent = '密码错误，请重试';
        errorEl.classList.remove('hidden');
        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordInput').focus();
    }
});

// 按回车触发登录
document.getElementById('passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('loginBtn').click();
    }
});

// ============================================
// 首次设置密码逻辑
// ============================================
document.getElementById('setupBtn').addEventListener('click', async () => {
    const password = document.getElementById('setupPasswordInput').value;
    const confirm = document.getElementById('setupConfirmInput').value;
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

    // 第2步：保存密码
    const result = await window.patentAPI.setPassword(password);
    if (result) {
        errorEl.classList.add('hidden');
        document.getElementById('setupPasswordInput').value = '';
        document.getElementById('setupConfirmInput').value = '';
        showPage('app');
    } else {
        errorEl.textContent = '密码设置失败，请重试';
        errorEl.classList.remove('hidden');
    }
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
            // 3.1 更新导航高亮状态
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // 3.2 切换页面内容区
            const pageName = item.dataset.page;
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
