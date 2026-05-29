/**
 * 文件名：dashboard.js
 * 作用：仪表盘页面 ECharts 可视化（资产构成饼图 + 动态存量柱状图 + 预算查询）
 * 依赖：echarts, window.patentAPI
 */

let pieChartInstance = null;
let barChartInstance = null;
let dashboardInited = false;

/**
 * 函数名：initDashboard
 * 作用：初始化仪表盘所有图表，仅首次调用有效
 */
function initDashboard() {
    if (!dashboardInited) {
        dashboardInited = true;
        renderPieChart();
        renderBarChart(1);
        renderStats();
        // 预算区间查询控件绑定
        const btn = document.getElementById('btnQueryBudget');
        const startInput = document.getElementById('budgetMonthStart');
        const endInput = document.getElementById('budgetMonthEnd');
        if (btn && startInput && endInput) {
            // 默认：今年1月 ~ 下个月
            const now = new Date();
            const nextMonth = new Date(now);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            startInput.value = now.getFullYear() + '-01';
            endInput.value = nextMonth.toISOString().slice(0, 7);
            btn.addEventListener('click', () => renderBudgetChart(startInput.value, endInput.value));
            renderBudgetChart(startInput.value, endInput.value);
        }
        // 年切换按钮
        document.querySelectorAll('#yearSwitch button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#yearSwitch button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderBarChart(parseInt(btn.dataset.years));
            });
        });
        return;
    }
    // 已初始化过，切回时触发图表自适应
    setTimeout(() => {
        if (pieChartInstance) pieChartInstance.resize();
        if (barChartInstance) barChartInstance.resize();
    }, 100);
}

// ============================================
// 1. 资产构成饼图
// ============================================

/**
 * 函数名：renderPieChart
 * 作用：查询专利数据和发明人信息，渲染饼图
 */
async function renderPieChart() {
    const container = document.getElementById('pieChart');
    if (!container) return;

    try {
        const rows = await window.patentAPI.dbQuery(
            "SELECT patent_type, inventor FROM patents WHERE is_deleted = 0"
        );

        // 按类型分组，统计第一发明人
        const typeMap = {};   // { '发明': { total: N, inventors: { '张强': 3, '李尚': 2 } } }
        rows.forEach(r => {
            const type = r.patent_type || '未分类';
            if (!typeMap[type]) typeMap[type] = { total: 0, inventors: {} };
            typeMap[type].total++;

            if (r.inventor) {
                const first = r.inventor.split('、')[0].trim();
                if (first) {
                    typeMap[type].inventors[first] = (typeMap[type].inventors[first] || 0) + 1;
                }
            }
        });

        const typeOrder = ['发明', '实用新型', '外观设计'];
        const pieData = typeOrder.filter(t => typeMap[t]).map(t => ({
            name: t,
            value: typeMap[t].total,
            inventors: typeMap[t].inventors
        }));
        // 其他未在 typeOrder 中的
        Object.keys(typeMap).forEach(t => {
            if (!typeOrder.includes(t)) {
                pieData.push({ name: t, value: typeMap[t].total, inventors: typeMap[t].inventors });
            }
        });

        if (pieData.length === 0) {
            container.innerHTML = '<p class="text-center text-muted" style="padding:60px 0;">暂无专利数据</p>';
            return;
        }

        const colors = ['#1890ff', '#52c41a', '#fa8c16', '#999'];

        if (pieChartInstance) pieChartInstance.dispose();
        pieChartInstance = echarts.init(container);
        pieChartInstance.setOption({
            tooltip: {
                trigger: 'item',
                formatter: function (params) {
                    const inv = params.data.inventors || {};
                    const invList = Object.keys(inv)
                        .sort((a, b) => inv[b] - inv[a])
                        .map(name => `${name}：${inv[name]}件`)
                        .join('；');
                    let html = `<strong>${params.name}</strong><br/>总数：${params.value}件`;
                    if (invList) html += `<br/><span style="font-size:12px;color:#999;">${invList}</span>`;
                    return html;
                }
            },
            legend: { bottom: 0, data: pieData.map(d => d.name) },
            series: [{
                type: 'pie',
                radius: ['35%', '60%'],
                center: ['50%', '42%'],
                avoidLabelOverlap: true,
                label: { show: true, formatter: '{b}\n{d}%' },
                emphasis: {
                    label: { show: true, fontSize: 14, fontWeight: 'bold' }
                },
                data: pieData.map(d => ({ ...d, itemStyle: { color: colors[pieData.indexOf(d)] || colors[3] } }))
            }]
        });
    } catch (err) {
        container.innerHTML = `<p class="text-center text-muted" style="padding:60px 0;">加载失败：${err.message}</p>`;
    }
}

// ============================================
// 2. 动态存量柱状图
// ============================================

/**
 * 函数名：renderBarChart
 * 作用：查询近 N 年申请数和有效数，渲染分组堆叠柱状图
 * 参数：years - number - 近 N 年（1/2/3）
 */
async function renderBarChart(years) {
    const container = document.getElementById('barChart');
    if (!container) return;

    try {
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - years + 1;
        const yearLabels = [];
        for (let y = startYear; y <= currentYear; y++) yearLabels.push(String(y));

        const rows = await window.patentAPI.dbQuery(
            `SELECT patent_type, strftime('%Y', apply_date) as year,
                    COUNT(*) as total,
                    SUM(CASE WHEN status = '专利权生效' THEN 1 ELSE 0 END) as active
             FROM patents WHERE is_deleted = 0 AND apply_date IS NOT NULL
               AND strftime('%Y', apply_date) BETWEEN ? AND ?
             GROUP BY patent_type, year ORDER BY year, patent_type`,
            [String(startYear), String(currentYear)]
        );

        // 类型配色：深色=有效数，浅色=申请数
        const typeConfig = {
            '发明': { active: '#1890ff', applied: '#b3d7ff' },
            '实用新型': { active: '#52c41a', applied: '#b7eb8f' },
            '外观设计': { active: '#fa8c16', applied: '#ffd591' }
        };
        const typeOrder = ['发明', '实用新型', '外观设计'];
        // yearMap[year][type] = { total, active }
        const yearMap = {};
        yearLabels.forEach(y => { yearMap[y] = {}; });
        rows.forEach(r => {
            if (!yearMap[r.year]) yearMap[r.year] = {};
            yearMap[r.year][r.patent_type] = { total: r.total, active: r.active };
        });

        // 构建 series：每类型一个堆叠柱（下层深色=有效数 + 上层浅色=申请数-有效数）
        const series = [];
        typeOrder.forEach(type => {
            const cfg = typeConfig[type] || typeConfig['发明'];
            // 下层：有效数（深色），标注总数于柱顶
            series.push({
                name: type + '-有效数',
                type: 'bar',
                stack: type,
                barWidth: 28,
                itemStyle: { color: cfg.active },
                data: yearLabels.map(y => {
                    const d = yearMap[y] && yearMap[y][type];
                    return d ? d.active : 0;
                }),
                label: { show: false }
            });
            // 上层：申请数-有效数（浅色）
            series.push({
                name: type + '-申请数',
                type: 'bar',
                stack: type,
                barWidth: 28,
                itemStyle: { color: cfg.applied },
                data: yearLabels.map(y => {
                    const d = yearMap[y] && yearMap[y][type];
                    return d ? Math.max(0, d.total - d.active) : 0;
                })
            });
        });

        if (barChartInstance) barChartInstance.dispose();
        barChartInstance = echarts.init(container);
        barChartInstance.setOption({
            tooltip: {
                trigger: 'axis',
                formatter: function (params) {
                    const yearLabel = params[0].axisValue;
                    const year = yearLabel.replace('年', '');
                    let html = `<strong>${yearLabel}</strong><br/>`;
                    typeOrder.forEach(t => {
                        const d = yearMap[year] && yearMap[year][t];
                        if (d && (d.total > 0 || d.active > 0)) {
                            html += `${t}：申请${d.total}件，有效${d.active}件<br/>`;
                        }
                    });
                    return html;
                }
            },
            legend: { show: false },
            grid: { left: 50, right: 30, top: 20, bottom: 30 },
            xAxis: {
                type: 'category',
                data: yearLabels.map(y => y + '年'),
                axisLabel: { fontSize: 13 }
            },
            yAxis: {
                type: 'value',
                minInterval: 1
            },
            series: series
        });
        renderBarLegend(barChartInstance, typeOrder);
    } catch (err) {
        container.innerHTML = `<p class="text-center text-muted" style="padding:60px 0;">加载失败：${err.message}</p>`;
    }
}

// ============================================
// 柱状图自定义图例
// ============================================

/**
 * 函数名：renderBarLegend
 * 作用：渲染自定义HTML图例，3列 × 2行（申请数一排，有效数一排）
 * 参数：chart - echarts实例, typeOrder - string[] 专利类型列表
 */
function renderBarLegend(chart, typeOrder) {
    const container = document.getElementById('barLegend');
    if (!container || !chart) return;

    const colors = { '发明': { active: '#1890ff', applied: '#b3d7ff' },
                     '实用新型': { active: '#52c41a', applied: '#b7eb8f' },
                     '外观设计': { active: '#fa8c16', applied: '#ffd591' } };
    // 每类一列，列内两行：申请数(浅色在上) + 有效数(深色在下)
    const statusOrder = [{ key: 'applied', label: '申请数' }, { key: 'active', label: '有效数' }];

    container.innerHTML = typeOrder.map(type => {
        const cfg = colors[type] || colors['发明'];
        return `<span class="legend-column">${statusOrder.map(s => {
            const color = s.key === 'active' ? cfg.active : cfg.applied;
            return `<span class="legend-item" data-name="${type}-${s.label}">
                <span class="legend-icon" style="background:${color}"></span>${type}-${s.label}
            </span>`;
        }).join('')}</span>`;
    }).join('');

    // 绑定点击事件
    container.querySelectorAll('.legend-item').forEach(el => {
        el.addEventListener('click', () => {
            const name = el.dataset.name;
            // 切换 ECharts 系列显隐
            chart.dispatchAction({ type: 'legendToggleSelect', name: name });
            el.classList.toggle('dimmed');
        });
    });
}

// ============================================
// 3. 查询预算视图
// ============================================

/**
 * 函数名：renderBudgetChart
 * 作用：查询指定月份的费用数据，更新预算视图
 * 参数：startMonth - string - YYYY-MM 起始月份
 *         endMonth - string - YYYY-MM 截止月份
 */
async function renderBudgetChart(startMonth, endMonth) {
    const container = document.getElementById('budgetResult');
    if (!container || !startMonth || !endMonth) return;

    try {
        const fees = await window.patentAPI.dbQuery(
            "SELECT fee_type, SUM(amount) as total, COUNT(*) as count FROM fee_tasks WHERE strftime('%Y-%m', due_date) BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM patents WHERE id = patent_id) GROUP BY fee_type ORDER BY total DESC",
            [startMonth, endMonth]
        );
        const totalRow = await window.patentAPI.dbQuery(
            "SELECT SUM(amount) as grand_total FROM fee_tasks WHERE strftime('%Y-%m', due_date) BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM patents WHERE id = patent_id)",
            [startMonth, endMonth]
        );
        const grandTotal = totalRow.length > 0 ? totalRow[0].grand_total || 0 : 0;

        if (fees.length === 0) {
            container.innerHTML = `<p class="text-center text-muted" style="padding:40px 0;">${startMonth} ~ ${endMonth} 无费用记录</p>`;
            return;
        }

        let html = `<div style="display:flex;gap:24px;align-items:flex-start;">
            <table class="budget-breakdown" style="flex:1;">
                <thead><tr><th>费用类型</th><th>笔数</th><th>金额（元）</th><th>操作</th></tr></thead>
                <tbody>`;
        fees.forEach(f => {
            html += `<tr>
                <td>${f.fee_type}</td>
                <td>${f.count}</td>
                <td>${(f.total || 0).toLocaleString()}</td>
                <td><a class="detail-link" data-fee-type="${f.fee_type}" data-start="${startMonth}" data-end="${endMonth}">查看详情</a></td>
            </tr>`;
        });
        html += `</tbody></table>
            <div style="text-align:right;flex-shrink:0;">
                <div class="budget-total" style="margin-top:0;">¥${grandTotal.toLocaleString()}</div>
                <div class="budget-label">${startMonth} ~ ${endMonth}<br/>费用总计</div>
            </div>
        </div>`;
        container.innerHTML = html;
        // 委托点击"查看详情"事件
        container.addEventListener('click', function onClickDetail(e) {
            const link = e.target.closest('.detail-link');
            if (link) {
                loadFeeDetail(link.dataset.feeType, link.dataset.start, link.dataset.end);
            }
        });
    } catch (err) {
        container.innerHTML = `<p class="text-center text-muted" style="padding:40px 0;">查询失败：${err.message}</p>`;
    }
}

// ============================================
// 费用明细弹窗
// ============================================

/**
 * 函数名：loadFeeDetail
 * 作用：查询指定费用类型的逐条明细，弹窗显示
 */
async function loadFeeDetail(feeType, startMonth, endMonth) {
    const modal = document.getElementById('feeDetailModal');
    const title = document.getElementById('feeDetailTitle');
    const body = document.getElementById('feeDetailBody');
    if (!modal || !title || !body) return;

    title.textContent = `${feeType} 明细  ${startMonth} ~ ${endMonth}`;
    body.innerHTML = '<p class="text-center text-muted" style="padding:40px 0;">加载中...</p>';
    modal.classList.remove('hidden');

    try {
        const rows = await window.patentAPI.dbQuery(
            `SELECT p.patent_no, p.patent_name, f.year_index, f.amount,
                    f.due_date, f.status, f.paid_date
             FROM fee_tasks f LEFT JOIN patents p ON f.patent_id = p.id
             WHERE f.fee_type = ? AND strftime('%Y-%m', f.due_date) BETWEEN ? AND ?
             ORDER BY f.status, f.due_date, p.patent_no`,
            [feeType, startMonth, endMonth]
        );

        if (rows.length === 0) {
            body.innerHTML = '<p class="text-center text-muted" style="padding:40px 0;">暂无数据</p>';
            return;
        }

        let totalAmount = 0;
        let html = `<table class="budget-breakdown fee-detail-table">
            <thead><tr>
                <th>专利号</th><th>专利名称</th><th>年度</th><th>金额（元）</th><th>截止日期</th><th>状态</th>
            </tr></thead><tbody>`;
        rows.forEach(r => {
            totalAmount += r.amount || 0;
            const yearLabel = r.year_index ? `第${r.year_index}年` : '-';
            const patentNo = r.patent_no || '<span style="color:#999;">(专利已不存在)</span>';
            const patentName = r.patent_name || '';
            html += `<tr>
                <td style="font-family:Consolas,monospace;">${patentNo}</td>
                <td>${patentName}</td>
                <td>${yearLabel}</td>
                <td style="text-align:right;">${(r.amount || 0).toLocaleString()}</td>
                <td>${r.due_date || '-'}</td>
                <td>${r.status || '-'}</td>
            </tr>`;
        });
        html += `</tbody>
            <tfoot><tr style="font-weight:600;">
                <td colspan="2">合计</td>
                <td>${rows.length}笔</td>
                <td style="text-align:right;">${totalAmount.toLocaleString()}</td>
                <td colspan="2"></td>
            </tr></tfoot></table>`;
        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = `<p class="text-center text-muted" style="padding:40px 0;">查询失败：${err.message}</p>`;
    }
}

// 弹窗关闭事件
document.addEventListener('click', function(e) {
    const modal = document.getElementById('feeDetailModal');
    if (!modal) return;
    // 点击关闭按钮或遮罩背景
    if (e.target.id === 'feeDetailClose' || e.target === modal) {
        modal.classList.add('hidden');
    }
});

// ============================================
// 统计概览卡片
// ============================================

/**
 * 函数名：renderStats
 * 作用：查询统计概览数据，更新四个白色卡片
 */
async function renderStats() {
    try {
        const [patentCnt, overdueCnt, feePending, otherPending, monthlyCnt] = await Promise.all([
            window.patentAPI.dbQuery("SELECT COUNT(*) as cnt FROM patents WHERE is_deleted = 0"),
            window.patentAPI.dbQuery("SELECT COUNT(*) as cnt FROM fee_tasks WHERE status = '待缴费' AND due_date < date('now','localtime') AND EXISTS (SELECT 1 FROM patents WHERE id = patent_id)"),
            window.patentAPI.dbQuery("SELECT COUNT(*) as cnt FROM fee_tasks WHERE status = '待缴费' AND EXISTS (SELECT 1 FROM patents WHERE id = patent_id)"),
            window.patentAPI.dbQuery("SELECT COUNT(*) as cnt FROM pending_urgent_tasks WHERE EXISTS (SELECT 1 FROM patents WHERE id = patent_id)"),
            window.patentAPI.dbQuery("SELECT COUNT(*) as cnt FROM fee_tasks WHERE status = '待缴费' AND strftime('%Y-%m', due_date) = strftime('%Y-%m', 'now', 'localtime') AND EXISTS (SELECT 1 FROM patents WHERE id = patent_id)")
        ]);
        document.getElementById('statPatentCount').textContent = patentCnt[0].cnt;
        document.getElementById('statOverdue').textContent = overdueCnt[0].cnt;
        document.getElementById('statPending').textContent = feePending[0].cnt + otherPending[0].cnt;
        document.getElementById('statMonthly').textContent = monthlyCnt[0].cnt;
    } catch (err) {
        console.error('统计卡片加载失败:', err.message);
    }
}

// 窗口自适应
window.addEventListener('resize', () => {
    if (pieChartInstance) pieChartInstance.resize();
    if (barChartInstance) barChartInstance.resize();
});
