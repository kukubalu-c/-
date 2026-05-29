/**
 * 文件名：seed_data.js
 * 作用：数据库种子数据——年费标准 + 状态流转映射
 * 被哪些文件调用：database.js（首次初始化时导入）
 * 依赖：无
 * 使用场景：数据库首次创建时自动填充基础数据
 *
 * 数据来源：RULES.md（业务规则手册）
 * 更新规则：修改此文件后，删除 data/patent.db 重启即可重新导入
 */

// ============================================
// 中国专利年费标准（全额）
// 数据来源：RULES.md 第二章
// ============================================
const FEE_STANDARDS = [
    // === 发明专利 ===
    { patent_type: '发明', year_start: 1,  year_end: 3,  fee: 900 },
    { patent_type: '发明', year_start: 4,  year_end: 6,  fee: 1200 },
    { patent_type: '发明', year_start: 7,  year_end: 8,  fee: 2000 },
    { patent_type: '发明', year_start: 9,  year_end: 10, fee: 4000 },
    { patent_type: '发明', year_start: 11, year_end: 12, fee: 4000 },
    { patent_type: '发明', year_start: 13, year_end: 15, fee: 6000 },
    { patent_type: '发明', year_start: 16, year_end: 20, fee: 8000 },
    // === 实用新型 ===
    { patent_type: '实用新型', year_start: 1,  year_end: 3,  fee: 600 },
    { patent_type: '实用新型', year_start: 4,  year_end: 6,  fee: 900 },
    { patent_type: '实用新型', year_start: 7,  year_end: 8,  fee: 1200 },
    { patent_type: '实用新型', year_start: 9,  year_end: 10, fee: 2000 },
    // === 外观设计 ===
    { patent_type: '外观设计', year_start: 1,  year_end: 3,  fee: 600 },
    { patent_type: '外观设计', year_start: 4,  year_end: 6,  fee: 900 },
    { patent_type: '外观设计', year_start: 7,  year_end: 8,  fee: 1200 },
    { patent_type: '外观设计', year_start: 9,  year_end: 10, fee: 1500 }
];

// ============================================
// 费减比例配置
// 数据来源：RULES.md 第三章
// ============================================
const FEE_REDUCTION_RATES = [
    { type: '无',        rate: 1.00 },
    { type: '个人',      rate: 0.15 },
    { type: '小微企业',  rate: 0.15 },
    { type: '普通企业',  rate: 0.30 },
    { type: '事业高校',  rate: 0.00 }
];

// ============================================
// 滞纳金比例
// 数据来源：RULES.md 第四章
// ============================================
const PENALTY_RATES = [
    { overdue_months: 0, rate: 0.00 },
    { overdue_months: 1, rate: 0.05 },
    { overdue_months: 2, rate: 0.10 },
    { overdue_months: 3, rate: 0.15 },
    { overdue_months: 4, rate: 0.20 },
    { overdue_months: 5, rate: 0.25 },
    { overdue_months: 6, rate: 0.25 }
];

// ============================================
// 状态流转映射表
// 数据来源：RULES.md 第一章 + PRD 2.3 状态变更规则
//
// 字段说明：
//   current_status        - 当前状态
//   action                - 用户操作
//   attachment_required   - 是否必须上传附件（0/1）
//   attachment_type       - 附件类型说明
//   next_status           - 下一状态
//   fee_type              - 涉及费用类型
//   fee_due_rule          - 费用截止规则描述
// ============================================
const STATUS_TRANSITIONS = [
    // 1. 撰写中 → 已申请
    {
        current_status: '撰写中',
        action: '提交申请/上传请求书',
        attachment_required: 0,
        attachment_type: '',
        next_status: '已申请',
        fee_type: '申请费,公布印刷费',
        fee_due_rule: '申请日+2个月'
    },
    // 2. 已申请 → 形式审查中
    {
        current_status: '已申请',
        action: '上传《专利申请受理通知书》',
        attachment_required: 1,
        attachment_type: '专利申请受理通知书',
        next_status: '形式审查中',
        fee_type: '',
        fee_due_rule: ''
    },
    // 3. 形式审查中 → 待实质审查（发明）
    {
        current_status: '形式审查中',
        action: '初审合格（系统过N天或手动触发）',
        attachment_required: 0,
        attachment_type: '',
        next_status: '待实质审查',
        fee_type: '实质审查费（仅发明）',
        fee_due_rule: '申请日满2.5年起提醒，满3年未缴终止'
    },
    // 4. 形式审查中 → 通知授权（实用新型/外观设计）
    {
        current_status: '形式审查中',
        action: '初审合格',
        attachment_required: 0,
        attachment_type: '',
        next_status: '通知授权',
        fee_type: '授权登记费',
        fee_due_rule: '授权发文日+2个月'
    },
    // 5. 待实质审查 → 实质审查中（收到进入实审通知书）
    {
        current_status: '待实质审查',
        action: '上传《发明专利申请进入实质审查阶段通知书》',
        attachment_required: 1,
        attachment_type: '进入实质审查阶段通知书',
        next_status: '实质审查中',
        fee_type: '',
        fee_due_rule: ''
    },
    // 6. 实质审查中 → OA答复中
    {
        current_status: '实质审查中',
        action: '下载/上传《审查意见通知书》(OA)',
        attachment_required: 1,
        attachment_type: '审查意见通知书',
        next_status: 'OA答复中',
        fee_type: '',
        fee_due_rule: ''
    },
    // 7. OA答复中 → 实质审查中（循环）
    {
        current_status: 'OA答复中',
        action: '上传《意见陈述书》及修改后权利要求书',
        attachment_required: 1,
        attachment_type: '意见陈述书及权利要求书',
        next_status: '实质审查中',
        fee_type: '',
        fee_due_rule: ''
    },
    // 8. OA答复中 → 通知授权（终结OA循环）
    {
        current_status: 'OA答复中',
        action: '上传《授予发明专利权通知书》',
        attachment_required: 1,
        attachment_type: '授予发明专利权通知书',
        next_status: '通知授权',
        fee_type: '授权登记费',
        fee_due_rule: '授权发文日+2个月'
    },
    // 9. 通知授权 → 专利权生效
    {
        current_status: '通知授权',
        action: '缴纳授权登记费',
        attachment_required: 0,
        attachment_type: '',
        next_status: '专利权生效',
        fee_type: '授权登记费',
        fee_due_rule: '缴费后自动生成首年年费'
    },
    // 10. 专利权生效 → 已终止（未缴年费）
    {
        current_status: '专利权生效',
        action: '年费逾期30天未缴',
        attachment_required: 0,
        attachment_type: '',
        next_status: '已终止',
        fee_type: '',
        fee_due_rule: ''
    },
    // 11. 实质审查中 → 已驳回
    {
        current_status: '实质审查中',
        action: '上传《驳回决定》',
        attachment_required: 1,
        attachment_type: '驳回决定',
        next_status: '已驳回',
        fee_type: '',
        fee_due_rule: ''
    },
    // 12. 任一状态 → 已撤回
    {
        current_status: '任一',
        action: '手动标记"主动撤回"并上传撤回声明',
        attachment_required: 1,
        attachment_type: '撤回声明',
        next_status: '已撤回',
        fee_type: '',
        fee_due_rule: ''
    }
];

// ============================================
// 费用截止日期计算规则
// 数据来源：RULES.md 第五章
// ============================================
const FEE_DUE_RULES = [
    { fee_type: '申请费',         base_on: 'apply_date', offset_months: 2,  desc: '申请日+2个月' },
    { fee_type: '公布印刷费',     base_on: 'apply_date', offset_months: 2,  desc: '申请日+2个月' },
    { fee_type: '实质审查费',     base_on: 'apply_date', offset_months: 36, desc: '申请日+3年' },
    { fee_type: '授权登记费',     base_on: 'authorize_date', offset_months: 2, desc: '授权发文日+2个月' },
    { fee_type: '年费',           base_on: 'apply_date', offset_months: 0,  desc: '申请日前对应日期' }
];

module.exports = {
    FEE_STANDARDS,
    FEE_REDUCTION_RATES,
    PENALTY_RATES,
    STATUS_TRANSITIONS,
    FEE_DUE_RULES
};
