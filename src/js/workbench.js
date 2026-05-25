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
