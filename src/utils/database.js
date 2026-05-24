/**
 * 文件名：database.js
 * 作用：数据库管理模块，封装 sql.js 的初始化、查询、写入和备份
 * 被哪些文件调用：server.js（服务端入口）
 * 依赖：sql.js, fs, path, crypto
 * 使用场景：服务器启动时初始化，所有 API 请求通过此模块操作数据库
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seedData = require('./seed_data.js');

class Database {
    /**
     * 函数名：constructor
     * 作用：创建 Database 实例
     * 参数：
     *   - dataDir - string - 数据库文件存储目录
     * 返回值：Database 实例
     * 使用场景：服务器启动时创建
     */
    constructor(dataDir) {
        // 变量名：dataDir
        // 作用：数据库文件存放目录
        // 格式：string - 绝对路径
        this.dataDir = dataDir;

        // 变量名：dbPath
        // 作用：主数据库文件完整路径
        // 格式：string
        this.dbPath = path.join(dataDir, 'patent.db');

        // 变量名：backupDir
        // 作用：备份文件存放目录
        // 格式：string - 绝对路径
        this.backupDir = path.join(dataDir, 'backups');
    }

    /**
     * 函数名：init
     * 作用：初始化数据库连接，创建表结构
     * 参数：无
     * 返回值：Promise<void>
     * 使用场景：服务器启动时调用
     */
    async init() {
        // 第1步：加载 sql.js WASM 模块
        const SQL = await initSqlJs();

        // 第2步：检查数据库文件是否存在
        if (fs.existsSync(this.dbPath)) {
            // 存在 → 从文件加载
            const buffer = fs.readFileSync(this.dbPath);
            this.db = new SQL.Database(buffer);
        } else {
            // 不存在 → 创建新数据库
            this.db = new SQL.Database();
        }

        // 第3步：确保备份目录存在
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }

        // 第4步：创建表结构
        this.createTables();
    }

    /**
     * 函数名：createTables
     * 作用：创建所有数据库表（如已存在则不重复创建）
     * 参数：无
     * 返回值：void
     * 使用场景：数据库初始化时
     */
    createTables() {
        // 开启外键约束
        this.db.run('PRAGMA foreign_keys = ON');

        // === 设置表：存储应用配置（如密码等键值对）===
        this.db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        // === 专利主表 ===
        this.db.run(`
            CREATE TABLE IF NOT EXISTS patents (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patent_no       TEXT NOT NULL UNIQUE,       -- 专利号/申请号（13位数字+小数点+校验位）
                patent_name     TEXT NOT NULL,              -- 专利名称
                patent_type     TEXT NOT NULL,              -- 专利类型：发明/实用新型/外观设计
                inventor        TEXT DEFAULT '',            -- 发明人
                applicant       TEXT DEFAULT '',            -- 申请人
                apply_date      TEXT,                       -- 申请日期 (YYYY-MM-DD)
                authorize_date  TEXT,                       -- 授权公告日 (YYYY-MM-DD)
                status          TEXT NOT NULL DEFAULT '撰写中',  -- 权利状态
                fee_reduction   TEXT DEFAULT '无',           -- 费减比例：无/个人/小微企业/普通企业/事业高校
                notes           TEXT DEFAULT '',            -- 备注
                is_deleted      INTEGER DEFAULT 0,          -- 0:正常 1:回收站中
                deleted_at      TEXT,                       -- 移入回收站时间
                created_at      TEXT DEFAULT (datetime('now','localtime')),
                updated_at      TEXT DEFAULT (datetime('now','localtime'))
            )
        `);

        // === 缴费任务表 ===
        this.db.run(`
            CREATE TABLE IF NOT EXISTS fee_tasks (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patent_id       INTEGER NOT NULL,           -- 关联专利ID
                fee_type        TEXT NOT NULL,              -- 费用类型：申请费/公布印刷费/实审费/授权登记费/年费
                year_index      INTEGER,                    -- 年度（年费专用，如第1年=1）
                due_date        TEXT NOT NULL,              -- 截止日期 (YYYY-MM-DD)
                amount          REAL NOT NULL DEFAULT 0,    -- 应缴金额
                paid_amount     REAL DEFAULT 0,             -- 实缴金额
                status          TEXT DEFAULT '待缴费',       -- 待缴费/已缴费/已失效
                paid_date       TEXT,                       -- 缴费日期
                penalty_rate    REAL DEFAULT 0,             -- 滞纳金比例
                paid_year       INTEGER,                    -- 已缴年度标记
                created_at      TEXT DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (patent_id) REFERENCES patents(id)
            )
        `);

        // === 附件表 ===
        this.db.run(`
            CREATE TABLE IF NOT EXISTS attachments (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patent_id       INTEGER NOT NULL,           -- 关联专利ID
                file_name       TEXT NOT NULL,              -- 文件名
                file_path       TEXT NOT NULL,              -- 文件存储路径
                file_type       TEXT,                       -- 文件类型（如：受理通知书/审查意见等）
                uploaded_at     TEXT DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (patent_id) REFERENCES patents(id)
            )
        `);

        // === 操作日志表 ===
        this.db.run(`
            CREATE TABLE IF NOT EXISTS operation_logs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patent_id       INTEGER,                    -- 关联专利ID（可选，0表示系统操作）
                action_type     TEXT NOT NULL,              -- 操作类型：创建/导入/状态变更/缴费/删除/恢复
                description     TEXT NOT NULL,              -- 操作描述
                operator        TEXT DEFAULT '系统',         -- 操作人
                created_at      TEXT DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (patent_id) REFERENCES patents(id)
            )
        `);

        // === 年费标准表：存储各类型专利各年度的年费金额 ===
        this.db.run(`
            CREATE TABLE IF NOT EXISTS fee_standards (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patent_type     TEXT NOT NULL,              -- 专利类型：发明/实用新型/外观设计
                year_start      INTEGER NOT NULL,           -- 起始年度
                year_end        INTEGER NOT NULL,           -- 结束年度
                fee             REAL NOT NULL               -- 年费金额（元）
            )
        `);

        // === 费减比例表 ===
        this.db.run(`
            CREATE TABLE IF NOT EXISTS fee_reduction_rates (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                type            TEXT NOT NULL UNIQUE,       -- 类型：无/个人/小微企业/普通企业/事业高校
                rate            REAL NOT NULL               -- 费减后应缴比例（如0.15=缴15%）
            )
        `);

        // === 滞纳金比例表 ===
        this.db.run(`
            CREATE TABLE IF NOT EXISTS penalty_rates (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                overdue_months  INTEGER NOT NULL,           -- 逾期月数
                rate            REAL NOT NULL               -- 滞纳金比例（如0.05=加收5%）
            )
        `);

        // === 状态流转映射表：定义专利状态变更规则 ===
        this.db.run(`
            CREATE TABLE IF NOT EXISTS status_transitions (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                current_status      TEXT NOT NULL,           -- 当前状态
                action              TEXT NOT NULL,           -- 用户操作
                attachment_required INTEGER DEFAULT 0,      -- 是否需要上传附件 0/1
                attachment_type     TEXT DEFAULT '',         -- 附件类型说明
                next_status         TEXT NOT NULL,           -- 下一状态
                fee_type            TEXT DEFAULT '',         -- 涉及费用类型
                fee_due_rule        TEXT DEFAULT ''          -- 费用截止规则
            )
        `);

        // === 费用截止规则表 ===
        this.db.run(`
            CREATE TABLE IF NOT EXISTS fee_due_rules (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                fee_type        TEXT NOT NULL,               -- 费用类型
                base_on         TEXT NOT NULL,               -- 基准日期字段名
                offset_months   INTEGER NOT NULL,            -- 偏移月数
                desc            TEXT DEFAULT ''              -- 规则描述
            )
        `);

        this.save();

        // 第5步：检查是否需要填充种子数据
        const seeded = this.query("SELECT value FROM settings WHERE key = 'seed_imported'");
        if (seeded.length === 0) {
            this.seedData();
        }
    }

    /**
     * 函数名：save
     * 作用：将当前数据库状态写入磁盘文件
     * 参数：无
     * 返回值：void
     * 使用场景：每次写操作后调用
     */
    save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
    }

    /**
     * 函数名：query
     * 作用：执行 SELECT 查询
     * 参数：
     *   - sql - string - SQL 查询语句
     *   - params - Array - 查询参数
     * 返回值：Array<Object> - 查询结果数组，每行一个对象
     * 使用场景：所有读取数据操作
     */
    query(sql, params = []) {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }

    /**
     * 函数名：run
     * 作用：执行 INSERT/UPDATE/DELETE 操作
     * 参数：
     *   - sql - string - SQL 语句
     *   - params - Array - 语句参数
     * 返回值：Object - { changes: number, lastInsertRowid: number }
     * 使用场景：所有写入数据操作
     */
    run(sql, params = []) {
        this.db.run(sql, params);
        this.save();

        // 第5步：记录操作日志（对 patents 和 fee_tasks 表的操作）
        if (sql.includes('patents') || sql.includes('fee_tasks')) {
            this.logOperation(sql, params);
        }

        return {
            changes: this.db.getRowsModified(),
            lastInsertRowid: this.db.exec("SELECT last_insert_rowid() as id")[0]?.values?.[0]?.[0] || null
        };
    }

    /**
     * 函数名：logOperation
     * 作用：解析 SQL 并写入操作日志
     * 参数：
     *   - sql - string - 原始 SQL 语句
     *   - params - Array - 参数
     * 返回值：void
     * 使用场景：run() 中自动调用
     */
    logOperation(sql, params) {
        const upperSql = sql.trim().toUpperCase();
        let actionType = '修改';
        let description = sql;

        if (upperSql.startsWith('INSERT')) {
            actionType = '创建';
            description = `新增记录: ${sql.substring(0, 100)}`;
        } else if (upperSql.startsWith('UPDATE')) {
            actionType = '修改';
            description = `更新记录: ${sql.substring(0, 100)}`;
        } else if (upperSql.startsWith('DELETE')) {
            actionType = '删除';
            description = `删除记录: ${sql.substring(0, 100)}`;
        }

        try {
            this.db.run(
                "INSERT INTO operation_logs (action_type, description) VALUES (?, ?)",
                [actionType, description]
            );
            this.save();
        } catch (e) {
            // 日志写入失败不影响主操作
        }
    }

    /**
     * 函数名：seedData
     * 作用：首次初始化时填充种子数据（年费标准、费减比例、状态流转等）
     * 参数：无
     * 返回值：void
     * 使用场景：数据库首次创建时自动调用
     */
    seedData() {
        // 第1步：填充年费标准
        const insertFee = this.db.prepare(
            "INSERT INTO fee_standards (patent_type, year_start, year_end, fee) VALUES (?, ?, ?, ?)"
        );
        seedData.FEE_STANDARDS.forEach(s => {
            insertFee.run([s.patent_type, s.year_start, s.year_end, s.fee]);
        });
        insertFee.free();

        // 第2步：填充费减比例
        const insertReduction = this.db.prepare(
            "INSERT INTO fee_reduction_rates (type, rate) VALUES (?, ?)"
        );
        seedData.FEE_REDUCTION_RATES.forEach(r => {
            insertReduction.run([r.type, r.rate]);
        });
        insertReduction.free();

        // 第3步：填充滞纳金比例
        const insertPenalty = this.db.prepare(
            "INSERT INTO penalty_rates (overdue_months, rate) VALUES (?, ?)"
        );
        seedData.PENALTY_RATES.forEach(p => {
            insertPenalty.run([p.overdue_months, p.rate]);
        });
        insertPenalty.free();

        // 第4步：填充状态流转映射
        const insertTransition = this.db.prepare(
            `INSERT INTO status_transitions
             (current_status, action, attachment_required, attachment_type, next_status, fee_type, fee_due_rule)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        seedData.STATUS_TRANSITIONS.forEach(t => {
            insertTransition.run([
                t.current_status, t.action, t.attachment_required,
                t.attachment_type, t.next_status, t.fee_type, t.fee_due_rule
            ]);
        });
        insertTransition.free();

        // 第5步：填充费用截止规则
        const insertDueRule = this.db.prepare(
            "INSERT INTO fee_due_rules (fee_type, base_on, offset_months, desc) VALUES (?, ?, ?, ?)"
        );
        seedData.FEE_DUE_RULES.forEach(r => {
            insertDueRule.run([r.fee_type, r.base_on, r.offset_months, r.desc]);
        });
        insertDueRule.free();

        // 第6步：标记种子数据已导入
        this.db.run(
            "INSERT INTO settings (key, value) VALUES ('seed_imported', '1')"
        );

        this.save();
        console.log('种子数据已导入');
    }

    /**
     * 函数名：backup
     * 作用：创建数据库快照备份，保留最近5次
     * 参数：无
     * 返回值：boolean - 是否备份成功
     * 使用场景：批量导入/批改前自动调用
     */
    backup() {
        try {
            // 第1步：生成备份文件名（含时间戳）
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.backupDir, `patent_${timestamp}.db`);

            // 第2步：保存当前数据库状态到备份文件
            const data = this.db.export();
            fs.writeFileSync(backupPath, Buffer.from(data));

            // 第3步：清理旧备份，只保留最近5次
            const files = fs.readdirSync(this.backupDir)
                .filter(f => f.startsWith('patent_') && f.endsWith('.db'))
                .sort()
                .reverse();

            if (files.length > 5) {
                files.slice(5).forEach(f => {
                    fs.unlinkSync(path.join(this.backupDir, f));
                });
            }

            return true;
        } catch (err) {
            console.error('备份失败:', err);
            return false;
        }
    }

    /**
     * 函数名：close
     * 作用：关闭数据库连接
     * 参数：无
     * 返回值：void
     * 使用场景：应用关闭时
     */
    close() {
        if (this.db) {
            this.save();
            this.db.close();
            this.db = null;
        }
    }
}

module.exports = Database;
