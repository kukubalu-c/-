/**
 * 文件名：preload.js
 * 作用：预加载脚本，通过 contextBridge 向渲染进程暴露安全的 API
 * 被哪些文件调用：main.js 中 webPreferences.preload 引入
 * 依赖：electron (contextBridge, ipcRenderer)
 * 使用场景：每个页面加载时自动执行
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 函数名：contextBridge.exposeInMainWorld
 * 作用：向渲染进程暴露 patentAPI 对象，隔离 Node.js 环境
 * 参数：
 *   - 'patentAPI' - string - 全局对象名称
 *   - apiMethods - object - 暴露的方法集合
 * 返回值：void
 * 使用场景：应用启动时自动执行
 */
contextBridge.exposeInMainWorld('patentAPI', {
    // ========== 数据库操作 ==========

    /**
     * 函数名：dbQuery
     * 作用：执行数据库查询语句（SELECT）
     * 参数：
     *   - sql - string - SQL 查询语句
     *   - params - Array - 查询参数
     * 返回值：Promise<Array> - 查询结果数组
     * 使用场景：渲染进程需要读取数据时调用
     */
    dbQuery: (sql, params) => ipcRenderer.invoke('db:query', sql, params),

    /**
     * 函数名：dbRun
     * 作用：执行数据库写操作（INSERT/UPDATE/DELETE）
     * 参数：
     *   - sql - string - SQL 语句
     *   - params - Array - 语句参数
     * 返回值：Promise<Object> - { changes, lastInsertRowid }
     * 使用场景：渲染进程需要写入数据时调用
     */
    dbRun: (sql, params) => ipcRenderer.invoke('db:run', sql, params),

    // ========== 文件对话框 ==========

    /**
     * 函数名：openFileDialog
     * 作用：打开系统文件选择对话框
     * 参数：
     *   - filters - Array - 文件类型过滤器
     * 返回值：Promise<Array> - 选中文件的路径数组
     * 使用场景：用户点击"导入"或"上传附件"时
     */
    openFileDialog: (filters) => ipcRenderer.invoke('dialog:openFile', filters),

    /**
     * 函数名：saveFileDialog
     * 作用：打开系统文件保存对话框
     * 参数：
     *   - options - Object - 对话框配置（默认文件名、过滤器等）
     * 返回值：Promise<string> - 保存文件路径
     * 使用场景：用户点击"导出"时
     */
    saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),

    // ========== 应用控制 ==========

    /**
     * 函数名：getAppPath
     * 作用：获取应用用户数据目录路径
     * 参数：无
     * 返回值：Promise<string> - 路径字符串
     * 使用场景：需要读写文件时（如备份、附件存储）
     */
    getAppPath: () => ipcRenderer.invoke('app:getPath'),

    // ========== 密码锁 ==========

    /**
     * 函数名：verifyPassword
     * 作用：验证应用密码
     * 参数：
     *   - password - string - 用户输入的密码
     * 返回值：Promise<boolean> - 密码是否正确
     * 使用场景：登录页面验证
     */
    verifyPassword: (password) => ipcRenderer.invoke('auth:verify', password),

    /**
     * 函数名：setPassword
     * 作用：设置/修改应用密码
     * 参数：
     *   - password - string - 新密码
     * 返回值：Promise<boolean> - 是否设置成功
     * 使用场景：首次设置或修改密码
     */
    setPassword: (password) => ipcRenderer.invoke('auth:set', password),

    /**
     * 函数名：checkPasswordSet
     * 作用：检查是否已设置密码
     * 参数：无
     * 返回值：Promise<boolean> - 是否已设置
     * 使用场景：启动时判断显示登录页还是设置页
     */
    checkPasswordSet: () => ipcRenderer.invoke('auth:isSet'),

    getSecurityQuestion: () => ipcRenderer.invoke('auth:getSecurityQuestion'),

    verifySecurityAnswer: (answer) => ipcRenderer.invoke('auth:verifySecurity', answer),

    // ========== 备份 ==========

    /**
     * 函数名：backupDatabase
     * 作用：手动触发数据库备份
     * 参数：无
     * 返回值：Promise<boolean> - 是否备份成功
     * 使用场景：高风险操作前自动调用
     */
    backupDatabase: () => ipcRenderer.invoke('db:backup'),

    // ========== 事件监听 ==========

    /**
     * 函数名：onBackupReady
     * 作用：监听备份完成通知
     * 参数：
     *   - callback - Function - 回调函数
     * 返回值：void
     * 使用场景：渲染进程需要知道备份完成时
     */
    onBackupReady: (callback) => {
        ipcRenderer.on('backup:ready', (_event, data) => callback(data));
    }
});
