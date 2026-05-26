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
    const btnEntry = document.getElementById('btnManualEntry');
    const formCard = document.getElementById('manualFormCard');

    // 点击"手动录入"按钮切换表单显示
    btnEntry.addEventListener('click', () => {
        formCard.classList.toggle('hidden');
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

    // 收集表单数据
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
 * 函数名：initWorkbenchList
 * 作用：初始化专利列表（搜索、分页、复选框事件，首次加载）
 */
function initWorkbenchList() {
    // 搜索
    document.getElementById('btnSearch').addEventListener('click', () => {
        patentPage = 1;
        loadPatentList();
    });
    // 重置
    document.getElementById('btnResetSearch').addEventListener('click', () => {
        document.getElementById('sPatentNo').value = '';
        document.getElementById('sPatentName').value = '';
        document.getElementById('sPatentType').value = '';
        document.getElementById('sStatus').value = '';
        document.getElementById('sDateFrom').value = '';
        document.getElementById('sDateTo').value = '';
        document.getElementById('sInventor').value = '';
        patentPage = 1;
        currentFilters = {};
        loadPatentList();
    });
    // 回车触发搜索
    document.querySelectorAll('.search-item input, .search-item select').forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                patentPage = 1;
                loadPatentList();
            }
        });
    });
    // 全选复选框
    document.getElementById('checkAll').addEventListener('change', function () {
        document.querySelectorAll('.patent-checkbox').forEach(cb => cb.checked = this.checked);
    });
    // 关闭详情弹窗
    document.getElementById('detailClose').addEventListener('click', () => {
        document.getElementById('detailModal').classList.add('hidden');
    });
    document.getElementById('detailCloseBtn').addEventListener('click', () => {
        document.getElementById('detailModal').classList.add('hidden');
    });
    // 关闭待办弹窗
    document.getElementById('taskModalClose').addEventListener('click', () => {
        document.getElementById('taskModal').classList.add('hidden');
    });
    document.getElementById('btnCancelTasks').addEventListener('click', () => {
        document.getElementById('taskModal').classList.add('hidden');
    });
    // 确认完成待办
    document.getElementById('btnConfirmTasks').addEventListener('click', confirmTasksComplete);

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
        patent_no: document.getElementById('sPatentNo').value.trim(),
        patent_name: document.getElementById('sPatentName').value.trim(),
        patent_type: document.getElementById('sPatentType').value,
        status: document.getElementById('sStatus').value,
        date_from: document.getElementById('sDateFrom').value,
        date_to: document.getElementById('sDateTo').value,
        inventor: document.getElementById('sInventor').value.trim()
    };

    const { where, params } = buildWhereClause(currentFilters);

    try {
        // 查询总数
        const countResult = await window.patentAPI.dbQuery(
            "SELECT COUNT(*) as total FROM patents WHERE is_deleted = 0" + where,
            params
        );
        totalPatents = countResult[0].total;
        document.getElementById('totalCount').textContent = `共 ${totalPatents} 条记录`;

        if (totalPatents === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:48px;">暂无数据</td></tr>';
            renderPagination();
            return;
        }

        // 计算总页数
        const totalPages = Math.ceil(totalPatents / pageSize);
        if (patentPage > totalPages) patentPage = totalPages;

        // 查询分页数据
        const offset = (patentPage - 1) * pageSize;
        const patents = await window.patentAPI.dbQuery(
            "SELECT id, patent_no, patent_name, patent_type, status, apply_date FROM patents WHERE is_deleted = 0" + where + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [...params, pageSize, offset]
        );

        // 批量查询紧迫任务和预警
        const patentIds = patents.map(p => p.id);
        let urgentMap = {};
        let warningMap = {};
        if (patentIds.length > 0) {
            const placeholders = patentIds.map(() => '?').join(',');
            const tasks = await window.patentAPI.dbQuery(
                "SELECT patent_id, fee_type, year_index, due_date, amount FROM fee_tasks WHERE patent_id IN (" + placeholders + ") AND status = '待缴费' ORDER BY patent_id, due_date ASC",
                patentIds
            );
            // 按 patent_id 分组，取最早到期任务
            const grouped = {};
            tasks.forEach(t => {
                if (!grouped[t.patent_id]) grouped[t.patent_id] = [];
                grouped[t.patent_id].push(t);
            });
            const today = new Date();
            patentIds.forEach(id => {
                const list = grouped[id] || [];
                urgentMap[id] = list.length > 0 ? list[0] : null;
                if (list.length > 0) {
                    const sorted = [...list].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
                    const earliest = sorted[0];
                    const dueDate = new Date(earliest.due_date);
                    const diffDays = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) {
                        warningMap[id] = { level: 'overdue', days: Math.abs(diffDays) };
                    } else if (diffDays <= 30) {
                        warningMap[id] = { level: 'urgent', days: diffDays };
                    } else {
                        warningMap[id] = { level: 'none', days: 0 };
                    }
                } else {
                    warningMap[id] = { level: 'none', days: 0 };
                }
            });
        }

        // 渲染表格
        let html = '';
        patents.forEach(p => {
            const urgent = urgentMap[p.id];
            const warning = warningMap[p.id] || { level: 'none', days: 0 };
            html += renderPatentRow(p, urgent, warning);
        });
        tbody.innerHTML = html;

        // 绑定每行点击事件（点击行弹出详情，点按钮除外）
        tbody.querySelectorAll('.clickable-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.col-actions')) return;
                if (e.target.closest('.col-checkbox')) return;
                showDetailModal(parseInt(row.dataset.id));
            });
        });

        // 绑定行内复选框事件（联动全选状态）
        tbody.querySelectorAll('.patent-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const all = document.querySelectorAll('.patent-checkbox');
                const checked = document.querySelectorAll('.patent-checkbox:checked');
                document.getElementById('checkAll').checked = all.length > 0 && all.length === checked.length;
            });
        });

        renderPagination();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:48px;">加载失败：${escapeHtml(err.message)}</td></tr>`;
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

    if (filters.patent_no) {
        conditions.push("patent_no LIKE ?");
        params.push('%' + filters.patent_no + '%');
    }
    if (filters.patent_name) {
        conditions.push("patent_name LIKE ?");
        params.push('%' + filters.patent_name + '%');
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
    if (filters.inventor) {
        conditions.push("inventor LIKE ?");
        params.push('%' + filters.inventor + '%');
    }

    return {
        where: conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '',
        params: params
    };
}

/**
 * 函数名：renderPatentRow
 * 作用：渲染单行专利数据
 */
function renderPatentRow(patent, urgent, warning) {
    const nameHtml = escapeHtml(patent.patent_name);
    const noHtml = escapeHtml(patent.patent_no);
    const w = warning || { level: 'none', days: 0 };

    // 紧迫任务
    let urgentHtml = '<span class="urgent-none">—</span>';
    if (urgent) {
        const typeLabel = escapeHtml(urgent.fee_type);
        const yearLabel = urgent.year_index ? `第${urgent.year_index}年` : '';
        const dueDate = escapeHtml(urgent.due_date);
        const amount = urgent.amount || 0;
        const isOverdue = new Date(urgent.due_date) < new Date();
        urgentHtml = `<div class="urgent-task"><div class="urgent-line1">${yearLabel}${typeLabel}|¥${amount}</div><div class="urgent-line2 ${isOverdue ? 'overdue' : 'due-date'}">截止${dueDate}</div></div>`;
    }

    // 预警灯 + 天数
    let warningHtml = '';
    if (w.level === 'overdue') {
        warningHtml = `<span class="warning-dot warning-dot-red"></span><span class="warning-text warning-text-red">逾期${w.days}天</span>`;
    } else if (w.level === 'urgent') {
        warningHtml = `<span class="warning-dot warning-dot-yellow"></span><span class="warning-text warning-text-yellow">剩余${w.days}天</span>`;
    }

    // 状态标签
    const statusHtml = renderStatusTag(patent.status);

    return `<tr class="clickable-row" data-id="${patent.id}">
        <td class="col-checkbox"><input type="checkbox" class="patent-checkbox" value="${patent.id}"></td>
        <td class="col-warning">${warningHtml}</td>
        <td>${noHtml}</td>
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
    if (!confirm('确认将该专利移入回收站？')) return;
    try {
        await window.patentAPI.dbRun(
            "UPDATE patents SET is_deleted = 1, deleted_at = datetime('now','localtime') WHERE id = ?",
            [id]
        );
        loadPatentList();
    } catch (err) {
        alert('删除失败：' + err.message);
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
    if (checked.length === 0) { alert('请先勾选要删除的专利'); return; }
    if (!confirm(`确认将选中的 ${checked.length} 条专利移入回收站？`)) return;
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
        alert('批量删除失败：' + err.message);
    }
}

/**
 * 函数名：batchCompleteTask
 * 作用：批量完成选中专利的所有待缴费任务
 */
async function batchCompleteTask() {
    const checked = document.querySelectorAll('.patent-checkbox:checked');
    if (checked.length === 0) { alert('请先勾选专利'); return; }
    const ids = Array.from(checked).map(cb => parseInt(cb.value));

    try {
        const placeholders = ids.map(() => '?').join(',');
        const tasks = await window.patentAPI.dbQuery(
            "SELECT t.id, t.patent_id, t.fee_type, t.year_index, t.due_date, t.amount, p.patent_no FROM fee_tasks t JOIN patents p ON t.patent_id = p.id WHERE t.patent_id IN (" + placeholders + ") AND t.status = '待缴费' ORDER BY t.patent_id, t.due_date ASC",
            ids
        );

        const listEl = document.getElementById('taskList');
        if (tasks.length === 0) {
            listEl.innerHTML = '<p class="text-muted text-center" style="padding:24px;">所选专利暂无待缴费事项</p>';
            document.getElementById('btnConfirmTasks').disabled = true;
        } else {
            let html = '';
            let lastPatentNo = '';
            tasks.forEach(t => {
                const yearLabel = t.year_index ? ` (第${t.year_index}年)` : '';
                const patentLabel = t.patent_no !== lastPatentNo ? `<div style="font-size:11px;color:#999;margin:4px 0 2px 0;">${escapeHtml(t.patent_no)}</div>` : '';
                lastPatentNo = t.patent_no;
                html += patentLabel;
                html += `<label class="task-item">
                    <input type="checkbox" class="task-checkbox" value="${t.id}">
                    <span class="task-info">${escapeHtml(t.fee_type)}${yearLabel} - 截止 ${escapeHtml(t.due_date)}</span>
                    <span class="task-amount">¥${t.amount}</span>
                </label>`;
            });
            listEl.innerHTML = html;
            document.getElementById('btnConfirmTasks').disabled = false;
        }
        document.getElementById('taskModal').dataset.patentId = '';
        document.getElementById('taskModal').classList.remove('hidden');
    } catch (err) {
        alert('加载待办数据失败：' + err.message);
    }
}

/**
 * 函数名：completeTask
 * 作用：打开完成待办弹窗，列出专利所有待缴费任务
 */
async function completeTask(patentId) {
    try {
        const tasks = await window.patentAPI.dbQuery(
            "SELECT id, fee_type, year_index, due_date, amount FROM fee_tasks WHERE patent_id = ? AND status = '待缴费' ORDER BY due_date ASC",
            [patentId]
        );
        const listEl = document.getElementById('taskList');
        if (tasks.length === 0) {
            listEl.innerHTML = '<p class="text-muted text-center" style="padding:24px;">该专利暂无待缴费事项</p>';
            document.getElementById('btnConfirmTasks').disabled = true;
        } else {
            let html = '';
            tasks.forEach(t => {
                const yearLabel = t.year_index ? ` (第${t.year_index}年)` : '';
                html += `<label class="task-item">
                    <input type="checkbox" class="task-checkbox" value="${t.id}">
                    <span class="task-info">${escapeHtml(t.fee_type)}${yearLabel} - 截止 ${escapeHtml(t.due_date)}</span>
                    <span class="task-amount">¥${t.amount}</span>
                </label>`;
            });
            listEl.innerHTML = html;
            document.getElementById('btnConfirmTasks').disabled = false;
        }
        // 存储 patentId 供 confirmTasksComplete 使用
        document.getElementById('taskModal').dataset.patentId = patentId;
        document.getElementById('taskModal').classList.remove('hidden');
    } catch (err) {
        alert('加载待办数据失败：' + err.message);
    }
}

/**
 * 函数名：confirmTasksComplete
 * 作用：确认将选中的待办任务标记为已完成
 */
async function confirmTasksComplete() {
    const checked = document.querySelectorAll('.task-checkbox:checked');
    if (checked.length === 0) {
        alert('请至少选择一项待办事项');
        return;
    }
    if (!confirm(`确认完成选中的 ${checked.length} 项待办？`)) return;

    try {
        const ids = Array.from(checked).map(cb => parseInt(cb.value));
        for (const id of ids) {
            await window.patentAPI.dbRun(
                "UPDATE fee_tasks SET status = '已缴费', paid_date = date('now','localtime') WHERE id = ?",
                [id]
            );
        }
        alert(`已完成 ${ids.length} 项待办`);
        document.getElementById('taskModal').classList.add('hidden');
        loadPatentList();
    } catch (err) {
        alert('操作失败：' + err.message);
    }
}

/**
 * 函数名：showDetailModal
 * 作用：弹窗显示专利详情、缴费记录、操作日志
 */
async function showDetailModal(id) {
    try {
        // 查询专利信息
        const patents = await window.patentAPI.dbQuery(
            "SELECT * FROM patents WHERE id = ?",
            [id]
        );
        if (patents.length === 0) {
            alert('未找到专利信息');
            return;
        }
        const p = patents[0];

        // 设置标题
        document.getElementById('detailTitle').textContent = `专利详情 - ${p.patent_no}`;

        // 渲染信息网格
        const fields = [
            { label: '专利号', value: p.patent_no },
            { label: '专利名称', value: p.patent_name },
            { label: '专利类型', value: p.patent_type },
            { label: '发明人', value: p.inventor || '-' },
            { label: '申请人', value: p.applicant || '-' },
            { label: '申请日期', value: p.apply_date || '-' },
            { label: '授权公告日', value: p.authorize_date || '-' },
            { label: '权利状态', value: renderStatusTag(p.status) },
            { label: '费减比例', value: p.fee_reduction || '无' },
            { label: '备注', value: p.notes || '-' },
            { label: '创建时间', value: p.created_at || '-' },
            { label: '更新时间', value: p.updated_at || '-' }
        ];
        let gridHtml = '';
        fields.forEach(f => {
            gridHtml += `<div class="detail-item"><span class="label">${f.label}</span><span class="value">${f.value}</span></div>`;
        });
        document.getElementById('detailGrid').innerHTML = gridHtml;

        // 查询缴费记录
        const fees = await window.patentAPI.dbQuery(
            "SELECT fee_type, year_index, amount, paid_amount, due_date, paid_date, status FROM fee_tasks WHERE patent_id = ? ORDER BY due_date ASC",
            [id]
        );
        const feeBody = document.getElementById('detailFeeBody');
        if (fees.length === 0) {
            feeBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">暂无记录</td></tr>';
        } else {
            let feeHtml = '';
            fees.forEach(t => {
                const yearLabel = t.year_index ? `第${t.year_index}年` : '-';
                const statusTag = t.status === '已缴费'
                    ? '<span class="status-tag status-tag-green">已缴费</span>'
                    : t.status === '已失效'
                    ? '<span class="status-tag status-tag-gray">已失效</span>'
                    : '<span class="status-tag status-tag-red">待缴费</span>';
                feeHtml += `<tr>
                    <td>${escapeHtml(t.fee_type)}</td>
                    <td>${yearLabel}</td>
                    <td>¥${t.amount}</td>
                    <td>¥${t.paid_amount || 0}</td>
                    <td>${t.due_date || '-'}</td>
                    <td>${statusTag}</td>
                </tr>`;
            });
            feeBody.innerHTML = feeHtml;
        }

        // 查询操作日志
        const logs = await window.patentAPI.dbQuery(
            "SELECT action_type, description, created_at FROM operation_logs WHERE patent_id = ? ORDER BY created_at DESC LIMIT 50",
            [id]
        );
        const logBody = document.getElementById('detailLogBody');
        if (logs.length === 0) {
            logBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">暂无记录</td></tr>';
        } else {
            let logHtml = '';
            logs.forEach(l => {
                logHtml += `<tr><td>${escapeHtml(l.action_type)}</td><td>${escapeHtml(l.description || '-')}</td><td>${l.created_at || '-'}</td></tr>`;
            });
            logBody.innerHTML = logHtml;
        }

        document.getElementById('detailModal').classList.remove('hidden');
    } catch (err) {
        alert('加载详情失败：' + err.message);
    }
}
