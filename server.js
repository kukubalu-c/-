/**
 * 文件名：server.js
 * 作用：Node.js 本地服务器，提供静态文件服务和 API 接口
 * 被哪些文件调用：package.json（入口文件）
 * 依赖：sql.js, xlsx, 以及 Node.js 内置模块 http/path/fs
 * 使用场景：开发时运行 `node server.js`，浏览器访问 http://localhost:3000
 *
 * 迁移到 Electron 时：此文件逻辑拆分到 main.js（主进程）和 database.js（数据库层）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ============================================
// 配置
// ============================================
const PORT = 3000;
const ROOT_DIR = __dirname;
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const NM_DIR = path.join(ROOT_DIR, 'node_modules');

// ============================================
// 初始化数据库
// ============================================
const Database = require('./src/utils/database.js');
let db;

/**
 * 函数名：initServer
 * 作用：初始化数据库后启动 HTTP 服务器
 * 参数：无
 * 返回值：void
 * 使用场景：应用启动时
 */
async function initServer() {
    // 确保数据目录存在
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // 初始化数据库
    db = new Database(DATA_DIR);
    await db.init();

    // 启动 HTTP 服务
    startHttpServer();
}

// ============================================
// HTTP 路由处理
// ============================================

/**
 * 函数名：getMimeType
 * 作用：根据文件扩展名返回 MIME 类型
 * 参数：
 *   - ext - string - 文件扩展名
 * 返回值：string - MIME 类型字符串
 * 使用场景：设置 HTTP 响应头时
 */
function getMimeType(ext) {
    const mimeMap = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
    };
    return mimeMap[ext] || 'application/octet-stream';
}

/**
 * 函数名：serveStaticFile
 * 作用：提供静态文件服务
 * 参数：
 *   - res - http.ServerResponse - 响应对象
 *   - filePath - string - 文件绝对路径
 * 返回值：void
 * 使用场景：请求静态资源时
 */
function serveStaticFile(res, filePath) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': getMimeType(ext) });
        res.end(data);
    });
}

/**
 * 函数名：parseBody
 * 作用：解析 HTTP 请求体中的 JSON 数据
 * 参数：
 *   - req - http.IncomingMessage - 请求对象
 * 返回值：Promise<Object> - 解析后的 JSON 对象
 * 使用场景：POST/PUT 请求需要读取请求体时
 */
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * 函数名：handleApiRequest
 * 作用：处理 /api/* 路径的 API 请求
 * 参数：
 *   - req - http.IncomingMessage - 请求对象
 *   - res - http.ServerResponse - 响应对象
 * 返回值：void
 * 使用场景：前端通过 fetch 调用 API 时
 */
async function handleApiRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // 设置 CORS 和 JSON 响应头
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    try {
        let result;

        // === 数据库查询 ===
        if (pathname === '/api/db/query' && method === 'POST') {
            const body = await parseBody(req);
            result = db.query(body.sql, body.params || []);
        }
        // === 数据库写入 ===
        else if (pathname === '/api/db/run' && method === 'POST') {
            const body = await parseBody(req);
            result = db.run(body.sql, body.params || []);
        }
        // === 密码校验 ===
        else if (pathname === '/api/auth/verify' && method === 'POST') {
            const body = await parseBody(req);
            const settings = db.query("SELECT value FROM settings WHERE key = 'app_password'");
            const storedHash = settings.length > 0 ? settings[0].value : null;
            // 简单 SHA-256 哈希比对（Node.js 内置 crypto）
            const crypto = require('crypto');
            const inputHash = crypto.createHash('sha256').update(body.password).digest('hex');
            result = { success: storedHash === inputHash };
        }
        // === 设置密码 ===
        else if (pathname === '/api/auth/set' && method === 'POST') {
            const body = await parseBody(req);
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(body.password).digest('hex');
            db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_password', ?)", [hash]);
            result = { success: true };
        }
        // === 检查密码是否设置 ===
        else if (pathname === '/api/auth/isset' && method === 'GET') {
            const settings = db.query("SELECT value FROM settings WHERE key = 'app_password'");
            result = { isSet: settings.length > 0 };
        }
        // === 上传附件 ===
        else if (pathname === '/api/upload' && method === 'POST') {
            const body = await parseBody(req);
            const patentId = body.patent_id;
            const uploadDir = path.join(DATA_DIR, 'uploads', String(patentId));
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            // 文件名冲突时自动加数字后缀
            let finalName = body.file_name;
            let filePath = path.join(uploadDir, finalName);
            let counter = 1;
            while (fs.existsSync(filePath)) {
                const ext = path.extname(body.file_name);
                const base = path.basename(body.file_name, ext);
                finalName = `${base}_${counter}${ext}`;
                filePath = path.join(uploadDir, finalName);
                counter++;
            }
            // 解码 base64 写入文件
            const buffer = Buffer.from(body.file_data, 'base64');
            fs.writeFileSync(filePath, buffer);
            // 记录到数据库
            const relativePath = `uploads/${patentId}/${finalName}`;
            const dbResult = db.run(
                "INSERT INTO attachments (patent_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)",
                [patentId, finalName, relativePath, body.file_type || '其他']
            );
            result = { id: dbResult.lastInsertRowid, file_path: relativePath };
        }
        // === 删除附件 ===
        else if (pathname === '/api/attachments/delete' && method === 'POST') {
            const body = await parseBody(req);
            const atts = db.query("SELECT file_path FROM attachments WHERE id = ?", [body.id]);
            if (atts.length > 0) {
                const fullPath = path.join(DATA_DIR, atts[0].file_path);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
                db.run("DELETE FROM attachments WHERE id = ?", [body.id]);
            }
            result = { success: true };
        }
        // === 数据库备份 ===
        else if (pathname === '/api/db/backup' && method === 'POST') {
            result = { success: db.backup() };
        }
        // === 备份文件列表 ===
        else if (pathname === '/api/db/backups' && method === 'GET') {
            const backupDir = path.join(DATA_DIR, 'backups');
            if (fs.existsSync(backupDir)) {
                const files = fs.readdirSync(backupDir)
                    .filter(f => f.endsWith('.db'))
                    .map(f => {
                        const stat = fs.statSync(path.join(backupDir, f));
                        return {
                            name: f,
                            size: stat.size,
                            created_at: stat.birthtime || stat.mtime,
                            path: path.join(backupDir, f)
                        };
                    })
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                result = { backups: files };
            } else {
                result = { backups: [] };
            }
        }
        else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'API not found' }));
            return;
        }

        res.writeHead(200);
        res.end(JSON.stringify(result));
    } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
    }
}

// ============================================
// 启动 HTTP 服务器
// ============================================
function startHttpServer() {
    const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url);
        const pathname = parsedUrl.pathname;

        // API 请求转发
        if (pathname.startsWith('/api/')) {
            handleApiRequest(req, res);
            return;
        }

        // 静态文件处理
        let filePath;
        if (pathname === '/') {
            filePath = path.join(SRC_DIR, 'index.html');
        } else if (pathname.startsWith('/node_modules/')) {
            filePath = path.join(ROOT_DIR, pathname);
        } else if (pathname.startsWith('/uploads/')) {
            filePath = path.join(DATA_DIR, pathname);
        } else {
            filePath = path.join(SRC_DIR, pathname);
        }

        // 安全检查：防止目录穿越
        if (!filePath.startsWith(SRC_DIR) && !filePath.startsWith(DATA_DIR) && !filePath.startsWith(NM_DIR)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        serveStaticFile(res, filePath);
    });

    server.listen(PORT, () => {
        console.log(`========================================`);
        console.log(`  企业专利全生命周期管理系统`);
        console.log(`  运行地址：http://localhost:${PORT}`);
        console.log(`========================================`);
    });
}

// ============================================
// 启动
// ============================================
initServer().catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
});
