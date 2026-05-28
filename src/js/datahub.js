/**
 * 文件名：datahub.js
 * 作用：数据中心页面逻辑（Excel导入、导出、回收站）
 * 手动录入功能已迁移至 workbench.js
 * 被哪些文件调用：index.html 底部引入
 * 依赖：window.patentAPI
 * 使用场景：用户点击"数据中心"导航时加载
 */

// ============================================
// CNIPA 专利号校验
// 规则：13位数字 + 小数点 + 1位校验位
// ============================================
function validatePatentNo(value) {
    if (!value || value.trim() === '') {
        return { valid: false, message: '专利号不能为空' };
    }
    const trimmed = value.trim();
    const pattern = /^\d{13}\.\d$/;
    if (!pattern.test(trimmed)) {
        if (!trimmed.includes('.')) {
            return { valid: false, message: '缺少小数点' };
        }
        const parts = trimmed.split('.');
        if (parts[0].length !== 13) {
            return { valid: false, message: `数字部分应为13位，当前${parts[0].length}位` };
        }
        if (parts[1].length !== 1) {
            return { valid: false, message: `校验位应为1位，当前${parts[1].length}位` };
        }
        return { valid: false, message: '格式不符，应为 13位数字.1位校验位' };
    }
    return { valid: true, message: '' };
}

// ============================================
// 页面初始化
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initSubTabs();
    initExport();
    initImport();
    initRecycle();
    cleanupRecycleBin();
});

// ============================================
// 子标签切换
// ============================================
function initSubTabs() {
    const subTabs = document.querySelectorAll('.sub-tab');
    subTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            subTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const subPage = tab.dataset.subpage;
            document.querySelectorAll('.sub-page').forEach(p => {
                p.classList.toggle('active', p.id === 'sub' + subPage.charAt(0).toUpperCase() + subPage.slice(1));
            });
            // 切换到回收站时自动刷新数据
            if (tab.dataset.subpage === 'recycle') {
                loadRecycleBin();
            }
        });
    });
}


// ============================================
// 导出功能
// ============================================
function initExport() {
    document.getElementById('btnExport').addEventListener('click', exportToExcel);
}

/**
 * 函数名：exportToExcel
 * 作用：按选中字段导出专利数据到 Excel
 * 参数：无
 * 返回值：Promise<void>
 * 使用场景：用户点击"导出 Excel"按钮时
 */
async function exportToExcel() {
    // 第1步：获取选中的字段
    const checked = document.querySelectorAll('.export-field:checked');
    if (checked.length === 0) {
        await showAlertModal('请至少选择一个导出字段');
        return;
    }

    const fields = Array.from(checked).map(cb => cb.value);
    // 中文表头映射
    const fieldLabels = {
        patent_no: '专利号/申请号', patent_name: '专利名称', patent_type: '专利类型',
        inventor: '发明人', applicant: '申请人', apply_date: '申请日期',
        authorize_date: '授权公告日', status: '权利状态', fee_reduction: '费减比例', notes: '备注'
    };

    // 第2步：查询所有未删除的专利
    const patents = await window.patentAPI.dbQuery(
        "SELECT * FROM patents WHERE is_deleted = 0 ORDER BY created_at DESC"
    );

    if (patents.length === 0) {
        await showAlertModal('没有可导出的数据');
        return;
    }

    // 第3步：生成导出数据
    const headers = fields.map(f => fieldLabels[f] || f);
    const rows = patents.map(p => fields.map(f => p[f] || ''));
    const wsData = [headers, ...rows];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = fields.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '专利数据');
    XLSX.writeFile(wb, `专利导出_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ============================================
// 回收站功能
// ============================================
function initRecycle() {
    loadRecycleBin();
    loadBackups();
    document.getElementById('btnRefreshBackups').addEventListener('click', loadBackups);
    document.getElementById('btnBatchRestore').addEventListener('click', batchRestore);
    document.getElementById('btnBatchPermanentDelete').addEventListener('click', batchPermanentDelete);
    document.getElementById('recycleCheckAll').addEventListener('change', function () {
        document.querySelectorAll('.recycle-checkbox').forEach(cb => cb.checked = this.checked);
    });
}

/**
 * 函数名：loadRecycleBin
 * 作用：加载回收站中的专利列表
 * 参数：无
 * 返回值：Promise<void>
 * 使用场景：进入回收站标签时
 */
async function loadRecycleBin() {
    const patents = await window.patentAPI.dbQuery(
        "SELECT id, patent_no, patent_name, patent_type, deleted_at FROM patents WHERE is_deleted = 1 ORDER BY deleted_at DESC"
    );

    const tbody = document.getElementById('recycleBody');
    if (patents.length === 0) {
        tbody.innerHTML = '<tr id="recycleEmpty"><td colspan="6" class="text-center text-muted">回收站为空</td></tr>';
        return;
    }

    let html = '';
    patents.forEach(p => {
        html += `<tr>
            <td class="col-checkbox"><input type="checkbox" class="recycle-checkbox" value="${p.id}"></td>
            <td>${p.patent_no}</td>
            <td>${p.patent_name}</td>
            <td>${p.patent_type}</td>
            <td>${p.deleted_at || '-'}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-default btn-sm" onclick="restorePatent(${p.id})">恢复</button>
                <button class="btn btn-danger btn-sm" onclick="permanentDeletePatent(${p.id})">彻底删除</button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

/**
 * 函数名：restorePatent
 * 作用：从回收站恢复专利
 * 参数：
 *   - id - number - 专利ID
 * 返回值：Promise<void>
 * 使用场景：用户点击"恢复"按钮时
 */
async function restorePatent(id) {
    await window.patentAPI.dbRun(
        "UPDATE patents SET is_deleted = 0, deleted_at = NULL, updated_at = datetime('now','localtime') WHERE id = ?",
        [id]
    );
    loadRecycleBin();
}

/**
 * 函数名：permanentDeletePatent
 * 作用：从数据库中彻底删除专利记录（不可恢复）
 * 参数：
 *   - id - number - 专利ID
 * 返回值：Promise<void>
 * 使用场景：用户点击"彻底删除"按钮时
 */
async function permanentDeletePatent(id) {
    if (!await showConfirmModal('确定要彻底删除该专利吗？此操作不可恢复！')) return;
    await window.patentAPI.dbRun("DELETE FROM patents WHERE id = ? AND is_deleted = 1", [id]);
    loadRecycleBin();
}

/**
 * 函数名：batchRestore
 * 作用：批量恢复选中的专利
 * 参数：无
 * 返回值：Promise<void>
 * 使用场景：用户勾选多条后点击"批量恢复"按钮时
 */
async function batchRestore() {
    const checked = document.querySelectorAll('.recycle-checkbox:checked');
    if (checked.length === 0) {
        await showAlertModal('请先勾选要恢复的专利');
        return;
    }
    if (!await showConfirmModal(`确定要恢复选中的 ${checked.length} 条专利吗？`)) return;
    const ids = Array.from(checked).map(cb => cb.value);
    await window.patentAPI.dbRun(
        "UPDATE patents SET is_deleted = 0, deleted_at = NULL, updated_at = datetime('now','localtime') WHERE id IN (" + ids.map(() => '?').join(',') + ") AND is_deleted = 1",
        ids
    );
    document.getElementById('recycleCheckAll').checked = false;
    loadRecycleBin();
}

/**
 * 函数名：batchPermanentDelete
 * 作用：批量彻底删除选中的专利记录
 * 参数：无
 * 返回值：Promise<void>
 * 使用场景：用户勾选多条后点击"批量删除"按钮时
 */
async function batchPermanentDelete() {
    const checked = document.querySelectorAll('.recycle-checkbox:checked');
    if (checked.length === 0) {
        await showAlertModal('请先勾选要删除的专利');
        return;
    }
    if (!await showConfirmModal(`确定要彻底删除选中的 ${checked.length} 条专利吗？此操作不可恢复！`)) return;
    const ids = Array.from(checked).map(cb => cb.value);
    await window.patentAPI.dbRun(
        "DELETE FROM patents WHERE id IN (" + ids.map(() => '?').join(',') + ") AND is_deleted = 1",
        ids
    );
    document.getElementById('recycleCheckAll').checked = false;
    loadRecycleBin();
}

/**
 * 函数名：loadBackups
 * 作用：加载并显示备份文件列表
 * 参数：无
 * 返回值：Promise<void>
 * 使用场景：进入回收站或点击"刷新"按钮时
 */
async function loadBackups() {
    const tbody = document.getElementById('backupBody');
    try {
        const backups = await window.patentAPI.getBackups();
        if (backups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">暂无备份</td></tr>';
            return;
        }
        let html = '';
        backups.forEach(b => {
            const sizeKB = (b.size / 1024).toFixed(1);
            const time = new Date(b.created_at).toLocaleString('zh-CN');
            html += `<tr><td>${b.name}</td><td>${sizeKB} KB</td><td>${time}</td><td style="font-size:12px;">${b.path}</td></tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">加载失败：${err.message}</td></tr>`;
    }
}

/**
 * 函数名：cleanupRecycleBin
 * 作用：清理超过30天的回收站记录（彻底删除）
 * 参数：无
 * 返回值：Promise<void>
 * 使用场景：应用启动时或每日首次打开回收站时
 */
async function cleanupRecycleBin() {
    await window.patentAPI.dbRun(
        "DELETE FROM patents WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND datetime(deleted_at) < datetime('now','-30 days','localtime')"
    );
}

// ============================================
// Excel 导入功能
// ============================================
function initImport() {
    // 下载模板
    document.getElementById('btnDownloadTemplate').addEventListener('click', downloadTemplate);

    // 上传区域点击
    document.getElementById('uploadArea').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    // 文件选择
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);

    // 确认导入
    document.getElementById('btnConfirmImport').addEventListener('click', confirmImport);

    // 取消导入
    document.getElementById('btnCancelImport').addEventListener('click', () => {
        document.getElementById('importPreview').classList.add('hidden');
        document.getElementById('fileInput').value = '';
    });
}

/**
 * 函数名：downloadTemplate
 * 作用：生成并下载 Excel 导入模板
 * 参数：无
 * 返回值：void
 * 使用场景：用户点击"下载导入模板"时
 */
function downloadTemplate() {
    // 使用 XLSX 库生成模板文件
    const headers = [
        ['专利号/申请号', '专利名称', '专利类型', '发明人', '申请人',
         '申请日期', '授权公告日', '权利状态', '费减比例', '备注',
         '待办任务', '截止日期', '费用']
    ];
    const example = [
        ['202310123456.7', '示例专利名称', '发明', '张三', '某公司',
         '2023-01-15', '', '专利权生效', '无', '',
         '年费-第8年', '2027-01-16', '900']
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers.concat(example));
    // 设置列宽
    ws['!cols'] = [
        { wch: 18 }, { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 20 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
        { wch: 20 }, { wch: 14 }, { wch: 12 }
    ];

    // 填写说明 sheet
    const hints = [
        ['字段', '填写说明'],
        ['专利号/申请号', '必填，13位数字.1位校验位（如 202310123456.7）'],
        ['专利名称', '必填'],
        ['专利类型', '可选，发明 / 实用新型 / 外观设计'],
        ['发明人', '可选'],
        ['申请人', '可选'],
        ['申请日期', '可选，YYYY-MM-DD 或 Excel 日期格式'],
        ['授权公告日', '可选，YYYY-MM-DD 或 Excel 日期格式'],
        ['权利状态', '可选，撰写中 / 已申请 / 形式审查中 / 实质审查中 / OA答复中 / 通知授权 / 专利权生效 / 已驳回 / 已撤回 / 已终止'],
        ['费减比例', '可选，无 / 个人 / 小微企业 / 普通企业 / 事业高校'],
        ['备注', '可选'],
        ['待办任务', '可选。导入时自动创建待办缴费任务。格式：年费-第N年 / 申请费 / 授权登记费 / 公布印刷费 / 实质审查费'],
        ['截止日期', '待办任务的缴费截止日期。格式：YYYY-MM-DD'],
        ['费用', '待办任务的金额（元）。留空则根据专利类型和费减比例自动计算'],
        ['', ''],
        ['示例', '专利权生效的专利，待办任务填"年费-第8年"，截止日期填"2027-01-16"，费用填"900"'],
        ['示例', '已申请的专利，待办任务填"申请费"，截止日期填"2023-03-15"'],
    ];
    const wsHints = XLSX.utils.aoa_to_sheet(hints);
    wsHints['!cols'] = [{ wch: 18 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '专利导入模板');
    XLSX.utils.book_append_sheet(wb, wsHints, '填写说明');
    XLSX.writeFile(wb, '专利导入模板.xlsx');
}

// 变量名：importData
// 作用：暂存解析后的 Excel 数据，等待用户确认导入
// 格式：Array<Object>
// 更新时机：Excel 解析成功后赋值，导入完成或取消后清空
let importData = [];

/**
 * 函数名：handleFileSelect
 * 作用：处理用户选择的 Excel 文件，解析并预览
 * 参数：
 *   - event - Event - 文件选择事件
 * 返回值：void
 * 使用场景：用户选择文件后
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

            if (jsonData.length === 0) {
                await showAlertModal('文件中没有数据');
                return;
            }

            // 解析并校验数据
            const parsed = parseImportData(jsonData);
            importData = parsed.valid;
            showImportPreview(parsed);
        } catch (err) {
            await showAlertModal('文件解析失败：' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * 函数名：parseImportData
 * 作用：解析 Excel 数据，校验每一行的专利号格式
 * 参数：
 *   - rows - Array<Object> - Excel 解析出的行数据
 * 返回值：Object - { valid: Array<Object>, errors: Array<Object> }
 * 使用场景：Excel 文件解析后
 */
function parseImportData(rows) {
    const valid = [];
    const errors = [];
    const fieldMap = {
        '专利号/申请号': 'patent_no', '专利号': 'patent_no', '申请号': 'patent_no',
        '专利名称': 'patent_name', '名称': 'patent_name',
        '专利类型': 'patent_type', '类型': 'patent_type',
        '发明人': 'inventor',
        '申请人': 'applicant',
        '申请日期': 'apply_date',
        '授权公告日': 'authorize_date',
        '权利状态': 'status', '状态': 'status',
        '费减比例': 'fee_reduction',
        '备注': 'notes',
        '待办任务': 'task_desc',
        '截止日期': 'task_due_date',
        '费用': 'task_amount'
    };

    rows.forEach((row, idx) => {
        const lineNum = idx + 2; // +2 因为行号从1开始，第1行是表头
        const mapped = {};
        // 表头自动匹配
        Object.keys(row).forEach(key => {
            const dbField = fieldMap[key.trim()] || null;
            if (dbField) {
                // 日期字段处理：Excel 日期序列号 → YYYY-MM-DD
                if (dbField === 'apply_date' || dbField === 'authorize_date' || dbField === 'task_due_date') {
                    const val = row[key];
                    if (typeof val === 'number' && val > 59) {
                        try {
                            const parsed = XLSX.SSF.parse_date_code(val);
                            if (parsed && parsed.y) {
                                const m = String(parsed.m).padStart(2, '0');
                                const d = String(parsed.d).padStart(2, '0');
                                mapped[dbField] = `${parsed.y}-${m}-${d}`;
                                return;
                            }
                        } catch (e) { /* 解析失败则 fallthrough 到 String 处理 */ }
                    }
                    mapped[dbField] = String(val).trim();
                } else if (dbField === 'task_amount') {
                    // 费用字段：数字或空
                    const val = row[key];
                    if (val === '' || val === null || val === undefined) {
                        mapped[dbField] = '';
                    } else if (typeof val === 'number') {
                        mapped[dbField] = val;
                    } else {
                        const n = parseFloat(String(val).trim());
                        mapped[dbField] = isNaN(n) ? '' : n;
                    }
                } else {
                    mapped[dbField] = String(row[key]).trim();
                }
            }
        });

        // 校验专利号
        if (!mapped.patent_no) {
            errors.push({ line: lineNum, msg: '专利号为空' });
            return;
        }
        const noCheck = validatePatentNo(mapped.patent_no);
        if (!noCheck.valid) {
            errors.push({ line: lineNum, msg: '专利号格式错误：' + noCheck.message });
            return;
        }

        if (!mapped.patent_name) {
            errors.push({ line: lineNum, msg: '专利名称为空' });
            return;
        }

        valid.push(mapped);
    });

    return { valid, errors };
}

/**
 * 函数名：showImportPreview
 * 作用：显示导入数据预览表格和错误信息
 * 参数：
 *   - parsed - Object - 解析结果（含 valid 和 errors）
 * 返回值：void
 * 使用场景：Excel 解析完成后
 */
function showImportPreview(parsed) {
    document.getElementById('importPreview').classList.remove('hidden');

    // 显示预览表格
    const wrapper = document.getElementById('importTableWrapper');
    if (parsed.valid.length > 0) {
        let html = `<table class="import-table">
            <thead><tr>
                <th>专利号</th><th>名称</th><th>类型</th><th>发明人</th><th>状态</th>
            </tr></thead><tbody>`;
        parsed.valid.slice(0, 20).forEach(p => {
            html += `<tr>
                <td>${p.patent_no}</td>
                <td>${p.patent_name}</td>
                <td>${p.patent_type || '-'}</td>
                <td>${p.inventor || '-'}</td>
                <td>${p.status || '撰写中'}</td>
            </tr>`;
        });
        if (parsed.valid.length > 20) {
            html += `<tr><td colspan="5">... 共 ${parsed.valid.length} 条，仅显示前20条</td></tr>`;
        }
        html += '</tbody></table>';
        wrapper.innerHTML = html;
    } else {
        wrapper.innerHTML = '<p class="text-muted">无有效数据</p>';
    }

    // 显示错误信息
    const errEl = document.getElementById('importErrors');
    if (parsed.errors.length > 0) {
        let html = '<h5>格式错误：</h5><ul>';
        parsed.errors.forEach(e => {
            html += `<li>第${e.line}行：${e.msg}</li>`;
        });
        html += '</ul>';
        errEl.innerHTML = html;
        errEl.classList.remove('hidden');
    } else {
        errEl.classList.add('hidden');
    }
}

/**
 * 函数名：confirmImport
 * 作用：确认导入，去重处理后写入数据库
 * 参数：无
 * 返回值：Promise<void>
 * 使用场景：用户点击"确认导入"时
 */
async function confirmImport() {
    if (importData.length === 0) {
        await showAlertModal('没有可导入的数据');
        return;
    }

    // 去重检查：文件内重复
    const seenNos = {};
    const fileDuplicates = [];
    const dedupedData = [];
    for (const row of importData) {
        if (seenNos[row.patent_no]) {
            fileDuplicates.push(row);
        } else {
            seenNos[row.patent_no] = true;
            dedupedData.push(row);
        }
    }
    if (fileDuplicates.length > 0) {
        console.warn('文件内发现 ' + fileDuplicates.length + ' 条重复专利号，已跳过');
    }

    // 去重检查：数据库重复
    const duplicates = [];
    const newData = [];
    for (const row of dedupedData) {
        const existing = await window.patentAPI.dbQuery(
            "SELECT id, patent_name, is_deleted FROM patents WHERE patent_no = ?",
            [row.patent_no]
        );
        if (existing.length > 0) {
            duplicates.push(row);
        } else {
            newData.push(row);
        }
    }

    // 如果有重复，弹窗让用户选择
    if (duplicates.length > 0) {
        const action = await showDuplicatesDialog(duplicates);
        if (action === 'cancel') return;
        // 如果选择覆盖，把重复也加入 newData
        if (action === 'overwrite') {
            newData.push(...duplicates);
        }
    }

    if (newData.length === 0) {
        await showAlertModal('没有需要导入的数据');
        return;
    }

    // 备份数据库
    await window.patentAPI.backupDatabase();

    // 执行导入
    let successCount = 0;
    for (const row of newData) {
        try {
            // 如果是覆盖，先删除再插入
            if (duplicates.includes(row)) {
                await window.patentAPI.dbRun(
                    "DELETE FROM patents WHERE patent_no = ?", [row.patent_no]
                );
            }
            const result = await window.patentAPI.dbRun(
                `INSERT INTO patents (patent_no, patent_name, patent_type, inventor, applicant,
                 apply_date, authorize_date, status, fee_reduction, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [row.patent_no, row.patent_name, row.patent_type || '',
                 row.inventor || '', row.applicant || '',
                 row.apply_date || null, row.authorize_date || null,
                 row.status || '撰写中', row.fee_reduction || '无', row.notes || '']
            );
            // 如果有待办任务信息，创建 fee_task
            if (result && result.lastInsertRowid && row.task_desc && row.task_due_date) {
                await createImportFeeTask(result.lastInsertRowid, row);
            }
            successCount++;
        } catch (err) {
            console.error('导入失败:', row.patent_no, err);
        }
    }

    await showAlertModal(`导入完成！成功 ${successCount} 条` + (newData.length - successCount > 0 ? `，失败 ${newData.length - successCount} 条` : ''));
    document.getElementById('importPreview').classList.add('hidden');
    document.getElementById('fileInput').value = '';
    importData = [];
}

/**
 * 函数名：createImportFeeTask
 * 作用：根据导入行的待办任务信息创建 fee_task
 * 参数：
 *   - patentId - number - 专利 ID
 *   - row - Object - 导入行数据（含 task_desc, task_due_date, task_amount, patent_type, fee_reduction）
 * 返回值：Promise<void>
 */
async function createImportFeeTask(patentId, row) {
    const desc = row.task_desc.trim();
    let feeType = '';
    let yearIndex = null;

    // 解析 task_desc
    const yearMatch = desc.match(/^年费-第(\d+)年$/);
    if (yearMatch) {
        feeType = '年费';
        yearIndex = parseInt(yearMatch[1]);
    } else if (desc === '申请费') {
        feeType = '申请费';
    } else if (desc === '授权登记费') {
        feeType = '授权登记费';
    } else if (desc === '公布印刷费') {
        feeType = '公布印刷费';
    } else if (desc === '实质审查费') {
        feeType = '实质审查费';
    } else {
        return; // 无法识别的任务格式，跳过
    }

    if (!row.task_due_date) return; // 截止日期不能为空

    // 计算金额
    let amount = 0;
    if (row.task_amount !== '' && row.task_amount !== null && row.task_amount !== undefined) {
        amount = Number(row.task_amount);
    } else {
        // 自动计算
        if (feeType === '年费' && yearIndex) {
            amount = getAnnualFeeAmount(row.patent_type || '发明', yearIndex);
        } else {
            amount = getOtherFeeAmount(feeType, row.patent_type || '发明');
        }
        // 应用费减
        const rate = getFeeReductionRate(row.fee_reduction || '无');
        if (rate > 0) {
            amount = Math.round(amount * rate);
        }
    }
    if (amount <= 0) return;

    try {
        // 检查是否已存在相同任务（避免重复导入）
        const existing = await window.patentAPI.dbQuery(
            "SELECT id FROM fee_tasks WHERE patent_id = ? AND fee_type = ? AND year_index IS ? AND status = '待缴费'",
            [patentId, feeType, yearIndex || null]
        );
        if (existing.length > 0) return;

        await window.patentAPI.dbRun(
            "INSERT INTO fee_tasks (patent_id, fee_type, year_index, amount, due_date, status) VALUES (?, ?, ?, ?, ?, '待缴费')",
            [patentId, feeType, yearIndex, amount, row.task_due_date]
        );
        await window.patentAPI.dbRun(
            "INSERT INTO operation_logs (patent_id, action_type, description) VALUES (?, '任务生成', ?)",
            [patentId, `导入时创建待办：${desc}，金额¥${amount}，截止${row.task_due_date}`]
        );
    } catch (err) {
        console.error('创建费用任务失败:', patentId, err);
    }
}

/**
 * 函数名：showDuplicatesDialog
 * 作用：显示去重确认弹窗，供用户选择跳过或覆盖
 * 参数：
 *   - duplicates - Array<Object> - 重复的专利数据
 * 返回值：Promise<string> - 'skip' | 'overwrite' | 'cancel'
 * 使用场景：导入发现有重复专利号时
 */
function showDuplicatesDialog(duplicates) {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay';
        dialog.innerHTML = `
            <div class="modal">
                <h4>发现 ${duplicates.length} 条重复专利</h4>
                <ul class="dup-list">
                    ${duplicates.slice(0, 10).map(d =>
                        `<li>${d.patent_no} - ${d.patent_name}</li>`
                    ).join('')}
                    ${duplicates.length > 10 ? `<li>... 共${duplicates.length}条</li>` : ''}
                </ul>
                <p class="text-muted">请选择处理方式：</p>
                <div class="modal-actions">
                    <button class="btn btn-primary" data-action="overwrite">覆盖更新</button>
                    <button class="btn btn-default" data-action="skip">跳过重复</button>
                    <button class="btn btn-default" data-action="cancel">取消导入</button>
                </div>
            </div>
        `;

        dialog.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve(btn.dataset.action);
            });
        });

        document.body.appendChild(dialog);
    });
}
