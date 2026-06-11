# Tier 3 自测报告

> 范围: `自测清单.md` Tier 3
> 执行时间: 2026-06-02
> 环境: localhost:3000, AUTH_MODE=mock, EASYROUTER_MODE=mock

## 结果总览

| 编号 | 测试项 | 状态 | 备注 |
|---|---|---|---|
| 3.1 | `/profile` 本月已用 / 约等于次数 | 通过 | 3.1-a PASS: query total=13/image=11, sql total=13/image=11; 3.1-b PASS: query used=650, sql used=650, selftestDelta=60; 3.1-c PASS: header total=13, month total=13 |
| 3.2 | `/admin` KPI 本月调用 / 活跃部门 / 成本 | 通过 | 3.2-a PASS: query calls=13, depts=1, users=1; sql calls=13, depts=1, users=1; 3.2-b PASS: query credits=650, cny=6.5; sql credits=650, cny=6.5000; selftestCost=0.6 |
| 3.3 | 配额进度条百分比 | 通过 | 3.3-a PASS: query 650/5000 ratio=0.1300, sql 650/5000 ratio=0.1300 |
| 3.4 | `/manager` 本部门权限 | 通过 | 3.4-a PASS: dept=fc881852-4438-4cd5-b05f-52aedcb21c7a, query calls=0/users=0/credits=0, sql calls=0/users=0/credits=0; 3.4-b PASS: members=2, deptUsers=2; 3.4-c PASS: HTTP 200; 3.4-d PASS: HTTP 307 |
| 3.5 | 报销金额统计 | 通过 | 3.5-a PASS: query count=1, total=123.45; sql count=1, total=123.45; selftestReimb=2; 3.5-b PASS: query reimb=123.45, sql reimb=123.45 |

## Bug 记录

暂无。

## 执行记录

- 3.1-a [PASS] /profile 本月次数与 SQL 一致: query total=13/image=11, sql total=13/image=11
- 3.1-b [PASS] /profile 本月已用额度与 SQL 一致: query used=650, sql used=650, selftestDelta=60
- 3.1-c [PASS] /profile 累计成功次数可取: header total=13, month total=13
- 3.2-a [PASS] /admin KPI 本月调用 / 活跃部门 / 活跃员工一致: query calls=13, depts=1, users=1; sql calls=13, depts=1, users=1
- 3.2-b [PASS] /admin KPI 成本 / 积分一致: query credits=650, cny=6.5; sql credits=650, cny=6.5000; selftestCost=0.6
- 3.3-a [PASS] 部门配额 used / limit / ratio 与 SQL 一致: query 650/5000 ratio=0.1300, sql 650/5000 ratio=0.1300
- 3.4-a [PASS] /manager KPI 只统计本部门: dept=fc881852-4438-4cd5-b05f-52aedcb21c7a, query calls=0/users=0/credits=0, sql calls=0/users=0/credits=0
- 3.4-b [PASS] /manager 成员表只包含本部门成员: members=2, deptUsers=2
- 3.4-c [PASS] 部门负责人可访问 /manager/dashboard: HTTP 200
- 3.4-d [PASS] 普通员工访问 /manager/dashboard 会被拦截: HTTP 307
- 3.5-a [PASS] 报销统计 approved 总额 / 笔数与 SQL 一致: query count=1, total=123.45; sql count=1, total=123.45; selftestReimb=2
- 3.5-b [PASS] /admin KPI 报销总额与 SQL 一致: query reimb=123.45, sql reimb=123.45
- 3.page-a [PASS] /profile 页面可访问: HTTP 200
- 3.page-b [PASS] /admin 页面可访问: HTTP 200
