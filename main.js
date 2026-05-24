/**
 * 文件名：main.js
 * 作用：Electron 主进程入口，创建窗口、管理 IPC 通信
 * 被哪些文件调用：package.json（入口文件）
 * 依赖：electron, better-sqlite3
 * 使用场景：应用启动时加载
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// 变量名：mainWindow
// 作用：存储主窗口实例
// 格式：BrowserWindow 对象
// 更新时机：应用启动时创建，关闭时置空
let mainWindow = null;

/**
 * 函数名：createWindow
 * 作用：创建主窗口并加载 index.html
 * 参数：无
 * 返回值：void
 * 使用场景：应用 ready 事件触发时
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        // 应用密码锁启动后显示，这里先显示主窗口
        show: false,
        title: '企业专利全生命周期管理系统'
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    // 等页面加载完成后显示窗口，避免白屏闪烁
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 开发环境下可打开 DevTools
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

// 应用准备就绪时创建窗口
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        // macOS 点击 Dock 图标时重建窗口
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
