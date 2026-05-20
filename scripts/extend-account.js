#!/usr/bin/env node
/**
 * 延长账号有效期（本地修改 data/accounts.json）
 *
 * 用法：
 *   node scripts/extend-account.js 123456          # 延长 30 天（默认）
 *   node scripts/extend-account.js 123456 60       # 延长 60 天
 *   node scripts/extend-account.js 123456 --set 2026-12-31  # 设为指定日期
 */
import { extendAccount, updateAccount } from '../server/authAccounts.js';

const username = process.argv[2];
const arg2 = process.argv[3];

if (!username) {
  console.error('用法: node scripts/extend-account.js <账号> [延长天数|--set YYYY-MM-DD]');
  process.exit(1);
}

try {
  if (arg2 === '--set') {
    const date = process.argv[4];
    if (!date) throw new Error('请提供日期 YYYY-MM-DD');
    const account = await updateAccount(username, {
      expiresAt: new Date(`${date}T23:59:59.000Z`).toISOString(),
    });
    console.log(`已设置 ${username} 到期时间: ${account.expiresAt}`);
  } else {
    const days = arg2 ? Number(arg2) : 30;
    const account = await extendAccount(username, days);
    console.log(`已延长 ${username} ${days} 天，新到期: ${account.expiresAt}`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
