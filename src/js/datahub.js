/**
 * 文件名：datahub.js
 * 作用：数据中心页面逻辑（手动录入、Excel导入、导出、回收站）
 * 被哪些文件调用：index.html 底部引入
 * 依赖：window.patentAPI
 * 使用场景：用户点击"数据中心"导航时加载
 */

// ============================================
// CNIPA 专利号校验
// 规则：13位数字 + 小数点 + 1位校验位
// ============================================
/**
 * 函数名：validatePatentNo
 * 作用：校验专利号是否符合 CNIPA 标准格式
 * 参数：
 *   - value - string - 专利号
 * 返回值：Object - { valid: boolean, message: string }
 * 使用场景：手动录入和 Excel 导入时校验
 */
function validatePatentNo(value) {
    if (!value || value.trim() === '') {
        return { valid: false, message: '专利号不能为空' };
    }
    const trimmed = value.trim();
    // 格式：数字部分(13位) + 小数点 + 校验位(1位)
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
    initManualForm();
    initImport();
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
        });
    });
}

// ============================================
// 手动录入表单
// ============================================
function initManualForm() {
    // 专利号实时校验
    document.getElementById('fPatentNo').addEventListener('blur', function () {
        const result = validatePatentNo(this.value);
        const errorEl = document.getElementById('fPatentNoError');
        if (!result.valid && this.value.trim() !== '') {
            errorEl.textContent = result.message;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.classList.add('hidden');
        }
    });

    // 保存按钮
    document.getElementById('btnSavePatent').addEventListener('click', savePatent);

    // 重置按钮
    document.getElementById('btnResetForm').addEventListener('click', () => {
        document.getElementById('patentForm').reset();
        document.getElementById('fPatentNoError').classList.add('hidden');
        document.getElementById('fFormMessage').classList.add('hidden');
    });

    // 回车提交
    document.getElementById('patentForm').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'SELECT') {
            e.preventDefault();
            document.getElementById('btnSavePatent').click();
        }
    });
}

/**
 * 函数名：savePatent
 * 作用：保存手动录入的专利数据
 * 参数：无
 * 返回值：Promise<void>
 * 使用场景：用户点击"保存"按钮时
 */
async function savePatent() {
    const msgEl = document.getElementById('fFormMessage');
    msgEl.classList.add('hidden');

    // 第1步：收集表单数据
    const patentNo = document.getElementById('fPatentNo').value.trim();
    const patentName = document.getElementById('fPatentName').value.trim();
    const patentType = document.getElementById('fPatentType').value;
    const inventor = document.getElementById('fInventor').value.trim();
    const applicant = document.getElementById('fApplicant').value.trim();
    const applyDate = document.getElementById('fApplyDate').value;
    const authorizeDate = document.getElementById('fAuthorizeDate').value;
    const status = document.getElementById('fStatus').value;
    const feeReduction = document.getElementById('fFeeReduction').value;
    const notes = document.getElementById('fNotes').value.trim();

    // 第2步：校验必填项
    if (!patentNo || !patentName || !patentType) {
        showFormMsg('请填写必填项（专利号、名称、类型）', 'error');
        return;
    }

    // 第3步：校验专利号格式
    const noResult = validatePatentNo(patentNo);
    if (!noResult.valid) {
        showFormMsg('专利号格式错误：' + noResult.message, 'error');
        return;
    }

    // 第4步：检查是否已存在（去重）
    const existing = await window.patentAPI.dbQuery(
        "SELECT id FROM patents WHERE patent_no = ? AND is_deleted = 0",
        [patentNo]
    );
    if (existing.length > 0) {
        showFormMsg('该专利号已存在，请勿重复添加', 'error');
        return;
    }

    // 第5步：保存到数据库
    try {
        await window.patentAPI.dbRun(
            `INSERT INTO patents (patent_no, patent_name, patent_type, inventor, applicant,
             apply_date, authorize_date, status, fee_reduction, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [patentNo, patentName, patentType, inventor, applicant,
             applyDate || null, authorizeDate || null, status, feeReduction, notes]
        );
        showFormMsg('保存成功！', 'success');
        document.getElementById('patentForm').reset();
    } catch (err) {
        showFormMsg('保存失败：' + err.message, 'error');
    }
}

function showFormMsg(text, type) {
    const el = document.getElementById('fFormMessage');
    el.textContent = text;
    el.className = 'form-msg ' + type;
    el.classList.remove('hidden');
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
         '申请日期', '授权公告日', '权利状态', '费减比例', '备注']
    ];
    const example = [
        ['202310123456.7', '示例专利名称', '发明', '张三', '某公司',
         '2023-01-15', '', '撰写中', '无', '']
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers.concat(example));
    // 设置列宽
    ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 20 },
                    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '专利导入模板');
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
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

            if (jsonData.length === 0) {
                alert('文件中没有数据');
                return;
            }

            // 解析并校验数据
            const parsed = parseImportData(jsonData);
            importData = parsed.valid;
            showImportPreview(parsed);
        } catch (err) {
            alert('文件解析失败：' + err.message);
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
        '备注': 'notes'
    };

    rows.forEach((row, idx) => {
        const lineNum = idx + 2; // +2 因为行号从1开始，第1行是表头
        const mapped = {};
        // 表头自动匹配
        Object.keys(row).forEach(key => {
            const dbField = fieldMap[key.trim()] || null;
            if (dbField) {
                mapped[dbField] = String(row[key]).trim();
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
        alert('没有可导入的数据');
        return;
    }

    // 去重检查
    const duplicates = [];
    const newData = [];
    for (const row of importData) {
        const existing = await window.patentAPI.dbQuery(
            "SELECT id, patent_name FROM patents WHERE patent_no = ? AND is_deleted = 0",
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
        alert('没有需要导入的数据');
        return;
    }

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
            await window.patentAPI.dbRun(
                `INSERT INTO patents (patent_no, patent_name, patent_type, inventor, applicant,
                 apply_date, authorize_date, status, fee_reduction, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [row.patent_no, row.patent_name, row.patent_type || '',
                 row.inventor || '', row.applicant || '',
                 row.apply_date || null, row.authorize_date || null,
                 row.status || '撰写中', row.fee_reduction || '无', row.notes || '']
            );
            successCount++;
        } catch (err) {
            console.error('导入失败:', row.patent_no, err);
        }
    }

    alert(`导入完成！成功 ${successCount} 条` + (newData.length - successCount > 0 ? `，失败 ${newData.length - successCount} 条` : ''));
    document.getElementById('importPreview').classList.add('hidden');
    document.getElementById('fileInput').value = '';
    importData = [];
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
