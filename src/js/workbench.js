/**
 * 文件名：workbench.js
 * 作用：工作台页面逻辑（手动录入、专利列表等）
 * 被哪些文件调用：index.html 底部引入
 * 依赖：window.patentAPI
 * 使用场景：用户点击"工作台"导航时加载
 */

// ============================================
// CNIPA 专利号校验（与 datahub 共用同一规则）
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
    initManualEntry();
    initWorkbenchList();
});

// ============================================
// 手动录入
// ============================================
function initManualEntry() {
    const modal = document.getElementById('manualModal');
    const btnEntry = document.getElementById('btnManualEntry');
    const btnClose = document.getElementById('manualModalClose');
    const btnSave = document.getElementById('btnSavePatent');
    const btnReset = document.getElementById('btnResetForm');
    const form = document.getElementById('patentForm');

    // 点击"新增"按钮打开弹窗
    btnEntry.addEventListener('click', () => {
        modal.classList.remove('hidden');
        // 重置表单和错误提示
        form.reset();
        document.getElementById('fPatentNoError').classList.add('hidden');
        document.getElementById('fFormMessage').classList.add('hidden');
    });

    // 关闭弹窗
    function closeModal() {
        modal.classList.add('hidden');
    }
    btnClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

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
    btnSave.addEventListener('click', savePatent);

    // 重置按钮
    btnReset.addEventListener('click', () => {
        form.reset();
        document.getElementById('fPatentNoError').classList.add('hidden');
        document.getElementById('fFormMessage').classList.add('hidden');
    });

    // 回车提交
    form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'SELECT') {
            e.preventDefault();
            btnSave.click();
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

    // 收集表单数据
    const patentNo = document.getElementById('fPatentNo').value.trim();
    const patentName = document.getElementById('fPatentName').value.trim();
    const patentType = document.getElementById('fPatentTypeForm').value;
    const inventor = document.getElementById('fInventor').value.trim();
    const applicant = document.getElementById('fApplicant').value.trim();
    const applyDate = document.getElementById('fApplyDate').value;
    const authorizeDate = document.getElementById('fAuthorizeDate').value;
    const status = document.getElementById('fStatusForm').value;
    const feeReduction = document.getElementById('fFeeReduction').value;
    const notes = document.getElementById('fNotes').value.trim();

    // 校验必填项
    if (!patentNo || !patentName || !patentType) {
        showFormMsg('请填写必填项（专利号、名称、类型）', 'error');
        return;
    }

    // 校验专利号格式
    const noResult = validatePatentNo(patentNo);
    if (!noResult.valid) {
        showFormMsg('专利号格式错误：' + noResult.message, 'error');
        return;
    }

    // 检查是否已存在（去重）
    const existing = await window.patentAPI.dbQuery(
        "SELECT id FROM patents WHERE patent_no = ? AND is_deleted = 0",
        [patentNo]
    );
    if (existing.length > 0) {
        showFormMsg('该专利号已存在，请勿重复添加', 'error');
        return;
    }

    // 保存到数据库
    try {
        const result = await window.patentAPI.dbRun(
            `INSERT INTO patents (patent_no, patent_name, patent_type, inventor, applicant,
             apply_date, authorize_date, status, fee_reduction, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [patentNo, patentName, patentType, inventor, applicant,
             applyDate || null, authorizeDate || null, status, feeReduction, notes]
        );
        // 状态变更联动（新增专利时初始状态对应任务生成）
        if (result && result.lastInsertRowid) {
            await handleStatusChange(result.lastInsertRowid, status);
        }
        showFormMsg('保存成功！', 'success');
        document.getElementById('patentForm').reset();
        // 保存成功后关闭弹窗
        setTimeout(() => {
            document.getElementById('manualModal').classList.add('hidden');
        }, 800);
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
// 中国专利年费标准及工具函数
// ============================================
const ANNUAL_FEE_STANDARDS = {
    '发明': [
        { min: 1, max: 3, amount: 900 },
        { min: 4, max: 6, amount: 1200 },
        { min: 7, max: 8, amount: 2000 },
        { min: 9, max: 10, amount: 4000 },
        { min: 11, max: 12, amount: 4000 },
        { min: 13, max: 15, amount: 6000 },
        { min: 16, max: 20, amount: 8000 },
    ],
    '实用新型': [
        { min: 1, max: 3, amount: 600 },
        { min: 4, max: 6, amount: 900 },
        { min: 7, max: 8, amount: 1200 },
        { min: 9, max: 10, amount: 2000 },
    ],
    '外观设计': [
        { min: 1, max: 3, amount: 600 },
        { min: 4, max: 6, amount: 900 },
        { min: 7, max: 8, amount: 1200 },
        { min: 9, max: 10, amount: 1500 },
    ],
};
const FEE_REDUCTION_RATES = { '无': 1, '个人': 0.15, '小微企业': 0.15, '普通企业': 0.30, '事业高校': 0 };

function getAnnualFeeAmount(patentType, yearIndex) {
    const standards = ANNUAL_FEE_STANDARDS[patentType] || ANNUAL_FEE_STANDARDS['发明'];
    for (const range of standards) {
        if (yearIndex >= range.min && yearIndex <= range.max) return range.amount;
    }
    return 0;
}
function getMaxYearForType(patentType) {
    const standards = ANNUAL_FEE_STANDARDS[patentType] || ANNUAL_FEE_STANDARDS['发明'];
    return standards[standards.length - 1].max;
}
function getFeeReductionRate(feeReduction) {
    return FEE_REDUCTION_RATES[feeReduction] || 1;
}
function calculateFeeDueDate(applyDate, yearIndex) {
    const d = new Date(applyDate);
    const due = new Date(d.getFullYear() + yearIndex, d.getMonth(), d.getDate());
    return due.toISOString().slice(0, 10);
}

// ============================================
// 其他费用标准（申请费、公布印刷费、授权登记费）
// ============================================
const OTHER_FEE_STANDARDS = {
    '申请费': { '发明': 900, '实用新型': 500, '外观设计': 500 },
    '公布印刷费': { '发明': 50, '实用新型': 0, '外观设计': 0 },
    '授权登记费': { '发明': 250, '实用新型': 200, '外观设计': 200 },
    '实质审查费': { '发明': 2500 },
};

function getOtherFeeAmount(feeType, patentType) {
    const standards = OTHER_FEE_STANDARDS[feeType];
    if (!standards) return 0;
    return standards[patentType] || 0;
}

function addMonths(dateStr, months) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
}

/**
 * 函数名：createFeeTaskIfNotExists
 * 作用：创建费用任务（如已存在则跳过）
 */
async function createFeeTaskIfNotExists(patentId, feeType, yearIndex, amount, dueDate) {
    const existing = await window.patentAPI.dbQuery(
        "SELECT id FROM fee_tasks WHERE patent_id = ? AND fee_type = ? AND year_index IS ? AND status = '待缴费'",
        [patentId, feeType, yearIndex || null]
    );
    if (existing.length > 0) return false;
    await window.patentAPI.dbRun(
        "INSERT INTO fee_tasks (patent_id, fee_type, year_index, amount, due_date, status) VALUES (?, ?, ?, ?, ?, '待缴费')",
        [patentId, feeType, yearIndex || null, amount, dueDate]
    );
    return true;
}

/**
 * 函数名：handleStatusChange
 * 作用：状态变更联动——自动生成/取消费用任务
 * 参数：
 *   - patentId - number - 专利ID
 *   - newStatus - string - 变更后的状态
 * 返回值：Promise<void>
 * 使用场景：专利状态变更时自动调用
 */
async function handleStatusChange(patentId, newStatus) {
    const patents = await window.patentAPI.dbQuery("SELECT * FROM patents WHERE id = ?", [patentId]);
    if (patents.length === 0) return;
    const p = patents[0];

    // 1) → 已申请: 生成申请费 + 公布印刷费
    if (newStatus === '已申请' && p.apply_date) {
        const dueDate = addMonths(p.apply_date, 2);
        const feeAmt = getOtherFeeAmount('申请费', p.patent_type);
        let created = false;
        if (feeAmt > 0) {
            const rate = getFeeReductionRate(p.fee_reduction);
            const finalAmount = rate > 0 ? Math.round(feeAmt * rate) : feeAmt;
            const ok = await createFeeTaskIfNotExists(patentId, '申请费', null, finalAmount, dueDate);
            if (ok) created = true;
        }
        const pubAmt = getOtherFeeAmount('公布印刷费', p.patent_type);
        if (pubAmt > 0) {
            const ok = await createFeeTaskIfNotExists(patentId, '公布印刷费', null, pubAmt, dueDate);
            if (ok) created = true;
        }
        if (created) {
            await window.patentAPI.dbRun(
                "INSERT INTO operation_logs (patent_id, action_type, description) VALUES (?, '任务生成', ?)",
                [patentId, `状态变更为"已申请"，自动生成了申请费和公布印刷费任务`]
            );
        }
    }

    // 2) → 通知授权: 生成授权登记费
    if (newStatus === '通知授权') {
        const feeAmt = getOtherFeeAmount('授权登记费', p.patent_type);
        if (feeAmt > 0) {
            const rate = getFeeReductionRate(p.fee_reduction);
            const finalAmount = rate > 0 ? Math.round(feeAmt * rate) : feeAmt;
            const baseDate = p.authorize_date || new Date().toISOString().slice(0, 10);
            const dueDate = addMonths(baseDate, 2);
            const ok = await createFeeTaskIfNotExists(patentId, '授权登记费', null, finalAmount, dueDate);
            if (ok) {
                await window.patentAPI.dbRun(
                    "INSERT INTO operation_logs (patent_id, action_type, description) VALUES (?, '任务生成', ?)",
                    [patentId, `状态变更为"通知授权"，自动生成了授权登记费任务（¥${finalAmount}，截止${dueDate}）`]
                );
            }
        }
    }

    // 3) → 终态（已终止/已驳回/已撤回）: 取消所有待缴费任务
    if (['已终止', '已驳回', '已撤回'].includes(newStatus)) {
        await window.patentAPI.dbRun(
            "UPDATE fee_tasks SET status = '已失效' WHERE patent_id = ? AND status = '待缴费'",
            [patentId]
        );
        await window.patentAPI.dbRun(
            "INSERT INTO operation_logs (patent_id, action_type, description) VALUES (?, '状态变更', ?)",
            [patentId, `状态变更为"${newStatus}"，已取消所有待缴费任务`]
        );
    }

    // 4) → 专利权生效（手动编辑路径）: 生成首年年费（如已有则跳过）
    if (newStatus === '专利权生效' && p.apply_date) {
        const dueDate = calculateFeeDueDate(p.apply_date, 1);
        const amount = getAnnualFeeAmount(p.patent_type, 1);
        if (amount > 0) {
            const rate = getFeeReductionRate(p.fee_reduction);
            const finalAmount = rate > 0 ? Math.round(amount * rate) : amount;
            const ok = await createFeeTaskIfNotExists(patentId, '年费', 1, finalAmount, dueDate);
            if (ok) {
                await window.patentAPI.dbRun(
                    "INSERT INTO operation_logs (patent_id, action_type, description) VALUES (?, '任务生成', ?)",
                    [patentId, `状态变更为"专利权生效"，自动生成了首年年费任务（¥${finalAmount}，截止${dueDate}）`]
                );
            }
        }
    }
}

// ============================================
// 工作台 - 专利列表与检索
// ============================================
let patentPage = 1;
let pageSize = 15;
let totalPatents = 0;
let currentFilters = {};

/**
 * 函数名：escapeHtml
 * 作用：转义 HTML 特殊字符，防止 XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * 函数名：showConfirmModal
 * 作用：显示自定义确认弹窗，返回 Promise<boolean>
 */
function showConfirmModal(message) {
    return new Promise(resolve => {
        const overlay = document.getElementById('confirmModal');
        const msgEl = document.getElementById('confirmMessage');
        msgEl.textContent = message;
        overlay.classList.remove('hidden');

        const okBtn = document.getElementById('btnConfirmOk');
        const cancelBtn = document.getElementById('btnConfirmCancel');
        // 移除之前绑定的监听器，用新的一次性监听
        const okHandler = () => {
            overlay.classList.add('hidden');
            okBtn.removeEventListener('click', okHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            resolve(true);
        };
        const cancelHandler = () => {
            overlay.classList.add('hidden');
            okBtn.removeEventListener('click', okHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            resolve(false);
        };
        // 点击遮罩层也视为取消
        const overlayHandler = (e) => {
            if (e.target === e.currentTarget) {
                cancelHandler();
                overlay.removeEventListener('click', overlayHandler);
            }
        };
        okBtn.addEventListener('click', okHandler);
        cancelBtn.addEventListener('click', cancelHandler);
        overlay.addEventListener('click', overlayHandler);
    });
}

/**
 * 函数名：showAlertModal
 * 作用：显示自定义提示弹窗，返回 Promise
 */
function showAlertModal(message) {
    return new Promise(resolve => {
        const overlay = document.getElementById('alertModal');
        const msgEl = document.getElementById('alertMessage');
        msgEl.textContent = message;
        overlay.classList.remove('hidden');

        const okBtn = document.getElementById('btnAlertOk');
        const handler = () => {
            overlay.classList.add('hidden');
            okBtn.removeEventListener('click', handler);
            overlay.removeEventListener('click', overlayHandler);
            resolve();
        };
        const overlayHandler = (e) => {
            if (e.target === e.currentTarget) {
                handler();
            }
        };
        okBtn.addEventListener('click', handler);
        overlay.addEventListener('click', overlayHandler);
    });
}

/**
 * 函数名：initWorkbenchList
 * 作用：初始化专利列表（搜索、分页、复选框事件，首次加载）
 */
function initWorkbenchList() {
    // 搜索
    document.getElementById('btnSearch').addEventListener('click', () => {
        patentPage = 1;
        loadPatentList();
    });
    // 回车触发搜索
    document.querySelectorAll('.search-item input, .search-item select, .filter-item select').forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                patentPage = 1;
                loadPatentList();
            }
        });
    });
    // 筛选面板切换
    document.getElementById('btnFilterToggle').addEventListener('click', () => {
        document.getElementById('filterPanel').classList.toggle('hidden');
        document.getElementById('btnFilterToggle').classList.toggle('active');
    });
    // 全选复选框
    document.getElementById('checkAll').addEventListener('change', function () {
        document.querySelectorAll('.patent-checkbox').forEach(cb => cb.checked = this.checked);
    });
    // 专利详情页 - 关闭浮层
    document.getElementById('btnCloseDetail').addEventListener('click', hidePatentDetail);
    document.querySelector('#patentDetailContainer .pd-backdrop').addEventListener('click', hidePatentDetail);
    // 专利详情页 - 编辑/删除/完成待办
    document.getElementById('btnDetailEdit').addEventListener('click', enterEditMode);
    document.getElementById('btnDetailDelete').addEventListener('click', deleteCurrentPatent);
    document.getElementById('btnDetailCompleteTask').addEventListener('click', () => {
        if (currentDetailPatentId) completeTask(currentDetailPatentId);
    });
    // 上传附件
    document.getElementById('btnUploadAtt').addEventListener('click', uploadAttachment);
    // 专利详情页 - 保存/取消编辑
    document.getElementById('btnSaveEdit').addEventListener('click', savePatentEdit);
    document.getElementById('btnCancelEdit').addEventListener('click', async () => {
        if (await showConfirmModal('放弃编辑？')) exitEditMode();
    });
    // 专利详情页 - 标签切换
    document.querySelectorAll('.pd-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.pd-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.pd-tab-content').forEach(c => c.classList.remove('active'));
            const tabId = 'pdTab' + tab.dataset.pdtab.charAt(0).toUpperCase() + tab.dataset.pdtab.slice(1);
            document.getElementById(tabId).classList.add('active');
            // 附件管理标签被点击时渲染列表
            if (tab.dataset.pdtab === 'attachment' && currentDetailPatentId) {
                renderDetailAttachments(currentDetailPatentId);
            }
        });
    });
    // 关闭待办弹窗
    document.getElementById('taskModalClose').addEventListener('click', () => {
        document.getElementById('taskModal').classList.add('hidden');
    });
    document.getElementById('btnCancelTasks').addEventListener('click', () => {
        document.getElementById('taskModal').classList.add('hidden');
    });
    document.getElementById('taskModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('taskModal').classList.add('hidden');
        }
    });
    // 自定义确认弹窗
    document.getElementById('btnConfirmCancel').addEventListener('click', () => {
        document.getElementById('confirmModal').classList.add('hidden');
    });
    document.getElementById('confirmModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('confirmModal').classList.add('hidden');
        }
    });
    // 自定义提示弹窗 - 点击遮罩层关闭
    document.getElementById('alertModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('alertModal').classList.add('hidden');
        }
    });

    // 批量删除
    document.getElementById('btnBatchDelete').addEventListener('click', batchDelete);
    // 批量完成待办
    document.getElementById('btnBatchComplete').addEventListener('click', batchCompleteTask);

    // 首次加载
    loadPatentList();
}

/**
 * 函数名：loadPatentList
 * 作用：根据筛选条件和分页参数加载专利列表
 */
async function loadPatentList() {
    const tbody = document.getElementById('patentTableBody');

    // 收集筛选条件
    currentFilters = {
        keyword: document.getElementById('sKeyword').value.trim(),
        patent_type: document.getElementById('fPatentType').value,
        status: document.getElementById('fStatus').value,
        warning: document.getElementById('fWarning').value,
        date_from: document.getElementById('sDateFrom').value,
        date_to: document.getElementById('sDateTo').value
    };

    const { where, params } = buildWhereClause(currentFilters);
    const hasWarningFilter = !!currentFilters.warning;

    try {
        let $patents;
        let urgentMap = {};
        let warningMap = {};

        if (hasWarningFilter) {
            // 有预警筛选时：查询全部数据，JS计算预警后过滤，再切片分页
            const all = await window.patentAPI.dbQuery(
                "SELECT id, patent_no, patent_name, patent_type, status, apply_date FROM patents WHERE is_deleted = 0" + where + " ORDER BY created_at DESC",
                params
            );
            const result = await computeWarningMap(all);
            warningMap = result.warningMap;
            urgentMap = result.urgentMap;

            const filtered = all.filter(p => {
                const w = warningMap[p.id] || { level: 'none' };
                return w.level === currentFilters.warning;
            });
            totalPatents = filtered.length;

            const totalPages = Math.ceil(totalPatents / pageSize) || 1;
            if (patentPage > totalPages) patentPage = totalPages;
            const offset = (patentPage - 1) * pageSize;
            $patents = filtered.slice(offset, offset + pageSize);
        } else {
            // 无预警筛选：使用 SQL 分页
            const countResult = await window.patentAPI.dbQuery(
                "SELECT COUNT(*) as total FROM patents WHERE is_deleted = 0" + where,
                params
            );
            totalPatents = countResult[0].total;

            if (totalPatents === 0) {
                document.getElementById('totalCount').textContent = '共 0 条记录';
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:48px;">暂无数据</td></tr>';
                renderPagination();
                return;
            }

            const totalPages = Math.ceil(totalPatents / pageSize);
            if (patentPage > totalPages) patentPage = totalPages;

            const offset = (patentPage - 1) * pageSize;
            $patents = await window.patentAPI.dbQuery(
                "SELECT id, patent_no, patent_name, patent_type, status, apply_date FROM patents WHERE is_deleted = 0" + where + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
                [...params, pageSize, offset]
            );

            const result = await computeWarningMap($patents);
            warningMap = result.warningMap;
            urgentMap = result.urgentMap;
        }

        // ==== 公共渲染 ====
        document.getElementById('totalCount').textContent = `共 ${totalPatents} 条记录`;

        if ($patents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:48px;">暂无数据</td></tr>';
            renderPagination();
            return;
        }

        let html = '';
        $patents.forEach(p => {
            const urgent = urgentMap[p.id];
            const warning = warningMap[p.id] || { level: 'none', days: 0 };
            html += renderPatentRow(p, urgent, warning);
        });
        tbody.innerHTML = html;

        // 绑定每行点击事件
        tbody.querySelectorAll('.clickable-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.col-actions')) return;
                if (e.target.closest('.col-checkbox')) return;
                showPatentDetail(parseInt(row.dataset.id));
            });
        });

        // 绑定行内复选框事件
        tbody.querySelectorAll('.patent-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const all = document.querySelectorAll('.patent-checkbox');
                const checked = document.querySelectorAll('.patent-checkbox:checked');
                document.getElementById('checkAll').checked = all.length > 0 && all.length === checked.length;
            });
        });

        renderPagination();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:48px;">加载失败：${escapeHtml(err.message)}</td></tr>`;
    }
}

/**
 * 函数名：buildWhereClause
 * 作用：将筛选条件拼装为 SQL WHERE 子句
 * 参数：
 *   - filters - Object - 筛选条件
 * 返回值：{ where: string, params: Array }
 */
function buildWhereClause(filters) {
    const conditions = [];
    const params = [];

    if (filters.keyword) {
        conditions.push("(patent_no LIKE ? OR patent_name LIKE ? OR inventor LIKE ?)");
        const kw = '%' + filters.keyword + '%';
        params.push(kw, kw, kw);
    }
    if (filters.patent_type) {
        conditions.push("patent_type = ?");
        params.push(filters.patent_type);
    }
    if (filters.status) {
        conditions.push("status = ?");
        params.push(filters.status);
    }
    if (filters.date_from) {
        conditions.push("apply_date >= ?");
        params.push(filters.date_from);
    }
    if (filters.date_to) {
        conditions.push("apply_date <= ?");
        params.push(filters.date_to);
    }

    return {
        where: conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '',
        params: params
    };
}

/**
 * 函数名：computeWarningMap
 * 作用：综合 fee_tasks + STATUS_TRANSITIONS + attachments 计算紧迫任务和预警
 */
async function computeWarningMap(patents) {
    const patentIds = patents.map(p => p.id);
    const urgentMap = {};
    const warningMap = {};

    if (patentIds.length === 0) return { urgentMap, warningMap };

    const placeholders = patentIds.map(() => '?').join(',');

    // 1) 待缴费任务
    const tasks = await window.patentAPI.dbQuery(
        "SELECT patent_id, fee_type, year_index, due_date, amount FROM fee_tasks WHERE patent_id IN (" + placeholders + ") AND status = '待缴费' ORDER BY patent_id, due_date ASC",
        patentIds
    );
    const feeByPatent = {};
    tasks.forEach(t => {
        if (!feeByPatent[t.patent_id]) feeByPatent[t.patent_id] = [];
        feeByPatent[t.patent_id].push(t);
    });

    // 2) 查各专利状态对应的流转规则
    const uniqueStatuses = [...new Set(patents.map(p => p.status))];
    let transitions = [];
    if (uniqueStatuses.length > 0) {
        const sp = uniqueStatuses.map(() => '?').join(',');
        transitions = await window.patentAPI.dbQuery(
            "SELECT * FROM status_transitions WHERE current_status IN (" + sp + ") OR current_status = '任一'", uniqueStatuses
        );
    }
    const transByStatus = {};
    transitions.forEach(t => {
        if (!transByStatus[t.current_status]) transByStatus[t.current_status] = [];
        transByStatus[t.current_status].push(t);
    });

    // 3) 已上传附件
    const atts = await window.patentAPI.dbQuery(
        "SELECT patent_id, file_type FROM attachments WHERE patent_id IN (" + placeholders + ")", patentIds
    );
    const attByPatent = {};
    atts.forEach(a => {
        if (!attByPatent[a.patent_id]) attByPatent[a.patent_id] = new Set();
        attByPatent[a.patent_id].add(a.file_type);
    });

    const today = new Date();
    // 按 patentId 索引
    const patentMap = {};
    patents.forEach(p => { patentMap[p.id] = p; });

    patentIds.forEach(pid => {
        const p = patentMap[pid];
        if (!p) { urgentMap[pid] = null; warningMap[pid] = { level: 'none', days: 0 }; return; }

        const feeList = feeByPatent[pid] || [];
        const uploadedTypes = attByPatent[pid] || new Set();
        const statusTrans = (transByStatus[p.status] || []).filter(t => {
            if (t.current_status === '形式审查中' && t.next_status === '实质审查中' && p.patent_type !== '发明') return false;
            if (t.current_status === '形式审查中' && t.next_status === '通知授权' && p.patent_type === '发明') return false;
            return true;
        });

        // 找：缺上传、待确认
        let pendingAtt = null;
        let pendingConfirm = null;
        for (const t of statusTrans) {
            if (t.attachment_required && !uploadedTypes.has(t.attachment_type)) {
                pendingAtt = t; break;
            }
        }
        if (!pendingAtt) {
            for (const t of statusTrans) {
                if (!t.attachment_required && !t.fee_type) {
                    pendingConfirm = t; break;
                }
            }
        }

        // 紧迫任务优先级：逾期缴费 > 缺附件 > 30天内缴费 > 待确认 > 其他缴费
        let urgent = null;
        let warning = { level: 'none', days: 0 };

        // 逾期缴费
        const overdueFees = feeList.filter(f => new Date(f.due_date) < today);
        if (overdueFees.length > 0) {
            urgent = { type: 'fee', ...overdueFees[0] };
            warning = { level: 'overdue', days: Math.floor((today - new Date(overdueFees[0].due_date)) / (1000 * 60 * 60 * 24)) };
        }
        // 缺必需附件
        else if (pendingAtt) {
            urgent = { type: 'attachment', text: `待上传：${pendingAtt.attachment_type}`, attachment_type: pendingAtt.attachment_type };
            warning = { level: 'urgent', days: 0 };
        }
        // 30天内缴费
        else if (feeList.length > 0) {
            const sorted = [...feeList].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
            const earliest = sorted[0];
            const diffDays = Math.floor((new Date(earliest.due_date) - today) / (1000 * 60 * 60 * 24));
            if (diffDays <= 90) {
                urgent = { type: 'fee', ...earliest };
                warning = { level: 'urgent', days: diffDays };
            } else {
                urgent = { type: 'fee', ...earliest };
                warning = { level: 'safe', days: 0 };
            }
        }
        // 待确认
        else if (pendingConfirm) {
            urgent = { type: 'confirm', text: `待确认：${pendingConfirm.action}` };
            warning = { level: 'none', days: 0 };
        }

        urgentMap[pid] = urgent || null;
        warningMap[pid] = warning;
    });

    return { urgentMap, warningMap };
}

/**
 * 函数名：renderPatentRow
 * 作用：渲染单行专利数据（支持附件/确认/缴费三种紧迫类型）
 */
function renderPatentRow(patent, urgent, warning) {
    const nameHtml = escapeHtml(patent.patent_name);
    const noHtml = escapeHtml(patent.patent_no);
    const w = warning || { level: 'none', days: 0 };

    // 紧迫任务
    let urgentHtml = '<span class="urgent-none">—</span>';
    if (urgent) {
        if (urgent.type === 'attachment') {
            urgentHtml = `<div class="urgent-task"><div class="urgent-line1 urgent-att">${escapeHtml(urgent.text)}</div></div>`;
        } else if (urgent.type === 'confirm') {
            urgentHtml = `<div class="urgent-task"><div class="urgent-line1 urgent-confirm">${escapeHtml(urgent.text)}</div></div>`;
        } else {
            // fee 类型（原有样式）
            const typeLabel = escapeHtml(urgent.fee_type || '');
            const yearLabel = urgent.year_index ? `第${urgent.year_index}年` : '';
            const dueDate = escapeHtml(urgent.due_date || '');
            const amount = urgent.amount || 0;
            const isOverdue = dueDate ? new Date(urgent.due_date) < new Date() : false;
            urgentHtml = `<div class="urgent-task"><div class="urgent-line1">${yearLabel}${typeLabel}|¥${amount}</div><div class="urgent-line2 ${isOverdue ? 'overdue' : 'due-date'}">截止${dueDate}</div></div>`;
        }
    }

    // 预警灯 + 天数
    let warningHtml = '';
    if (urgent && urgent.type === 'attachment') {
        warningHtml = '<span class="warning-dot warning-dot-orange"></span>';
    } else if (w.level === 'overdue') {
        warningHtml = `<span class="warning-dot warning-dot-red"></span><span class="warning-text warning-text-red">逾期${w.days}天</span>`;
    } else if (w.level === 'urgent') {
        warningHtml = `<span class="warning-dot warning-dot-yellow"></span><span class="warning-text warning-text-yellow">剩余${w.days}天</span>`;
    } else if (w.level === 'safe') {
        warningHtml = `<span class="warning-dot warning-dot-green"></span><span class="warning-text warning-text-green">-</span>`;
    }

    // 状态标签
    const statusHtml = renderStatusTag(patent.status);

    return `<tr class="clickable-row" data-id="${patent.id}">
        <td class="col-checkbox"><input type="checkbox" class="patent-checkbox" value="${patent.id}"></td>
        <td class="col-warning">${warningHtml}</td>
        <td>${noHtml}</td>
        <td class="col-type">${escapeHtml(patent.patent_type || '-')}</td>
        <td><div class="patent-name-cell">${nameHtml}</div></td>
        <td class="col-status">${statusHtml}</td>
        <td>${urgentHtml}</td>
    </tr>`;
}

/**
 * 函数名：renderStatusTag
 * 作用：根据专利状态返回带颜色的标签 HTML
 */
function renderStatusTag(status) {
    const grayStatuses = ['撰写中', '已申请', '形式审查中'];
    const blueStatuses = ['实质审查中', 'OA答复中', '通知授权'];
    const greenStatuses = ['专利权生效'];
    const redStatuses = ['已驳回', '已撤回', '已终止'];

    let cssClass = 'status-tag-gray';
    if (blueStatuses.includes(status)) cssClass = 'status-tag-blue';
    else if (greenStatuses.includes(status)) cssClass = 'status-tag-green';
    else if (redStatuses.includes(status)) cssClass = 'status-tag-red';

    return `<span class="status-tag ${cssClass}">${escapeHtml(status)}</span>`;
}

/**
 * 函数名：renderPagination
 * 作用：渲染分页控件
 */
function renderPagination() {
    const el = document.getElementById('pagination');
    const totalPages = Math.ceil(totalPatents / pageSize);
    if (totalPages <= 1 && totalPatents <= pageSize) {
        el.innerHTML = '';
        return;
    }

    let html = `<span class="page-info">第 ${patentPage}/${totalPages} 页</span>`;

    // 上一页
    html += `<button class="page-btn${patentPage <= 1 ? ' disabled' : ''}" onclick="${patentPage > 1 ? "goToPage(" + (patentPage - 1) + ")" : ""}">‹</button>`;

    // 页码
    const maxVisible = 5;
    let start = Math.max(1, patentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
        html += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
        if (start > 2) html += `<button class="page-btn disabled">...</button>`;
    }
    for (let i = start; i <= end; i++) {
        html += `<button class="page-btn${i === patentPage ? ' active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    if (end < totalPages) {
        if (end < totalPages - 1) html += `<button class="page-btn disabled">...</button>`;
        html += `<button class="page-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }

    // 下一页
    html += `<button class="page-btn${patentPage >= totalPages ? ' disabled' : ''}" onclick="${patentPage < totalPages ? "goToPage(" + (patentPage + 1) + ")" : ""}">›</button>`;

    // 每页条数
    html += `<select class="page-size-select" onchange="changePageSize(this.value)">
        <option value="10"${pageSize === 10 ? ' selected' : ''}>10条/页</option>
        <option value="15"${pageSize === 15 ? ' selected' : ''}>15条/页</option>
        <option value="30"${pageSize === 30 ? ' selected' : ''}>30条/页</option>
        <option value="50"${pageSize === 50 ? ' selected' : ''}>50条/页</option>
    </select>`;

    el.innerHTML = html;
}

/**
 * 函数名：goToPage
 * 作用：跳转到指定页码
 */
function goToPage(page) {
    patentPage = page;
    loadPatentList();
}

/**
 * 函数名：changePageSize
 * 作用：修改每页条数并刷新列表
 */
function changePageSize(size) {
    pageSize = parseInt(size);
    patentPage = 1;
    loadPatentList();
}

/**
 * 函数名：deletePatent
 * 作用：将指定专利移入回收站
 */
async function deletePatent(id) {
    if (!await showConfirmModal('确认将该专利移入回收站？')) return;
    try {
        await window.patentAPI.dbRun(
            "UPDATE patents SET is_deleted = 1, deleted_at = datetime('now','localtime') WHERE id = ?",
            [id]
        );
        loadPatentList();
    } catch (err) {
        await showAlertModal('删除失败：' + err.message);
    }
}

// ============================================
// 批量操作
// ============================================

/**
 * 函数名：batchDelete
 * 作用：批量将选中的专利移入回收站
 */
async function batchDelete() {
    const checked = document.querySelectorAll('.patent-checkbox:checked');
    if (checked.length === 0) { await showAlertModal('请先勾选要删除的专利'); return; }
    if (!await showConfirmModal(`确认将选中的 ${checked.length} 条专利移入回收站？`)) return;
    const ids = Array.from(checked).map(cb => parseInt(cb.value));
    try {
        for (const id of ids) {
            await window.patentAPI.dbRun(
                "UPDATE patents SET is_deleted = 1, deleted_at = datetime('now','localtime') WHERE id = ?",
                [id]
            );
        }
        document.getElementById('checkAll').checked = false;
        loadPatentList();
    } catch (err) {
        await showAlertModal('批量删除失败：' + err.message);
    }
}

/**
 * 函数名：batchCompleteTask
 * 作用：批量完成选中专利的所有待缴费任务（年费类，不影响状态流转）
 */
async function batchCompleteTask() {
    const checked = document.querySelectorAll('.patent-checkbox:checked');
    if (checked.length === 0) { await showAlertModal('请先勾选专利'); return; }
    const ids = Array.from(checked).map(cb => parseInt(cb.value));

    // 统计待缴任务数
    const placeholders = ids.map(() => '?').join(',');
    const tasks = await window.patentAPI.dbQuery(
        "SELECT id, patent_id, fee_type, year_index FROM fee_tasks WHERE patent_id IN (" + placeholders + ") AND status = '待缴费'",
        ids
    );
    if (tasks.length === 0) {
        await showAlertModal('所选专利暂无待缴费任务');
        return;
    }
    if (!await showConfirmModal(`确认批量完成 ${tasks.length} 项待缴费任务？`)) return;

    try {
        for (const t of tasks) {
            await window.patentAPI.dbRun(
                "UPDATE fee_tasks SET status = '已缴费', paid_date = date('now','localtime') WHERE id = ?", [t.id]
            );
        }
        // 年费生成下一年
        for (const t of tasks) {
            if (t.fee_type === '年费' && t.year_index) {
                const pList = await window.patentAPI.dbQuery("SELECT * FROM patents WHERE id = ?", [t.patent_id]);
                if (pList.length === 0) continue;
                const p = pList[0];
                if (!p.apply_date) continue;
                const nextYear = t.year_index + 1;
                const maxYear = getMaxYearForType(p.patent_type);
                if (nextYear > maxYear) continue;
                const existing = await window.patentAPI.dbQuery(
                    "SELECT id FROM fee_tasks WHERE patent_id = ? AND fee_type = '年费' AND year_index = ? AND status = '待缴费'",
                    [t.patent_id, nextYear]
                );
                if (existing.length > 0) continue;
                const dueDate = calculateFeeDueDate(p.apply_date, nextYear);
                const amount = getAnnualFeeAmount(p.patent_type, nextYear);
                const finalAmount = Math.round(amount * getFeeReductionRate(p.fee_reduction));
                await window.patentAPI.dbRun(
                    "INSERT INTO fee_tasks (patent_id, fee_type, year_index, amount, due_date, status) VALUES (?, '年费', ?, ?, ?, '待缴费')",
                    [t.patent_id, nextYear, finalAmount, dueDate]
                );
            }
        }
        await showAlertModal(`已完成 ${tasks.length} 项待缴费`);
        document.getElementById('checkAll').checked = false;
        await window.patentAPI.backupDatabase().catch(() => {});
        loadPatentList();
    } catch (err) {
        await showAlertModal('批量操作失败：' + err.message);
    }
}

/**
 * 函数名：completeTask
 * 作用：打开完成待办弹窗——根据专利当前状态查 STATUS_TRANSITIONS，动态渲染流转卡片
 */
async function completeTask(patentId) {
    try {
        const patents = await window.patentAPI.dbQuery("SELECT * FROM patents WHERE id = ?", [patentId]);
        if (patents.length === 0) return;
        const p = patents[0];

        // 查当前状态的可能流转
        const transitions = await window.patentAPI.dbQuery(
            "SELECT * FROM status_transitions WHERE current_status = ? OR current_status = '任一'",
            [p.status]
        );

        // 已上传的附件类型
        const atts = await window.patentAPI.dbQuery(
            "SELECT file_type FROM attachments WHERE patent_id = ?", [patentId]
        );
        const uploadedTypes = new Set(atts.map(a => a.file_type));

        // 待缴费任务
        const pendingFees = await window.patentAPI.dbQuery(
            "SELECT id, fee_type, year_index, amount, due_date FROM fee_tasks WHERE patent_id = ? AND status = '待缴费' ORDER BY due_date", [patentId]
        );

        const modal = document.getElementById('taskModal');
        modal.dataset.patentId = patentId;
        modal.dataset.uploadedTypes = JSON.stringify([...uploadedTypes]);

        let html = `<div class="task-status-bar">当前状态：${renderStatusTag(p.status)}</div>`;

        // 过滤：形式审查中→实质审查中 仅发明适用；→通知授权 仅实用新型/外观设计适用
        const isInvention = p.patent_type === '发明';
        const filteredTrans = transitions.filter(t => {
            if (t.current_status === '形式审查中' && t.next_status === '实质审查中' && !isInvention) return false;
            if (t.current_status === '形式审查中' && t.next_status === '通知授权' && isInvention) return false;
            return true;
        });
        modal.dataset.transitions = JSON.stringify(filteredTrans);

        // --- 流转卡片 ---
        if (filteredTrans.length > 0) {
            html += `<div style="font-size:13px;font-weight:500;color:#333;margin:12px 0 8px;">状态流转</div>`;
            filteredTrans.forEach((t, idx) => {
                const attUploaded = t.attachment_required ? uploadedTypes.has(t.attachment_type) : false;
                const needsFeeFirst = t.current_status === '通知授权' && t.next_status === '专利权生效';
                let feeTaskId = null;
                if (needsFeeFirst && t.fee_type) {
                    const ft = pendingFees.find(f => t.fee_type.includes(f.fee_type) || f.fee_type.includes(t.fee_type.replace(/[（(].*[）)]/, '')));
                    if (ft) feeTaskId = ft.id;
                }

                html += `<div class="transition-card" data-idx="${idx}">`;
                html += `<div class="transition-summary">
                    <span class="transition-action-text">${escapeHtml(t.action)}</span>
                    <span class="transition-arrow">→</span>
                    <span class="transition-next-status">${escapeHtml(t.next_status)}</span>
                </div>`;

                // 附件上传步骤
                if (t.attachment_required) {
                    if (attUploaded) {
                        html += `<div class="transition-step done">✓ ${escapeHtml(t.attachment_type)} 已上传</div>`;
                    } else {
                        const safeType = escapeHtml(t.attachment_type);
                        html += `<div class="transition-step">
                            <span class="step-label">📎 上传 ${safeType} <span class="required-mark">*</span></span>
                            <span class="step-action">
                                <input type="file" class="task-file-input" accept=".pdf,.png,.jpg,.jpeg" data-idx="${idx}">
                                <button class="btn btn-primary btn-sm" onclick="uploadTaskAttachment(${patentId}, ${idx})">上传</button>
                                <span class="step-status" id="taskStepStatus_${idx}"></span>
                            </span>
                        </div>`;
                    }
                }

                // 缴费步骤（通知授权→专利权生效，需先缴费）
                if (needsFeeFirst && feeTaskId) {
                    const feeTask = pendingFees.find(f => f.id === feeTaskId);
                    html += `<div class="transition-step">
                        <span class="step-label">💰 缴纳 ${escapeHtml(t.fee_type)} ¥${feeTask.amount}</span>
                        <span class="step-action">
                            <label><input type="checkbox" class="task-fee-check" data-task-id="${feeTask.id}" onchange="updateExecuteBtn(${idx})"> 确认已缴费</label>
                        </span>
                    </div>`;
                }

                // 执行按钮
                const canExec = (!t.attachment_required || attUploaded);
                html += `<button class="btn btn-primary btn-sm transition-execute" id="execBtn_${idx}" ${canExec ? '' : 'disabled'}
                    onclick="executeTransition(${patentId}, ${idx})">执行此流转</button>`;

                html += `</div>`;
            });
        }

        // --- 独立的缴费任务（年费、申请费等，不触发状态流转的）---
        // 界定哪些费用已被流转卡片覆盖
        const coveredTypes = new Set();
        filteredTrans.forEach(t => {
            if (t.fee_type) {
                t.fee_type.split(/[,，]/).forEach(ft => {
                    const main = ft.replace(/[（(].*[）)]/, '').trim();
                    if (main) coveredTypes.add(main);
                });
            }
        });
        // 通知授权→专利权生效 的授权登记费已被上述卡片覆盖，不再出现在独立列表
        const feeOnly = pendingFees.filter(f => !coveredTypes.has(f.fee_type));
        // 年费不触发状态流转，始终留在独立列表
        // 但如果 fee task 的专利处于 专利权生效 以外状态，年费可能也是过渡性费用，所以需要判断

        if (feeOnly.length > 0) {
            html += `<div class="tc-feesection">
                <div class="tc-feesection-title">💳 待缴费任务</div>`;
            feeOnly.forEach(t => {
                const yearLabel = t.year_index ? ` (第${t.year_index}年)` : '';
                html += `<label class="task-item">
                    <input type="checkbox" class="fee-only-check" data-task-id="${t.id}">
                    <span class="task-info">${escapeHtml(t.fee_type)}${yearLabel} - 截止 ${escapeHtml(t.due_date)}</span>
                    <span class="task-amount">¥${t.amount}</span>
                </label>`;
            });
            html += `<div style="margin-top:8px;"><button class="btn btn-primary btn-sm" onclick="confirmFeeOnlyTasks()">确认缴费</button></div>`;
            html += `</div>`;
        }

        if (filteredTrans.length === 0 && feeOnly.length === 0) {
            html += '<p class="text-muted text-center" style="padding:24px;">当前无待办事项</p>';
        }

        document.getElementById('taskModalBody').innerHTML = html;
        modal.classList.remove('hidden');
    } catch (err) {
        await showAlertModal('加载失败：' + err.message);
    }
}

/**
 * 函数名：uploadTaskAttachment
 * 作用：在完成待办弹窗内直接上传附件，上传后更新界面状态
 */
async function uploadTaskAttachment(patentId, idx) {
    const fileInput = document.querySelector(`.task-file-input[data-idx="${idx}"]`);
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        await showAlertModal('请先选择文件');
        return;
    }
    const file = fileInput.files[0];
    const modal = document.getElementById('taskModal');
    const transitions = JSON.parse(modal.dataset.transitions || '[]');
    const t = transitions[idx];
    if (!t || !t.attachment_type) return;

    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.gif'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
        await showAlertModal('仅支持 PDF 和图片文件');
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        await showAlertModal('文件大小不能超过 20MB');
        return;
    }

    try {
        const reader = new FileReader();
        const base64Data = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        await window.patentAPI.uploadFile(patentId, file.name, t.attachment_type, base64Data);

        // 替换上传行为 ✓ 已完成
        const card = document.querySelector(`.transition-card[data-idx="${idx}"]`);
        if (card) {
            const stepDiv = card.querySelector('.transition-step');
            if (stepDiv) {
                stepDiv.outerHTML = `<div class="transition-step done">✓ ${escapeHtml(t.attachment_type)} 已上传</div>`;
            }
            // 启用执行按钮
            const execBtn = card.querySelector('.transition-execute');
            if (execBtn) execBtn.disabled = false;
        }
    } catch (err) {
        await showAlertModal('上传失败：' + err.message);
    }
}

/**
 * 函数名：updateExecuteBtn
 * 作用：根据复选框状态更新执行按钮
 */
function updateExecuteBtn(idx) {
    const card = document.querySelector(`.transition-card[data-idx="${idx}"]`);
    if (!card) return;
    const feeCheck = card.querySelector('.task-fee-check');
    const btn = document.getElementById(`execBtn_${idx}`);
    if (!btn) return;
    btn.disabled = feeCheck && !feeCheck.checked;
}

/**
 * 函数名：executeTransition
 * 作用：执行状态流转——校验条件 → 标记缴费 → 变更状态 → 生成后续任务
 */
async function executeTransition(patentId, idx) {
    const modal = document.getElementById('taskModal');
    const transitions = JSON.parse(modal.dataset.transitions || '[]');
    const t = transitions[idx];
    if (!t) return;

    const card = document.querySelector(`.transition-card[data-idx="${idx}"]`);

    // 校验：必需附件是否已上传
    if (t.attachment_required) {
        // 检查卡片中是否已有 done 标记，或数据库已有记录
        const hasDone = card && card.querySelector('.transition-step.done');
        if (!hasDone) {
            const atts = await window.patentAPI.dbQuery(
                "SELECT id FROM attachments WHERE patent_id = ? AND file_type = ?",
                [patentId, t.attachment_type]
            );
            if (atts.length === 0) {
                await showAlertModal(`请先上传 ${t.attachment_type}`);
                return;
            }
        }
    }

    if (!await showConfirmModal(`确认执行：${t.action} → ${t.next_status}？`)) return;

    try {
        // 1) 缴费（通知授权→专利权生效，授权登记费需先缴）
        if (t.current_status === '通知授权' && t.next_status === '专利权生效') {
            if (card) {
                const feeCheck = card.querySelector('.task-fee-check');
                if (feeCheck && feeCheck.checked) {
                    const taskId = parseInt(feeCheck.dataset.taskId);
                    await window.patentAPI.dbRun(
                        "UPDATE fee_tasks SET status = '已缴费', paid_date = date('now','localtime') WHERE id = ?",
                        [taskId]
                    );
                }
            }
        }

        // 2) 变更状态
        await window.patentAPI.dbRun(
            "UPDATE patents SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
            [t.next_status, patentId]
        );

        // 3) 状态变更联动（生成新状态的费用任务）
        await handleStatusChange(patentId, t.next_status);

        // 4) 操作日志
        await window.patentAPI.dbRun(
            "INSERT INTO operation_logs (patent_id, action_type, description) VALUES (?, '状态变更', ?)",
            [patentId, `完成待办"${t.action}"，状态变更为"${t.next_status}"`]
        );

        modal.classList.add('hidden');
        await showAlertModal(`状态已变更为"${t.next_status}"`);
        loadPatentList();
        if (currentDetailPatentId === patentId) showPatentDetail(patentId);
    } catch (err) {
        await showAlertModal('操作失败：' + err.message);
    }
}

/**
 * 函数名：confirmFeeOnlyTasks
 * 作用：处理独立缴费任务（年费等的缴费，不触发状态流转）
 */
async function confirmFeeOnlyTasks() {
    const checked = document.querySelectorAll('.fee-only-check:checked');
    if (checked.length === 0) {
        await showAlertModal('请至少选择一项待缴费任务');
        return;
    }
    if (!await showConfirmModal(`确认完成选中的 ${checked.length} 项缴费？`)) return;

    try {
        const ids = Array.from(checked).map(cb => parseInt(cb.dataset.taskId));
        // 查询任务详情
        const placeholders = ids.map(() => '?').join(',');
        const tasks = await window.patentAPI.dbQuery(
            "SELECT id, patent_id, fee_type, year_index FROM fee_tasks WHERE id IN (" + placeholders + ")", ids
        );

        // 标记已缴费
        for (const id of ids) {
            await window.patentAPI.dbRun(
                "UPDATE fee_tasks SET status = '已缴费', paid_date = date('now','localtime') WHERE id = ?", [id]
            );
        }

        // 按专利分组，年费→生成下一年
        const patentActions = {};
        tasks.forEach(t => {
            if (!patentActions[t.patent_id]) patentActions[t.patent_id] = new Set();
            patentActions[t.patent_id].add(t.fee_type + (t.year_index ? '_' + t.year_index : ''));
        });

        for (const pidStr of Object.keys(patentActions)) {
            const pid = parseInt(pidStr);
            const pList = await window.patentAPI.dbQuery("SELECT * FROM patents WHERE id = ?", [pid]);
            if (pList.length === 0) continue;
            const p = pList[0];

            for (const action of patentActions[pid]) {
                if (action.startsWith('年费')) {
                    const parts = action.split('_');
                    const completedYear = parts.length > 1 ? parseInt(parts[1]) : null;
                    if (!completedYear || !p.apply_date) continue;
                    const nextYear = completedYear + 1;
                    const maxYear = getMaxYearForType(p.patent_type);
                    if (nextYear > maxYear) continue;

                    const existing = await window.patentAPI.dbQuery(
                        "SELECT id FROM fee_tasks WHERE patent_id = ? AND fee_type = '年费' AND year_index = ? AND status = '待缴费'",
                        [pid, nextYear]
                    );
                    if (existing.length > 0) continue;

                    const dueDate = calculateFeeDueDate(p.apply_date, nextYear);
                    const amount = getAnnualFeeAmount(p.patent_type, nextYear);
                    const finalAmount = Math.round(amount * getFeeReductionRate(p.fee_reduction));
                    await window.patentAPI.dbRun(
                        "INSERT INTO fee_tasks (patent_id, fee_type, year_index, amount, due_date, status) VALUES (?, '年费', ?, ?, ?, '待缴费')",
                        [pid, nextYear, finalAmount, dueDate]
                    );
                    await window.patentAPI.dbRun(
                        "INSERT INTO operation_logs (patent_id, action_type, description) VALUES (?, '任务生成', ?)",
                        [pid, `第${completedYear}年年费已缴，自动生成第${nextYear}年年费（¥${finalAmount}，截止${dueDate}）`]
                    );
                }
            }
        }

        await showAlertModal(`已完成 ${ids.length} 项缴费`);
        document.getElementById('taskModal').classList.add('hidden');
        await window.patentAPI.backupDatabase().catch(() => {});
        loadPatentList();
    } catch (err) {
        await showAlertModal('操作失败：' + err.message);
    }
}

/**
 * 函数名：showPatentDetail
 * 作用：在工作台内打开专利详情页（页面视图）
 */
let currentDetailPatentId = null;

async function showPatentDetail(id) {
    currentDetailPatentId = id;
    try {
        const patents = await window.patentAPI.dbQuery(
            "SELECT * FROM patents WHERE id = ?", [id]
        );
        if (patents.length === 0) { await showAlertModal('未找到专利信息'); return; }
        const p = patents[0];

        // 显示浮层
        document.getElementById('patentDetailContainer').classList.remove('hidden');

        // 渲染标题区
        document.getElementById('pdTitle').textContent = p.patent_name;
        const subtitleEl = document.getElementById('pdSubtitle');
        subtitleEl.innerHTML = `
            <span>${escapeHtml(p.patent_no)}</span>
            <span class="pd-sep">|</span>
            <span>${escapeHtml(p.patent_type || '-')}</span>
            <span class="pd-sep">|</span>
            ${renderStatusTag(p.status)}
        `;

        // 渲染各标签页
        renderDetailInfo(p);
        renderDetailFlow(p);
        renderDetailFees(id);
        renderDetailLogs(id);

        // 默认激活基本信息标签
        document.querySelectorAll('.pd-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.pd-tab[data-pdtab="info"]').classList.add('active');
        document.querySelectorAll('.pd-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('pdTabInfo').classList.add('active');

        exitEditMode();
    } catch (err) {
        await showAlertModal('加载详情失败：' + err.message);
    }
}

/**
 * 函数名：hidePatentDetail
 * 作用：关闭专利详情浮层
 */
function hidePatentDetail() {
    document.getElementById('patentDetailContainer').classList.add('hidden');
    currentDetailPatentId = null;
}

/**
 * 函数名：renderDetailInfo
 * 作用：渲染基本信息网格
 */
function renderDetailInfo(p) {
    const feeLabels = {
        '无': '无（全额）',
        '个人': '个人（85%费减）',
        '小微企业': '小微企业（85%费减）',
        '普通企业': '普通企业（70%费减）',
        '事业高校': '事业高校（100%费减）',
    };
    const fields = [
        { label: '申请日', key: 'apply_date', full: false },
        { label: '授权公告日', key: 'authorize_date', full: false },
        { label: '权利状态', key: 'status', full: false, html: true },
        { label: '费减比例', key: 'fee_reduction', full: false, fmt: v => feeLabels[v] || v },
        { label: '发明人', key: 'inventor', full: false },
        { label: '申请人', key: 'applicant', full: false },
        { label: '申请至今', key: null, full: false, computed: p.apply_date ? `${daysSince(p.apply_date)}天` : '-' },
        { label: '备注', key: 'notes', full: true },
    ];
    let html = '';
    fields.forEach(f => {
        let value;
        if (f.computed) {
            value = f.computed;
        } else if (f.html) {
            value = renderStatusTag(p[f.key]);
        } else if (f.fmt) {
            value = escapeHtml(f.fmt(p[f.key]));
        } else {
            value = escapeHtml(p[f.key] || '-');
        }
        html += `<div class="pd-field ${f.full ? 'pd-field-full' : ''}">
            <span class="pd-field-label">${f.label}</span>
            <span class="pd-field-value">${value}</span>
        </div>`;
    });
    document.getElementById('pdGrid').innerHTML = html;
}

function daysSince(dateStr) {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    const now = new Date();
    return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

/**
 * 函数名：renderDetailFlow
 * 作用：渲染状态流（水平管道图）
 */
function renderDetailFlow(p) {
    const FLOW = ['撰写中', '已申请', '形式审查中', '实质审查中', 'OA答复中', '通知授权', '专利权生效', '已终止'];
    const currentIdx = FLOW.indexOf(p.status);
    const isTerminal = ['已驳回', '已撤回', '已终止'].includes(p.status);
    const currentFlowIdx = isTerminal ? FLOW.length - 1 : currentIdx;

    let html = '<div class="pd-flow-row">';
    FLOW.forEach((state, i) => {
        let dotClass = 'inactive';
        let labelClass = '';
        if (isTerminal && i === FLOW.length - 1) {
            dotClass = 'terminated';
            labelClass = 'terminated-label';
        } else if (i <= currentFlowIdx && currentFlowIdx >= 0) {
            dotClass = 'active';
            labelClass = 'active-label';
        }
        // 当前状态高亮
        if (i === currentIdx) labelClass = 'active-label';
        // 终态节点文字显示实际状态
        const label = (isTerminal && i === FLOW.length - 1) ? p.status : state;

        html += `<div class="pd-flow-node">
            <div class="pd-flow-dot ${dotClass}"></div>
            <span class="pd-flow-label ${labelClass}">${label}</span>
        </div>`;
        if (i < FLOW.length - 1) {
            const lineClass = (i < currentFlowIdx && currentFlowIdx >= 0) ? 'active-line' : '';
            html += `<div class="pd-flow-line ${lineClass}"></div>`;
        }
    });
    html += '</div>';
    document.getElementById('pdFlowContainer').innerHTML = html;
}

/**
 * 函数名：renderDetailFees
 * 作用：渲染缴费记录表格
 */
async function renderDetailFees(id) {
    const fees = await window.patentAPI.dbQuery(
        "SELECT fee_type, year_index, amount, due_date, paid_date, status FROM fee_tasks WHERE patent_id = ? ORDER BY due_date ASC",
        [id]
    );
    const body = document.getElementById('pdFeeBody');
    if (fees.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无记录</td></tr>';
        return;
    }
    let html = '';
    fees.forEach(t => {
        const yearLabel = t.year_index ? `第${t.year_index}年` : '-';
        const statusTag = t.status === '已缴费'
            ? '<span class="status-tag status-tag-green">已缴费</span>'
            : t.status === '已失效'
            ? '<span class="status-tag status-tag-gray">已失效</span>'
            : '<span class="status-tag status-tag-red">待缴费</span>';
        html += `<tr>
            <td>${escapeHtml(t.fee_type)}</td>
            <td>${yearLabel}</td>
            <td>${t.due_date || '-'}</td>
            <td>${t.paid_date || '-'}</td>
            <td>¥${t.amount}</td>
            <td>${statusTag}</td>
        </tr>`;
    });
    body.innerHTML = html;
}

/**
 * 函数名：renderDetailLogs
 * 作用：渲染操作日志表格
 */
async function renderDetailLogs(id) {
    const logs = await window.patentAPI.dbQuery(
        "SELECT action_type, description, created_at FROM operation_logs WHERE patent_id = ? ORDER BY created_at DESC LIMIT 50",
        [id]
    );
    const body = document.getElementById('pdLogBody');
    if (logs.length === 0) {
        body.innerHTML = '<tr><td colspan="3" class="text-center text-muted">暂无记录</td></tr>';
        return;
    }
    let html = '';
    logs.forEach(l => {
        html += `<tr><td>${escapeHtml(l.action_type)}</td><td>${escapeHtml(l.description || '-')}</td><td>${l.created_at || '-'}</td></tr>`;
    });
    body.innerHTML = html;
}

// ============================================
// 附件管理
// ============================================

/**
 * 函数名：renderDetailAttachments
 * 作用：查询并渲染附件列表
 */
async function renderDetailAttachments(patentId) {
    const body = document.getElementById('attBody');
    try {
        const atts = await window.patentAPI.dbQuery(
            "SELECT id, file_name, file_path, file_type, uploaded_at FROM attachments WHERE patent_id = ? ORDER BY uploaded_at DESC",
            [patentId]
        );
        if (atts.length === 0) {
            body.innerHTML = '<tr><td colspan="4" class="text-center text-muted">暂无附件</td></tr>';
            return;
        }
        let html = '';
        atts.forEach(a => {
            const fileUrl = '/' + a.file_path;
            const isImage = /\.(png|jpg|jpeg|gif)$/i.test(a.file_path);
            const previewHtml = isImage
                ? `<a href="${fileUrl}" target="_blank" class="att-filename-link">${escapeHtml(a.file_name)}</a>`
                : `<a href="${fileUrl}" target="_blank" class="att-filename-link">${escapeHtml(a.file_name)}</a>`;
            html += `<tr>
                <td class="att-filename">${previewHtml}</td>
                <td>${escapeHtml(a.file_type || '-')}</td>
                <td>${a.uploaded_at || '-'}</td>
                <td><button class="att-delete-btn" onclick="deleteAttachment(${a.id})">🗑 删除</button></td>
            </tr>`;
        });
        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = `<tr><td colspan="4" class="text-center text-muted">加载失败：${escapeHtml(err.message)}</td></tr>`;
    }
}

/**
 * 函数名：uploadAttachment
 * 作用：上传附件（读取文件 → base64 → 调 API → 刷新列表）
 */
async function uploadAttachment() {
    const fileInput = document.getElementById('attFileInput');
    const fileType = document.getElementById('attFileType').value;
    const file = fileInput.files[0];
    if (!file) { await showAlertModal('请先选择文件'); return; }
    if (!fileType) { await showAlertModal('请选择文件类型'); return; }
    if (!currentDetailPatentId) { await showAlertModal('未选择专利'); return; }

    // 校验文件类型
    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.gif'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
        await showAlertModal('仅支持 PDF 和图片文件（png/jpg/gif）');
        return;
    }
    // 文件大小限制（20MB）
    if (file.size > 20 * 1024 * 1024) {
        await showAlertModal('文件大小不能超过 20MB');
        return;
    }

    try {
        // 读取文件为 base64
        const reader = new FileReader();
        const base64Data = await new Promise((resolve, reject) => {
            reader.onload = () => {
                const result = reader.result;
                // 去掉 data:xxx;base64, 前缀
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        await window.patentAPI.uploadFile(currentDetailPatentId, file.name, fileType, base64Data);
        await showAlertModal('上传成功');
        // 清空文件选择和类型
        fileInput.value = '';
        document.getElementById('attFileType').value = '';
        // 刷新列表
        renderDetailAttachments(currentDetailPatentId);
    } catch (err) {
        await showAlertModal('上传失败：' + err.message);
    }
}

/**
 * 函数名：deleteAttachment
 * 作用：删除附件（确认 → 调 API → 刷新列表）
 */
async function deleteAttachment(id) {
    if (!await showConfirmModal('确认删除该附件？')) return;
    try {
        await window.patentAPI.deleteAttachment(id);
        if (currentDetailPatentId) renderDetailAttachments(currentDetailPatentId);
    } catch (err) {
        await showAlertModal('删除失败：' + err.message);
    }
}

// ============================================
// 编辑 & 删除功能
// ============================================

/**
 * 函数名：enterEditMode
 * 作用：切换基本信息到编辑模式
 */
function enterEditMode() {
    const editGrid = document.getElementById('pdEditGrid');
    const viewGrid = document.getElementById('pdGrid');
    const actions = document.getElementById('pdEditActions');

    // 获取当前专利数据
    const patentEl = document.getElementById('pdTitle');
    const patentName = patentEl.textContent;

    // 从 subtitle 和 DB 获取数据
    window.patentAPI.dbQuery("SELECT * FROM patents WHERE id = ?", [currentDetailPatentId]).then(patents => {
        if (patents.length === 0) return;
        const p = patents[0];

        const fields = [
            { label: '专利号/申请号', key: 'patent_no', type: 'text' },
            { label: '专利名称', key: 'patent_name', type: 'text' },
            { label: '专利类型', key: 'patent_type', type: 'select', options: ['发明', '实用新型', '外观设计'] },
            { label: '发明人', key: 'inventor', type: 'text' },
            { label: '申请人', key: 'applicant', type: 'text' },
            { label: '申请日期', key: 'apply_date', type: 'date' },
            { label: '授权公告日', key: 'authorize_date', type: 'date' },
            { label: '权利状态', key: 'status', type: 'select', options: ['撰写中', '已申请', '形式审查中', '实质审查中', 'OA答复中', '通知授权', '专利权生效', '已驳回', '已撤回', '已终止'] },
            { label: '费减比例', key: 'fee_reduction', type: 'select', options: ['无', '个人', '小微企业', '普通企业', '事业高校'] },
            { label: '备注', key: 'notes', type: 'text', full: true },
        ];

        let html = '';
        fields.forEach(f => {
            const val = p[f.key] || '';
            const fullClass = f.full ? ' pd-edit-field-full' : '';
            if (f.type === 'select') {
                const opts = f.options.map(o =>
                    `<option value="${o}"${o === val ? ' selected' : ''}>${o}</option>`
                ).join('');
                html += `<div class="pd-edit-field${fullClass}">
                    <label>${f.label}</label>
                    <select data-key="${f.key}">${opts}</select>
                </div>`;
            } else {
                html += `<div class="pd-edit-field${fullClass}">
                    <label>${f.label}</label>
                    <input type="${f.type}" value="${escapeHtml(val)}" data-key="${f.key}">
                </div>`;
            }
        });
        editGrid.innerHTML = html;

        // 查询当前紧迫任务并渲染编辑字段
        window.patentAPI.dbQuery(
            "SELECT id, fee_type, year_index, amount, due_date FROM fee_tasks WHERE patent_id = ? AND status = '待缴费' ORDER BY due_date ASC LIMIT 1",
            [currentDetailPatentId]
        ).then(urgentTasks => {
            const u = urgentTasks.length > 0 ? urgentTasks[0] : null;
            let urgentHtml = '<div class="pd-edit-section-header">当前紧迫任务</div>';

            // 费用类型
            const feeTypes = ['申请费', '公布印刷费', '实质审查费', '授权登记费', '年费'];
            let opts = '<option value="">无</option>';
            feeTypes.forEach(t => {
                opts += `<option value="${t}"${u?.fee_type === t ? ' selected' : ''}>${t}</option>`;
            });
            urgentHtml += `<div class="pd-edit-field"><label>费用类型</label><select data-key="urgent_fee_type">${opts}</select></div>`;

            // 年度（年费专用）
            urgentHtml += `<div class="pd-edit-field"><label>年度</label><input type="number" value="${u?.year_index || ''}" data-key="urgent_year_index" placeholder="年费专用"></div>`;

            // 金额
            urgentHtml += `<div class="pd-edit-field"><label>金额(¥)</label><input type="number" step="0.01" value="${u?.amount || ''}" data-key="urgent_amount"></div>`;

            // 截止日期
            urgentHtml += `<div class="pd-edit-field pd-edit-field-full"><label>截止日期</label><input type="date" value="${u?.due_date || ''}" data-key="urgent_due_date"></div>`;

            editGrid.insertAdjacentHTML('beforeend', urgentHtml);
        });

        viewGrid.classList.add('hidden');
        editGrid.classList.remove('hidden');
        actions.classList.remove('hidden');
    });
}

/**
 * 函数名：exitEditMode
 * 作用：退出编辑模式回到查看模式
 */
function exitEditMode() {
    document.getElementById('pdEditGrid').classList.add('hidden');
    document.getElementById('pdEditActions').classList.add('hidden');
    document.getElementById('pdGrid').classList.remove('hidden');
}

/**
 * 函数名：savePatentEdit
 * 作用：保存编辑后的专利信息
 */
async function savePatentEdit() {
    const editGrid = document.getElementById('pdEditGrid');
    const inputs = editGrid.querySelectorAll('input[data-key], select[data-key]');
    const data = {};
    inputs.forEach(el => {
        data[el.dataset.key] = el.value;
    });
    if (!data.patent_no || !data.patent_name) {
        await showAlertModal('专利号和专利名称为必填项');
        return;
    }
    // 校验专利号格式
    const noCheck = validatePatentNo(data.patent_no);
    if (!noCheck.valid) {
        await showAlertModal('专利号格式错误：' + noCheck.message);
        return;
    }
    try {
        // 查询旧状态，用于后续状态变更联动
        const oldPatents = await window.patentAPI.dbQuery(
            "SELECT status FROM patents WHERE id = ?", [currentDetailPatentId]
        );
        const oldStatus = oldPatents.length > 0 ? oldPatents[0].status : null;

        await window.patentAPI.dbRun(
            `UPDATE patents SET patent_no=?, patent_name=?, patent_type=?, inventor=?, applicant=?,
             apply_date=?, authorize_date=?, status=?, fee_reduction=?, notes=?,
             updated_at=datetime('now','localtime') WHERE id=?`,
            [data.patent_no, data.patent_name, data.patent_type || '', data.inventor || '',
             data.applicant || '', data.apply_date || null, data.authorize_date || null,
             data.status || '撰写中', data.fee_reduction || '无', data.notes || '',
             currentDetailPatentId]
        );
        // 状态变更联动
        if (oldStatus && oldStatus !== data.status) {
            await handleStatusChange(currentDetailPatentId, data.status);
        }

        // 保存紧迫任务编辑
        const urgentFeeType = data.urgent_fee_type;
        const urgentYearIndex = data.urgent_year_index ? parseInt(data.urgent_year_index) : null;
        const urgentAmount = data.urgent_amount ? parseFloat(data.urgent_amount) : 0;
        const urgentDueDate = data.urgent_due_date;
        if (urgentFeeType && urgentDueDate) {
            const existing = await window.patentAPI.dbQuery(
                "SELECT id FROM fee_tasks WHERE patent_id = ? AND status = '待缴费' ORDER BY due_date ASC LIMIT 1",
                [currentDetailPatentId]
            );
            if (existing.length > 0) {
                await window.patentAPI.dbRun(
                    "UPDATE fee_tasks SET fee_type=?, year_index=?, amount=?, due_date=? WHERE id=?",
                    [urgentFeeType, urgentYearIndex, urgentAmount, urgentDueDate, existing[0].id]
                );
            } else {
                await window.patentAPI.dbRun(
                    "INSERT INTO fee_tasks (patent_id, fee_type, year_index, amount, due_date, status) VALUES (?, ?, ?, ?, ?, '待缴费')",
                    [currentDetailPatentId, urgentFeeType, urgentYearIndex, urgentAmount, urgentDueDate]
                );
            }
        }
        await window.patentAPI.dbRun(
            "INSERT INTO operation_logs (patent_id, action_type, description) VALUES (?, '编辑', '修改专利基本信息')",
            [currentDetailPatentId]
        );
        await showAlertModal('保存成功');
        // 刷新列表和详情
        loadPatentList();
        showPatentDetail(currentDetailPatentId);
    } catch (err) {
        await showAlertModal('保存失败：' + err.message);
    }
}

/**
 * 函数名：deleteCurrentPatent
 * 作用：将当前专利移入回收站
 */
async function deleteCurrentPatent() {
    if (!currentDetailPatentId) return;
    if (!await showConfirmModal('确认将该专利移入回收站？')) return;
    try {
        await window.patentAPI.dbRun(
            "UPDATE patents SET is_deleted = 1, deleted_at = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?",
            [currentDetailPatentId]
        );
        await showAlertModal('已移入回收站');
        loadPatentList();
        hidePatentDetail();
    } catch (err) {
        await showAlertModal('操作失败：' + err.message);
    }
}
